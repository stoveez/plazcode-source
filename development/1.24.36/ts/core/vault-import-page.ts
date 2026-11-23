// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/vault-import-page.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// The import page (core/vault-import.html). Runs as a PlazCode page, never inside an AI site, so the site cannot see the files.
(function (win: Window & typeof globalThis & { __vaultImport?: unknown; chrome?: any }) {
  const doc = win.document, $ = (id: string) => doc.getElementById(id)!;
  // The modules are top-level constants of earlier scripts, so they are read by name, not from window.
  const Imp = typeof PlazCodeVaultImport !== 'undefined' ? PlazCodeVaultImport : null, Rel = typeof PlazCodeReliability !== 'undefined' ? PlazCodeReliability : null;
  if (!Imp || !$('folder')) return;
  const say = (text?: string, kind?: string) => { const m = $('msg'); m.textContent = text || ''; m.className = kind || ''; };
  const send = (request: Record<string, unknown>): Promise<any> => new Promise((resolve, reject) => {
    try {
      win.chrome.runtime.sendMessage({ type: 'vault', request }, (reply: any) => {
        const err = win.chrome.runtime.lastError;
        if (err) return reject(new Error('PlazCode could not reach its desktop app. Open the PlazCode app and try again.'));
        if (!reply || reply.ok !== true) return reject(new Error((reply && reply.error) || 'The vault did not answer. Open the newest PlazCode desktop app.'));
        resolve(reply);
      });
    } catch (e) { reject(new Error('This page must be opened from PlazCode (Memory, Vault, Import a folder).')); }
  });
  let planned: ReturnType<typeof PlazCodeVaultImport.plan> | null = null, controller: AbortController | null = null;
  const el = (tag: string, text?: string, cls?: string) => { const n = doc.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  async function showVault() {
    try {
      const info = await send({ action: 'settings' });
      let name = info.custom ? info.path : 'PlazCode vault';
      try { const got: any = await new Promise((r) => win.chrome.storage.local.get(['rsActiveVault'], r)); if (got && got.rsActiveVault && got.rsActiveVault.name) name = got.rsActiveVault.name; } catch { /* name is a nicety */ }
      $('vault').textContent = name;
    } catch (e) { $('vault').textContent = 'Not connected'; say((e as Error).message, 'bad'); }
  }
  function renderPreview() {
    if (!planned || !Imp) return;
    const box = $('preview'); box.textContent = ''; box.hidden = false;
    box.append(el('strong', 'Folder: ' + planned.folder));
    const ready = el('div', undefined, 'row'); ready.append(el('span', 'Notes ready to import'), el('span', String(planned.notes.length), 'num')); box.append(ready);
    for (const reason of Object.keys(Imp.REASONS)) {
      const items = planned.skipped.filter((s: any) => s.reason === reason); if (!items.length) continue;
      const d = el('details'); const s = el('summary'); s.append(el('span', Imp.REASONS[reason] + ': '), el('span', String(items.length), 'num')); d.append(s);
      if (reason !== 'hidden') d.append(el('pre', items.slice(0, 40).map((i: any) => i.rel).join('\n') + (items.length > 40 ? '\n... and ' + (items.length - 40) + ' more' : '')));
      box.append(d);
    }
    const go = el('button', planned.notes.length ? 'Import ' + planned.notes.length + ' note' + (planned.notes.length === 1 ? '' : 's') : 'Nothing to import', 'primary') as HTMLButtonElement; go.id = 'go'; go.type = 'button'; go.disabled = !planned.notes.length;
    go.onclick = start; box.append(go);
  }
  // Blob.text() where the browser has it, otherwise FileReader.
  const readText = (file: File): Promise<string> => typeof file.text === 'function' ? file.text() : new Promise((resolve, reject) => { const r = new win.FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = () => reject(r.error); r.readAsText(file); });
  async function pick(files: FileList | null) {
    if (!Imp) return;
    say(''); $('preview').hidden = true;
    const all = Array.from(files || []); if (!all.length) return;
    say('Reading ' + all.length + ' files...');
    const rows: Array<{ path: string; size: number; text: string | null }> = [];
    for (const f of all) {
      const path = f.webkitRelativePath || f.name, isNote = /\.md$/i.test(path);
      let text: string | null = null;
      if (isNote && f.size <= Imp.limits.MAX_BYTES && !/(^|\/)\./.test(path)) { try { text = await readText(f); } catch { text = null; } }
      rows.push({ path, size: f.size, text });
    }
    planned = Imp.plan(rows, { redact: Rel ? Rel.redact : undefined });
    say(''); renderPreview();
  }
  async function start() {
    if (!planned || !planned.notes.length || !Imp) return;
    ($('go') as HTMLButtonElement).disabled = true; $('pickLabel').hidden = true; controller = new AbortController();
    const box = $('progressBox'); box.hidden = false; const bar = $('bar') as HTMLProgressElement, text = $('progressText');
    bar.max = planned.notes.length; bar.value = 0;
    try {
      const result = await Imp.run(planned, send, { signal: controller.signal, progress: (i: number, n: number) => { bar.value = i; text.textContent = 'Imported ' + i + ' of ' + n + '...'; } });
      const body = Imp.report(planned, result);
      const path = planned.prefix + 'Import report.md';
      const write = (mode: string) => send({ action: 'write', mode, path, content: body, frontmatter: { tags: ['imported', 'report'], origin: 'import' }, reason: 'import report' });
      try { await write('create'); } catch (e) { if (/already exists/i.test(String((e as Error)?.message))) await write('replace'); }
      const skippedTotal = planned.skipped.length + result.skipped.length + result.failed.length;
      say('Done. ' + result.imported.length + ' notes imported, ' + skippedTotal + ' skipped. A report note is in the same folder. Open PlazCode, Memory, Open vault to see them.', 'ok');
    } catch (e) { say((e as Error).message || 'The import stopped.', 'bad'); }
    box.hidden = true; $('pickLabel').hidden = false; $('preview').hidden = true;
  }
  $('cancel').onclick = () => { if (controller) controller.abort(); };
  $('folder').addEventListener('change', (event) => { pick((event.target as HTMLInputElement).files); });
  showVault();
  win.__vaultImport = { pick, start, plan: () => planned };
})(window);
