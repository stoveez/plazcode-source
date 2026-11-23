// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/workshop-ui.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
const PlazCodeWorkshopUI = (() => {
  'use strict';
  ;
  ;
  ;
  ;

  ;



















  const CATEGORIES = ['All categories', '3D Assets', 'Animation', 'Interface', 'Tools', 'Worldbuilding', 'Scripting'];

  function formatBytes(bytes) {
    if (!bytes || bytes < 1024) return Math.max(1, bytes || 0) + ' B';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function cardGlyph(category, kind) {
    if (kind === 'specialist') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l3 5.5L21 9.5l-4.5 4 1 6-5.5-3-5.5 3 1-6L3 9.5l6-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    }
    if (category === 'Interface') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M9 9v11" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    }
    if (category === 'Animation') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor"/></svg>';
    }
    if (category === '3D Assets') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l9 9-9 9-9-9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>';
  }

  const wsStyle = `<style>
.ws-shell{display:grid;gap:16px}
.ws-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px}
.ws-head h2{margin:0;font-size:28px;font-weight:700;letter-spacing:-.02em}
.ws-head p{margin:4px 0 0;font-size:13px;color:var(--ink-soft,#9aa8be)}
.ws-banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-radius:14px;border:1px solid var(--pz-line,var(--stroke,#253650));background:var(--pz-card,var(--surface,#0a1423))}
.ws-banner-info{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:12.5px}
.ws-dot{width:8px;height:8px;border-radius:50%;background:var(--amber,#ffb33f)}
.ws-dot.on{background:var(--green,#31e0a4);box-shadow:0 0 10px rgb(49 224 164/.6)}
.ws-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.ws-pills{display:inline-flex;gap:4px;padding:4px;border-radius:11px;border:1px solid var(--pz-line,var(--stroke,#253650));background:rgb(0 0 0/.2)}
.ws-pills button{padding:7px 14px;border-radius:8px;border:1px solid transparent;background:none;color:var(--ink-soft,#9aa8be);font-size:12.5px;font-weight:600;cursor:pointer}
.ws-pills button[aria-pressed=true]{background:var(--text,#f5f8ff);color:#09111d}
.ws-search{flex:1 1 240px;min-width:180px;padding:9px 13px;border-radius:11px;border:1px solid var(--pz-line,var(--stroke,#253650));background:rgb(0 0 0/.24);color:var(--text,#f5f8ff);font-size:13px}
.ws-select{padding:8px 11px;border-radius:10px;border:1px solid var(--pz-line,var(--stroke,#253650));background:var(--pz-card,var(--surface,#0a1423));color:var(--text,#f5f8ff);font-size:12.5px}
.ws-cats{display:flex;flex-wrap:wrap;gap:8px}
.ws-chip{padding:6px 13px;border-radius:999px;border:1px solid var(--pz-line,var(--stroke,#253650));background:rgb(255 255 255/.03);color:var(--ink-soft,#9aa8be);font-size:12px;font-weight:600;cursor:pointer}
.ws-chip[aria-pressed=true]{background:var(--text,#f5f8ff);border-color:var(--text,#f5f8ff);color:#09111d}
.ws-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
.ws-card{display:flex;flex-direction:column;border-radius:16px;border:1px solid var(--pz-line,var(--stroke,#253650));background:var(--pz-card,var(--surface,#0a1423));overflow:hidden;transition:border-color .18s ease,transform .18s ease}
.ws-card:hover{border-color:rgb(var(--pz-rgb,255 146 38)/.55);transform:translateY(-2px)}
.ws-card-banner{position:relative;height:78px;display:grid;place-items:center;background:radial-gradient(circle at 50% 0%,rgb(var(--pz-rgb,255 146 38)/.16),transparent 70%),linear-gradient(180deg,rgb(255 255 255/.04),transparent);border-bottom:1px solid var(--pz-line,var(--stroke,#1e2e46));color:var(--text,#f5f8ff)}
.ws-card-icon{width:40px;height:40px;border-radius:11px;border:1px solid var(--pz-line,var(--stroke,#2b3952));background:var(--canvas,#0a111d);display:grid;place-items:center}
.ws-badge{position:absolute;top:10px;right:10px;padding:3px 8px;border-radius:7px;font:700 10px/1.2 var(--pz-mono,monospace);letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--pz-line,#324766);background:rgb(0 0 0/.45);color:var(--text,#f5f8ff)}
.ws-badge.featured{border-color:rgb(var(--pz-rgb,255 146 38)/.65);color:var(--orange2,#ffc052)}
.ws-card-body{flex:1 1 auto;padding:14px 16px;display:grid;gap:8px;align-content:start}
.ws-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ws-kind-pill{padding:3px 8px;border-radius:6px;border:1px solid var(--pz-line,#2b3952);font:700 10px/1.1 var(--pz-mono,monospace);text-transform:uppercase;color:var(--ink-soft,#9aa8be)}
.ws-card-title{margin:0;font-size:15.5px;font-weight:700;color:var(--text,#f5f8ff)}
.ws-card-author{font-size:11.5px;color:var(--ink-soft,#9aa8be)}
.ws-card-review{font-size:11px;color:var(--green,#31e0a4)}
.ws-card-review.unreviewed{color:var(--amber,#ffb33f)}
.ws-card-summary{margin:0;font-size:12.5px;line-height:1.45;color:var(--ink-soft,#aebbd0);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ws-tags{display:flex;flex-wrap:wrap;gap:5px}
.ws-tag{padding:2px 8px;border-radius:6px;border:1px solid var(--pz-line,#22324a);background:rgb(255 255 255/.03);font:500 10.5px/1.3 var(--pz-mono,monospace);color:var(--ink-soft,#94a3b8)}
.ws-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 16px;border-top:1px solid var(--pz-line,var(--stroke,#1e2e46));background:rgb(0 0 0/.14)}
.ws-foot-meta{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--ink-soft,#94a3b8)}
.ws-rate-group{display:inline-flex;align-items:center;gap:2px}
.ws-star-btn{border:0;background:none;color:var(--muted,#657a97);cursor:pointer;padding:1px;font-size:13px;line-height:1}
.ws-star-btn.on{color:#ffc94d}
.ws-foot-actions{display:flex;align-items:center;gap:6px}
.ws-report-btn{padding:6px 8px;border-radius:8px;border:1px solid var(--pz-line,#2b3952);background:transparent;color:var(--ink-soft,#94a3b8);font-size:11.5px;cursor:pointer}
.ws-report-btn:hover{color:var(--red,#ff696c);border-color:var(--red,#ff696c)}
.ws-modal{position:fixed;inset:0;z-index:130;display:grid;place-items:center;background:rgb(4 8 15/.76);backdrop-filter:blur(8px);padding:20px}
.ws-modal[hidden]{display:none}
.ws-modal-card{width:min(620px,95vw);max-height:88vh;overflow-y:auto;display:grid;gap:12px;padding:22px;border-radius:18px;border:1px solid var(--pz-line,var(--stroke,#2b3952));background:var(--canvas,#0d1522);box-shadow:0 32px 90px rgb(0 0 0/.65)}
.ws-modal-card label{display:grid;gap:5px;font-size:12.5px}
.ws-modal-card input,.ws-modal-card textarea,.ws-modal-card select{width:100%;padding:8px 10px;border-radius:9px;border:1px solid var(--pz-line,#2b3952);background:rgb(0 0 0/.24);color:var(--text,#f5f8ff);box-sizing:border-box}
.ws-form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:600px){.ws-form-row{grid-template-columns:1fr}}
.ws-scan-box{padding:10px 12px;border-radius:10px;border:1px solid var(--pz-line,#2b3952);font-size:12px}
.ws-scan-box.ok{border-color:#31e0a466;color:#31e0a4}
.ws-scan-box.bad{border-color:#ff696c66;color:#ff696c}
</style>`;

  function mount(host, api, getPreferences, setPreferences, goPage) {
    host.innerHTML = wsStyle + `
<div class="ws-shell">
  <div class="ws-head">
    <div>
      <h2>Workshop</h2>
      <p>Share skills and specialists with the community, or install theirs in one click.</p>
    </div>
    <span data-ws="status" style="font-size:12.5px;color:var(--ink-soft,#9aa8be)" role="status" aria-live="polite"></span>
  </div>

  <div class="ws-banner">
    <div class="ws-banner-info">
      <span class="ws-dot" data-ws="reg-dot"></span>
      <strong>Public Registry</strong>
      <span data-ws="reg-text" style="color:var(--ink-soft,#9aa8be)">Offline starter catalog · Set a Cloudflare Worker URL to browse and publish live</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="softbtn" data-ws="reg-config">Configure Registry</button>
      <button type="button" class="softbtn" data-ws="reg-settings" hidden>Settings</button>
    </div>
  </div>

  <div class="ws-toolbar">
    <div class="ws-pills" role="group" aria-label="Filter by type">
      <button type="button" data-ws-kind="all" aria-pressed="true">All</button>
      <button type="button" data-ws-kind="skill" aria-pressed="false">Skills</button>
      <button type="button" data-ws-kind="specialist" aria-pressed="false">Specialists</button>
    </div>
    <input type="search" class="ws-search" data-ws="search" placeholder="Search the workshop..." aria-label="Search the workshop">
    <select class="ws-select" data-ws="engine" aria-label="Filter by engine">
      <option value="all">All engines</option>
      <option value="roblox">Roblox</option>
      <option value="blender">Blender</option>
      <option value="godot">Godot</option>
      <option value="unity">Unity</option>
      <option value="general">General</option>
    </select>
    <select class="ws-select" data-ws="sort" aria-label="Sort results">
      <option value="rating">Top rated</option>
      <option value="installs">Most installed</option>
      <option value="newest">Newest</option>
    </select>
    <button type="button" class="softbtn" data-ws="import-pkg">Import Package</button>
    <input type="file" data-ws="import-pkg-file" accept=".plazskill,.zip" hidden>
    <button type="button" class="accentbtn" data-ws="open-upload">Upload a Skill</button>
  </div>

  <div class="ws-cats" data-ws="categories" role="group" aria-label="Categories"></div>
  <div class="ws-grid" data-ws="grid"></div>

  <div class="ws-modal" data-ws="upload-modal" hidden role="dialog" aria-modal="true" aria-label="Upload a Skill">
    <div class="ws-modal-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Upload a Skill</h3>
        <button type="button" class="softbtn" data-ws="upload-close">Close</button>
      </div>
      <label>Local skill
        <select data-ws="up-skill"></select>
      </label>
      <div class="ws-form-row">
        <label>Title<input type="text" data-ws="up-title" placeholder="Skill or Specialist title"></label>
        <label>Type
          <select data-ws="up-kind"><option value="skill">Skill</option><option value="specialist">Specialist</option></select>
        </label>
      </div>
      <label>Summary<textarea rows="2" data-ws="up-summary" placeholder="What does this skill or specialist do?"></textarea></label>
      <div class="ws-form-row">
        <label>Category
          <select data-ws="up-category">
            <option>3D Assets</option><option>Animation</option><option>Interface</option>
            <option selected>Tools</option><option>Worldbuilding</option><option>Scripting</option>
          </select>
        </label>
        <label>Engine
          <select data-ws="up-engine">
            <option value="roblox">Roblox</option><option value="blender">Blender</option>
            <option value="godot">Godot</option><option value="unity">Unity</option><option value="general">General</option>
          </select>
        </label>
      </div>
      <div class="ws-form-row">
        <label>Author<input type="text" data-ws="up-author" placeholder="Your handle"></label>
        <label>Version<input type="text" data-ws="up-version" value="1.0.0"></label>
      </div>
      <label>Tags (comma-separated)<input type="text" data-ws="up-tags" placeholder="ui, roblox, layout"></label>
      <div class="ws-scan-box" data-ws="up-scan-result" hidden></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center">
        <button type="button" class="softbtn" data-ws="up-scan">Run Safety Check</button>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="softbtn" data-ws="up-export">Export .plazskill</button>
          <button type="button" class="accentbtn" data-ws="up-submit">Submit to Registry</button>
        </div>
      </div>
    </div>
  </div>

  <div class="ws-modal" data-ws="report-modal" hidden role="dialog" aria-modal="true" aria-label="Report Workshop Item">
    <div class="ws-modal-card" style="width:min(440px,94vw)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Report Skill</h3>
        <button type="button" class="softbtn" data-ws="rep-close">Close</button>
      </div>
      <p style="margin:0;font-size:12.5px;color:var(--ink-soft,#9aa8be)">Items with 3 community reports are automatically hidden for owner review.</p>
      <label>Reason<textarea rows="3" data-ws="rep-reason" placeholder="Describe prompt injection, broken steps, or unsafe instructions..."></textarea></label>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button type="button" class="dangerbtn" data-ws="rep-submit">Submit Report</button>
      </div>
    </div>
  </div>

  <div class="ws-modal" data-ws="reg-modal" hidden role="dialog" aria-modal="true" aria-label="Workshop Registry Settings">
    <div class="ws-modal-card" style="width:min(480px,94vw)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Workshop Registry URL</h3>
        <button type="button" class="softbtn" data-ws="reg-close">Close</button>
      </div>
      <p style="margin:0;font-size:12.5px;color:var(--ink-soft,#9aa8be)">Connect to a deployed PlazCode Workshop Cloudflare Worker (leave blank for built-in offline catalog).</p>
      <label>Registry URL (workshopRegistryUrl)
        <input type="url" data-ws="reg-input" placeholder="https://plazcode-workshop.workers.dev">
      </label>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button type="button" class="accentbtn" data-ws="reg-save">Save URL</button>
      </div>
    </div>
  </div>
</div>`;

    const find = (name) => host.querySelector('[data-ws="' + name + '"]');
    const status = (msg) => { find('status').textContent = msg || ''; };
    let kindFilter = 'all', categoryFilter = 'All categories', items = [], installedIds = new Set();
    let localRatings = {}, localSkills = [], reportTargetId = '', busy = false;

    const run = (fn) => async (...args) => {
      if (busy) return;
      busy = true;
      try { await fn(...args); } catch (e) { status((e)?.message || String(e)); } finally { busy = false; }
    };

    function renderCategories() {
      const box = find('categories');
      box.replaceChildren();
      for (const cat of CATEGORIES) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ws-chip';
        btn.setAttribute('aria-pressed', String(categoryFilter === cat));
        btn.textContent = cat;
        btn.onclick = () => { categoryFilter = cat; renderCategories(); void refresh(); };
        box.appendChild(btn);
      }
    }

    function renderGrid() {
      const grid = find('grid');
      grid.replaceChildren();
      if (!items.length) {
        const empty = document.createElement('p');
        empty.style.color = 'var(--ink-soft,#9aa8be)';
        empty.textContent = 'No matching skills or specialists found.';
        grid.appendChild(empty);
        return;
      }
      for (const item of items) {
        const card = document.createElement('article');
        card.className = 'ws-card';
        card.setAttribute('data-ws-card', item.id);

        const banner = document.createElement('div');
        banner.className = 'ws-card-banner';
        const icon = document.createElement('div');
        icon.className = 'ws-card-icon';
        icon.innerHTML = cardGlyph(item.category, item.kind);
        const badge = document.createElement('span');
        badge.className = 'ws-badge' + (item.badge === 'FEATURED' ? ' featured' : '');
        badge.textContent = item.badge || 'COMMUNITY';
        banner.append(icon, badge);

        const body = document.createElement('div');
        body.className = 'ws-card-body';
        const top = document.createElement('div');
        top.className = 'ws-card-top';
        const kindPill = document.createElement('span');
        kindPill.className = 'ws-kind-pill';
        kindPill.textContent = item.kind === 'specialist' ? 'Specialist' : 'Skill';
        const catSmall = document.createElement('small');
        catSmall.style.color = 'var(--ink-soft,#94a3b8)';
        catSmall.textContent = item.category;
        top.append(kindPill, catSmall);

        const title = document.createElement('h3');
        title.className = 'ws-card-title';
        title.textContent = item.title;

        const author = document.createElement('div');
        author.className = 'ws-card-author';
        author.textContent = `${item.author} · v${item.version}`;

        const review = document.createElement('div');
        const isReviewed = item.review_status.startsWith('reviewed');
        review.className = 'ws-card-review' + (isReviewed ? '' : ' unreviewed');
        review.textContent = item.review_status;

        const summary = document.createElement('p');
        summary.className = 'ws-card-summary';
        summary.textContent = item.summary;

        const tags = document.createElement('div');
        tags.className = 'ws-tags';
        for (const t of (item.tags || []).slice(0, 4)) {
          const pill = document.createElement('span');
          pill.className = 'ws-tag';
          pill.textContent = t;
          tags.appendChild(pill);
        }
        body.append(top, title, author, review, summary, tags);

        const foot = document.createElement('div');
        foot.className = 'ws-card-foot';
        const meta = document.createElement('div');
        meta.className = 'ws-foot-meta';
        const sizeSpan = document.createElement('span');
        sizeSpan.textContent = `${formatBytes(item.body_bytes)} · ${item.file_count} file${item.file_count === 1 ? '' : 's'}`;
        const rateWrap = document.createElement('span');
        rateWrap.className = 'ws-rate-group';
        const curRating = localRatings[item.id] || Math.round(item.rating_avg || 0);
        for (let s = 1; s <= 5; s++) {
          const star = document.createElement('button');
          star.type = 'button';
          star.className = 'ws-star-btn' + (s <= curRating ? ' on' : '');
          star.textContent = '★';
          star.title = `Rate ${s} star${s === 1 ? '' : 's'}`;
          star.onclick = run(async () => {
            const res = await api('/api/workshop/rate', { method: 'POST', body: JSON.stringify({ id: item.id, stars: s }) });
            localRatings[item.id] = s;
            item.rating_avg = res?.rating_avg ?? s;
            renderGrid();
            status(`Rated ${item.title} ${s}/5.`);
          });
          rateWrap.appendChild(star);
        }
        meta.append(sizeSpan, rateWrap);

        const actions = document.createElement('div');
        actions.className = 'ws-foot-actions';
        const repBtn = document.createElement('button');
        repBtn.type = 'button';
        repBtn.className = 'ws-report-btn';
        repBtn.textContent = 'Report';
        repBtn.onclick = () => {
          reportTargetId = item.id;
          find('rep-reason').value = '';
          find('report-modal').hidden = false;
        };
        const instBtn = document.createElement('button');
        instBtn.type = 'button';
        instBtn.className = installedIds.has(item.id) ? 'softbtn' : 'accentbtn';
        instBtn.setAttribute('data-ws-install', item.id);
        instBtn.textContent = installedIds.has(item.id) ? 'Installed' : 'Install';
        instBtn.onclick = run(async () => {
          status(`Installing ${item.title}…`);
          const res = await api('/api/workshop/install', { method: 'POST', body: JSON.stringify({ id: item.id }) });
          installedIds.add(item.id);
          renderGrid();
          status(`Installed "${res?.installed?.title || item.title}" as a community skill (${res?.installed?.id || ''}).`);
        });
        actions.append(repBtn, instBtn);
        foot.append(meta, actions);

        card.append(banner, body, foot);
        grid.appendChild(card);
      }
    }

    async function refresh() {
      const q = encodeURIComponent(find('search').value.trim());
      const cat = encodeURIComponent(categoryFilter);
      const eng = encodeURIComponent(find('engine').value);
      const sort = encodeURIComponent(find('sort').value);
      const res = await api(`/api/workshop/catalog?q=${q}&kind=${kindFilter}&category=${cat}&engine=${eng}&sort=${sort}`);
      items = res?.items || [];
      installedIds = new Set(res?.installed_ids || []);
      localRatings = res?.local_ratings || {};
      localSkills = res?.local_skills || [];

      const regUrl = String(res?.registry_url || getPreferences()?.workshopRegistryUrl || '');
      const regState = String(res?.registry_status || 'offline');
      const dot = find('reg-dot');
      dot.className = 'ws-dot' + (regState === 'connected' ? ' on' : '');
      find('reg-text').textContent = regState === 'connected'
        ? `Connected to ${regUrl} · Browse and publish live`
        : (regUrl ? `Registry offline (${res?.registry_error || 'unreachable'}) · Showing built-in starter catalog` : 'Offline starter catalog · Configure a Cloudflare Worker URL to browse & publish live');

      renderGrid();
    }

    function populateUploadSkills() {
      const sel = find('up-skill');
      sel.replaceChildren();
      for (const s of localSkills) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.title || s.id} (${s.files?.length || 1} files)`;
        sel.appendChild(opt);
      }
      const syncSelected = () => {
        const chosen = localSkills.find(s => s.id === sel.value);
        if (!chosen) return;
        find('up-title').value = chosen.title || '';
        find('up-summary').value = chosen.description || '';
        find('up-engine').value = chosen.domain === 'blender' ? 'blender' : (chosen.domain === 'local' ? 'general' : 'roblox');
      };
      sel.onchange = syncSelected;
      syncSelected();
    }

    host.querySelectorAll('[data-ws-kind]').forEach(btn => {
      btn.onclick = () => {
        kindFilter = btn.getAttribute('data-ws-kind') || 'all';
        host.querySelectorAll('[data-ws-kind]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        void refresh();
      };
    });
    find('search').addEventListener('input', () => { void refresh(); });
    find('engine').addEventListener('change', () => { void refresh(); });
    find('sort').addEventListener('change', () => { void refresh(); });

    find('import-pkg').onclick = () => find('import-pkg-file').click();
    find('import-pkg-file').onchange = run(async () => {
      const input = find('import-pkg-file');
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.slice(i, i + 8192));
      const res = await api('/api/workshop/install', { method: 'POST', body: JSON.stringify({ zip: btoa(bin) }) });
      status(`Imported package as "${res?.installed?.title || file.name}" (${res?.installed?.id || ''}).`);
    });

    find('open-upload').onclick = () => {
      populateUploadSkills();
      find('up-scan-result').hidden = true;
      find('upload-modal').hidden = false;
    };
    find('upload-close').onclick = () => { find('upload-modal').hidden = true; };

    function uploadPayload() {
      const tags = find('up-tags').value.split(',').map(t => t.trim()).filter(Boolean);
      return {
        skill_id: find('up-skill').value,
        title: find('up-title').value.trim(),
        summary: find('up-summary').value.trim(),
        kind: find('up-kind').value,
        category: find('up-category').value,
        engine: find('up-engine').value,
        author: find('up-author').value.trim() || 'community',
        version: find('up-version').value.trim() || '1.0.0',
        tags,
      };
    }

    find('up-scan').onclick = run(async () => {
      const payload = uploadPayload();
      const res = await api('/api/workshop/scan', { method: 'POST', body: JSON.stringify({ skill_id: payload.skill_id }) });
      const box = find('up-scan-result');
      box.hidden = false;
      const v = res?.validation || {};
      const safe = Boolean(v?.safety?.safe);
      box.className = 'ws-scan-box ' + (safe ? 'ok' : 'bad');
      box.textContent = safe
        ? 'Safety check passed: no prompt injections, secrets, or unsafe paths.'
        : 'Blocked: ' + (v?.safety?.issues || []).map((i) => i.reason).join('; ');
    });

    find('up-export').onclick = run(async () => {
      const payload = uploadPayload();
      const res = await api('/api/workshop/export', { method: 'POST', body: JSON.stringify(payload) });
      const bin = atob(res.zip_base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || 'skill.plazskill';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status(`Exported ${res.filename} (${formatBytes(res.bytes)}).`);
    });

    find('up-submit').onclick = run(async () => {
      const payload = uploadPayload();
      const res = await api('/api/workshop/upload', { method: 'POST', body: JSON.stringify(payload) });
      find('upload-modal').hidden = true;
      status(res?.message || 'Submitted to Workshop.');
      await refresh();
    });

    find('rep-close').onclick = () => { find('report-modal').hidden = true; };
    find('rep-submit').onclick = run(async () => {
      const reason = find('rep-reason').value.trim();
      if (!reason) throw Error('Enter a reason for the report.');
      await api('/api/workshop/report', { method: 'POST', body: JSON.stringify({ id: reportTargetId, reason }) });
      find('report-modal').hidden = true;
      status('Report recorded. Thank you.');
    });

    find('reg-config').onclick = () => {
      find('reg-input').value = String(getPreferences()?.workshopRegistryUrl || '');
      find('reg-modal').hidden = false;
    };
    if (goPage) {
      find('reg-settings').hidden = false;
      find('reg-settings').onclick = () => goPage('settings', 'general');
    }
    find('reg-close').onclick = () => { find('reg-modal').hidden = true; };
    find('reg-save').onclick = run(async () => {
      const url = find('reg-input').value.trim();
      await setPreferences({ workshopRegistryUrl: url });
      find('reg-modal').hidden = true;
      await refresh();
      status(url ? 'Workshop registry URL saved.' : 'Switched to offline starter catalog.');
    });

    renderCategories();
    return { refresh };
  }

  return { mount };
})();
if (typeof module !== 'undefined') module.exports = PlazCodeWorkshopUI;
