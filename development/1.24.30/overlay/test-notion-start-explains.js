// Notion start handshake that does not get its command must say WHAT it saw, in the log
// (start.handshakeFailed.seen) and in the banner, instead of one generic sentence. Also runs
// the real start sequence with a reply that Notion split into [command][spoken line] (the
// new-workspace case) and checks that it now gets through the handshake.
// Fixtures only: the Notion pages here are stand-ins, not captures of a live Notion.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {JSDOM} = require(process.env.PLAZCODE_TEST_JSDOM || 'jsdom');

const parserSrc = fs.readFileSync('core/parser.js', 'utf8');
const providerSrc = fs.readFileSync('providers/notion.js', 'utf8');
const main = fs.readFileSync('core/main.js', 'utf8');
const parser = new Function(parserSrc + ';return RSParse;')();
const waitSrc = main.slice(main.indexOf('  async function waitForResponse('), main.indexOf('\n  // ═', main.indexOf('  async function waitForResponse(')));
const verifySrc = main.slice(main.indexOf('  function verifyResponseOwner('), main.indexOf('  async function waitForResponse('));
const startFrom = main.indexOf('  async function startSession('), startTo = main.indexOf('  const SVG =', startFrom);
const helpers = main.slice(main.indexOf('  function isProviderPolicyRefusal('), main.indexOf('  function notionPlainText('));
const notionPlain = main.slice(main.indexOf('  function notionPlainText('), main.indexOf('  const PLAN_CONTINUE_FEEDBACK'));
const startSrc = main.slice(startFrom, startTo);

const LIST = '{"command":"list_commands","params":{}}';
const COMPOSER = '<section id="composer"><textarea placeholder="Ask Notion AI"></textarea><button data-testid="agent-chat-send-button" aria-label="Send message">Send</button></section>';
const HOME_CARDS = '<h1>How can I help you today?</h1><div>Create Slides</div><div>Spreadsheets</div><div>Research</div><div>Visualize</div>';
const user = (t) => `<div style="display:flex;justify-content:flex-end"><div>${t}</div></div>`;
const cmdRoot = (blockId, text) => `<div data-content-editable-root="true"><pre data-block-id="${blockId}">${text}</pre></div>`;
const proseRoot = (blockId, text) => `<div data-content-editable-root="true"><div data-block-id="${blockId}">${text}</div></div>`;

