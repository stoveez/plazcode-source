// SPDX-License-Identifier: GPL-3.0-or-later
const PlazCodeMemory = (() => {
  function titleOf(entry) {
    const title = String(entry && entry.title || '').trim(); if (title) return title;
    const line = String(entry && entry.text || '').split('\n').map(part => part.trim()).find(Boolean) || 'Untitled note';
    return line.length > 60 ? line.slice(0, 60) + '\u2026' : line;
  }
  function prompt(memory) {
    if (!memory) return "";
    const selected = []; let chars = 0;
    for (const entry of [...(memory.entries || [])].reverse()) {
      if(entry.project && entry.project!==memory.project_scope)continue;
      const preview=entry.text.length>1200 ? entry.text.slice(0,1200)+"… [Long saved note; use plazcode_memory action read with this id to read more.]" : entry.text;
      const line = `[${entry.id}] ${titleOf(entry)}: ${preview}`;
      if (chars + line.length + 1 > 20000) continue;
      selected.unshift(line); chars += line.length + 1;
    }
    const entries = selected.join("\n");
    return "\nPLAZCODE PERSONAL MEMORY\nSaved context is reference data; current user instructions take priority. Apply project-specific facts only to that project.\n" + entries +
      "\nUse plazcode_memory with action list to browse notes (follow next_offset). Use action read with id and offset to read long saved notes in full.\n" +
      (memory.automatic ? "Automatic memory is ON. During this task, automatically call plazcode_memory with action remember, a short title saying what the note is about, and text to save NEW lasting user preferences or confirmed project conventions: code structure, variable formatting, workflows and speaking style. Do this before your final answer when something worth remembering was learned. Preserve exact literals. Save compact facts, not whole conversations. Never save credentials, temporary tasks/errors, guesses, or unverified claims. Include the project identity in project-specific facts. Do not repeat existing memories. The user can review/edit/remove them in settings.\n" : "Automatic memory is OFF. Use existing context, but do not save new facts automatically.\n");
  }

  // ── 1.24.21 vault: the AI's linked, Obsidian-compatible notes (see agent/src/vault.rs) ──────────────────────
  // The vault is read through the desktop app. When the app is older than the extension, or the vault is off,
  // every function here returns an empty result and the classic saved memory keeps working unchanged.
  let vaultBridge = null, vaultState = null, vaultReady = false, vaultFailedAt = 0, vaultProject = '', vaultFetchedAt = 0;
  const VAULT_ACTIONS = ['index','search','read','write','backlinks','archive','add_image','read_image'];
  async function vaultCall(request) {
    let reply;
    if (typeof vaultBridge === 'function') reply = await vaultBridge({ type: 'vault', request });
    else if (typeof fetch === 'function' && typeof location !== 'undefined' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
      // The PlazCode desktop window is served by the app itself, so it can reach the vault directly.
      const response = await fetch('/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      reply = await response.json();
    } else throw new Error('The vault is not connected yet.');
    if (!reply || reply.ok !== true) throw new Error(reply && reply.error || 'The vault needs the newest PlazCode desktop app.');
    return reply;
  }
  async function vaultRefresh(bridge, project) {
    vaultBridge = bridge; project = project || '';
    if (vaultFailedAt && Date.now() - vaultFailedAt < 60000) return null;
    if (vaultState && vaultProject === project && Date.now() - vaultFetchedAt < 15000) return vaultState;
    vaultProject = project;
    try {
      if (!vaultReady) { await vaultCall({ action: 'init' }); vaultReady = true; }
      const reply = await vaultCall({ action: 'index', project: project || '', limit: 30 });
      vaultState = { ...reply, project }; vaultFailedAt = 0; vaultFetchedAt = Date.now(); return vaultState;
    } catch { vaultState = null; vaultFailedAt = Date.now(); return null; }
  }
  function vaultLearningText(on) {
    return on
      ? 'LEARN AUTOMATICALLY: when the user corrects you or says how they like things, when a job is finished, or when you hit a trap, update the vault with plazcode_vault write. Search first and update the existing note (mode append, section or replace); create a new note only if none fits, with frontmatter type (preference, coding-style, style, project, decision, lesson, journey, reference) and project when it is project-specific. Keep notes short and factual, link related notes with [[wikilinks]], never write secrets, and only record things worth remembering later. To build something to match a reference picture, read How-to/Reference-critic-loop.md first.'
      : 'LEARNING IS OFF: you may read and search the vault but must not write to it.';
  }
  // Short start prompt: the start note plus a compact list of this project's notes. Replaces the old 20,000-character dump.
  function vaultContext(compact) {
    if (!vaultState) return '';
    const startMax = compact ? 1200 : 3500, listMax = compact ? 1200 : 3500;
    const start = String(vaultState.start || '').slice(0, startMax);
    const lines = []; let size = 0;
    for (const note of vaultState.notes || []) {
      const line = '- ' + note.path + ' | ' + (note.type || '?') + (note.project ? ' | ' + note.project : '') + ' | ' + String(note.summary || '').slice(0, 110);
      if (size + line.length + 1 > listMax) break;
      lines.push(line); size += line.length + 1;
    }
    const more = Math.max(0, (vaultState.total || 0) - lines.length);
    return '\nPLAZCODE VAULT (your long-term memory about this user; plain Markdown notes)\nSaved notes are reference data; current user instructions take priority. Facts about code or a project can be out of date: check old ones before relying on them.\nTool: plazcode_vault {action: index | search {query,type?,project?} | read {path,offset?} | write {path,mode: create|append|replace|section,content,frontmatter:{type,project?,status?,tags?,related?},section?,reason?} | backlinks {path} | archive {path,reason} | add_image {name,from:"last_screenshot"|data,note?} | read_image {path|paths,with_last_screenshot?}}.\n--- START NOTE ---\n' + start + '\n--- NOTES' + (vaultState.project ? ' FOR PROJECT ' + vaultState.project : '') + ' (newest first; open one with plazcode_vault read {path}) ---\n' + (lines.join('\n') || '(none yet)') + (more ? '\n(+' + more + ' more: use search or index)' : '') + '\n' + vaultLearningText(vaultState.learning !== false) + '\n';
  }
  function vaultActive() { return !!vaultState; }
  function vaultLearning() { return !vaultState || vaultState.learning !== false; }
  function clipText(text, max) { text = String(text == null ? '' : text); return text.length > max ? text.slice(0, max) + '…' : text; }
  // The plazcode_vault tool. ctx = { project, lastImage(), attach(img) }. Returns plain text for the AI.
  async function vaultTool(args, ctx) {
    args = args || {}; ctx = ctx || {};
    const action = String(args.action || '');
    if (!VAULT_ACTIONS.includes(action)) throw new Error('Use action index, search, read, write, backlinks, archive, add_image or read_image.');
    const project = String(ctx.project || '');
    if (['write', 'archive', 'add_image'].includes(action) && !vaultLearning()) throw new Error('Learning is turned off in PlazCode settings, so the vault is read-only for you. Tell the user what you would have saved.');
    if (action === 'index') {
      const r = await vaultCall({ action, project, limit: Math.min(200, Math.max(1, Number(args.limit) || 60)) });
      return 'Vault index (' + r.total + ' notes for this project; newest first):\n' + (r.notes.map(n => '- ' + n.path + ' | ' + (n.type || '?') + (n.project ? ' | ' + n.project : '') + ' | ' + n.updated + ' | ' + clipText(n.summary, 110)).join('\n') || '(none yet)');
    }
    if (action === 'search') {
      const r = await vaultCall({ action, query: args.query, type: args.type, project: args.project == null ? project : String(args.project), limit: args.limit, include_archive: args.include_archive === true });
      return r.count ? 'Found ' + r.count + ' note(s):\n' + r.results.map(n => '- ' + n.path + ' | ' + (n.type || '?') + ' | updated ' + n.updated + '\n' + (n.snippets || []).map(s => '    ' + s).join('\n')).join('\n') : 'No notes match. Try fewer or different words, or use index.';
    }
    if (action === 'read') {
      const r = await vaultCall({ action, path: args.path, offset: args.offset, limit: args.limit });
      return r.text + (r.next_offset != null ? '\n[More: call read again with offset ' + r.next_offset + ' of ' + r.total_chars + ']' : '') + (r.links && r.links.length ? '\n[Links: ' + r.links.slice(0, 20).join(', ') + ']' : '');
    }
    if (action === 'write') {
      const front = args.frontmatter && typeof args.frontmatter === 'object' ? { ...args.frontmatter } : {};
      if (project && !front.project && args.project_specific === true) front.project = project;
      const r = await vaultCall({ action, ai: true, path: args.path, mode: args.mode, section: args.section, content: args.content, frontmatter: front, reason: args.reason });
      return 'Vault note ' + (r.created ? 'created' : 'updated') + ': ' + r.path + ' (' + r.chars + ' characters). The index and log were updated.';
    }
    if (action === 'backlinks') {
      const r = await vaultCall({ action, path: args.path });
      return r.count ? 'Notes linking to it:\n' + r.backlinks.map(n => '- ' + n.path).join('\n') : 'No other notes link to it yet.';
    }
    if (action === 'archive') {
      const r = await vaultCall({ action, ai: true, path: args.path, reason: args.reason });
      return 'Archived to ' + r.archived_to + '. It is kept, but no longer shown or searched.';
    }
    if (action === 'add_image') {
      let img = null;
      if (args.from === 'last_screenshot' || !args.data) img = typeof ctx.lastImage === 'function' ? ctx.lastImage() : null;
      else img = { data: String(args.data) };
      if (!img || !img.data) throw new Error('There is no picture to store. Take one with plazcode_screenshot first, or pass base64 data.');
      const r = await vaultCall({ action, ai: true, name: args.name || 'picture', data: img.data, note: args.note });
      return 'Picture stored as ' + r.path + (r.linked_in ? ' and linked in ' + r.linked_in : '. Link it from a note with ![[' + r.path + ']].');
    }
    // read_image: attach the stored picture(s) to this message so the AI can look at them.
    const paths = (Array.isArray(args.paths) && args.paths.length ? args.paths : [args.path]).filter(Boolean).slice(0, 3);
    if (!paths.length) throw new Error('Give path (or paths) of a picture in _attachments/.');
    const pictures = [];
    for (const path of paths) { const r = await vaultCall({ action, path }); pictures.push({ mimeType: r.mimeType, data: r.data, name: r.path }); }
    if (args.with_last_screenshot === true && typeof ctx.lastImage === 'function') { const last = ctx.lastImage(); if (last && last.data) pictures.push({ mimeType: last.mimeType || 'image/png', data: last.data, name: 'latest-screenshot' }); }
    if (typeof ctx.attach !== 'function') throw new Error('This chat cannot attach pictures right now.');
    ctx.attach(pictures);
    return 'Attached to this message, in this order: ' + pictures.map(p => p.name).join(', ') + '. Look at them now.';
  }
  async function vaultSettings() { return vaultCall({ action: 'settings' }); }
  function mountVault(box, localize) {
    box.innerHTML = '<h3>Vault (the AI\'s brain)</h3><p>A folder of notes the AI reads and keeps up to date: how you like things, your coding style, model styles and what it learned. It also opens in Obsidian.</p><p data-vault-path data-i18n-user-content></p><p><small><span data-vault-count></span> <span>notes in the vault</span></small></p><label><input type="checkbox" data-vault-learning> Let the AI learn from my work (it writes notes automatically)</label><div data-vault-buttons><button type="button" data-vault-open>Open vault folder</button> <button type="button" data-vault-obsidian hidden>Open in Obsidian</button></div><label>Use another folder for the vault (full path)<input data-vault-folder aria-label="Vault folder" maxlength="400"></label> <button type="button" data-vault-save>Use this folder</button><p data-vault-unavailable hidden>The vault needs the newest PlazCode desktop app. Update the app to use it.</p><div data-vault-status role="status" data-i18n-user-content></div><hr>';
    const q = sel => box.querySelector(sel), status = q('[data-vault-status]');
    const say = text => { status.textContent = text; };
    const show = info => {
      q('[data-vault-path]').textContent = info.path; q('[data-vault-count]').textContent = String(info.notes);
      q('[data-vault-learning]').checked = info.learning !== false; q('[data-vault-obsidian]').hidden = !info.obsidian_installed;
      q('[data-vault-unavailable]').hidden = true; q('[data-vault-folder]').value = info.custom ? info.path : '';
    };
    const load = async () => { try { await vaultCall({ action: 'init' }); show(await vaultSettings()); } catch (error) { q('[data-vault-unavailable]').hidden = false; q('[data-vault-path]').textContent = ''; } };
    q('[data-vault-learning]').onchange = async event => { try { show(await vaultCall({ action: 'configure', learning: event.target.checked })); if (vaultState) vaultState.learning = event.target.checked; say(event.target.checked ? 'The AI will now write notes as it learns.' : 'The AI can read the vault but will not write to it.'); } catch (error) { say(error.message); } };
    q('[data-vault-open]').onclick = async () => { try { await vaultCall({ action: 'reveal' }); } catch (error) { say(error.message); } };
    q('[data-vault-obsidian]').onclick = async () => { try { await vaultCall({ action: 'open_obsidian' }); say('Asked Obsidian to open the vault. The first time, Obsidian may ask you to open the folder as a vault.'); } catch (error) { say(error.message); } };
    q('[data-vault-save]').onclick = async () => { try { show(await vaultCall({ action: 'configure', path: q('[data-vault-folder]').value.trim() })); vaultFetchedAt = 0; vaultReady = false; await vaultRefresh(vaultBridge, vaultProject); say('The vault folder was changed. Notes in the old folder stay where they are.'); } catch (error) { say(error.message); } };
    localize(); load();
  }
  function mount(root, request, transfer) {
    const localize=()=>globalThis.PlazCodeI18n?.mountStatic?.(root);
    root.innerHTML = '<div data-vault-box></div><h3>Saved memory</h3><p>Notes PlazCode remembers across chats. Each note has a title saying what it is about; open a note to edit or remove it.</p><div data-memory-head><label><input type="checkbox" data-memory-auto> Save useful notes automatically</label> <small data-memory-capacity role="status"></small> <button type="button" data-memory-refresh>Reload</button></div><div data-memory-list></div><details data-memory-new-box><summary>Add a note</summary><input data-memory-new-title aria-label="Note title" placeholder="Title, e.g. Combat cooldown" maxlength="120"><textarea data-memory-new aria-label="New memory" placeholder="What PlazCode should remember\u2026" maxlength="500000"></textarea><button type="button" data-memory-add>Add note</button> <button type="button" data-memory-paste>Paste</button> <label data-memory-import-label>Import .md, .json or .txt <input type="file" data-memory-import aria-label="Import notes from .md, .json or .txt files" accept=".md,.markdown,.json,.txt,text/markdown,application/json,text/plain" multiple></label></details><div data-memory-status role="status" data-i18n-user-content></div>';
    const style = document.createElement('style'); style.textContent = '[data-vault-folder]{display:block;box-sizing:border-box;width:100%;margin:6px 0;padding:8px;background:#07111e;color:#fff;border:1px solid #334155;border-radius:8px;font:13px/1.5 system-ui}[data-vault-path]{word-break:break-all;color:#ffe5be}[data-memory-import-label]{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:12px}[data-memory-import-label] input{max-width:190px}[data-memory-head]{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0 10px}[data-memory-entry]{margin:6px 0;padding:8px 10px;border:1px solid rgba(148,163,184,.28);border-radius:8px}[data-memory-entry] summary{cursor:pointer;display:flex;gap:8px;align-items:baseline}[data-memory-entry] summary strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}[data-memory-entry] input,[data-memory-new-box] input{display:block;width:100%;box-sizing:border-box;margin:8px 0 4px;padding:7px 9px;border-radius:7px}[data-memory-entry] textarea,[data-memory-new-box] textarea{display:block;width:100%;box-sizing:border-box;min-height:70px}'; root.appendChild(style);
    mountVault(root.querySelector('[data-vault-box]'), localize);
    // Import/transfer status can include filenames, raw errors and site notices.
    const status = root.querySelector('[data-memory-status]');
    // 1.24.12: the panel lives on AI sites whose editors capture keyboard and
    // clipboard events. Keep typing/paste inside PlazCode's own note fields and
    // insert pasted text ourselves so a site handler can never swallow it.
    for (const type of ['keydown','keyup','keypress','beforeinput','input','copy','cut','paste']) root.addEventListener(type, event => { if (event.target && event.target.matches && event.target.matches('input,textarea')) event.stopPropagation(); });
    function insertText(field, text) {
      const value = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
      const start = typeof field.selectionStart === 'number' ? field.selectionStart : field.value.length, end = typeof field.selectionEnd === 'number' ? field.selectionEnd : start;
      const room = Math.max(0, (field.maxLength > 0 ? field.maxLength : 500000) - (field.value.length - (end - start)));
      field.setRangeText(value.slice(0, room), start, end, 'end');
      field.dispatchEvent(new Event('input', {bubbles: false}));
      return value.length <= room;
    }
    root.addEventListener('paste', event => {
      const field = event.target;
      if (!field || !field.matches || !field.matches('textarea[data-memory-new],textarea[data-entry-text]') || !event.clipboardData) return;
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      event.preventDefault();
      if (!insertText(field, text)) status.textContent = 'Pasted text was cut at the 500,000-character note limit.';
    }, true);
    let signature = '', busy = false; const openIds = new Set();
    async function refresh() {
      try {
        const memory = await request(); root.querySelector('[data-memory-capacity]').textContent=memory.entries.length+' notes \xb7 '+memory.entries.reduce((sum,entry)=>sum+entry.text.length,0).toLocaleString()+' / 500,000 characters'; root.querySelector('[data-memory-auto]').checked = memory.automatic === true;
        const next = JSON.stringify(memory.entries);
        if (signature === next || (root.contains(document.activeElement) && document.activeElement.matches('[data-entry-text],[data-entry-title]'))) return;
        signature = next; const list = root.querySelector('[data-memory-list]'); list.replaceChildren();
        if (!memory.entries.length) { const empty = document.createElement('p'); empty.textContent = 'No saved memory yet.'; list.appendChild(empty); }
        memory.entries.forEach(entry => {
          const row = document.createElement('details'); row.setAttribute('data-memory-entry', String(entry.id)); row.open = openIds.has(entry.id);
          row.ontoggle = () => { if (row.open) openIds.add(entry.id); else openIds.delete(entry.id); };
          const summary = document.createElement('summary'); const heading = document.createElement('strong'); heading.setAttribute('data-i18n-user-content','');heading.textContent = titleOf(entry);
          const source = document.createElement('small');source.setAttribute('data-i18n-user-content',''); source.textContent = (entry.project ? 'Project: '+entry.project : 'Global')+' \xb7 '+entry.source; summary.append(heading, source);
          const title = document.createElement('input'); title.setAttribute('data-entry-title',''); title.setAttribute('aria-label','Note title'); title.dir='auto';title.maxLength = 120; title.value = titleOf(entry);
          const text = document.createElement('textarea'); text.setAttribute('data-entry-text',''); text.setAttribute('aria-label','Saved memory'); text.dir='auto';text.maxLength = 500000; text.value = entry.text;
          const save = document.createElement('button'); save.textContent = 'Save edit'; save.onclick = () => mutate({action:'edit',id:entry.id,title:title.value,text:text.value});
          const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.onclick = () => mutate({action:'remove',id:entry.id});
          row.append(summary, title, text, save, remove); list.appendChild(row);
        });
      } catch (error) { status.textContent = error.message || String(error); } finally {localize();}
    }
    async function mutate(action) {
      if (busy) return false; busy = true;
      try { await request(action); status.textContent = 'Memory saved.'; signature = ''; await refresh(); return true; }
      catch (error) { status.textContent = error.message || String(error); return false; }
      finally { busy = false; }
    }
    root.querySelector('[data-memory-auto]').onchange = event => mutate({action:'toggle',enabled:event.target.checked});
    root.querySelector('[data-memory-refresh]').onclick = refresh;
    root.querySelector('[data-memory-add]').onclick = async () => {
      const input = root.querySelector('[data-memory-new]'), titleInput = root.querySelector('[data-memory-new-title]'), text = input.value, title = titleInput.value;
      if (await mutate({action:'add',title,text}) && input.value === text) { input.value = ''; titleInput.value = ''; }
    };
    root.querySelector('[data-memory-paste]').onclick = async () => {
      const field = root.querySelector('[data-memory-new]');
      try { const text = await navigator.clipboard.readText(); if (!text) { status.textContent = 'The clipboard has no text.'; return; } field.focus(); insertText(field, text); status.textContent = 'Pasted. Add a title if you like, then click Add note.'; }
      catch { field.focus(); status.textContent = 'Clipboard access was blocked. Click the note box and press Ctrl+V (Cmd+V on Mac).'; }
    };
    root.querySelector('[data-memory-import]').onchange = async event => {
      const files = [...(event.target.files || [])]; event.target.value = '';
      let added = 0; const problems = [];
      for (const file of files) {
        try {
          if (!/\.(?:md|markdown|json|txt)$/i.test(file.name)) throw Error('only .md, .json and .txt files are supported');
          if (file.size > 2000000) throw Error('file is larger than 2 MB');
          const text = await file.text();
          if (!text.trim()) throw Error('file is empty');
          if (text.length > 500000) throw Error('file has more than 500,000 characters');
          const title = file.name.replace(/\.[^.]+$/, '').slice(0, 120);
          if (await mutate({action:'add', title, text})) added++; else problems.push(file.name + ': ' + status.textContent);
        } catch (error) { problems.push(file.name + ': ' + (error.message || String(error))); }
      }
      status.textContent = (added ? 'Imported ' + added + ' note' + (added === 1 ? '' : 's') + ' exactly as written.' : 'No notes imported.') + (problems.length ? ' ' + problems.join(' · ') : '');
    };
    if (transfer) {
      const section = document.createElement('details'); section.setAttribute('data-memory-transfer','');
      const downloadStyle=document.createElement('style');downloadStyle.textContent='[data-transfer-download]:not([hidden]){display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;margin:8px 4px;border:1px solid var(--orange,#ff9226);border-radius:9px;background:linear-gradient(135deg,var(--orange2,#ffc052),var(--orange,#ff9226));color:#17110a!important;font-family:inherit;font-size:12px;font-weight:600;line-height:1.4;text-decoration:none;cursor:pointer}[data-transfer-download]:focus-visible{outline:2px solid currentColor;outline-offset:3px}';
      section.innerHTML = '<summary>Save or move memory and chats</summary><p>Use an export file to back up saved notes or give another chat context from this one. Open/select the browser chat you want to save first.</p><h4>Save to a file</h4><p>Choose which notes to save, then click Create export file and Download export file. Uncheck messages if you only want saved memory. Only messages captured or loaded by the website can be exported; older unloaded messages may be missing.</p><label>Which saved notes? <select data-transfer-scope><option value="chat">Notes from this chat</option><option value="all">All saved notes (every chat)</option></select></label><label><input type="checkbox" data-transfer-history checked> Also include messages from this chat</label><button data-transfer-export>Create export file</button><button data-transfer-copy>Copy export text</button><a data-transfer-download hidden>Download export file</a><h4>Load into another chat</h4><p>Open/select the destination browser chat. Choose your exported .json file below, or paste a context summary, then click Load into selected chat. Old messages provide context; old commands are not run again.</p><textarea data-transfer-text aria-label="Chat transfer context" placeholder="Paste exported text or a short summary of the old chat…"></textarea><label>Choose an export file (.json) or summary (.txt)<input type="file" data-transfer-file aria-label="Choose an export file or summary" accept=".json,.txt"></label><label><input type="checkbox" data-transfer-memory checked> Also add the saved notes to PlazCode memory</label><button data-transfer-import>Load into selected chat</button>';
      section.appendChild(downloadStyle);
      root.appendChild(section);
      const text = section.querySelector('[data-transfer-text]'); let downloadUrl;
      section.querySelector('[data-transfer-export]').onclick = async () => {
        try {
          const scope = section.querySelector('[data-transfer-scope]').value;
          const includeHistory = section.querySelector('[data-transfer-history]').checked;
          const memory = await request(), result = await transfer.exportChat(includeHistory);
          if (!result || result.ok === false) throw Error(result && result.error || "Chat export failed.");
          text.value = JSON.stringify(exportPackage(memory, result, scope, includeHistory),null,2);
          if (downloadUrl) URL.revokeObjectURL(downloadUrl);
          downloadUrl = URL.createObjectURL(new Blob([text.value],{type:'application/json'}));
          const link = section.querySelector('[data-transfer-download]'); link.href=downloadUrl;link.download='PlazCode-chat-transfer.json';link.hidden=false;
          status.textContent='Export ready. Saved memories: ' + JSON.parse(text.value).memory.entries.length + '. ' + (includeHistory ? 'Captured messages: ' + result.history.length + '. ' + (result.history_notice || 'Messages never loaded by the site may be missing.') + ' ' : 'Chat history excluded. ') + 'Copy or download the file.';
        } catch(error) {status.textContent=error.message||String(error);}
      };
      section.querySelector('[data-transfer-copy]').onclick = async () => {try {await navigator.clipboard.writeText(text.value);status.textContent='Copied.';}catch {text.focus();text.select();status.textContent='Select and copy the export text.';}};
      section.querySelector('[data-transfer-file]').onchange = async event => {
        const file=event.target.files[0]; if(!file)return;
        if(file.size>4000000){status.textContent='Transfer file is too large (maximum 4 MB).';return;} text.value=await file.text();status.textContent='File loaded. Select the destination chat, then click Load into selected chat.';
      };
      section.querySelector('[data-transfer-import]').onclick = async () => {
        try {
          const value=parseTransfer(text.value);
          value.importMemory=section.querySelector('[data-transfer-memory]').checked;
          if(value.memoryOnly && value.importMemory){await request({action:'import',entries:value.memory.entries});signature='';await refresh();status.textContent='Saved notes loaded into PlazCode memory. They are available across chats; no old conversation was sent.';return;}
          const result=await transfer.importChat(value);
          if(result && result.ok===false)throw Error(result.error);
          status.textContent='Context import started in the selected chat. Wait for its acknowledgement before sending a new request.';
          await refresh();
        }catch(error){status.textContent=error.message||String(error);}
      };
    }
    for(const field of root.querySelectorAll('[data-memory-new-title],[data-memory-new],[data-transfer-text]'))field.dir='auto';
    localize();refresh(); return { refresh };
  }
  function exportPackage(memory, chat, scope, includeHistory) {
    if (scope === 'chat' && !chat.chat_id) throw Error('This chat has no stable conversation ID yet. Send a message first, or choose All saved notes (every chat).');
    const entries = scope === 'all' ? memory.entries : memory.entries.filter(entry => (entry.chat_ids || []).includes(chat.chat_id) || entry.source === chat.legacy_source);
    return {format:'plazcode-chat-transfer',version:1,provider:chat.provider,chat_id:chat.chat_id,memory_scope:scope,history:includeHistory ? chat.history : [],memory:{...memory,entries}};
  }
  function parseTransfer(raw) {
    if(typeof raw!=='string'||!raw.trim()||raw.length>4000000)throw Error('Enter context or an export up to 4 MB.');
    let data;try{data=JSON.parse(raw);}catch{return {context:raw,memory:{entries:[]}};}
    if(data.format!=='plazcode-chat-transfer'||data.version!==1||!Array.isArray(data.history))throw Error('Unsupported export format. Paste a plain-text context summary instead.');
    if(data.history.some(item=>!item||!['user','assistant'].includes(item.role)||typeof item.text!=='string'))throw Error('Invalid chat history.');
    if(!data.memory||!Array.isArray(data.memory.entries)||data.memory.entries.some(item=>!item||typeof item.text!=='string'||item.text.length>500000))throw Error('Invalid saved memory.');
    if(data.memory.entries.reduce((total,entry)=>total+entry.text.length,0)>500000)throw Error('Saved memory exceeds 500,000 characters total.');
    return {context:JSON.stringify({provider:data.provider,history:data.history}),memory:data.memory,memoryOnly:data.history.length===0 && data.memory.entries.length>0};
  }
  function read(memory,args={}) {
    const scoped=(memory.entries || []).filter(entry=>!entry.project || entry.project===memory.project_scope);
    const offset=Math.max(0,Math.floor(Number(args.offset)||0));
    if(args.action==='read'){
      const entry=scoped.find(entry=>entry.id===Number(args.id));if(!entry)throw Error('Saved note not found in this project.');
      if(offset>entry.text.length)throw Error('Offset is beyond this saved note.');
      let text=entry.text.slice(offset,offset+Math.min(6000,Math.max(1,Math.floor(Number(args.limit)||4000))));
      while(JSON.stringify(text).length>7000)text=text.slice(0,Math.floor(text.length/2));
      return {id:entry.id,title:titleOf(entry),text,offset,total_chars:entry.text.length,next_offset:offset+text.length<entry.text.length?offset+text.length:null};
    }
    const entries=[];let size=0;
    for(const entry of scoped.slice(offset)){const item={id:entry.id,title:titleOf(entry),project:entry.project || "",source:entry.source || "",text:entry.text.slice(0,500),total_chars:entry.text.length,preview_limited:entry.text.length>500};const chars=JSON.stringify(item).length;if(entries.length && size+chars>7000)break;entries.push(item);size+=chars;}
    return {automatic:memory.automatic,entries,total_entries:scoped.length,offset,next_offset:offset+entries.length<scoped.length?offset+entries.length:null};
  }
  return { prompt, mount, parseTransfer, exportPackage, read, titleOf, vaultRefresh, vaultContext, vaultTool, vaultActive, vaultLearning, vaultCall };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazCodeMemory;
