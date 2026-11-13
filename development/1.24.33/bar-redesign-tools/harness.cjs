// Scratch harness: the real PlazCode bar on an offline ChatGPT-like page (dark), for screenshots.
const fs = require('node:fs'), path = require('node:path');
function open(browser, opts = {}) {
  return (async () => {
    const src = process.env.SRC;
    const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
    const page = await browser.newPage({ viewport: { width: opts.width || 1280, height: opts.height || 820 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><style>
      html,body{margin:0;height:100%;background:#212121;color:#ececec;font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
      #timeline{max-width:760px;margin:0 auto;padding:40px 20px 260px}
      .msg{background:#303030;border-radius:18px;padding:10px 16px;margin:12px 0 12px auto;width:fit-content;max-width:70%}
      .ai{margin:18px 0;color:#ececec}
      form{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);width:760px;max-width:calc(100% - 40px);background:#303030;border-radius:28px;padding:14px 18px 12px;box-sizing:border-box;box-shadow:0 0 0 1px #ffffff12}
      #prompt-textarea{white-space:pre-wrap;min-height:28px;max-height:160px;overflow:auto;outline:none;color:#ececec}
      #prompt-textarea:empty::before{content:"Ask anything";color:#9b9b9b}
      button[data-testid=send-button]{float:right;height:34px;width:34px;border-radius:50%;border:0;background:#fff;color:#000}
      </style><main id="timeline"><div class="msg">Make me a simple obby with five stages.</div><div class="ai">Sure. I'll build five stages with checkpoints, a kill brick on each, and a finish pad.</div></main>
      <form><div class="prosemirror-parent"><div id="prompt-textarea" contenteditable="true"></div></div><button type="button" data-testid="send-button">↑</button><div style="clear:both"></div></form></html>` }));
    await page.goto('https://chatgpt.com/c/offline-bar-look');
    const store = Object.assign({ rsApprovalMode: 'bypass', rsThinkingLevel: process.env.EFFORT||'ultracode' }, opts.store || {});
    await page.evaluate((store) => {
      window.sent = [];
      document.querySelector('form').onsubmit = e => e.preventDefault();
      const tools = [['read_file', 'path']].map(([name, key]) => ({ name, server: 'local', description: 'Offline', inputSchema: { type: 'object', properties: { [key]: { type: 'string' } }, required: [key] } }));
      const answer = msg => {
        if (msg.type === 'live-status') return { ok: true, bridge_reachable: true, connected: true, roblox_connected: true, local_connected: true, local_full: false, local_root: '/offline/workspace', profile_required: false, control_v2: true };
        if (msg.type === 'call_tool') return { ok: true, text: 'Not found' };
        if (msg.type === 'rs-memory') return { ok: true, memory: { entries: [] } };
        return { ok: true, control_v2: true, fresh: true, connected: true, mcpAlive: true, roblox_connected: true, local_connected: true, tools, skills: [], templates: [], servers: [] };
      };
      const listeners = [];
      const get = (keys, cb) => { const value = { ...store }; if (cb) queueMicrotask(() => cb(value)); return Promise.resolve(value); };
      window.__store = store; window.__fire = (changes) => { for (const [k, v] of Object.entries(changes)) store[k] = v; const c = {}; for (const [k, v] of Object.entries(changes)) c[k] = { newValue: v }; listeners.forEach(fn => fn(c, 'local')); };
      window.chrome = { runtime: { id: 'offline', getManifest: () => ({ version: '1.24.33' }), getURL: p => 'https://chatgpt.com/fixture/' + p, onMessage: { addListener() {} }, sendMessage: (msg, cb) => { const v = answer(msg); if (cb) queueMicrotask(() => cb(v)); return Promise.resolve(v); } }, storage: { local: { get, set: (u) => { Object.assign(store, u); return Promise.resolve(); }, remove: () => Promise.resolve() }, onChanged: { addListener(fn) { listeners.push(fn); } } } };
    }, store);
    await page.addStyleTag({ path: path.join(src, 'overlay.css') });
    for (const file of manifest.content_scripts.find(x => x.js.includes('providers/chatgpt.js')).js) {
      let code = fs.readFileSync(path.join(src, file), 'utf8');
      if (file === 'providers/chatgpt.js') code += ';window.provider=RSProvider;';
      await page.addScriptTag({ content: code });
    }
    await page.waitForSelector('#rs-bar');
    await page.waitForTimeout(opts.settle || 900);
    return { page, errors };
  })();
}
module.exports = { open };
