// Run the real content scripts on different provider fixtures with shared extension storage.
const {JSDOM, VirtualConsole} = require(process.env.PLAZCODE_TEST_JSDOM || 'jsdom');
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const R = require('./core/reliability.js');
const manifest = JSON.parse(fs.readFileSync(__dirname + '/manifest.json'));
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r)); };
const transfer = (chat = 'chatgpt|/c/work', provider = 'ChatGPT') => R.handoff({
  provider, chat, history: [{role:'user', text:'Finish the shop in my Roblox project.'}]
});
function storage(seed = {}, nativeHandoff = null) {
  const data = structuredClone(seed), listeners = new Set();
  const change = values => {
    const changes = {};
    for (const [key, value] of Object.entries(values)) {
      changes[key] = {oldValue:data[key], newValue:structuredClone(value)};
      if (value === undefined) delete data[key]; else data[key] = structuredClone(value);
    }
    for (const listener of listeners) listener(structuredClone(changes), 'local');
    return Promise.resolve();
  };
  return {data, listeners, change, nativeHandoff};
}
async function open(shared, {provider = 'claude', path = '/chat/new-site', started = true, request = '', holdArchive = false} = {}) {
  const host = provider === 'claude' ? 'claude.ai' : 'chatgpt.com';
  const composer = provider === 'claude'
    ? '<div class="ProseMirror" contenteditable="true" role="textbox"><p></p></div><button aria-label="Send message">Send</button>'
    : '<div class="composer-surface"><div id="prompt-textarea" class="ProseMirror" contenteditable="true" role="textbox"><p></p></div><button id="composer-submit-button" data-testid="send-button" aria-label="Send" type="submit">Send</button></div>';
  const dom = new JSDOM('<!doctype html><html><body><main><div id="messages"></div><form>' + composer + '</form></main></body></html>', {
    url:'https://' + host + path, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:new VirtualConsole()
  });
  const w = dom.window, context = dom.getInternalVMContext(), intervals = [], listeners = [], requests = [];
  if (started) shared.data.rsStartedSessions = [...new Set([...(shared.data.rsStartedSessions || []), path])];
  if (request) {
    const row = w.document.createElement('div'); row.textContent = request;
    row.setAttribute(provider === 'claude' ? 'data-testid' : 'data-message-author-role', provider === 'claude' ? 'user-message' : 'user');
    w.document.querySelector('#messages').append(row);
  }
  const get = (keys, cb) => {
    const result = {};
    for (const key of [].concat(keys || Object.keys(shared.data))) if (key in shared.data) result[key] = structuredClone(shared.data[key]);
    if (cb) queueMicrotask(() => cb(result));
    return Promise.resolve(result);
  };
  w.chrome = {
    runtime:{id:'test', getManifest:() => manifest, getURL:p => 'chrome-extension://test/' + p,
      onMessage:{addListener(){}}, sendMessage:(msg, cb) => {
        requests.push(msg);
        if (holdArchive && msg.type === 'chat-history' && msg.request) return new Promise(() => {});
        const result = {ok:true, connected:false, tools:[], servers:[], ...(msg.type === 'chat-history' && !msg.request ? {handoff:shared.nativeHandoff} : {})};
        if (cb) queueMicrotask(() => cb(result)); return Promise.resolve(result);
      }},
    storage:{local:{get, set:shared.change, remove:keys => shared.change(Object.fromEntries([].concat(keys).map(k => [k, undefined])))},
      onChanged:{addListener:fn => { listeners.push(fn); shared.listeners.add(fn); }}}
  };
  let hidden = false, focused = true;
  Object.defineProperty(w.document, 'hidden', {get:() => hidden});
  w.document.hasFocus = () => focused;
  w.ResizeObserver = class {observe(){} disconnect(){}};
  w.setInterval = (fn, ms) => { intervals.push({fn, ms}); return intervals.length; };
  w.setTimeout = () => 1; w.requestAnimationFrame = () => 1; w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.getBoundingClientRect = () => ({left:200, top:500, width:700, height:120, right:900, bottom:620});
  Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', {get(){return this.parentElement;}});
  w.__now = 1e12; vm.runInContext('Date.now = () => globalThis.__now;', context);
  const scripts = manifest.content_scripts.find(x => x.js.includes('providers/' + provider + '.js') && x.js.includes('core/main.js')).js;
  for (const file of scripts) vm.runInContext(fs.readFileSync(__dirname + '/' + file, 'utf8'), context, {filename:file});
  await settle();
  return {
    w, requests, offer:() => w.document.querySelector('.rs-continuation-offer'),
    async tick(ms = 1000) { w.__now += ms; for (const t of intervals.filter(x => x.ms === 1000)) t.fn(); await settle(); },
    async archiveTick() { for (const t of intervals.filter(x => x.ms === 10000)) t.fn(); await settle(); },
    async leave() { focused = false; hidden = true; w.document.dispatchEvent(new w.Event('visibilitychange')); await settle(); },
    async navigateAway() { focused = false; w.dispatchEvent(new w.Event('pagehide')); await settle(); },
    close() { for (const fn of listeners) shared.listeners.delete(fn); w.close(); }
  };
}
const ready = async page => { await page.tick(); await page.tick(2100); };
(async () => {
  const failures = [];
  const check = async (label, fn) => { try { await fn(); console.log('PASS', label); } catch(e) { failures.push(label); console.error('FAIL', label, e.message); } };
  await check('ChatGPT work is offered on Claude after an intervening startup-only DeepSeek chat', async () => {
    const shared = storage({rsLatestHandoff:transfer(), rsLastUsedChats:[{id:'chatgpt|/c/work', at:1}, {id:'deepseek|/chat/s/startup-only', at:2}]});
    const page = await open(shared);
    try { await ready(page); assert(page.offer()); assert.equal(page.offer().querySelector('.rs-co-from b').textContent, 'ChatGPT'); }
    finally { page.close(); }
  });
  await check('Leaving before the ten-second save offers the chat just left, including on an already-open website', async () => {
    const shared = storage({rsLatestHandoff:transfer('gemini|/app/old', 'Gemini')});
    const source = await open(shared, {provider:'chatgpt', path:'/c/work', request:'Finish the shop in my Roblox project.'});
    const destination = await open(shared);
    try {
      await source.leave();
      assert.equal(shared.data.rsLatestHandoff.chat_id, 'chatgpt|/c/work');
      await ready(destination); assert(destination.offer());
      assert.equal(destination.offer().querySelector('.rs-co-from b').textContent, 'ChatGPT');
    } finally { source.close(); destination.close(); }
  });
  await check('A fresh-looking chat never offers its own saved handoff', async () => {
    const page = await open(storage({rsLatestHandoff:transfer('claude|/chat/new-site', 'Claude')}));
    try { await ready(page); assert.equal(page.offer(), null); } finally { page.close(); }
  });
  await check('Claude work also continues on ChatGPT; newer shared work replaces an open stale offer', async () => {
    const shared = storage({rsLatestHandoff:transfer('claude|/chat/work', 'Claude')});
    const page = await open(shared, {provider:'chatgpt', path:'/c/new-site'});
    try {
      await ready(page); assert.equal(page.offer().querySelector('.rs-co-from b').textContent, 'Claude');
      await shared.change({rsLatestHandoff:transfer('gemini|/app/latest', 'Gemini')});
      await page.tick(); assert.equal(page.offer(), null, 'stale offer closes');
      await page.tick(2100); assert.equal(page.offer().querySelector('.rs-co-from b').textContent, 'Gemini');
    } finally { page.close(); }
  });
  await check('New work is captured when leaving even with an older archive write still pending', async () => {
    const shared = storage();
    const page = await open(shared, {provider:'chatgpt', path:'/c/work', request:'Build the shop.', holdArchive:true});
    try {
      await page.archiveTick();
      assert(page.requests.some(msg => msg.type === 'chat-history' && msg.request));
      page.w.document.querySelector('#messages > div').textContent = 'The shop is finished; now fix inventory persistence.';
      await page.leave();
      assert(shared.data.rsLatestHandoff.history[0].text.includes('now fix inventory persistence'));
    } finally { page.close(); }
  });
  await check('Same-tab website navigation saves the outgoing chat before its regular save', async () => {
    const shared = storage({rsLatestHandoff:transfer('gemini|/app/old', 'Gemini')});
    const page = await open(shared, {provider:'chatgpt', path:'/c/work', request:'Continue the shop.'});
    try { await page.navigateAway(); assert.equal(shared.data.rsLatestHandoff.chat_id, 'chatgpt|/c/work'); }
    finally { page.close(); }
  });
  await check('A fresh browser store restores from the desktop; choosing a new project stays respected on another website', async () => {
    const shared = storage({}, transfer());
    let page = await open(shared);
    try {
      await ready(page); assert(page.offer(), 'desktop archive restores a genuinely missing handoff');
      page.offer().querySelector('.rs-co-no').click(); await settle();
      assert.equal(shared.data.rsLatestHandoff, null);
    } finally { page.close(); }
    page = await open(shared, {provider:'chatgpt', path:'/c/new-project'});
    try { await ready(page); assert.equal(page.offer(), null, 'an old desktop archive cannot undo the new-project choice'); }
    finally { page.close(); }
  });
  await check('Cross-site prompt still waits for startup, respects opt-out and excludes real work', async () => {
    for (const options of [{started:false}, {request:'Start a different project.'}, {}]) {
      const shared = storage({rsLatestHandoff:transfer(), ...(Object.keys(options).length ? {} : {rsContinuationOffer:false})});
      const page = await open(shared, options);
      try { await ready(page); assert.equal(page.offer(), null); } finally { page.close(); }
    }
  });
  await check('Startup-only handoffs and a separate profile with no history never prompt', async () => {
    for (const seed of [{}, {rsLatestHandoff:R.handoff({provider:'ChatGPT', chat:'chatgpt|/c/startup', history:[{role:'user', text:'PlazCode startup check: reply with exactly one fenced json code block'}]})}]) {
      const page = await open(storage(seed));
      try { await ready(page); assert.equal(page.offer(), null); } finally { page.close(); }
    }
  });
  assert.equal(failures.length, 0, failures.join('; '));
  console.log('Cross-site continuation regression checks passed.');
})().catch(e => {console.error(e); process.exitCode = 1;});
