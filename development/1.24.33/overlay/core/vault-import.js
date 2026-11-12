// PlazCode vault import (1.24.21+): turns a folder of notes into vault notes under "10 Inbox/Imported <folder>/".
// Pure planning plus a runner that takes the vault call as a parameter, so it is easy to test.
// Rules: only .md notes; hidden/system folders, pictures and other files are skipped; notes that look like they hold
// secrets, notes over 60,000 characters, empty notes and notes whose name already exists are skipped and reported.
// The original text is kept exactly as written (the vault app stores it with its own front matter rules).
const PlazCodeVaultImport = (() => {
  const MAX_NOTES = 300, MAX_CHARS = 60000, MAX_BYTES = 300000, MAX_PATH = 240, INBOX = '10 Inbox';
  const RESERVED = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;
  const SKIP_DIRS = new Set(['node_modules', '.obsidian', '.git', '.trash', '.github', '__macosx']);
  const PICTURE = /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i;
  const REASONS = {
    hidden: 'Hidden or system folders and files (such as .obsidian and .git)',
    picture: 'Pictures (not imported yet)',
    'not-note': 'Other files that are not .md notes',
    empty: 'Empty notes',
    'too-long': 'Notes longer than 60,000 characters (split them first)',
    secret: 'Notes that look like they contain a password, key or token',
    'bad-name': 'Notes with a name the vault cannot store',
    'same-name': 'Notes whose name already exists in the vault',
    'over-limit': 'Beyond the 300 notes allowed in one import',
    failed: 'Notes the vault could not save',
  };
  const cleanSeg = (seg) => {
    let s = String(seg || '').replace(/[\u0000-\u001f<>:"|?*\\]/g, '-').replace(/[. ]+$/, '').trim().slice(0, 100);
    if (!s || s.startsWith('.')) return '';
    if (RESERVED.test(s.split('.')[0])) s = '_' + s;
    return s;
  };
  const folderName = (files) => { const first = (files[0] && String(files[0].path || '').split('/')[0]) || 'notes'; return cleanSeg(first).slice(0, 60) || 'notes'; };
  // files: [{path: "Folder/sub/note.md", size, text}]  (text is null for files that were not read)
  function plan(files, options) {
    const redact = options && typeof options.redact === 'function' ? options.redact : (t) => t;
    const list = Array.isArray(files) ? files : [];
    const folder = folderName(list), prefix = INBOX + '/Imported ' + folder + '/';
    const notes = [], skipped = [], seen = new Set();
    const skip = (rel, reason) => skipped.push({ rel, reason });
    for (const file of list) {
      const rel = String(file && file.path || '').replace(/\\/g, '/');
      const parts = rel.split('/').slice(1); // drop the picked folder's own name
      if (!parts.length) continue;
      if (parts.some((p) => p.startsWith('.') || SKIP_DIRS.has(p.toLowerCase()))) { skip(rel, 'hidden'); continue; }
      const leaf = parts[parts.length - 1];
      if (PICTURE.test(leaf)) { skip(rel, 'picture'); continue; }
      if (!/\.md$/i.test(leaf)) { skip(rel, 'not-note'); continue; }
      const segs = parts.map(cleanSeg);
      if (segs.some((s) => !s)) { skip(rel, 'bad-name'); continue; }
      segs[segs.length - 1] = segs[segs.length - 1].replace(/\.md$/i, '') + '.md';
      const dest = prefix + segs.join('/');
      if (dest.length > MAX_PATH) { skip(rel, 'bad-name'); continue; }
      const text = file.text;
      if (typeof text !== 'string' || (file.size || 0) > MAX_BYTES) { skip(rel, 'too-long'); continue; }
      const body = text.replace(/\r\n/g, '\n');
      if (!body.trim()) { skip(rel, 'empty'); continue; }
      if (body.length > MAX_CHARS) { skip(rel, 'too-long'); continue; }
      let secret = false; try { secret = redact(body) !== body; } catch { secret = true; }
      if (secret) { skip(rel, 'secret'); continue; }
      const key = dest.toLowerCase();
      if (seen.has(key)) { skip(rel, 'same-name'); continue; }
      seen.add(key);
      if (notes.length >= MAX_NOTES) { skip(rel, 'over-limit'); continue; }
      notes.push({ rel, dest, text: body });
    }
    return { folder, prefix, notes, skipped, counts: counts(skipped) };
  }
  function counts(skipped) { const out = {}; for (const s of skipped) out[s.reason] = (out[s.reason] || 0) + 1; return out; }
  // Writes the notes one at a time. call(request) is the vault call. Returns {imported, skipped, failed}.
  async function run(planned, call, options) {
    const opts = options || {}, imported = [], skipped = [], failed = [];
    let index = 0;
    for (const note of planned.notes) {
      if (opts.signal && opts.signal.aborted) break;
      index++;
      try {
        await call({ action: 'write', mode: 'create', path: note.dest, content: 'Importing this note.', frontmatter: { tags: ['imported'], origin: 'import' }, reason: 'imported from a folder' });
        try { await call({ action: 'save_raw', path: note.dest, text: note.text }); imported.push(note.dest); }
        catch (error) {
          failed.push({ rel: note.rel, reason: 'failed', why: String(error && error.message || error).slice(0, 160) });
          try { await call({ action: 'write', mode: 'replace', path: note.dest, content: 'This note could not be imported (' + String(error && error.message || error).slice(0, 120) + '). Original file: ' + note.rel + '.', reason: 'import failed' }); } catch { /* the stub says nothing wrong; leave it */ }
        }
      } catch (error) {
        const text = String(error && error.message || error);
        if (/already exists/i.test(text)) skipped.push({ rel: note.rel, reason: 'same-name' });
        else failed.push({ rel: note.rel, reason: 'failed', why: text.slice(0, 160) });
      }
      if (typeof opts.progress === 'function') opts.progress(index, planned.notes.length);
    }
    return { imported, skipped, failed };
  }
  const list = (items, max) => items.slice(0, max).map((s) => '- ' + s.rel + (s.why ? ' (' + s.why + ')' : '')).join('\n') + (items.length > max ? '\n- ... and ' + (items.length - max) + ' more' : '');
  // A plain report note (file names only, never note contents).
  function report(planned, result, when) {
    const all = [...planned.skipped, ...result.skipped, ...result.failed];
    const by = {}; for (const s of all) (by[s.reason] = by[s.reason] || []).push(s);
    const lines = ['# Import report: ' + planned.folder, '', 'Imported ' + result.imported.length + ' note' + (result.imported.length === 1 ? '' : 's') + ' from "' + planned.folder + '" on ' + (when || new Date().toISOString().slice(0, 10)) + '. They are in ' + planned.prefix.replace(/\/$/, '') + '. The original folder was not changed.', ''];
    for (const reason of Object.keys(REASONS)) {
      if (!by[reason]) continue;
      if (reason === 'hidden') { lines.push('## ' + REASONS[reason], '', by[reason].length + ' skipped (not listed).', ''); continue; }
      lines.push('## ' + REASONS[reason] + ' (' + by[reason].length + ')', '', list(by[reason], 60), '');
    }
    return lines.join('\n').trim() + '\n';
  }
  return { plan, run, report, counts, REASONS, limits: { MAX_NOTES, MAX_CHARS, MAX_BYTES, MAX_PATH } };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazCodeVaultImport;
