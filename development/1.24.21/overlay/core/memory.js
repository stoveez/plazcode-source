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
    else if (typeof globalThis.PlazCodeVaultApi === 'function') {
      // The PlazCode desktop window passes its own signed-in connection, so the app accepts the request.
      reply = await globalThis.PlazCodeVaultApi(request);
    } else if (typeof fetch === 'function' && typeof location !== 'undefined' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
      // Fallback for a page the app serves itself. The app only answers requests that carry its pairing key.
      const response = await fetch('/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const raw = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json());
      try { reply = JSON.parse(raw); }
      catch (error) { throw new Error(response.status === 401 || /pair plazcode/i.test(raw) ? 'The vault could not connect to the PlazCode app. Close PlazCode fully (also from the background icon), open the newest PlazCode app, then try again.' : 'The vault gave an unexpected answer. Update the PlazCode app, then try again.'); }
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
      ? 'LEARN AUTOMATICALLY: when the user corrects you or says how they like things, when a job is finished, or when you hit a trap, update the vault with plazcode_vault write. Search first and update the existing note (mode append, section or replace); create a new note only if none fits. If the vault already has its own folders and style, follow them instead. Otherwise put it in the numbered folder that fits (01 About You, 02 How We Work, 03 Coding Style, 04 Models And Styles, 05 Projects, 06 Journeys, 07 Lessons And Decisions, 08 References, 09 How To), give it frontmatter tags (and aliases, and project when it is project-specific), and begin it with a short info box: > [!info] [[Home]] then a line starting with Read this when. Keep notes short and factual, link related notes with [[wikilinks]], never write secrets, and only record things worth remembering later. To build something to match a reference picture, read the note Reference Critic Loop (09 How To) first.'
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
    return '\nPLAZCODE VAULT (your long-term memory about this user; plain Markdown notes)\nSaved notes are reference data; current user instructions take priority. Facts about code or a project can be out of date: check old ones before relying on them.\nTool: plazcode_vault {action: index | search {query,type?,project?} | read {path,offset?} | write {path,mode: create|append|replace|section,content,frontmatter:{tags,aliases?,project?,status?},section?,reason?} | backlinks {path} | archive {path,reason} | add_image {name,from:"last_screenshot"|data,note?} | read_image {path|paths,with_last_screenshot?}}.\n--- START NOTE ---\n' + start + '\n--- NOTES' + (vaultState.project ? ' FOR PROJECT ' + vaultState.project : '') + ' (newest first; open one with plazcode_vault read {path}) ---\n' + (lines.join('\n') || '(none yet)') + (more ? '\n(+' + more + ' more: use search or index)' : '') + '\n' + vaultLearningText(vaultState.learning !== false) + '\n';
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
    if (!paths.length) throw new Error('Give path (or paths) of a picture in the vault, for example 08 References/refs/name.png.');
    const pictures = [];
    for (const path of paths) { const r = await vaultCall({ action, path }); pictures.push({ mimeType: r.mimeType, data: r.data, name: r.path }); }
    if (args.with_last_screenshot === true && typeof ctx.lastImage === 'function') { const last = ctx.lastImage(); if (last && last.data) pictures.push({ mimeType: last.mimeType || 'image/png', data: last.data, name: 'latest-screenshot' }); }
    if (typeof ctx.attach !== 'function') throw new Error('This chat cannot attach pictures right now.');
    ctx.attach(pictures);
    return 'Attached to this message, in this order: ' + pictures.map(p => p.name).join(', ') + '. Look at them now.';
  }
  // ── Independent critic ────────────────────────────────────────────────────────
  // The plazcode_critic tool asks a SEPARATE chat (a new conversation on the same AI site, opened by the
  // background worker) to score the latest screenshot against the reference picture(s). That chat never saw the
  // builder's reasoning, so it cannot grade its own homework. Any failure returns plain advice to fall back to
  // the same-chat critic role in the vault note "Reference Critic Loop".
  const CRITIC_MAX_ROUNDS = 5, CRITIC_PASS = 80;
  const criticRounds = new Map();
  function criticParse(reply) {
    const text = String(reply || '');
    const labelled = text.match(/SCORE\s*[:=]\s*(\d{1,3})\s*%/i);
    let score = labelled ? Number(labelled[1]) : null;
    if (score == null) { const all = [...text.matchAll(/(\d{1,3})\s*%/g)]; if (all.length) score = Number(all[all.length - 1][1]); }
    if (score != null && score > 100) score = null;
    const verdict = /VERDICT\s*[:=]\s*APPROVED/i.test(text) ? 'APPROVED' : /VERDICT\s*[:=]\s*REVISE/i.test(text) ? 'REVISE' : null;
    return { score, verdict };
  }
  function criticPrompt(options) {
    const lines = [
      'You are a strict, independent visual critic. You did NOT build this and you have no stake in it. Be honest and specific.',
      'The attached pictures, in order: ' + options.names.join(', ') + '. The LAST picture is the result to judge. The ones before it are the reference the result must match.',
    ];
    if (options.goal) lines.push('What the builder was asked to make: ' + options.goal);
    if (options.rubric) lines.push('Score every line of this rubric from 1 to 10, one sentence of evidence each:\n' + options.rubric);
    else lines.push('No rubric was given. Judge these five things from 1 to 10, one sentence of evidence each: overall shape and proportions, colours and materials, important details, style match, polish.');
    lines.push('This is round ' + options.round + ' of ' + CRITIC_MAX_ROUNDS + '. The pass mark is ' + CRITIC_PASS + ' percent.');
    lines.push('Reply in exactly this form and nothing else:\nSCORES:\n- <item>: <n>/10 - <evidence>\nSCORE: <total as a whole percent>%\nVERDICT: APPROVED or REVISE\nFIXES:\n1. <one exact, measurable change, for example "make the blade 30% longer">\n2. ...');
    lines.push('Do not write code. Do not praise to be polite. APPROVED only if the total reaches the pass mark and nothing important is missing. Every fix must be something the builder can do in the next round.');
    return lines.join('\n\n');
  }
  function criticFallback(reason) {
    return 'The independent critic chat was not available (' + reason + '). Fall back to the same-chat critic: read the vault note "09 How To/Reference Critic Loop", switch to the CRITIC role, score every rubric line honestly, and continue the loop. Tell the user the critic was not independent this round.';
  }
  // args: { references:[vault paths], rubric?: vault path, goal?, new_job? }  ctx: { chat, project, lastImage(), ask({prompt, images}) }
  async function criticTool(args, ctx) {
    args = args || {}; ctx = ctx || {};
    const refs = (Array.isArray(args.references) && args.references.length ? args.references : [args.reference]).filter(Boolean).map(String).slice(0, 3);
    if (!refs.length) throw new Error('Give references: the vault path of the reference picture(s), for example ["08 References/refs/sword.png"]. Add one first with plazcode_vault add_image if there is none.');
    const shot = typeof ctx.lastImage === 'function' ? ctx.lastImage() : null;
    if (!shot || !shot.data) throw new Error('There is no screenshot of your result yet. Take one with plazcode_screenshot first, then call plazcode_critic again.');
    const key = String(ctx.chat || '') + '|' + refs.join(',');
    if (args.new_job === true) criticRounds.delete(key);
    const round = (criticRounds.get(key) || 0) + 1;
    if (round > CRITIC_MAX_ROUNDS) {
      criticRounds.delete(key);
      if (typeof ctx.close === 'function') { try { ctx.close(); } catch (error) { /* ignore */ } }
      return 'Round limit reached (' + CRITIC_MAX_ROUNDS + ' rounds). Stop looping: show the user your best result, say what is still missing, and ask whether to continue. Log the journey in the vault.';
    }
    let rubric = '';
    if (args.rubric) { try { const note = await vaultCall({ action: 'read', path: String(args.rubric), limit: 6000 }); rubric = clipText(note.text, 6000); } catch (error) { rubric = ''; } }
    const images = []; const names = [];
    try {
      for (const path of refs) { const r = await vaultCall({ action: 'read_image', path }); images.push({ mimeType: r.mimeType, data: r.data, name: r.path || path }); names.push('reference ' + (names.length + 1)); }
    } catch (error) { throw new Error('Could not read a reference picture from the vault: ' + (error.message || error)); }
    images.push({ mimeType: shot.mimeType || 'image/png', data: shot.data, name: 'latest-screenshot' }); names.push('RESULT (latest screenshot)');
    if (typeof ctx.ask !== 'function') return criticFallback('this PlazCode version cannot open a second chat here');
    let answer;
    try { answer = await ctx.ask({ prompt: criticPrompt({ names, goal: clipText(args.goal || '', 600), rubric, round }), images, round }); }
    catch (error) { return criticFallback(String(error && error.message || error).slice(0, 160)); }
    if (!answer || !answer.ok || !String(answer.reply || '').trim()) return criticFallback(String(answer && answer.error || 'no answer came back').slice(0, 160));
    criticRounds.set(key, round);
    const parsed = criticParse(answer.reply);
    const approved = parsed.verdict === 'APPROVED' || (parsed.verdict == null && parsed.score != null && parsed.score >= CRITIC_PASS);
    if (approved || round >= CRITIC_MAX_ROUNDS) { if (approved) criticRounds.delete(key); if (typeof ctx.close === 'function') { try { ctx.close(); } catch (error) { /* the window is only a convenience */ } } }
    return 'Independent critic (a separate chat), round ' + round + ' of ' + CRITIC_MAX_ROUNDS + ': ' + (parsed.score != null ? parsed.score + '%' : 'no score found') + ' - ' + (approved ? 'APPROVED' : 'REVISE') + '\n' + clipText(answer.reply, 6000)
      + '\n' + (approved ? 'Approved: finish up, then record the journey in the vault (the scores and what fixed it).' : 'Apply the numbered fixes, take a new screenshot, then call plazcode_critic again. Add this round to the journey note in the vault.');
  }
  async function vaultSettings() { return vaultCall({ action: 'settings' }); }
  function mountVault(box, localize) {
    box.innerHTML = '<div data-vault-card><div data-vault-head><div><h3>Vault</h3><p>A folder of linked notes. The AI reads it before it starts and keeps it up to date. It opens in Obsidian too.</p></div><small><span data-vault-count></span> <span>notes in the vault</span></small></div><div data-vault-buttons><button type="button" data-vault-view>Open vault</button></div><details data-vault-more><summary>More options</summary><div data-vault-options><p data-vault-folderline><span>Vault folder</span> <code data-vault-path data-i18n-user-content></code></p><div data-vault-buttons><button type="button" data-vault-open>Open vault folder</button><button type="button" data-vault-obsidian hidden>Open in Obsidian</button></div><label data-vault-learn><input type="checkbox" data-vault-learning><span><strong>Let the AI write notes</strong><small>It saves what it learns from your work. Turn this off and the AI can still read the vault.</small></span></label><label data-vault-folderlabel>Use a different folder<input data-vault-folder aria-label="Vault folder" maxlength="400" placeholder="Full path, for example D:\\PlazCode Vault"></label><button type="button" data-vault-save>Use this folder</button></div></details><p data-vault-unavailable hidden>The vault could not start. Close PlazCode fully (also from the background icon), open the newest PlazCode app, then try again.</p><div data-vault-status role="status" data-i18n-user-content></div></div>';
    const q = sel => box.querySelector(sel), status = q('[data-vault-status]');
    const say = text => { status.textContent = text; };
    const show = info => {
      q('[data-vault-path]').textContent = info.path; q('[data-vault-count]').textContent = String(info.notes);
      q('[data-vault-learning]').checked = info.learning !== false; q('[data-vault-obsidian]').hidden = !info.obsidian_installed;
      q('[data-vault-unavailable]').hidden = true; q('[data-vault-folder]').value = info.custom ? info.path : '';
    };
    const load = async () => { try { await vaultCall({ action: 'init' }); show(await vaultSettings()); } catch (error) { q('[data-vault-unavailable]').hidden = false; q('[data-vault-path]').textContent = ''; say(error && error.message ? error.message : ''); } };
    q('[data-vault-learning]').onchange = async event => { try { show(await vaultCall({ action: 'configure', learning: event.target.checked })); if (vaultState) vaultState.learning = event.target.checked; say(event.target.checked ? 'The AI will now write notes as it learns.' : 'The AI can read the vault but will not write to it.'); } catch (error) { say(error.message); } };
    q('[data-vault-view]').onclick = () => { try { openVaultViewer({}); } catch (error) { say(error.message); } };
    q('[data-vault-open]').onclick = async () => { try { await vaultCall({ action: 'reveal' }); } catch (error) { say(error.message); } };
    q('[data-vault-obsidian]').onclick = async () => { try { await vaultCall({ action: 'open_obsidian' }); say('Asked Obsidian to open the vault. The first time, Obsidian may ask you to open the folder as a vault.'); } catch (error) { say(error.message); } };
    q('[data-vault-save]').onclick = async () => { try { show(await vaultCall({ action: 'configure', path: q('[data-vault-folder]').value.trim() })); vaultFetchedAt = 0; vaultReady = false; await vaultRefresh(vaultBridge, vaultProject); say('The vault folder was changed. Notes in the old folder stay where they are.'); } catch (error) { say(error.message); } };
    localize(); load();
  }
  // ── 1.24.21 vault window: an Obsidian-style reader and editor for the vault ─────────────────────────────────
  // Plain DOM and text only: note text is always escaped, never inserted as HTML. Pictures load through the app.
  // Info-style boxes follow the PlazCode theme; the other kinds keep their own meaning (warning, danger, success...).
  const PCV_COLORS = { info: 'theme', note: 'theme', todo: 'theme', abstract: '0 191 188', summary: '0 191 188', tip: '0 191 188', hint: '0 191 188', success: '8 176 80', check: '8 176 80', done: '8 176 80', question: '236 117 0', help: '236 117 0', faq: '236 117 0', warning: '236 117 0', caution: '236 117 0', attention: '236 117 0', failure: '233 49 71', fail: '233 49 71', missing: '233 49 71', danger: '233 49 71', error: '233 49 71', bug: '233 49 71', example: '120 82 238', quote: '158 158 158', cite: '158 158 158' };
  const PCV_ICONS = {
    chevron: '<path d="m9 18 6-6-6-6"/>', folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
    back: '<path d="m12 19-7-7 7-7M19 12H5"/>', forward: '<path d="m12 5 7 7-7 7M5 12h14"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>', book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    alias: '<path d="m15 14 5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>', calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    text: '<path d="M17 6H3M21 12H3M15 18H3"/>', more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>', archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    collapse: '<path d="m7 20 5-5 5 5M7 4l5 5 5-5"/>', expand: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'
  };
  function ico(name, size) { size = size || 16; return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PCV_ICONS[name] || '') + '</svg>'; }
  const vvEsc = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const vvT = text => { try { return (globalThis.PlazCodeI18n && globalThis.PlazCodeI18n.t) ? globalThis.PlazCodeI18n.t(text) : text; } catch { return text; } };

  // Inline Markdown. The text is escaped first, so nothing a note says can become markup.
  function vvInline(source) {
    const codes = [];
    let text = String(source).replace(/`([^`\n]+)`/g, (m, code) => { codes.push(code); return '\u0000' + (codes.length - 1) + '\u0000'; });
    text = vvEsc(text);
    text = text.replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (m, target, size) => {
      const width = /^\d{1,4}$/.test(String(size || '').trim()) ? Math.min(2000, Number(size)) : 0;
      return '<span class="pcv-embed" data-embed="' + target.trim() + '"' + (width ? ' data-width="' + width + '"' : '') + '></span>';
    });
    text = text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (m, target, alias) => {
      const shown = alias ? alias : target.replace(/#/g, ' > ');
      return '<a class="pcv-link" href="#" data-link="' + target.trim() + '">' + shown + '</a>';
    });
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => /^https?:/i.test(url) ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + (alt || url) + '</a>' : '<span class="pcv-embed" data-embed="' + url + '"></span>');
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    text = text.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^\w])_([^_\n]+?)_(?=[^\w]|$)/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>').replace(/==([^=\n]+?)==/g, '<mark>$1</mark>');
    text = text.replace(/(^|[\s(>])#([A-Za-z][\w/-]{0,40})/g, '$1<span class="pcv-hash">#$2</span>');
    text = text.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + vvEsc(codes[Number(i)]) + '</code>');
    return text;
  }
  const VV_TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
  const VV_LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  function vvSplitRow(line) {
    // Split on | but not inside [[wikilinks]] (so [[Note|alias]] works in a table) and not after a backslash.
    let row = line.trim();
    if (row.startsWith('|')) row = row.slice(1);
    if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
    const cells = []; let cell = '', depth = 0;
    for (let i = 0; i < row.length; i++) {
      const two = row.substr(i, 2);
      if (two === '[[') { depth++; cell += two; i++; continue; }
      if (two === ']]' && depth) { depth--; cell += two; i++; continue; }
      if (row[i] === '\\' && row[i + 1] === '|') { cell += '|'; i++; continue; }
      if (row[i] === '|' && !depth) { cells.push(cell.trim()); cell = ''; continue; }
      cell += row[i];
    }
    cells.push(cell.trim());
    return cells;
  }
  function vvLighten(rgb) { return rgb.split(' ').map(n => Math.round(Number(n) + (255 - Number(n)) * 0.35)).join(' '); }
  function vvList(items) {
    // items: [{indent, ordered, text}] in order. Builds nested lists from the indentation.
    let html = '';
    const stack = [];
    const close = () => { const top = stack.pop(); html += '</li></' + top.tag + '>'; };
    for (const item of items) {
      while (stack.length && item.indent < stack[stack.length - 1].indent) close();
      const tag = item.ordered ? 'ol' : 'ul';
      if (stack.length && item.indent > stack[stack.length - 1].indent) { html += '<' + tag + '><li>'; stack.push({ indent: item.indent, tag }); }
      else if (stack.length && stack[stack.length - 1].tag !== tag) { close(); html += '<' + tag + '><li>'; stack.push({ indent: item.indent, tag }); }
      else if (stack.length) { html += '</li><li>'; }
      else { html += '<' + tag + '><li>'; stack.push({ indent: item.indent, tag }); }
      const task = /^\[([ xX])\]\s+(.*)$/.exec(item.text);
      html += task ? '<input type="checkbox" disabled' + (task[1] !== ' ' ? ' checked' : '') + '> ' + vvInline(task[2]) : vvInline(item.text);
    }
    while (stack.length) close();
    return html;
  }
  function vvBlocks(lines) {
    const out = [];
    let i = 0;
    const startsBlock = line => /^\s{0,3}(#{1,6}\s|>|```|~~~)/.test(line) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line) || VV_LIST_ITEM.test(line);
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      const fence = /^\s{0,3}(```|~~~)\s*([\w+-]*)/.exec(line);
      if (fence) {
        const code = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++]);
        i++;
        out.push('<pre><code>' + vvEsc(code.join('\n')) + '</code></pre>');
        continue;
      }
      const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading) { out.push('<h' + heading[1].length + '>' + vvInline(heading[2]) + '</h' + heading[1].length + '>'); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^\s{0,3}>/.test(line)) {
        const inner = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) inner.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
        const callout = /^\[!([\w-]+)\][+-]?\s*(.*)$/.exec(inner[0]);
        if (callout) {
          const type = callout[1].toLowerCase();
          const rgb = PCV_COLORS[type] || PCV_COLORS.note;
          const title = callout[2].trim() || (type.charAt(0).toUpperCase() + type.slice(1));
          out.push('<div class="pcv-co" style="' + (rgb === 'theme' ? '--co:var(--v-rgb);--cot:var(--v-light)' : '--co:' + rgb + ';--cot:rgb(' + vvLighten(rgb) + ')') + '"><div class="pcv-co-title"><span class="pcv-co-icon" aria-hidden="true">' + (/^(warning|caution|attention|danger|error|bug|failure|fail|missing)$/.test(type) ? '!' : /^(success|check|done)$/.test(type) ? '✓' : /^(question|help|faq)$/.test(type) ? '?' : /^(quote|cite)$/.test(type) ? '“' : 'i') + '</span><span>' + vvInline(title) + '</span></div>' + (inner.length > 1 ? '<div class="pcv-co-body">' + vvBlocks(inner.slice(1)) + '</div>' : '') + '</div>');
        } else out.push('<blockquote>' + vvBlocks(inner) + '</blockquote>');
        continue;
      }
      if (line.includes('|') && i + 1 < lines.length && VV_TABLE_RULE.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const head = vvSplitRow(line), aligns = vvSplitRow(lines[i + 1]).map(cell => /^:-+:$/.test(cell) ? 'center' : /-:$/.test(cell) ? 'right' : '');
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) rows.push(vvSplitRow(lines[i++]));
        const cell = (tag, text, index) => '<' + tag + (aligns[index] ? ' style="text-align:' + aligns[index] + '"' : '') + '>' + vvInline(text) + '</' + tag + '>';
        out.push('<div class="pcv-table"><table><thead><tr>' + head.map((c, n) => cell('th', c, n)).join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + head.map((c, n) => cell('td', r[n] || '', n)).join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      const item = VV_LIST_ITEM.exec(line);
      if (item) {
        const items = [];
        while (i < lines.length) {
          const m = VV_LIST_ITEM.exec(lines[i]);
          if (m) { items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), text: m[3] }); i++; }
          else if (/^\s+\S/.test(lines[i]) && items.length && !startsBlock(lines[i])) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; }
          else break;
        }
        out.push(vvList(items));
        continue;
      }
      const para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && (para.length === 0 || !startsBlock(lines[i]))) para.push(lines[i++]);
      out.push('<p>' + para.map(vvInline).join('<br>') + '</p>');
    }
    return out.join('');
  }
  function renderMarkdown(text) {
    const clean = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/%%[\s\S]*?%%/g, '');
    return vvBlocks(clean.split('\n'));
  }
  function vvDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!m) return String(value);
    try { return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))); } catch { return m[0]; }
  }
  const vvUnquote = value => { const v = String(value == null ? '' : value).trim(); return v.length > 1 && /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v; };
  function vvProps(front, open) {
    const order = (front && front.order) || [];
    if (!order.length) return '';
    const rows = order.map(key => {
      const raw = String((front.fields || {})[key] == null ? '' : front.fields[key]);
      let icon = 'text', value;
      if (key === 'tags') { icon = 'tag'; value = (front.tags || []).map(tag => '<span class="pcv-chip">' + vvEsc(tag) + '</span>').join(''); }
      else if (key === 'aliases') { icon = 'alias'; value = (front.aliases || []).map(alias => '<span class="pcv-pill">' + vvEsc(alias) + '</span>').join(''); }
      else if (/^\d{4}-\d{2}-\d{2}/.test(vvUnquote(raw))) { icon = 'calendar'; value = '<span class="pcv-date">' + vvEsc(vvDate(vvUnquote(raw))) + '</span>'; }
      else if (/^\[.*\]$/.test(raw.trim())) { value = raw.trim().slice(1, -1).split(',').map(vvUnquote).filter(Boolean).map(item => '<span class="pcv-pill">' + vvEsc(item) + '</span>').join(''); }
      else value = '<span class="pcv-text">' + vvEsc(vvUnquote(raw)) + '</span>';
      return '<div class="pcv-prop"><span class="pcv-prop-key">' + ico(icon, 16) + '<span>' + vvEsc(key) + '</span></span><span class="pcv-prop-val">' + (value || '<span class="pcv-faint">—</span>') + '</span></div>';
    }).join('');
    return '<div class="pcv-props' + (open ? '' : ' pcv-props-closed') + '"><button type="button" class="pcv-props-head" aria-expanded="' + (open ? 'true' : 'false') + '"><span class="pcv-chev">' + ico('chevron', 14) + '</span><span>' + vvEsc(vvT('Properties')) + '</span></button><div class="pcv-props-body">' + rows + '</div></div>';
  }

  // Colours come from the PlazCode theme (the same variables the bar and panels use), so the window follows the chosen palette.
  const VV_CSS = '#pcv-root{all:initial}#pcv-root{--v-rgb:var(--pc-rgb,233 186 83);--v-accent:var(--pc-accent,#e9ba53);--v-light:var(--pc-light,#ffe0a1);--v-bg:var(--pc-bg,#18140d);--v-text:#eef4ff;--v-muted:#9fb0c7;--v-faint:color-mix(in srgb,#9fb0c7 60%,var(--v-bg));--v-side:color-mix(in srgb,var(--v-bg) 91%,var(--v-accent));--v-bar:color-mix(in srgb,var(--v-bg) 86%,#000);--v-line:rgb(var(--v-rgb) / .26);--v-hover:rgb(var(--v-rgb) / .10);--v-active:rgb(var(--v-rgb) / .20);--v-code:color-mix(in srgb,var(--v-bg) 84%,var(--v-accent))}'
    + '#pcv-root{position:fixed;inset:2vh 2vw;z-index:2147483602;display:flex;flex-direction:column;background:radial-gradient(ellipse at top right,rgb(var(--v-rgb) / .12),transparent 70%),var(--v-bg);color:var(--v-text);border:1px solid rgb(var(--v-rgb) / .45);border-radius:14px;box-shadow:0 14px 34px #0006,0 0 24px rgb(var(--v-rgb) / var(--pc-glow-strength,.13));font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden;text-align:left;scrollbar-color:rgb(var(--v-rgb) / .4) transparent}'
    + 'html[data-rs-gradients=off] #pcv-root{background:var(--v-bg)}#pcv-root[hidden]{display:none!important}#pcv-root *{box-sizing:border-box;scrollbar-color:rgb(var(--v-rgb) / .4) transparent}'
    + '#pcv-root button{all:unset;box-sizing:border-box;cursor:pointer;color:inherit;font:inherit}#pcv-root button:focus-visible,#pcv-root input:focus-visible,#pcv-root [tabindex]:focus-visible{outline:2px solid var(--v-light);outline-offset:-2px}'
    + '.pcv-top{display:flex;align-items:center;gap:4px;height:38px;padding:0 8px;background:var(--v-bar);border-bottom:1px solid var(--v-line);flex:none}'
    + '#pcv-root .pcv-ib{display:inline-flex!important;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;border:1px solid transparent;color:var(--v-muted);transition:background .15s,border-color .15s,filter .15s}#pcv-root .pcv-ib:hover{background:var(--v-hover);border-color:var(--v-line);color:var(--v-text)}#pcv-root .pcv-ib[aria-pressed="true"],#pcv-root .pcv-ib.pcv-on{background:var(--v-active);border-color:rgb(var(--v-rgb) / .45);color:var(--v-light)}'
    + '.pcv-tab{display:flex;align-items:center;gap:8px;max-width:340px;height:30px;margin-left:6px;padding:0 12px;background:var(--v-bg);border:1px solid var(--v-line);border-bottom:none;border-radius:9px 9px 0 0;color:var(--v-light);font-size:13px;font-weight:600;position:relative;top:4px}.pcv-tab span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.pcv-spacer{flex:1}.pcv-body{flex:1;display:flex;min-height:0}'
    + '.pcv-rail{display:flex;flex-direction:column;gap:4px;width:42px;padding:8px 6px;background:var(--v-bar);border-right:1px solid var(--v-line);flex:none}'
    + '.pcv-side{display:flex;flex-direction:column;width:286px;min-width:200px;background:var(--v-side);border-right:1px solid var(--v-line);flex:none}'
    + '.pcv-side-tools{display:flex;align-items:center;gap:2px;padding:8px 8px 4px;justify-content:center}'
    + '.pcv-search{margin:4px 10px 6px;position:relative}.pcv-search input{all:unset;box-sizing:border-box;width:100%;height:32px;padding:0 12px;background:var(--v-bg);border:1px solid var(--v-line);border-radius:10px;color:var(--v-text);font-size:13px}.pcv-search input::placeholder{color:var(--v-faint)}.pcv-search input:focus{border-color:var(--v-light)}'
    + '.pcv-tree{flex:1;overflow:auto;padding:2px 6px 10px}.pcv-row{display:flex;align-items:center;gap:4px;min-height:27px;padding:2px 8px;border-radius:8px;color:color-mix(in srgb,var(--v-text) 86%,var(--v-bg));font-size:13px;cursor:pointer;user-select:none}.pcv-row:hover{background:var(--v-hover)}.pcv-row.pcv-active{background:var(--v-active);color:var(--v-light);font-weight:600}.pcv-row .pcv-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.pcv-row .pcv-chev{display:inline-flex;width:14px;color:var(--v-muted);transition:transform .12s}.pcv-row.pcv-open .pcv-chev{transform:rotate(90deg)}.pcv-pill-ext{font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--v-muted);background:var(--v-hover);border-radius:5px;padding:1px 5px}.pcv-row.pcv-archive{opacity:.6}'
    + '.pcv-result{padding:8px 10px;border-radius:8px;cursor:pointer}.pcv-result:hover{background:var(--v-hover)}.pcv-result b{display:block;color:var(--v-light);font-weight:600;font-size:13px}.pcv-result small{display:block;color:var(--v-faint);font-size:11px}.pcv-result p{margin:2px 0 0;color:var(--v-muted);font-size:12px}.pcv-empty{padding:14px;color:var(--v-muted);font-size:13px}'
    + '.pcv-foot{display:flex;align-items:center;gap:6px;padding:8px 10px;border-top:1px solid var(--v-line);color:var(--v-muted);font-size:12px}.pcv-foot b{flex:1;font-weight:600;color:var(--v-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.pcv-main{flex:1;display:flex;flex-direction:column;min-width:0;position:relative}'
    + '.pcv-nav{display:flex;align-items:center;gap:2px;height:40px;padding:0 10px;flex:none}.pcv-crumb{flex:1;text-align:center;color:var(--v-muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pcv-crumb b{color:var(--v-text);font-weight:600}'
    + '#pcv-root .pcv-text-btn{display:inline-flex!important;align-items:center;height:30px;padding:0 14px;border-radius:10px;border:1px solid rgb(var(--v-rgb) / .4);background:rgb(var(--v-rgb) / .10);color:var(--v-text);font-size:12.5px;font-weight:750;transition:filter .15s,border-color .15s,box-shadow .15s}#pcv-root .pcv-text-btn:hover{border-color:var(--v-light);filter:brightness(1.1)}#pcv-root .pcv-text-btn.pcv-go{background:linear-gradient(135deg,var(--v-light),var(--v-accent));border-color:rgb(var(--v-rgb) / .6);color:#08111d}#pcv-root .pcv-text-btn.pcv-go:hover{box-shadow:0 0 14px rgb(var(--v-rgb) / .4)}'
    + '.pcv-scroll{flex:1;overflow:auto}.pcv-note{max-width:780px;margin:0 auto;padding:22px 32px 90px}'
    + '.pcv-title{margin:0 0 14px;font-size:2em;line-height:1.2;font-weight:700;color:var(--v-text);word-break:break-word}'
    + '.pcv-props{margin:0 0 22px}#pcv-root .pcv-props-head{display:flex!important;align-items:center;gap:4px;color:var(--v-light);font-weight:600;font-size:14px;padding:2px 0;margin-bottom:6px}.pcv-props-head .pcv-chev{display:inline-flex;transition:transform .12s;transform:rotate(90deg);color:var(--v-muted)}.pcv-props-closed .pcv-chev{transform:none}.pcv-props-closed .pcv-props-body{display:none}'
    + '.pcv-prop{display:flex;align-items:flex-start;gap:12px;min-height:30px;padding:3px 0}.pcv-prop-key{display:flex;align-items:center;gap:8px;width:136px;flex:none;color:var(--v-muted);font-size:13px;padding-top:3px}.pcv-prop-val{display:flex;flex-wrap:wrap;gap:6px;min-width:0;color:var(--v-text);font-size:13px;padding-top:2px;word-break:break-word}'
    + '.pcv-chip{display:inline-block;padding:1px 10px;border-radius:12px;background:rgb(var(--v-rgb) / .18);border:1px solid rgb(var(--v-rgb) / .3);color:var(--v-light);font-size:12px}.pcv-pill{display:inline-block;padding:1px 10px;border-radius:12px;background:var(--v-hover);color:var(--v-text);font-size:12px}.pcv-faint{color:var(--v-faint)}'
    + '.pcv-md{font-size:16px;line-height:1.6;color:var(--v-text);word-break:break-word}.pcv-md h1,.pcv-md h2{color:var(--v-light)}.pcv-md h1{font-size:2em;margin:1.1em 0 .4em;line-height:1.2;font-weight:700}.pcv-md h2{font-size:1.6em;margin:1.1em 0 .4em;line-height:1.25;font-weight:700}.pcv-md h3{font-size:1.37em;margin:1em 0 .35em;font-weight:650;color:var(--v-text)}.pcv-md h4,.pcv-md h5,.pcv-md h6{font-size:1.15em;margin:1em 0 .3em;font-weight:650;color:var(--v-text)}'
    + '.pcv-md p{margin:0 0 .85em}.pcv-md ul,.pcv-md ol{margin:0 0 .85em;padding-left:1.7em}.pcv-md li{margin:.15em 0}.pcv-md li::marker{color:var(--v-accent)}.pcv-md input[type=checkbox]{margin-right:6px;accent-color:var(--v-accent)}.pcv-md hr{border:0;border-top:1px solid var(--v-line);margin:1.4em 0}'
    + '.pcv-md a{color:var(--v-light);text-decoration:underline;text-underline-offset:2px;cursor:pointer}.pcv-md a.pcv-unresolved{opacity:.55;text-decoration-style:dotted}.pcv-md code{background:var(--v-code);border-radius:5px;padding:1px 5px;font:.88em ui-monospace,Menlo,Consolas,monospace;color:var(--v-light)}.pcv-md pre{background:var(--v-code);border:1px solid rgb(var(--v-rgb) / .16);border-radius:10px;padding:12px 14px;overflow:auto;margin:0 0 1em}.pcv-md pre code{background:none;padding:0;color:var(--v-text)}'
    + '.pcv-md blockquote{margin:0 0 1em;padding:2px 0 2px 16px;border-left:3px solid var(--v-accent);color:var(--v-muted)}.pcv-md mark{background:rgb(var(--v-rgb) / .3);color:var(--v-text);border-radius:3px;padding:0 2px}.pcv-md .pcv-hash{color:var(--v-light);background:rgb(var(--v-rgb) / .14);border-radius:10px;padding:0 7px;font-size:.9em}'
    + '.pcv-table{overflow:auto;margin:0 0 1em}.pcv-md table{border-collapse:collapse;min-width:60%}.pcv-md th,.pcv-md td{border:1px solid var(--v-line);padding:6px 12px;vertical-align:top;font-size:15px}.pcv-md th{background:var(--v-hover);text-align:left;font-weight:700;color:var(--v-light)}.pcv-md tbody td:first-child{font-weight:700}'
    + '.pcv-co{margin:1em 0;padding:12px 16px;border:1px solid rgb(var(--co) / .3);border-radius:10px;background:rgb(var(--co) / .10)}.pcv-co-title{display:flex;align-items:center;gap:8px;font-weight:600;color:var(--cot)}.pcv-co-title a{color:var(--cot)}.pcv-co-icon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1.5px solid currentColor;border-radius:50%;font-size:11px;line-height:1;font-style:italic;flex:none}.pcv-co-body{margin-top:6px}.pcv-co-body>:last-child{margin-bottom:0}'
    + '.pcv-img{max-width:100%;height:auto;border-radius:10px;border:1px solid var(--v-line);display:block;margin:.6em 0}.pcv-embed-missing{color:var(--v-muted);font-style:italic}'
    + '.pcv-back{margin-top:34px;padding-top:14px;border-top:1px solid var(--v-line)}.pcv-back h4{margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--v-muted);font-weight:600}.pcv-back a{display:inline-block;margin:2px 10px 2px 0;color:var(--v-light);text-decoration:underline}'
    + '.pcv-editor{all:unset;box-sizing:border-box;display:block;width:100%;min-height:62vh;padding:14px 16px;background:var(--v-code);border:1px solid var(--v-line);border-radius:10px;color:var(--v-text);font:13.5px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;overflow:auto}.pcv-editor:focus{border-color:var(--v-light)}'
    + '.pcv-imgview{display:flex;align-items:center;justify-content:center;min-height:60vh;padding:20px}.pcv-imgview img{max-width:100%;max-height:78vh;border-radius:10px;border:1px solid var(--v-line)}'
    + '.pcv-status{display:flex;justify-content:flex-end;gap:14px;height:26px;align-items:center;padding:0 14px;border-top:1px solid var(--v-line);color:var(--v-muted);font-size:12px;flex:none}'
    + '.pcv-toast{position:absolute;left:50%;bottom:38px;transform:translateX(-50%);max-width:80%;padding:8px 14px;border-radius:10px;background:var(--v-side);border:1px solid var(--v-line);color:var(--v-text);font-size:13px;box-shadow:0 8px 24px #0008}.pcv-toast[hidden]{display:none}'
    + '.pcv-menu{position:absolute;right:10px;top:40px;z-index:3;min-width:190px;padding:6px;background:var(--v-side);border:1px solid rgb(var(--v-rgb) / .4);border-radius:10px;box-shadow:0 12px 30px #000a}.pcv-menu[hidden]{display:none}#pcv-root .pcv-menu button{display:flex!important;align-items:center;gap:10px;width:100%;padding:7px 10px;border-radius:7px;font-size:13px;color:var(--v-text)}#pcv-root .pcv-menu button:hover{background:var(--v-hover)}#pcv-root .pcv-menu .pcv-danger{color:#f08a80}'
    + '#pcv-root{--v-g:var(--pc-glow-strength,.13)}'
    + '#pcv-root{background:radial-gradient(ellipse 70% 55% at 100% 0%,rgb(var(--v-rgb) / .26),transparent 65%),radial-gradient(ellipse 60% 50% at 0% 100%,rgb(var(--v-rgb) / .14),transparent 65%),linear-gradient(160deg,color-mix(in srgb,var(--v-bg) 88%,var(--v-accent)),var(--v-bg) 55%);border-color:rgb(var(--v-rgb) / .6);box-shadow:0 0 0 1px rgb(var(--v-rgb) / .12),0 0 calc(30px + var(--v-g)*90px) rgb(var(--v-rgb) / calc(var(--v-g)*2.4)),0 22px 60px #000b}'
    + '.pcv-top{background:linear-gradient(180deg,rgb(var(--v-rgb) / .20),rgb(var(--v-rgb) / .05)),var(--v-bar);box-shadow:0 1px 14px rgb(var(--v-rgb) / calc(var(--v-g)*1.2))}'
    + '.pcv-rail{background:linear-gradient(180deg,rgb(var(--v-rgb) / .16),rgb(var(--v-rgb) / .03)),var(--v-bar)}'
    + '.pcv-side{background:linear-gradient(180deg,rgb(var(--v-rgb) / .13),rgb(var(--v-rgb) / .03) 60%),var(--v-side)}'
    + '.pcv-tab{background:linear-gradient(180deg,rgb(var(--v-rgb) / .30),rgb(var(--v-rgb) / .08)),var(--v-bg);border-color:rgb(var(--v-rgb) / .5);box-shadow:0 -2px 14px rgb(var(--v-rgb) / calc(var(--v-g)*2.2)),inset 0 2px 0 var(--v-light)}'
    + '#pcv-root .pcv-ib:hover{box-shadow:0 0 12px rgb(var(--v-rgb) / calc(var(--v-g)*2.5))}#pcv-root .pcv-ib[aria-pressed="true"],#pcv-root .pcv-ib.pcv-on{background:linear-gradient(135deg,rgb(var(--v-rgb) / .38),rgb(var(--v-rgb) / .12));box-shadow:0 0 14px rgb(var(--v-rgb) / calc(var(--v-g)*3))}'
    + '.pcv-search input{background:linear-gradient(180deg,rgb(var(--v-rgb) / .08),transparent),var(--v-bg)}.pcv-search input:focus{box-shadow:0 0 0 3px rgb(var(--v-rgb) / .22),0 0 16px rgb(var(--v-rgb) / calc(var(--v-g)*3))}'
    + '.pcv-row:hover{background:linear-gradient(90deg,rgb(var(--v-rgb) / .20),rgb(var(--v-rgb) / .04))}.pcv-row.pcv-active{background:linear-gradient(90deg,rgb(var(--v-rgb) / .42),rgb(var(--v-rgb) / .10));box-shadow:inset 3px 0 0 var(--v-light),0 0 16px rgb(var(--v-rgb) / calc(var(--v-g)*2.6));color:#fff}'
    + '.pcv-foot{background:linear-gradient(0deg,rgb(var(--v-rgb) / .16),transparent)}.pcv-status{background:linear-gradient(0deg,rgb(var(--v-rgb) / .12),transparent)}'
    + '.pcv-title{background:linear-gradient(100deg,#fff 0%,var(--v-light) 45%,var(--v-accent) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 calc(var(--v-g)*60px) rgb(var(--v-rgb) / .55))}'
    + '.pcv-md h1,.pcv-md h2{background:linear-gradient(100deg,var(--v-light),var(--v-accent));-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}'
    + '.pcv-chip{background:linear-gradient(135deg,rgb(var(--v-rgb) / .38),rgb(var(--v-rgb) / .14));border-color:rgb(var(--v-rgb) / .55);box-shadow:0 0 10px rgb(var(--v-rgb) / calc(var(--v-g)*2))}.pcv-md .pcv-hash{background:linear-gradient(135deg,rgb(var(--v-rgb) / .34),rgb(var(--v-rgb) / .12))}'
    + '.pcv-co{background:linear-gradient(135deg,rgb(var(--co) / .26),rgb(var(--co) / .06) 70%);border-color:rgb(var(--co) / .5);box-shadow:0 0 calc(10px + var(--v-g)*70px) rgb(var(--co) / calc(var(--v-g)*1.6)),inset 0 1px 0 rgb(255 255 255 / .06)}'
    + '.pcv-md th{background:linear-gradient(180deg,rgb(var(--v-rgb) / .34),rgb(var(--v-rgb) / .12))}.pcv-md tbody tr:nth-child(even) td{background:rgb(var(--v-rgb) / .05)}.pcv-table{border-radius:10px}'
    + '.pcv-md pre{background:linear-gradient(160deg,rgb(var(--v-rgb) / .12),transparent 60%),var(--v-code);border-color:rgb(var(--v-rgb) / .3);box-shadow:0 0 18px rgb(var(--v-rgb) / calc(var(--v-g)*1.2))}.pcv-md blockquote{background:linear-gradient(90deg,rgb(var(--v-rgb) / .14),transparent);border-left-width:4px}'
    + '.pcv-md hr{border:0;height:2px;background:linear-gradient(90deg,transparent,var(--v-accent),transparent);box-shadow:0 0 12px rgb(var(--v-rgb) / calc(var(--v-g)*3))}'
    + '.pcv-md a:hover{text-shadow:0 0 12px rgb(var(--v-rgb) / .9)}.pcv-img{border-color:rgb(var(--v-rgb) / .45);box-shadow:0 0 22px rgb(var(--v-rgb) / calc(var(--v-g)*2.2))}'
    + '#pcv-root .pcv-text-btn{background:linear-gradient(135deg,rgb(var(--v-rgb) / .30),rgb(var(--v-rgb) / .10));box-shadow:0 0 12px rgb(var(--v-rgb) / calc(var(--v-g)*1.6))}#pcv-root .pcv-text-btn.pcv-go{background:linear-gradient(135deg,var(--v-light),var(--v-accent));box-shadow:0 0 calc(8px + var(--v-g)*70px) rgb(var(--v-rgb) / calc(var(--v-g)*3.2))}#pcv-root .pcv-text-btn:hover{box-shadow:0 0 20px rgb(var(--v-rgb) / calc(var(--v-g)*4))}'
    + '.pcv-menu{background:linear-gradient(160deg,rgb(var(--v-rgb) / .16),transparent),var(--v-side);box-shadow:0 0 24px rgb(var(--v-rgb) / calc(var(--v-g)*2.2)),0 12px 30px #000a}.pcv-toast{background:linear-gradient(135deg,rgb(var(--v-rgb) / .28),rgb(var(--v-rgb) / .08)),var(--v-side);border-color:rgb(var(--v-rgb) / .5);box-shadow:0 0 18px rgb(var(--v-rgb) / calc(var(--v-g)*2.5)),0 8px 24px #0008}'
    + 'html[data-rs-gradients=off] #pcv-root{background:var(--v-bg)}html[data-rs-gradients=off] .pcv-top,html[data-rs-gradients=off] .pcv-rail,html[data-rs-gradients=off] .pcv-side,html[data-rs-gradients=off] .pcv-foot,html[data-rs-gradients=off] .pcv-status,html[data-rs-gradients=off] .pcv-tab,html[data-rs-gradients=off] .pcv-search input,html[data-rs-gradients=off] .pcv-menu,html[data-rs-gradients=off] .pcv-toast{background:var(--v-side)}html[data-rs-gradients=off] .pcv-top,html[data-rs-gradients=off] .pcv-rail{background:var(--v-bar)}html[data-rs-gradients=off] .pcv-title,html[data-rs-gradients=off] .pcv-md h1,html[data-rs-gradients=off] .pcv-md h2{background:none;-webkit-text-fill-color:var(--v-light);color:var(--v-light);filter:none}html[data-rs-gradients=off] .pcv-row.pcv-active,html[data-rs-gradients=off] .pcv-row:hover{background:var(--v-active)}html[data-rs-gradients=off] .pcv-chip,html[data-rs-gradients=off] .pcv-md th,html[data-rs-gradients=off] .pcv-co,html[data-rs-gradients=off] #pcv-root .pcv-text-btn:not(.pcv-go){background:rgb(var(--v-rgb) / .14)}html[data-rs-gradients=off] .pcv-co{background:rgb(var(--co) / .12)}html[data-rs-gradients=off] .pcv-md pre,html[data-rs-gradients=off] .pcv-md blockquote{background:var(--v-code)}'
    + '@media (max-width:760px){#pcv-root{inset:0;border-radius:0}.pcv-rail{display:none}.pcv-side{position:absolute;z-index:4;top:38px;bottom:0;left:0;width:84%;max-width:320px;box-shadow:12px 0 30px #0009;display:none}#pcv-root.pcv-side-open .pcv-side{display:flex}.pcv-note{padding:16px 16px 80px}.pcv-prop-key{width:100px}}';
  function vvInjectStyle() {
    if (document.getElementById('pcv-style')) return;
    const style = document.createElement('style'); style.id = 'pcv-style'; style.textContent = VV_CSS; (document.head || document.documentElement).appendChild(style);
  }

  let pcvRoot = null;
  function openVaultViewer(options) {
    options = options || {};
    vvInjectStyle();
    if (pcvRoot && pcvRoot.isConnected) { pcvRoot.hidden = false; if (options.path) pcvRoot.__open(options.path); return pcvRoot; }
    const root = document.createElement('div');
    root.id = 'pcv-root'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', vvT('Vault'));
    root.innerHTML = '<div class="pcv-top"><button type="button" class="pcv-ib" data-act="side" aria-label="' + vvEsc(vvT('Show or hide the file list')) + '">' + ico('panel', 17) + '</button><div class="pcv-tab"><span data-tab></span></div><div class="pcv-spacer"></div><button type="button" class="pcv-ib" data-act="close" aria-label="' + vvEsc(vvT('Close')) + '">' + ico('x', 17) + '</button></div>'
      + '<div class="pcv-body"><nav class="pcv-rail"><button type="button" class="pcv-ib pcv-on" data-act="files" aria-label="' + vvEsc(vvT('Files')) + '">' + ico('folder', 18) + '</button><button type="button" class="pcv-ib" data-act="find" aria-label="' + vvEsc(vvT('Search')) + '">' + ico('search', 18) + '</button></nav>'
      + '<aside class="pcv-side"><div class="pcv-side-tools"><button type="button" class="pcv-ib" data-act="collapse" aria-label="' + vvEsc(vvT('Collapse all')) + '">' + ico('collapse', 17) + '</button><button type="button" class="pcv-ib" data-act="expand" aria-label="' + vvEsc(vvT('Expand all')) + '">' + ico('expand', 17) + '</button></div><div class="pcv-search"><input type="text" data-search placeholder="' + vvEsc(vvT('Search')) + '" aria-label="' + vvEsc(vvT('Search')) + '" maxlength="120" autocomplete="off" spellcheck="false"></div><div class="pcv-tree" role="tree" data-tree></div><div class="pcv-foot"><b data-vname></b><button type="button" class="pcv-ib" data-act="folder" aria-label="' + vvEsc(vvT('Open vault folder')) + '">' + ico('folder', 16) + '</button></div></aside>'
      + '<section class="pcv-main"><div class="pcv-nav"><button type="button" class="pcv-ib" data-act="back" aria-label="' + vvEsc(vvT('Back')) + '">' + ico('back', 17) + '</button><button type="button" class="pcv-ib" data-act="forward" aria-label="' + vvEsc(vvT('Forward')) + '">' + ico('forward', 17) + '</button><div class="pcv-crumb" data-crumb></div><span data-nav-actions></span><button type="button" class="pcv-ib" data-act="menu" aria-label="' + vvEsc(vvT('More options')) + '">' + ico('more', 17) + '</button></div>'
      + '<div class="pcv-menu" data-menu hidden><button type="button" data-act="edit">' + ico('pencil', 15) + '<span>' + vvEsc(vvT('Edit note')) + '</span></button><button type="button" data-act="archive" class="pcv-danger">' + ico('archive', 15) + '<span data-archive-label>' + vvEsc(vvT('Move to archive')) + '</span></button></div>'
      + '<div class="pcv-scroll" data-scroll><article class="pcv-note" data-note></article></div><div class="pcv-status" data-status></div><div class="pcv-toast" data-toast role="status" hidden></div></section></div>';
    document.body.appendChild(root);
    pcvRoot = root;
    const q = selector => root.querySelector(selector);
    const tree = q('[data-tree]'), note = q('[data-note]'), crumb = q('[data-crumb]'), status = q('[data-status]'), toast = q('[data-toast]'), menu = q('[data-menu]'), search = q('[data-search]'), navActions = q('[data-nav-actions]'), scroll = q('[data-scroll]');
    let entries = [], kids = new Map(), nameMap = new Map(), imageMap = new Map(), kindOf = new Map(), expanded = new Set(['00 Start Here']);
    let current = null, history = [], hpos = -1, editing = false, propsOpen = true, archiveArmed = false, toastTimer = 0, searchTimer = 0, openToken = 0;
    const imageCache = new Map();
    const say = text => { toast.textContent = text; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 4200); };
    const failure = error => say((error && error.message) || String(error));
    const baseName = path => String(path).split('/').pop().replace(/\.md$/i, '');
    const addTo = (map, key, value) => { const list = map.get(key) || []; if (!list.includes(value)) list.push(value); map.set(key, list); };
    // The root swallows keys and paste so the AI site's own editor never reacts to typing inside the window.
    for (const type of ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'copy', 'cut', 'paste']) root.addEventListener(type, event => { if (event.target && event.target.matches && event.target.matches('input,textarea')) event.stopPropagation(); });

    function indexEntries(list) {
      entries = list; kids = new Map(); nameMap = new Map(); imageMap = new Map(); kindOf = new Map();
      for (const entry of list) {
        kindOf.set(entry.path, entry.kind);
        const cut = entry.path.lastIndexOf('/'); addTo(kids, cut < 0 ? '' : entry.path.slice(0, cut), entry);
        if (entry.kind === 'note') {
          const base = entry.path.replace(/\.md$/i, '');
          addTo(nameMap, base.split('/').pop().toLowerCase(), entry.path); addTo(nameMap, base.toLowerCase(), entry.path);
          for (const alias of entry.aliases || []) addTo(nameMap, String(alias).toLowerCase(), entry.path);
        } else if (entry.kind === 'image') { addTo(imageMap, entry.path.split('/').pop().toLowerCase(), entry.path); addTo(imageMap, entry.path.toLowerCase(), entry.path); }
      }
    }
    const shortest = list => list && list.length ? list.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0] : null;
    const resolveNote = target => { const t = String(target).split('#')[0].split('^')[0].trim().toLowerCase().replace(/\.md$/, ''); return t ? shortest(nameMap.get(t)) : null; };
    const resolveImage = target => shortest(imageMap.get(String(target).split('|')[0].trim().toLowerCase()));
    const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

    function drawTree() {
      tree.textContent = '';
      const build = (parent, depth, into) => {
        const tail = e => e.path.split('/').pop().startsWith('_') ? 1 : 0;
        const list = (kids.get(parent) || []).slice().sort((a, b) => tail(a) - tail(b) || (a.kind === 'folder' ? 0 : 1) - (b.kind === 'folder' ? 0 : 1) || natural(a.path.split('/').pop(), b.path.split('/').pop()));
        for (const entry of list) {
          const row = document.createElement('div'), name = entry.path.split('/').pop();
          row.className = 'pcv-row' + (entry.path === current ? ' pcv-active' : '') + (entry.path.startsWith('_Archive') ? ' pcv-archive' : '');
          row.dataset.path = entry.path; row.dataset.kind = entry.kind; row.setAttribute('role', 'treeitem'); row.tabIndex = 0;
          row.style.paddingLeft = (8 + depth * 16) + 'px';
          const chev = document.createElement('span'); chev.className = 'pcv-chev'; if (entry.kind === 'folder') chev.innerHTML = ico('chevron', 13);
          const label = document.createElement('span'); label.className = 'pcv-name'; label.textContent = entry.kind === 'note' ? name.replace(/\.md$/i, '') : name;
          row.append(chev, label);
          if (entry.kind === 'image') { const ext = document.createElement('span'); ext.className = 'pcv-pill-ext'; ext.textContent = (name.split('.').pop() || '').slice(0, 4); label.textContent = name.replace(/\.[^.]+$/, ''); row.append(ext); }
          if (entry.kind === 'folder') { const isOpen = expanded.has(entry.path); if (isOpen) row.classList.add('pcv-open'); row.setAttribute('aria-expanded', isOpen ? 'true' : 'false'); }
          into.appendChild(row);
          if (entry.kind === 'folder' && expanded.has(entry.path)) build(entry.path, depth + 1, into);
        }
      };
      build('', 0, tree);
      if (!entries.length) { const empty = document.createElement('div'); empty.className = 'pcv-empty'; empty.textContent = vvT('No notes yet.'); tree.appendChild(empty); }
    }
    function revealPath(path) { const parts = path.split('/'); parts.pop(); let acc = ''; for (const part of parts) { acc = acc ? acc + '/' + part : part; expanded.add(acc); } }
    async function loadTree() { const reply = await vaultCall({ action: 'tree' }); indexEntries(reply.entries || []); drawTree(); }

    function setNavActions() {
      navActions.innerHTML = '';
      if (!current || kindOf.get(current) !== 'note') return;
      const button = document.createElement('button'); button.type = 'button';
      if (editing) {
        button.className = 'pcv-text-btn'; button.dataset.act = 'cancel'; button.textContent = vvT('Cancel');
        const save = document.createElement('button'); save.type = 'button'; save.className = 'pcv-text-btn pcv-go'; save.dataset.act = 'save'; save.textContent = vvT('Save'); save.style.marginLeft = '6px';
        navActions.append(button, save);
      } else {
        button.className = 'pcv-ib'; button.dataset.act = 'edit'; button.setAttribute('aria-label', vvT('Edit note')); button.innerHTML = ico('pencil', 17); navActions.append(button);
      }
    }
    function decorate() {
      for (const link of note.querySelectorAll('a.pcv-link[data-link]')) { const path = resolveNote(link.getAttribute('data-link')); if (path) link.setAttribute('data-path', path); else link.classList.add('pcv-unresolved'); }
      for (const slot of note.querySelectorAll('.pcv-embed')) {
        const target = slot.getAttribute('data-embed'), image = resolveImage(target);
        if (image) {
          const img = document.createElement('img'); img.className = 'pcv-img'; img.alt = baseName(image); img.dataset.path = image;
          const width = Number(slot.getAttribute('data-width')); if (width) img.style.width = width + 'px';
          slot.replaceWith(img); loadImage(img, image);
        } else {
          const path = resolveNote(target), span = document.createElement('span');
          if (path) { const link = document.createElement('a'); link.className = 'pcv-link'; link.href = '#'; link.dataset.path = path; link.textContent = baseName(path); span.appendChild(link); } else { span.className = 'pcv-embed-missing'; span.textContent = target; }
          slot.replaceWith(span);
        }
      }
    }
    async function pictureUrl(path) {
      if (imageCache.has(path)) return imageCache.get(path);
      const reply = await vaultCall({ action: 'read_image', path }); const url = 'data:' + reply.mimeType + ';base64,' + reply.data; imageCache.set(path, url); return url;
    }
    function loadImage(img, path) { pictureUrl(path).then(url => { img.src = url; }).catch(() => { img.alt = baseName(path) + ' (could not be loaded)'; }); }

    function paint(extra) {
      const path = current;
      root.querySelector('[data-tab]').textContent = path ? baseName(path) : vvT('Vault');
      crumb.innerHTML = path ? path.split('/').map((part, i, all) => i === all.length - 1 ? '<b>' + vvEsc(part.replace(/\.md$/i, '')) + '</b>' : vvEsc(part)).join(' / ') : '';
      setNavActions(); archiveArmed = false; q('[data-archive-label]').textContent = vvT('Move to archive');
      drawTree();
      status.textContent = extra || '';
    }
    async function open(path, push) {
      if (editing) { say(vvT('Save or cancel your edit first.')); return; }
      const kind = kindOf.get(path);
      if (kind === 'folder') { if (expanded.has(path)) expanded.delete(path); else expanded.add(path); drawTree(); return; }
      const token = ++openToken;
      try {
        if (kind === 'image') {
          current = path; revealPath(path);
          note.innerHTML = '<div class="pcv-imgview"><img alt=""></div>'; const img = note.querySelector('img'); img.alt = baseName(path); loadImage(img, path);
          if (push !== false) { history = history.slice(0, hpos + 1); history.push(path); hpos = history.length - 1; }
          paint(''); scroll.scrollTop = 0; return;
        }
        const [read, back] = await Promise.all([vaultCall({ action: 'read', path, view: true }), vaultCall({ action: 'backlinks', path }).catch(() => ({ backlinks: [] }))]);
        if (token !== openToken) return;
        current = read.path; revealPath(current);
        const links = (back.backlinks || []);
        note.innerHTML = '<h1 class="pcv-title"></h1>' + vvProps(read.front, propsOpen) + '<div class="pcv-md">' + renderMarkdown(read.body) + '</div>'
          + (links.length ? '<div class="pcv-back"><h4>' + vvEsc(vvT('Linked from')) + '</h4>' + links.map(l => '<a href="#" class="pcv-link" data-path="' + vvEsc(l.path) + '">' + vvEsc(l.title) + '</a>').join('') + '</div>' : '');
        note.querySelector('.pcv-title').textContent = baseName(current);
        note.__raw = read.raw;
        decorate();
        if (push !== false) { history = history.slice(0, hpos + 1); history.push(current); hpos = history.length - 1; }
        const count = (read.front.order || []).length;
        status.innerHTML = ''; for (const text of [links.length + ' ' + vvT(links.length === 1 ? 'backlink' : 'backlinks'), count + ' ' + vvT(count === 1 ? 'property' : 'properties'), read.words + ' ' + vvT('words'), read.chars + ' ' + vvT('characters')]) { const span = document.createElement('span'); span.textContent = text; status.appendChild(span); }
        const keep = status.innerHTML; paint(''); status.innerHTML = keep;
        scroll.scrollTop = 0;
      } catch (error) { failure(error); }
    }
    root.__open = path => open(path, true);

    function startEdit() {
      if (!current || kindOf.get(current) !== 'note' || editing) return;
      const area = document.createElement('textarea'); area.className = 'pcv-editor'; area.setAttribute('aria-label', vvT('Edit note')); area.maxLength = 64000; area.value = note.__raw || '';
      note.textContent = ''; const title = document.createElement('h1'); title.className = 'pcv-title'; title.textContent = baseName(current); note.append(title, area);
      editing = true; setNavActions(); area.focus();
    }
    async function saveEdit() {
      const area = note.querySelector('textarea'); if (!area) return;
      try { await vaultCall({ action: 'save_raw', path: current, text: area.value }); editing = false; await loadTree(); await open(current, false); say(vvT('Saved.')); } catch (error) { failure(error); }
    }
    function cancelEdit() { editing = false; open(current, false); }
    async function archiveCurrent() {
      if (!current || kindOf.get(current) !== 'note') return;
      if (!archiveArmed) { archiveArmed = true; q('[data-archive-label]').textContent = vvT('Click again to confirm'); return; }
      try { await vaultCall({ action: 'archive', path: current, reason: 'Moved to the archive by you' }); menu.hidden = true; await loadTree(); current = null; await open('00 Start Here/Home.md', true); say(vvT('Moved to the archive. Nothing was deleted.')); } catch (error) { failure(error); }
    }
    function go(delta) { const next = hpos + delta; if (next < 0 || next >= history.length || editing) return; hpos = next; open(history[hpos], false); }
    async function runSearch(text) {
      if (text.trim().length < 2) { drawTree(); return; }
      try {
        const reply = await vaultCall({ action: 'search', query: text, limit: 30 });
        tree.textContent = '';
        if (!reply.results.length) { const none = document.createElement('div'); none.className = 'pcv-empty'; none.textContent = vvT('No notes match.'); tree.appendChild(none); return; }
        for (const hit of reply.results) {
          const item = document.createElement('div'); item.className = 'pcv-result'; item.dataset.path = hit.path; item.dataset.kind = 'note'; item.tabIndex = 0; item.setAttribute('role', 'treeitem');
          const title = document.createElement('b'); title.textContent = hit.title; const where = document.createElement('small'); where.textContent = hit.path.replace(/\.md$/i, ''); item.append(title, where);
          if (hit.snippets && hit.snippets[0]) { const p = document.createElement('p'); p.textContent = hit.snippets[0]; item.appendChild(p); }
          tree.appendChild(item);
        }
      } catch (error) { failure(error); }
    }

    root.addEventListener('click', event => {
      const target = event.target.closest ? event.target : event.target.parentElement; if (!target) return;
      const act = target.closest('[data-act]');
      if (menu && !menu.hidden && !target.closest('[data-menu]') && !(act && act.dataset.act === 'menu')) menu.hidden = true;
      const props = target.closest('.pcv-props-head');
      if (props) { propsOpen = !propsOpen; props.parentElement.classList.toggle('pcv-props-closed', !propsOpen); props.setAttribute('aria-expanded', propsOpen ? 'true' : 'false'); return; }
      const link = target.closest('a.pcv-link');
      if (link) { event.preventDefault(); const path = link.getAttribute('data-path') || resolveNote(link.getAttribute('data-link')); if (path) open(path, true); else say(vvT('There is no note with that name yet.')); return; }
      const row = target.closest('[data-path][data-kind]');
      if (row) { if (window.innerWidth <= 760 && row.dataset.kind !== 'folder') root.classList.remove('pcv-side-open'); open(row.dataset.path, true); return; }
      if (!act) return;
      const name = act.dataset.act;
      if (name === 'close') { if (!editing) { root.hidden = true; } else say(vvT('Save or cancel your edit first.')); }
      else if (name === 'side') root.classList.toggle('pcv-side-open');
      else if (name === 'find') { root.classList.add('pcv-side-open'); search.focus(); }
      else if (name === 'files') { search.value = ''; drawTree(); }
      else if (name === 'collapse') { expanded.clear(); drawTree(); }
      else if (name === 'expand') { for (const entry of entries) if (entry.kind === 'folder') expanded.add(entry.path); drawTree(); }
      else if (name === 'folder') vaultCall({ action: 'reveal' }).catch(failure);
      else if (name === 'back') go(-1);
      else if (name === 'forward') go(1);
      else if (name === 'menu') { menu.hidden = !menu.hidden; archiveArmed = false; q('[data-archive-label]').textContent = vvT('Move to archive'); }
      else if (name === 'edit') { menu.hidden = true; startEdit(); }
      else if (name === 'save') saveEdit();
      else if (name === 'cancel') cancelEdit();
      else if (name === 'archive') archiveCurrent();
    });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); if (!menu.hidden) menu.hidden = true; else if (editing) cancelEdit(); else root.hidden = true; return; }
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches && event.target.matches('[data-path][data-kind]')) { event.preventDefault(); open(event.target.dataset.path, true); }
      if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
      if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); go(1); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && editing) { event.preventDefault(); saveEdit(); }
    });
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(search.value), 220); });

    (async () => {
      try {
        await vaultCall({ action: 'init' });
        const info = await vaultCall({ action: 'settings' }); const folderName = String(info.path || '').split(/[\\/]/).filter(Boolean).pop() || 'Vault'; q('[data-vname]').textContent = folderName === 'Vault' ? 'PlazCode Vault' : folderName;
        await loadTree();
        await open(options.path && kindOf.get(options.path) ? options.path : '00 Start Here/Home.md', true);
      } catch (error) { note.innerHTML = '<p class="pcv-empty"></p>'; note.firstChild.textContent = (error && error.message) || vvT('The vault needs the newest PlazCode desktop app. Update the app to use it.'); }
    })();
    root.focus && root.setAttribute('tabindex', '-1');
    return root;
  }

  // 1.24.21: plain-language labels for the notes list (beginners should not see raw chat addresses).
  function noteSource(entry) {
    const first = String(entry && entry.source || '').split(/\s*[·|]\s*/)[0].trim();
    return !first || /^(edited by )?(you|user|manual)\b/i.test(first) ? 'Written by you' : 'Learned from ' + first;
  }
  function notePreview(entry) {
    const title = titleOf(entry), lines = String(entry && entry.text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const line = lines.find(item => item !== title && !title.startsWith(item.replace(/…$/, ''))) || lines[0] || '';
    return line.length > 120 ? line.slice(0, 120) + '…' : line;
  }
  function mount(root, request, transfer) {
    const localize=()=>globalThis.PlazCodeI18n?.mountStatic?.(root);
    root.setAttribute('data-pcm', '');
    root.innerHTML = '<div data-memory-intro><p>PlazCode remembers things about you and your projects so you do not have to repeat yourself in every chat. Use the Vault for a whole folder of notes, and Quick notes for short facts.</p></div><div data-vault-box></div><section data-pcm-card><div data-pcm-head><div><h3>Quick notes</h3><p>Short facts the AI reads before each task. Open a note to edit or remove it.</p></div><span data-pcm-count></span></div><label data-pcm-switch><input type="checkbox" data-memory-auto><span><strong>Learn as I work</strong><small>PlazCode saves useful notes by itself while you use it.</small></span></label><div data-memory-status role="status" data-i18n-user-content></div><div data-pcm-tools><input type="search" data-memory-filter placeholder="Search your notes" aria-label="Search your notes" maxlength="120" hidden><button type="button" data-memory-refresh>Reload</button></div><div data-memory-list></div><details data-memory-new-box><summary>Add a note</summary><div data-pcm-form><label>Title<input data-memory-new-title aria-label="Note title" placeholder="Short title, for example Combat cooldown" maxlength="120"></label><label>What should PlazCode remember?<textarea data-memory-new aria-label="New memory" placeholder="Write the note here\u2026" maxlength="500000"></textarea></label><div data-pcm-actions><button type="button" data-memory-add>Add note</button> <button type="button" data-memory-paste>Paste from clipboard</button></div><label data-memory-import-label>Or import notes from a file (.md, .json or .txt) <input type="file" data-memory-import aria-label="Import notes from .md, .json or .txt files" accept=".md,.markdown,.json,.txt,text/markdown,application/json,text/plain" multiple></label></div></details><p data-pcm-storage><small data-memory-capacity role="status"></small></p></section>';
    const style = document.createElement('style'); style.textContent = '[data-pcm]{display:grid;gap:16px;font-size:13px}\n[data-pcm] h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-.012em}\n[data-pcm] p{margin:0;line-height:1.55}\n[data-pcm] small{font-size:12px}\n[data-memory-intro] p{margin-top:5px;max-width:64ch;color:var(--pc-soft,#a3acbc)}\n[data-vault-card],[data-pcm-card]{padding:18px;border:1px solid rgb(var(--pc-rgb,233 186 83) / .24);border-radius:14px;background:rgb(var(--pc-rgb,233 186 83) / .05);box-shadow:0 1px 0 rgb(255 255 255 / .05) inset}\n[data-vault-head],[data-pcm-head]{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}\n[data-vault-head] p,[data-pcm-head] p{margin-top:4px;max-width:60ch;color:var(--pc-soft,#a3acbc)}\n[data-vault-head]>small,[data-pcm-count]{flex:none;padding:3px 11px;border:1px solid rgb(var(--pc-rgb,233 186 83) / .32);border-radius:999px;color:var(--pc-light,#ffe0a1);white-space:nowrap}\n[data-vault-buttons]{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 2px}\n:is(#memorySettings,[data-pcm]) :is([data-vault-buttons],[data-vault-options],[data-pcm-tools],[data-pcm-actions],[data-pcm-form],[data-memory-entry]) button{margin:0;min-height:34px;padding:7px 15px;border-radius:10px;border:1px solid rgb(255 255 255 / .14);background:rgb(255 255 255 / .06);color:inherit;font:inherit;font-size:13px;font-weight:600;cursor:pointer}\n:is(#memorySettings,[data-pcm]) :is([data-vault-buttons],[data-vault-options],[data-pcm-tools],[data-pcm-actions],[data-pcm-form],[data-memory-entry]) button:hover{border-color:rgb(var(--pc-rgb,233 186 83) / .6);background:rgb(255 255 255 / .1)}\n:is(#memorySettings,[data-pcm]) :is([data-vault-view],[data-memory-add],[data-memory-save]){background:linear-gradient(135deg,var(--pc-light,#ffe0a1),var(--pc-accent,#e9ba53));border-color:var(--pc-light,#ffe0a1);color:#0a0d14;font-weight:700}\n:is(#memorySettings,[data-pcm]) :is([data-vault-view],[data-memory-add],[data-memory-save]):hover{background:linear-gradient(135deg,var(--pc-light,#ffe0a1),var(--pc-accent,#e9ba53));filter:brightness(1.06)}\n:is(#memorySettings,[data-pcm]) [data-memory-remove]{color:#ff8f98;border-color:rgb(255 120 130 / .35)}\n[data-vault-more]{margin-top:12px;border-top:1px solid rgb(255 255 255 / .08);padding-top:10px}\n[data-vault-more]>summary{cursor:pointer;color:var(--pc-soft,#a3acbc);font-weight:600}\n[data-vault-options]{display:grid;gap:12px;padding:12px 0 2px}\n[data-vault-folderline]{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;color:var(--pc-soft,#a3acbc)}\n[data-vault-path]{word-break:break-all;color:var(--pc-light,#ffe0a1);font:12px/1.5 ui-monospace,Consolas,monospace}\n[data-vault-learn],[data-pcm-switch]{display:flex!important;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid rgb(255 255 255 / .08);border-radius:12px;background:rgb(255 255 255 / .03);cursor:pointer;margin:14px 0 0}\n[data-vault-options] [data-vault-learn]{margin:0}\n[data-vault-learn] input,[data-pcm-switch] input{flex:none;width:17px;height:17px;margin:2px 0 0;accent-color:var(--pc-accent,#e9ba53)}\n[data-vault-learn] strong,[data-pcm-switch] strong{display:block;font-size:14px}\n[data-vault-learn] small,[data-pcm-switch] small{display:block;margin-top:2px;color:var(--pc-soft,#a3acbc)}\n[data-vault-folderlabel]{display:grid;gap:6px;color:var(--pc-soft,#a3acbc)}\n:is(#memorySettings,[data-pcm]) :is([data-vault-folder],[data-pcm-form] input:not([type=file]),[data-pcm-form] textarea,[data-pcm-tools] input,[data-memory-entry] input,[data-memory-entry] textarea){display:block;box-sizing:border-box;width:100%;margin:0;padding:9px 11px;border:1px solid rgb(255 255 255 / .14);border-radius:9px;background:rgb(0 0 0 / .25);color:#fff;font:13px/1.5 inherit}\n[data-vault-unavailable]{margin-top:10px;padding:10px 12px;border:1px solid rgb(255 160 80 / .4);border-radius:10px;background:rgb(255 160 80 / .08);color:#ffd3a8}\n[data-vault-status]:not(:empty),[data-memory-status]:not(:empty){margin:10px 0 0;padding:9px 12px;border-radius:10px;background:rgb(255 255 255 / .05);color:var(--pc-light,#ffe0a1)}\n[data-pcm-tools]{display:flex;gap:8px;align-items:center;margin:14px 0 4px}\n[data-pcm-tools] input{flex:1}\n[data-pcm-tools] input[hidden]{display:none}\n[data-pcm-tools] button{margin-left:auto}\n[data-memory-entry]{margin:8px 0;padding:0;border:1px solid rgb(255 255 255 / .09);border-radius:12px;background:rgb(255 255 255 / .025);overflow:hidden}\n[data-memory-entry]:hover,[data-memory-entry][open]{border-color:rgb(var(--pc-rgb,233 186 83) / .4)}\n[data-memory-entry]>summary{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:12px 14px;cursor:pointer;list-style:none}\n[data-memory-entry]>summary::-webkit-details-marker{display:none}\n[data-memory-entry]>summary::before{content:"";flex:none;width:7px;height:7px;border:solid currentColor;border-width:0 1.7px 1.7px 0;opacity:.6;transform:rotate(-45deg);transition:transform .2s}\n[data-memory-entry][open]>summary::before{transform:rotate(45deg);opacity:1}\n.pcm-main{flex:1;min-width:0;display:grid;gap:2px}\n.pcm-main strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:650}\n.pcm-main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--pc-soft,#a3acbc)}\n.pcm-chips{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto}\n.pcm-chips em{font-style:normal;font-size:11.5px;padding:2px 9px;border-radius:999px;background:rgb(255 255 255 / .07);color:var(--pc-soft,#a3acbc);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n[data-memory-entry][open]>summary{border-bottom:1px solid rgb(255 255 255 / .08)}\n.pcm-edit{display:grid;gap:10px;padding:14px}\n.pcm-edit label,[data-pcm-form] label{display:grid;gap:6px;color:var(--pc-soft,#a3acbc);font-weight:600}\n.pcm-edit textarea,[data-pcm-form] textarea{min-height:110px;resize:vertical}\n.pcm-edit .pcm-buttons,[data-pcm-actions]{display:flex;flex-wrap:wrap;gap:8px}\n[data-pcm-empty]{margin:10px 0;padding:22px 16px;border:1px dashed rgb(255 255 255 / .18);border-radius:12px;text-align:center}\n[data-pcm-empty] strong{display:block;font-size:14px;margin-bottom:4px}\n[data-pcm-empty] p{color:var(--pc-soft,#a3acbc)}\n[data-memory-new-box]{margin-top:12px;border:1px dashed rgb(var(--pc-rgb,233 186 83) / .45);border-radius:12px}\n[data-memory-new-box]>summary{padding:12px 14px;cursor:pointer;font-weight:700;color:var(--pc-light,#ffe0a1);list-style:none}\n[data-memory-new-box]>summary::-webkit-details-marker{display:none}\n[data-memory-new-box]>summary::before{content:"+";display:inline-block;width:18px;font-weight:800}\n[data-memory-new-box][open]>summary::before{content:"\\2212"}\n[data-pcm-form]{display:grid;gap:12px;padding:4px 14px 14px}\n[data-memory-import-label]{font-weight:500!important;cursor:pointer}\n[data-memory-import-label] input{max-width:100%}\n[data-pcm-storage]{margin-top:12px!important;color:var(--pc-soft,#a3acbc)}\n[data-memory-transfer]>summary{cursor:pointer;font-weight:600}'; root.appendChild(style);
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
        const memory = await request(); const used = memory.entries.reduce((sum,entry)=>sum+entry.text.length,0); root.querySelector('[data-memory-capacity]').textContent='Storage: '+used.toLocaleString()+' of 500,000 characters used'; root.querySelector('[data-pcm-count]').textContent=memory.entries.length+(memory.entries.length===1?' note':' notes'); root.querySelector('[data-memory-filter]').hidden = memory.entries.length < 6; root.querySelector('[data-memory-auto]').checked = memory.automatic === true;
        const next = JSON.stringify(memory.entries);
        if (signature === next || (root.contains(document.activeElement) && document.activeElement.matches('[data-entry-text],[data-entry-title]'))) return;
        signature = next; const list = root.querySelector('[data-memory-list]'); list.replaceChildren();
        if (!memory.entries.length) { const empty = document.createElement('div'); empty.setAttribute('data-pcm-empty',''); const head = document.createElement('strong'); head.textContent = 'No notes yet'; const hint = document.createElement('p'); hint.textContent = 'Useful things the AI learns will show up here. You can also add your own with Add a note below.'; empty.append(head, hint); list.appendChild(empty); }
        memory.entries.forEach(entry => {
          const row = document.createElement('details'); row.setAttribute('data-memory-entry', String(entry.id)); row.open = openIds.has(entry.id);
          row.ontoggle = () => { if (row.open) openIds.add(entry.id); else openIds.delete(entry.id); };
          const summary = document.createElement('summary'); const main = document.createElement('span'); main.className = 'pcm-main';
          const heading = document.createElement('strong'); heading.setAttribute('data-i18n-user-content',''); heading.textContent = titleOf(entry);
          const preview = document.createElement('small'); preview.setAttribute('data-i18n-user-content',''); preview.textContent = notePreview(entry); main.append(heading, preview);
          const chips = document.createElement('span'); chips.className = 'pcm-chips'; for (const label of [entry.project ? 'Project: ' + entry.project : 'All projects', noteSource(entry)]) { const chip = document.createElement('em'); chip.setAttribute('data-i18n-user-content',''); chip.textContent = label; chips.appendChild(chip); }
          summary.append(main, chips);
          const form = document.createElement('div'); form.className = 'pcm-edit';
          const title = document.createElement('input'); title.setAttribute('data-entry-title',''); title.setAttribute('aria-label','Note title'); title.dir='auto';title.maxLength = 120; title.value = titleOf(entry);
          const text = document.createElement('textarea'); text.setAttribute('data-entry-text',''); text.setAttribute('aria-label','Saved memory'); text.dir='auto';text.maxLength = 500000; text.value = entry.text;
          const titleLabel = document.createElement('label'); titleLabel.append('Title', title); const textLabel = document.createElement('label'); textLabel.append('Note', text);
          const buttons = document.createElement('div'); buttons.className = 'pcm-buttons';
          const save = document.createElement('button'); save.setAttribute('data-memory-save',''); save.textContent = 'Save changes'; save.onclick = () => mutate({action:'edit',id:entry.id,title:title.value,text:text.value});
          const remove = document.createElement('button'); remove.setAttribute('data-memory-remove',''); remove.textContent = 'Remove note'; remove.onclick = () => mutate({action:'remove',id:entry.id});
          buttons.append(save, remove); form.append(titleLabel, textLabel, buttons);
          row.dataset.memorySearch = (titleOf(entry) + ' ' + entry.text + ' ' + (entry.project || '') + ' ' + noteSource(entry)).toLowerCase();
          row.append(summary, form); list.appendChild(row);
        });
        applyFilter();
      } catch (error) { status.textContent = error.message || String(error); } finally {localize();}
    }
    function applyFilter() {
      const word = root.querySelector('[data-memory-filter]').value.trim().toLowerCase(); let shown = 0, total = 0;
      root.querySelectorAll('[data-memory-entry]').forEach(row => { total++; const match = !word || (row.dataset.memorySearch || '').includes(word); row.hidden = !match; if (match) shown++; });
      const list = root.querySelector('[data-memory-list]'); const none = list.querySelector('[data-pcm-nomatch]');
      if (word && total && !shown) { if (!none) { const note = document.createElement('p'); note.setAttribute('data-pcm-nomatch',''); note.textContent = 'No notes match your search.'; list.appendChild(note); } } else if (none) none.remove();
    }
    root.querySelector('[data-memory-filter]').oninput = applyFilter;
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
      const downloadStyle=document.createElement('style');downloadStyle.textContent='[data-transfer-download]:not([hidden]){display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;margin:8px 4px;border:1px solid var(--orange,#e9ba53);border-radius:9px;background:linear-gradient(135deg,var(--orange2,#ffc052),var(--orange,#e9ba53));color:#17110a!important;font-family:inherit;font-size:12px;font-weight:600;line-height:1.4;text-decoration:none;cursor:pointer}[data-transfer-download]:focus-visible{outline:2px solid currentColor;outline-offset:3px}';
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
  return { prompt, mount, parseTransfer, exportPackage, read, titleOf, vaultRefresh, vaultContext, vaultTool, vaultActive, vaultLearning, vaultCall, criticTool, criticParse, criticPrompt, openVault: openVaultViewer, renderMarkdown };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazCodeMemory;
