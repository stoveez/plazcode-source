// Ox Alpha: pressing Start / Restart on the HOME page must never put the start
// prompt in a web address. Before this fix the home page's box turned the ~14,000
// character prompt into /chat?q=<prompt> and nginx answered "414 Request-URI Too Large".
// Now: the provider leaves for the plain /chat URL and finishes the Start there once;
// it refuses to type on a non-chat page; and core/main.js cancels any send-time
// navigation or GET form whose address is over 1500 characters and carries the message.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');

const CAP = 1500;
const providerSrc = fs.readFileSync('providers/oxalpha.js', 'utf8');
const mainSrc = fs.readFileSync('core/main.js', 'utf8');
const PROMPT = '⟦RS-SYS⟧\nCONTEXT: the user has installed a browser extension called PlazCode. ' + 'x'.repeat(14000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Loads the provider with a recording `location`, so navigations can be observed (jsdom cannot navigate).
function load(url, body) {
  const d = new JSDOM('<main>' + body + '</main>', {url, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = d.window;
  w.HTMLElement.prototype.getBoundingClientRect = function () { return {x: 100, y: 400, left: 100, top: 400, right: 700, bottom: 450, width: 600, height: 50}; };
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {get() { return this.textContent; }});
  const u = new URL(url);
  const nav = [];
  const fakeLocation = {pathname: u.pathname, origin: u.origin, search: u.search, hash: '', href: url, assign(x) { nav.push(String(x)); }};
  const make = vm.runInContext('(function(location){' + providerSrc + '\nreturn RSProvider;})', d.getInternalVMContext());
  const p = make(fakeLocation);
  const events = [];
  const diag = (n, data) => events.push([n, data]);
  return {w, p, nav, events, diag, fakeLocation};
}
const HOME = '<form action="/chat" method="get"><textarea name="q" placeholder="Ask anything"></textarea><button type="submit" aria-label="Send message">Send</button></form>';
const CHAT = '<form><textarea placeholder="Ask anything"></textarea><button type="submit" aria-label="Send message">Send</button></form>';
const PENDING = 'plazcode.oxalpha.pendingStart';

(async () => {
  // 1. Start on the home page: go to the plain chat URL, remember the Start, type nothing.
  for (const origin of ['https://oxalpha.com', 'https://oxalpha.org']) {
    const {w, p, nav, diag} = load(origin + '/', HOME);
    p.init({diag, isStopped: () => false, isSessionActive: () => false, requestStart: () => { throw new Error('must not start on the home page'); }});
    const r = await p.ensureComposerReady('startup');
    assert.deepEqual({ready: r.ready, navigating: r.navigating}, {ready: false, navigating: true}, 'home start navigates');
    assert.deepEqual(nav, [origin + '/chat'], 'only the clean chat address is opened on ' + origin);
    const state = w.sessionStorage.getItem(PENDING);
    assert(state && !/RS-SYS|CONTEXT|PlazCode/.test(state), 'only text-free state is remembered');
    assert.equal(w.document.querySelector('textarea').value, '', 'nothing typed into the home box');
    w.close();
  }

  // 2. Other callers (Fix connection, UI cards) never navigate; typing on the home page is refused outright.
  {
    const {w, p, nav} = load('https://oxalpha.com/', HOME);
    p.init({diag: () => {}});
    await p.ensureComposerReady();
    await p.ensureComposerReady('doctor');
    assert.equal(nav.length, 0, 'no navigation without the startup reason');
    let submits = 0;
    w.document.addEventListener('submit', () => { submits++; }, true);
    await assert.rejects(() => p.typeAndSend(PROMPT), /home page, not a chat/);
    assert.equal(w.document.querySelector('textarea').value, '', 'home box stays empty');
    assert.equal(submits, 0, 'home form never submitted');
    assert.equal(nav.length, 0);
    w.close();
  }

  // 3. A real chat is untouched: Start proceeds in place, typing and sending still work.
  {
    const {w, p, nav} = load('https://oxalpha.com/chat', CHAT);
    p.init({diag: () => {}});
    const r = await p.ensureComposerReady('startup');
    assert.equal(r.ready, true); assert(!r.navigating);
    assert.equal(nav.length, 0);
    const ta = w.document.querySelector('textarea');
    w.document.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); ta.value = ''; });
    await p.typeAndSend('hello there');
    assert.equal(ta.value, '', 'message went through the normal chat box');
    w.close();
    const t = load('https://oxalpha.com/chat/abc123', CHAT);
    assert.equal(t.p.conversationKey(), 'abc123');
    t.w.close();
  }

  // 4. After the page change the Start is finished exactly once; stale or finished starts are dropped.
  {
    const {w, p} = load('https://oxalpha.com/chat', CHAT);
    w.sessionStorage.setItem(PENDING, JSON.stringify({at: Date.now(), navs: 1, lastNav: Date.now(), reason: 'startup'}));
    let starts = 0;
    const hooks = {diag: () => {}, isStopped: () => false, isSessionActive: () => false, requestStart: () => { starts++; }};
    p.init(hooks);
    await sleep(1700);
    assert.equal(starts, 1, 'Start resumed once');
    assert.equal(w.sessionStorage.getItem(PENDING), null, 'remembered start cleared');
    p.init(hooks); // a second init (or reload) must not start again
    await sleep(1200);
    assert.equal(starts, 1, 'never started twice');
    w.close();
  }
  {
    const {w, p} = load('https://oxalpha.com/chat', CHAT);
    w.sessionStorage.setItem(PENDING, JSON.stringify({at: Date.now(), navs: 1, lastNav: Date.now()}));
    let starts = 0;
    p.init({diag: () => {}, isStopped: () => false, isSessionActive: () => true, requestStart: () => { starts++; }});
    await sleep(900);
    assert.equal(starts, 0, 'already-running session is not started again');
    assert.equal(w.sessionStorage.getItem(PENDING), null);
    w.close();
  }
  {
    const {w, p} = load('https://oxalpha.com/chat', CHAT);
    w.sessionStorage.setItem(PENDING, JSON.stringify({at: Date.now() - 200000, navs: 1, lastNav: Date.now() - 200000}));
    let starts = 0;
    p.init({diag: () => {}, requestStart: () => { starts++; }});
    await sleep(900);
    assert.equal(starts, 0, 'an old remembered start expires');
    assert.equal(w.sessionStorage.getItem(PENDING), null);
    w.close();
  }

  // 5. If the site keeps sending the tab back, give up with a plain message instead of looping.
  {
    const {w, p, nav} = load('https://oxalpha.com/', HOME);
    p.init({diag: () => {}});
    w.sessionStorage.setItem(PENDING, JSON.stringify({at: Date.now(), navs: 3, lastNav: Date.now()}));
    const r = await p.ensureComposerReady('startup');
    assert.equal(r.ready, false); assert(!r.navigating);
    assert.match(r.detail, /oxalpha\.com\/chat/);
    assert.equal(nav.length, 0);
    w.close();
  }

  // 6. core/main.js: the startup path stops quietly when the provider is navigating, and every send is guarded.
  assert(/if \(modeState && modeState\.navigating\) \{ diag\("start\.navigating"/.test(mainSrc), 'main.js stops quietly while the provider navigates');
  assert(mainSrc.indexOf('modeState.navigating') < mainSrc.indexOf('if (!modeState || !modeState.ready)'), 'navigating is checked before the not-ready banner');
  const sendSites = mainSrc.split('\n').filter((l) => /await P\.typeAndSend\(/.test(l));
  assert.equal(sendSites.length, 3, 'three send sites');
  for (const site of sendSites) {
    const i = mainSrc.indexOf(site);
    assert(/armUrlGuard\(/.test(mainSrc.slice(Math.max(0, i - 400), i)), 'send site is guarded: ' + site.trim().slice(0, 60));
  }

  // 7. The long-address guard itself (block taken straight from core/main.js).
  {
    const a = mainSrc.indexOf('const URL_TEXT_CAP');
    const b = mainSrc.indexOf('async function submitAndGetBase');
    assert(a > 0 && b > a, 'guard block present');
    const d = new JSDOM('<form id="g" action="/chat" method="get"><textarea name="q"></textarea></form><form id="p" action="/chat" method="post"><textarea name="q"></textarea></form>', {url: 'https://oxalpha.com/', runScripts: 'outside-only'});
    const w = d.window;
    const handlers = [];
    w.navigation = {addEventListener(type, fn) { if (type === 'navigate') handlers.push(fn); }};
    const toasts = [], diags = [];
    w.__t = {toasts, diags};
    const api = vm.runInContext('(function(){ const ui={toast:(m)=>__t.toasts.push(m)}; const diag=(n,x)=>__t.diags.push([n,x]);\n' +
      mainSrc.slice(a, b) + '\nreturn {armUrlGuard, urlGuard, urlCarriesPrompt};})()', d.getInternalVMContext());
    assert.equal(api.urlCarriesPrompt('https://oxalpha.com/chat?q=' + encodeURIComponent(PROMPT)), false, 'unarmed guard does nothing');
    api.armUrlGuard(PROMPT);
    const bigUrl = 'https://oxalpha.com/chat?q=' + encodeURIComponent(PROMPT);
    assert(bigUrl.length > CAP * 5);
    assert.equal(api.urlCarriesPrompt(bigUrl), true, 'long address carrying the prompt is caught');
    assert.equal(api.urlCarriesPrompt('https://oxalpha.com/chat?q=' + PROMPT.replace(/ /g, '+')), true, 'plus-encoded spaces are caught too');
    assert.equal(api.urlCarriesPrompt('https://oxalpha.com/chat?q=hi'), false, 'short addresses pass');
    assert.equal(api.urlCarriesPrompt('https://oxalpha.com/login?next=' + 'a'.repeat(3000)), false, 'long addresses that do not carry the message pass');
    // GET form carrying the prompt is cancelled; a POST form is not.
    const get = w.document.getElementById('g'); get.querySelector('textarea').value = PROMPT;
    const ev = new w.Event('submit', {bubbles: true, cancelable: true});
    get.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, true, 'GET form with the prompt is cancelled');
    const post = w.document.getElementById('p'); post.querySelector('textarea').value = PROMPT;
    const ev2 = new w.Event('submit', {bubbles: true, cancelable: true});
    post.dispatchEvent(ev2);
    assert.equal(ev2.defaultPrevented, false, 'POST form is left alone');
    // Navigation API.
    assert.equal(handlers.length, 1, 'navigate listener installed');
    let prevented = 0;
    handlers[0]({destination: {url: bigUrl}, cancelable: true, preventDefault() { prevented++; }});
    assert.equal(prevented, 1, 'long navigation cancelled');
    handlers[0]({destination: {url: 'https://oxalpha.com/chat'}, cancelable: true, preventDefault() { prevented++; }});
    assert.equal(prevented, 1, 'normal navigation allowed');
    // Guard window closes after the send.
    api.urlGuard.until = Date.now() - 1;
    handlers[0]({destination: {url: bigUrl}, cancelable: true, preventDefault() { prevented++; }});
    assert.equal(prevented, 1, 'guard is only active around a send');
    assert(toasts.length >= 2 && diags.every(([n]) => n === 'send.longUrlBlocked'), 'user told, no text logged');
    assert(!JSON.stringify(diags).includes('CONTEXT'), 'blocked prompt text is never logged');
    w.close();
  }

  // 8. No provider or core file builds a web address out of message text.
  {
    const files = fs.readdirSync('providers').map((f) => 'providers/' + f).concat(['core/main.js']);
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert(!/[?&]q=\s*["'`]\s*\+|[?&]q=\$\{|searchParams\.(?:set|append)\(\s*["']q["']/.test(src), f + ' must not put text in a ?q= address');
    }
  }

  console.log('PASS Ox Alpha home-page start: no prompt in any web address, clean /chat hand-off resumes once, home box never typed into, long-address guard cancels 414-sized navigations.');
})().catch((e) => { console.error(e); process.exit(1); });