function page(body, url) {
  const dom = new JSDOM('<div id="rs-root"></div><main>' + body + COMPOSER + '</main>', {url, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  const clock = {now: 1000};
  w.HTMLElement.prototype.getBoundingClientRect = function () { return {left: 100, top: 600, width: 600, height: 60, right: 700, bottom: 660}; };
  w.Date = {now: () => clock.now};
  vm.runInContext(parserSrc + ';globalThis.RSParse=RSParse;' + providerSrc + ';globalThis.provider=RSProvider;', dom.getInternalVMContext());
  return {dom, w, p: w.provider, clock};
}

// Runs the real startSession. `first` is what the first wait returns: an object, or 'real' to use the real watcher.
async function start(env, first, later = []) {
  const banners = [], diags = [];
  let sends = 0, dispatches = 0, realCalls = 0;
  const queue = [...later];
  const box = {
    A: {startGen: 0, sessionGen: 1, stop: false, sendToken: null, detectedTool: null, toolNames: new Set(), toolList: [{name: 'read_file', server: 'local'}]},
    P: Object.assign(Object.create(env.p), {ensureComposerReady: async () => ({ready: true}), prepareSessionStart: undefined, chatIsEmpty: () => true}),
    RSParse: parser, T: {RESPONSE_TIMEOUT_MS: 900000, STABLE_MS: 15000, WARMUP_MS: 90000, REASON_NOREPLY_MS: 180000, PRESTART_MS: 60000},
    Date: {now: () => env.clock.now}, document: {hidden: false}, bgMode: false, sleep: async (ms) => { env.clock.now += ms; },
    condoLocked: () => false, diag: (n, v) => diags.push([n, v]), activeEngine: () => 'local', ensureTools: async () => {}, systemPrompt: () => '⟦RS-SYS⟧',
    submitAndGetBase: async () => { sends++; return 0; },
    decorate: {sweep() {}, toolBox() {}}, ui: {setStarting() {}, inputCover() {}, updateStartGate() {}, trackCard() {}, setStarted() {}, toast() {}, banner: (kind, title, text) => banners.push({kind, title, text})},
    startupTurnIdentity: () => ({}), rememberExecuted() {}, runTool: async () => { dispatches++; return 'read_file'; }, rememberStartupOutcome() {}, rememberSession() {},
    SendAbortedError: class extends Error {}, RUN_CMD: 'run', log() {}, adoptChatId() {}, bareToolName: (v) => v, knownTool: () => false,
  };
  vm.createContext(box);
  vm.runInContext(verifySrc + waitSrc + ';this.realWait=waitForResponse;', box);
  box.waitForResponse = async (base) => {
    if (realCalls++ === 0) return first === 'real' ? box.realWait(base) : first;
    return queue.shift();
  };
  vm.runInContext(helpers + notionPlain + startSrc + ';this.start=startSession;', box);
  const result = await box.start();
  return {result, banners, diags, sends, dispatches, box};
}

(async () => {
  // 1. New workspace, message sent, but Notion is still on its AI home page and no chat appeared.
  {
    const env = page(HOME_CARDS, 'https://app.notion.com/ai');
    const r = await start(env, {kind: 'empty'});
    assert.equal(r.banners.length, 1);
    assert.equal(r.banners[0].title, 'Notion AI did not open a chat');
    assert.match(r.banners[0].text, /Open Notion AI > New chat, then press Start/);
    const seen = r.diags.find(([n]) => n === 'start.handshakeFailed')[1].seen;
    assert.equal(seen.page, 'home'); assert.equal(seen.newChatUrl, false); assert.equal(seen.items, 0); assert.equal(seen.kind, 'empty');
    assert.equal(r.dispatches, 0);
    env.w.close();
  }
  // 2. A chat exists but Notion answered in words: the banner quotes the answer, the log has the facts.
  {
    const env = page(user('I clicked Start Agent...') + proseRoot('p1', 'I cannot run commands on your computer.'), 'https://app.notion.com/chat?t=abc');
    const r = await start(env, {kind: 'text', text: 'I cannot run commands on your computer.'}, [{kind: 'text', text: 'I cannot run commands on your computer.'}]);
    assert.equal(r.banners.length, 1);
    assert.equal(r.banners[0].title, 'Notion AI answered in words');
    assert.match(r.banners[0].text, /I cannot run commands on your computer\./);
    assert.match(r.banners[0].text, /New chat, then press Start/);
    const seen = r.diags.find(([n]) => n === 'start.handshakeFailed')[1].seen;
    assert.equal(seen.page, 'chat'); assert.equal(seen.newChatUrl, true); assert.equal(seen.assistants, 1); assert.equal(seen.users, 1);
    assert.equal(seen.splitReply, false); assert.equal(seen.replyHead, 'I cannot run commands on your computer.');
    assert(!JSON.stringify(seen).includes('Start Agent'), 'the user message is never copied into the log');
    env.w.close();
  }
  // 3. A site notice (free-plan limit) is quoted as a notice.
  {
    const msg = "You've reached your free AI limit. Upgrade your plan to keep going.";
    const env = page(user('hello') + proseRoot('p1', msg), 'https://app.notion.com/chat?t=abc');
    const r = await start(env, {kind: 'text', text: msg}, [{kind: 'text', text: msg}]);
    assert.equal(r.banners[0].title, 'Notion AI showed a notice');
    assert.match(r.banners[0].text, /free AI limit/);
    env.w.close();
  }
  // 4. A provider with no evidence keeps the old generic wording.
  {
    const env = page(user('hi') + proseRoot('p1', 'prose'), 'https://app.notion.com/chat?t=abc');
    delete env.p.startupEvidence;
    const r = await start(env, {kind: 'text', text: 'prose'}, [{kind: 'text', text: 'prose'}]);
    assert.equal(r.banners[0].title, 'Startup handshake failed');
    assert.match(r.banners[0].text, /did not produce the required list_commands tool call/);
    env.w.close();
  }
  // 5. The new-workspace case: the first reply is [list_commands part][spoken line]. The handshake gets through.
  {
    const env = page(user('I clicked Start Agent...') + cmdRoot('c1', LIST) + proseRoot('p1', 'Waiting for the command list to come back.'), 'https://app.notion.com/chat?t=abc');
    const r = await start(env, 'real', [{kind: 'text', text: 'PlazCode is ready.'}]);
    assert.deepEqual(r.banners, []);
    assert.equal(r.dispatches, 1, 'list_commands ran once');
    assert(r.box.A.started, 'the session is started');
    env.w.close();
  }
  console.log('PASS Notion start failure explains itself (home page, words, notice, fallback) and a split first reply now passes the handshake.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
