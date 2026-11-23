// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// PlazCode Skill & Specialist Workshop — Cloudflare Worker + D1 API.

const MAX_BODY_BYTES = 512 * 1024;
const MAX_SMALL_BODY_BYTES = 8 * 1024;
const MAX_FILES_PER_SKILL = 60;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_TEXT_BYTES = 450 * 1024;
const ALLOWED_KINDS = new Set(['skill', 'specialist']);
const ALLOWED_ENGINES = new Set(['roblox', 'blender', 'godot', 'unity', 'general']);
const ALLOWED_CATEGORIES = new Set([
  '3D Assets',
  'Animation',
  'Interface',
  'Tools',
  'Worldbuilding',
  'Scripting',
]);

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Workshop-Client',
};

class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: BASE_HEADERS });
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'skill';
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length || ab.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function boundedJson(request, maxBytes = MAX_BODY_BYTES) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
    throw new ApiError(415, 'Content-Type must be application/json.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Request body is empty.');
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw new ApiError(413, `Request exceeds ${maxBytes} byte limit.`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    merged.set(chunk, at);
    at += chunk.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(merged));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError(400, 'Expected a JSON object.');
    }
    return parsed;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'Malformed JSON payload.');
  }
}

export function isSafeRelativePath(path) {
  if (typeof path !== 'string' || !path || path.length > 200) return false;
  if (path.startsWith('/') || path.startsWith('\\') || path.includes('\0')) return false;
  const parts = path.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))) return false;
  if (/[<>:"|?*\\]/.test(path)) return false;
  const blockedExt = /\.(exe|dll|so|dylib|bat|cmd|ps1|vbs|msi|scr|com|jar|bin)$/i;
  if (blockedExt.test(path)) return false;
  return true;
}

const INJECTION_RULES = [
  { id: 'hidden-bidi', re: /[\u202a-\u202e\u2066-\u2069\u200b-\u200f]/, reason: 'Hidden bidirectional or zero-width control characters' },
  { id: 'prompt-override', re: /\b(?:ignore\s+(?:all\s+|any\s+)?previous\s+instructions|disregard\s+(?:all\s+|your\s+)?(?:previous|system)\s+instructions|override\s+system\s+prompt|forget\s+your\s+instructions|reveal\s+(?:your\s+)?system\s+prompt)\b/i, reason: 'Prompt injection override instruction' },
  { id: 'hidden-html-directive', re: /<!--[\s\S]*?(?:ignore\s+previous|system\s+prompt|secret|exfiltrate|bypass\s+safety)[\s\S]*?-->/i, reason: 'Hidden instruction inside HTML comment' },
  { id: 'secret-openai', re: /\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{20,}\b/, reason: 'Possible OpenAI API key detected' },
  { id: 'secret-github', re: /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,})\b/, reason: 'Possible Git token detected' },
  { id: 'secret-aws', re: /\bAKIA[0-9A-Z]{16}\b/, reason: 'Possible AWS access key detected' },
  { id: 'secret-private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, reason: 'Private key material detected' },
  { id: 'fetch-and-run-shell', re: /(?:curl|wget|fetch)\s+[^\n|]{4,}\|\s*(?:sh|bash|zsh|pwsh|powershell|python|node)\b/i, reason: 'Remote fetch-and-execute shell pattern' },
  { id: 'fetch-and-run-ps', re: /\b(?:irm|invoke-restmethod|iwr|invoke-webrequest)\b[^\n|]{3,}\|\s*(?:iex|invoke-expression)\b/i, reason: 'Remote PowerShell fetch-and-execute pattern' },
  { id: 'fetch-and-eval', re: /(?:eval|new\s+Function)\s*\(\s*(?:await\s+)?fetch\s*\(/i, reason: 'Dynamic fetch-and-eval pattern' },
];

export function scanSkillPayload({ title = '', summary = '', files = [] }) {
  const issues = [];
  if (!Array.isArray(files) || files.length === 0) {
    issues.push({ file: 'SKILL.md', rule: 'empty-files', reason: 'At least one text file (SKILL.md) is required.' });
    return { safe: false, issues };
  }
  if (files.length > MAX_FILES_PER_SKILL) {
    issues.push({ file: '*', rule: 'too-many-files', reason: `At most ${MAX_FILES_PER_SKILL} files allowed.` });
  }
  let totalBytes = 0;
  const enc = new TextEncoder();
  const checkText = (file, text) => {
    if (text.includes('\0')) {
      issues.push({ file, rule: 'null-byte', reason: 'Binary or null-byte content is not allowed.' });
      return;
    }
    for (const rule of INJECTION_RULES) {
      if (rule.re.test(text)) {
        issues.push({ file, rule: rule.id, reason: rule.reason });
      }
    }
  };
  checkText('metadata', `${title}\n${summary}`);
  let hasMain = false;
  for (const f of files) {
    const path = String(f?.path || '');
    const text = typeof f?.text === 'string' ? f.text : '';
    if (!isSafeRelativePath(path)) {
      issues.push({ file: path || '(empty)', rule: 'unsafe-path', reason: 'Unsafe or disallowed file path.' });
      continue;
    }
    if (path.toUpperCase() === 'SKILL.MD') hasMain = true;
    const size = enc.encode(text).length;
    if (size > MAX_FILE_BYTES) {
      issues.push({ file: path, rule: 'file-too-large', reason: `File exceeds ${MAX_FILE_BYTES} bytes.` });
    }
    totalBytes += size;
    checkText(path, text);
  }
  if (!hasMain) {
    issues.push({ file: 'SKILL.md', rule: 'missing-skill-md', reason: 'SKILL.md is required.' });
  }
  if (totalBytes > MAX_TOTAL_TEXT_BYTES) {
    issues.push({ file: '*', rule: 'total-too-large', reason: `Total size exceeds ${MAX_TOTAL_TEXT_BYTES} bytes.` });
  }
  return { safe: issues.length === 0, issues, totalBytes };
}

function bearerToken(request) {
  const raw = request.headers.get('authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function isOwner(request, env) {
  const expected = env.WORKSHOP_OWNER_TOKEN;
  if (!expected) return false;
  return constantTimeEqual(bearerToken(request), expected);
}

function requireOwner(request, env) {
  if (!env.WORKSHOP_OWNER_TOKEN) {
    throw new ApiError(503, 'Owner moderation secret is not configured on this worker.');
  }
  if (!isOwner(request, env)) {
    throw new ApiError(403, 'Owner authorization required.');
  }
}

async function resolveActor(request, env, { allowClientHeader = false } = {}) {
  const token = bearerToken(request);
  if (token) {
    if (env.WORKSHOP_OWNER_TOKEN && constantTimeEqual(token, env.WORKSHOP_OWNER_TOKEN)) {
      return { userId: 'owner:plazcode', username: 'PlazCode', owner: true };
    }
    if (env.WORKSHOP_UPLOAD_TOKEN && constantTimeEqual(token, env.WORKSHOP_UPLOAD_TOKEN)) {
      const alias = String(request.headers.get('x-workshop-client') || 'contributor').slice(0, 64);
      return { userId: 'token:' + (await sha256Hex(token + ':' + alias)).slice(0, 24), username: alias, owner: false };
    }
    if (env.ACCOUNT_SESSION_URL) {
      const res = await fetch(`${env.ACCOUNT_SESSION_URL.replace(/\/+$/, '')}/v1/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new ApiError(401, 'Invalid or expired account session.');
      const data = await res.json();
      if (!data?.profile?.id) throw new ApiError(401, 'Account profile missing.');
      return {
        userId: `acct:${data.profile.id}`,
        username: String(data.profile.username || 'community').slice(0, 48),
        owner: false,
      };
    }
    if (env.WORKSHOP_PUBLIC_UPLOADS === 'true') {
      const hash = (await sha256Hex(token)).slice(0, 24);
      return { userId: `user:${hash}`, username: '', owner: false };
    }
    throw new ApiError(401, 'Authentication token rejected.');
  }
  if (allowClientHeader) {
    const client = String(request.headers.get('x-workshop-client') || '').trim();
    if (client && client.length <= 80) {
      return { userId: 'client:' + (await sha256Hex(client)).slice(0, 24), username: 'community', owner: false };
    }
  }
  throw new ApiError(401, 'Sign in or provide a valid workshop token.');
}

async function enforceBudget(db, key, limit, windowMs, now) {
  const expires = now + windowMs;
  await db.prepare('DELETE FROM budgets WHERE id = ? AND expires_at <= ?').bind(key, now).run();
  const row = await db
    .prepare(
      'INSERT INTO budgets (id, used, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used'
    )
    .bind(key, expires, limit)
    .first();
  if (!row) throw new ApiError(429, 'Rate limit exceeded. Please try again later.');
}

function serializeSkillRow(row, includeFiles = false) {
  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch {}
  const out = {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    author: row.author,
    version: row.version,
    category: row.category,
    engine: row.engine,
    tags,
    body_bytes: row.body_bytes,
    file_count: row.file_count,
    status: row.status,
    featured: Boolean(row.featured),
    reviewed_by: row.reviewed_by || '',
    review_status: row.reviewed_by ? `reviewed by ${row.reviewed_by}` : 'community, not checked by PlazCode',
    rating_avg: Number(row.rating_avg || 0),
    rating_count: Number(row.rating_count || 0),
    report_count: Number(row.report_count || 0),
    install_count: Number(row.install_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (includeFiles) {
    try { out.files = JSON.parse(row.files_json || '[]'); } catch { out.files = []; }
    if (row.reject_reason) out.reject_reason = row.reject_reason;
  }
  return out;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: BASE_HEADERS });
    }
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const now = Date.now();

      if (path === '/api/v1/health' && request.method === 'GET') {
        return json({ ok: true, service: 'plazcode-workshop', version: 1, dbReady: Boolean(env?.DB) });
      }

      if (!env?.DB) throw new ApiError(503, 'Workshop D1 database binding is not configured.');
      const db = env.DB;

      // GET /api/v1/skills
      if (path === '/api/v1/skills' && request.method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        const kind = (url.searchParams.get('kind') || 'all').toLowerCase();
        const category = (url.searchParams.get('category') || '').trim();
        const engine = (url.searchParams.get('engine') || '').trim().toLowerCase();
        const sort = (url.searchParams.get('sort') || 'rating').toLowerCase();
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 48) || 48));
        const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);

        const where = ["status = 'approved'"];
        const params = [];
        if (kind === 'skill' || kind === 'specialist') {
          where.push('kind = ?');
          params.push(kind);
        }
        if (category && category !== 'All categories') {
          where.push('category = ?');
          params.push(category);
        }
        if (engine && engine !== 'all') {
          where.push('engine = ?');
          params.push(engine);
        }
        if (q) {
          where.push('(LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(tags) LIKE ? OR LOWER(author) LIKE ?)');
          const like = `%${q}%`;
          params.push(like, like, like, like);
        }
        const orderBy =
          sort === 'newest'
            ? 'featured DESC, created_at DESC'
            : sort === 'installs'
              ? 'featured DESC, install_count DESC, rating_avg DESC'
              : 'featured DESC, rating_avg DESC, install_count DESC, created_at DESC';

        const sql = `SELECT * FROM skills WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        const rows = await db.prepare(sql).bind(...params, limit, offset).all();
        return json({ ok: true, skills: (rows.results || []).map((r) => serializeSkillRow(r, false)) });
      }

      // GET /api/v1/skills/:id
      const skillGet = path.match(/^\/api\/v1\/skills\/([a-zA-Z0-9_-]{2,80})$/);
      if (skillGet && request.method === 'GET') {
        const id = skillGet[1];
        const row = await db.prepare('SELECT * FROM skills WHERE id = ?').bind(id).first();
        if (!row) throw new ApiError(404, 'Skill not found.');
        if (row.status !== 'approved' && !isOwner(request, env)) {
          throw new ApiError(404, 'Skill not found.');
        }
        return json({ ok: true, skill: serializeSkillRow(row, true) });
      }

      // POST /api/v1/skills
      if (path === '/api/v1/skills' && request.method === 'POST') {
        const actor = await resolveActor(request, env);
        await enforceBudget(db, `submit:${actor.userId}:${Math.floor(now / 86400000)}`, 25, 86400000, now);

        const body = await boundedJson(request, MAX_BODY_BYTES);
        const title = String(body.title || '').trim();
        const summary = String(body.summary || body.description || '').trim();
        const kind = ALLOWED_KINDS.has(body.kind) ? body.kind : 'skill';
        const category = ALLOWED_CATEGORIES.has(body.category) ? body.category : 'Tools';
        const engine = ALLOWED_ENGINES.has(String(body.engine || '').toLowerCase())
          ? String(body.engine).toLowerCase()
          : 'general';
        const version = String(body.version || '1.0.0').trim().slice(0, 24) || '1.0.0';
        const author = (actor.username || String(body.author || 'community')).trim().slice(0, 48) || 'community';
        const authorKey = actor.userId;

        const banned = await db
          .prepare('SELECT author_key FROM banned_authors WHERE author_key = ? OR author_key = ?')
          .bind(authorKey, author.toLowerCase())
          .first();
        if (banned) throw new ApiError(403, 'This author account is banned from submitting to the Workshop.');

        if (!title || title.length > 120) throw new ApiError(400, 'Title must be 1 to 120 characters.');
        if (!summary || summary.length > 600) throw new ApiError(400, 'Summary must be 1 to 600 characters.');

        const tags = Array.isArray(body.tags)
          ? body.tags.map((t) => String(t).trim().toLowerCase().slice(0, 32)).filter(Boolean).slice(0, 10)
          : [];
        const files = Array.isArray(body.files)
          ? body.files.map((f) => ({ path: String(f?.path || '').replace(/\\/g, '/'), text: String(f?.text || '') }))
          : [];

        const scan = scanSkillPayload({ title, summary, files });
        if (!scan.safe) {
          throw new ApiError(400, 'Submission blocked by safety scanner.', { issues: scan.issues });
        }

        const slug = slugify(body.slug || title);
        const id = `${slug}-${crypto.randomUUID().slice(0, 8)}`;
        const approved = actor.owner && body.approve !== false;
        const status = approved ? 'approved' : 'pending';
        const reviewedBy = approved ? 'PlazCode' : '';
        const featured = approved && body.featured === true ? 1 : 0;

        await db
          .prepare(
            `INSERT INTO skills (
              id, slug, kind, title, summary, author, author_key, version, category, engine,
              tags, files_json, body_bytes, file_count, status, featured, reviewed_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            slug,
            kind,
            title,
            summary,
            author,
            authorKey,
            version,
            category,
            engine,
            JSON.stringify(tags),
            JSON.stringify(files),
            scan.totalBytes,
            files.length,
            status,
            featured,
            reviewedBy,
            now,
            now
          )
          .run();

        const created = await db.prepare('SELECT * FROM skills WHERE id = ?').bind(id).first();
        return json(
          {
            ok: true,
            status,
            message: approved
              ? 'Published and approved in Workshop.'
              : 'Submitted for owner review. It becomes public once approved.',
            skill: serializeSkillRow(created, false),
          },
          201
        );
      }

      // POST /api/v1/skills/:id/rate
      const rateMatch = path.match(/^\/api\/v1\/skills\/([a-zA-Z0-9_-]{2,80})\/rate$/);
      if (rateMatch && request.method === 'POST') {
        const skillId = rateMatch[1];
        const actor = await resolveActor(request, env, { allowClientHeader: true });
        await enforceBudget(db, `rate:${actor.userId}:${Math.floor(now / 3600000)}`, 60, 3600000, now);
        const body = await boundedJson(request, MAX_SMALL_BODY_BYTES);
        const stars = Number(body.stars);
        if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
          throw new ApiError(400, 'Rating must be an integer between 1 and 5.');
        }
        const skill = await db.prepare("SELECT id, status FROM skills WHERE id = ? AND status = 'approved'").bind(skillId).first();
        if (!skill) throw new ApiError(404, 'Skill not found.');

        await db
          .prepare(
            'INSERT INTO ratings (skill_id, user_id, stars, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(skill_id, user_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at'
          )
          .bind(skillId, actor.userId, stars, now)
          .run();

        const agg = await db
          .prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(stars), 0) AS sum_stars FROM ratings WHERE skill_id = ?')
          .bind(skillId)
          .first();
        const cnt = Number(agg?.cnt || 0);
        const sum = Number(agg?.sum_stars || 0);
        const avg = cnt > 0 ? Math.round((sum / cnt) * 100) / 100 : 0;
        await db
          .prepare('UPDATE skills SET rating_sum = ?, rating_count = ?, rating_avg = ?, updated_at = ? WHERE id = ?')
          .bind(sum, cnt, avg, now, skillId)
          .run();
        return json({ ok: true, id: skillId, stars, rating_avg: avg, rating_count: cnt });
      }

      // POST /api/v1/skills/:id/report (3 reports auto-hide)
      const reportMatch = path.match(/^\/api\/v1\/skills\/([a-zA-Z0-9_-]{2,80})\/report$/);
      if (reportMatch && request.method === 'POST') {
        const skillId = reportMatch[1];
        const actor = await resolveActor(request, env, { allowClientHeader: true });
        await enforceBudget(db, `report:${actor.userId}:${Math.floor(now / 86400000)}`, 20, 86400000, now);
        const body = await boundedJson(request, MAX_SMALL_BODY_BYTES);
        const reason = String(body.reason || '').trim().slice(0, 300);
        if (!reason) throw new ApiError(400, 'Please include a short report reason.');
        const skill = await db.prepare('SELECT id, status FROM skills WHERE id = ?').bind(skillId).first();
        if (!skill || skill.status === 'removed') throw new ApiError(404, 'Skill not found.');

        await db
          .prepare(
            'INSERT INTO reports (skill_id, user_id, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(skill_id, user_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at'
          )
          .bind(skillId, actor.userId, reason, now)
          .run();

        const agg = await db.prepare('SELECT COUNT(*) AS cnt FROM reports WHERE skill_id = ?').bind(skillId).first();
        const count = Number(agg?.cnt || 0);
        const nextStatus = count >= 3 && skill.status === 'approved' ? 'hidden' : skill.status;
        await db
          .prepare('UPDATE skills SET report_count = ?, status = ?, updated_at = ? WHERE id = ?')
          .bind(count, nextStatus, now, skillId)
          .run();
        return json({ ok: true, id: skillId, report_count: count, status: nextStatus, hidden: nextStatus === 'hidden' });
      }

      // POST /api/v1/skills/:id/install
      const installMatch = path.match(/^\/api\/v1\/skills\/([a-zA-Z0-9_-]{2,80})\/install$/);
      if (installMatch && request.method === 'POST') {
        const skillId = installMatch[1];
        const skill = await db.prepare("SELECT id, install_count FROM skills WHERE id = ? AND status = 'approved'").bind(skillId).first();
        if (!skill) throw new ApiError(404, 'Skill not found.');
        const actorKey = String(request.headers.get('x-workshop-client') || 'anonymous').slice(0, 64);
        await enforceBudget(db, `install:${actorKey}:${Math.floor(now / 3600000)}`, 120, 3600000, now);
        await db.prepare('INSERT INTO installs (skill_id, actor, created_at) VALUES (?, ?, ?)').bind(skillId, actorKey, now).run();
        const updated = await db
          .prepare('UPDATE skills SET install_count = install_count + 1, updated_at = ? WHERE id = ? RETURNING install_count')
          .bind(now, skillId)
          .first();
        return json({ ok: true, id: skillId, install_count: Number(updated?.install_count ?? skill.install_count + 1) });
      }

      // Owner moderation endpoints
      if (path === '/api/v1/owner/queue' && request.method === 'GET') {
        requireOwner(request, env);
        const rows = await db
          .prepare("SELECT * FROM skills WHERE status IN ('pending', 'hidden') ORDER BY report_count DESC, created_at ASC LIMIT 100")
          .all();
        return json({ ok: true, queue: (rows.results || []).map((r) => serializeSkillRow(r, true)) });
      }

      if (path === '/api/v1/owner/approve' && request.method === 'POST') {
        requireOwner(request, env);
        const body = await boundedJson(request, MAX_SMALL_BODY_BYTES);
        const id = String(body.id || '').trim();
        if (!id) throw new ApiError(400, 'Skill id is required.');
        const featured = body.featured === true ? 1 : 0;
        const row = await db
          .prepare("UPDATE skills SET status = 'approved', reviewed_by = 'PlazCode', featured = ?, reject_reason = '', updated_at = ? WHERE id = ? RETURNING *")
          .bind(featured, now, id)
          .first();
        if (!row) throw new ApiError(404, 'Skill not found.');
        return json({ ok: true, skill: serializeSkillRow(row, false) });
      }

      if (path === '/api/v1/owner/reject' && request.method === 'POST') {
        requireOwner(request, env);
        const body = await boundedJson(request, MAX_SMALL_BODY_BYTES);
        const id = String(body.id || '').trim();
        const reason = String(body.reason || 'Does not meet Workshop guidelines.').trim().slice(0, 300);
        if (!id) throw new ApiError(400, 'Skill id is required.');
        const row = await db
          .prepare("UPDATE skills SET status = 'rejected', reject_reason = ?, updated_at = ? WHERE id = ? RETURNING *")
          .bind(reason, now, id)
          .first();
        if (!row) throw new ApiError(404, 'Skill not found.');
        return json({ ok: true, skill: serializeSkillRow(row, false) });
      }

      if (path === '/api/v1/owner/remove' && request.method === 'POST') {
        requireOwner(request, env);
        const body = await boundedJson(request, MAX_SMALL_BODY_BYTES);
        const id = String(body.id || '').trim();
        if (!id) throw new ApiError(400, 'Skill id is required.');
        const row = await db
          .prepare("UPDATE skills SET status = 'removed', updated_at = ? WHERE id = ? RETURNING id")
          .bind(now, id)
          .first();
        if (!row) throw new ApiError(404, 'Skill not found.');
        return json({ ok: true, id, removed: true });
      }

      if (path === '/api/v1/owner/ban' && request.method === 'POST') {
        requireOwner(request, env);
        const body = await boundedJson(request, MAX_SMALL_BODY_BYTES);
        const rawAuthor = String(body.author_key || body.author || '').trim();
        const reason = String(body.reason || 'Banned by owner.').trim().slice(0, 300);
        if (!rawAuthor) throw new ApiError(400, 'author_key is required.');
        const keys = new Set([rawAuthor, rawAuthor.toLowerCase()]);
        const existing = await db.prepare('SELECT DISTINCT author_key FROM skills WHERE author_key = ? OR LOWER(author) = ?').bind(rawAuthor, rawAuthor.toLowerCase()).all();
        for (const r of existing.results || []) if (r.author_key) keys.add(r.author_key);
        for (const key of keys) {
          await db
            .prepare('INSERT INTO banned_authors (author_key, reason, banned_at) VALUES (?, ?, ?) ON CONFLICT(author_key) DO UPDATE SET reason = excluded.reason, banned_at = excluded.banned_at')
            .bind(key, reason, now)
            .run();
        }
        await db
          .prepare("UPDATE skills SET status = 'removed', updated_at = ? WHERE author_key = ? OR LOWER(author) = ?")
          .bind(now, rawAuthor, rawAuthor.toLowerCase())
          .run();
        return json({ ok: true, author_key: rawAuthor, banned: true });
      }

      throw new ApiError(404, 'Not found.');
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ ok: false, error: error.message, ...(error.details || {}) }, error.status);
      }
      return json({ ok: false, error: 'Workshop service error.' }, 500);
    }
  },
};
