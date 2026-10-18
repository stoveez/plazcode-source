// Vani AI (c.vani.ai): the provider is registered on its own host, reads Vani's
// data-turn-id turns, treats only the login page as a sign-in wall (anonymous
// chat works), and recognises Vani's allowance/limit messages as busy.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert(manifest.host_permissions.includes('https://c.vani.ai/*'), 'Vani host permission');
const entries = manifest.content_scripts.filter((e) => (e.matches || []).includes('https://c.vani.ai/*'));
const own = entries.filter((e) => (e.js || []).includes('providers/vani.js'));
assert.equal(own.length, 1, 'one Vani provider entry');
assert.deepEqual(own[0].matches, ['https://c.vani.ai/*'], 'Vani provider only loads on Vani');
const useai = manifest.content_scripts.find((e) => (e.js || []).includes('providers/useai.js'));
assert.deepEqual(own[0].js, useai.js.map((f) => f === 'providers/useai.js' ? 'providers/vani.js' : f), 'Vani loads the same core scripts as the other sites');
assert.deepEqual(own[0].css, useai.css);
assert(entries.some((e) => (e.js || []).includes('core/debug-capture.js')), 'shared early scripts cover Vani');
assert(!manifest.content_scripts.some((e) => (e.js || []).includes('providers/vani.js') && e.matches.some((m) => m !== 'https://c.vani.ai/*')), 'Vani provider never loads elsewhere');
assert(fs.readFileSync('background.js', 'utf8').includes('"https://c.vani.ai/*"'), 'background knows Vani tabs');
assert(fs.readFileSync('popup.js', 'utf8').includes('"c.vani.ai"'), 'popup knows Vani');
assert(fs.readFileSync('core/main.js', 'utf8').includes('{ name: "Vani AI", url: "https://c.vani.ai/c" }'), 'Vani in the site list');

function load(url, body) {
  const d = new JSDOM('<main>' + body + '</main>', {url, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = d.window;
  w.HTMLElement.prototype.getBoundingClientRect = function () { return {x: 100, y: 400, left: 100, top: 400, right: 700, bottom: 450, width: 600, height: 50}; };
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {get() { return this.textContent; }});
  vm.runInContext(fs.readFileSync('providers/vani.js', 'utf8') + ';this.p=RSProvider;', d.getInternalVMContext());
  return {w, p: w.p};
}

// Vani's turn layout: user turns carry an items-end child, assistant turns do not.
{ const {w, p} = load('https://c.vani.ai/c/abc123',
    '<div data-turn-id="1"><div class="items-end"><div class="break-words">hello</div></div></div>' +
    '<div data-turn-id="2"><div><div class="break-words">{"command":"list_commands"}</div></div></div>' +
    '<form><textarea placeholder="Ask anything"></textarea><button type="submit" aria-label="Send message">Send</button></form>');
  assert.equal(p.id, 'vani'); assert.equal(p.displayName, 'Vani AI');
  assert.equal(p.userCount(), 1); assert.equal(p.assistantCount(), 1);
  assert.match(p.readAssistant().reply, /list_commands/);
  assert.equal(p.conversationKey(), 'abc123');
  assert.equal(p.loginGatePresent(), false, 'anonymous chat is not a sign-in wall');
  assert.equal(p.modeWarning(), '');
  w.close(); }

// The login page is the only sign-in wall, with a plain way back to the chat.
{ const {w, p} = load('https://c.vani.ai/login', '');
  assert.equal(p.loginGatePresent(), true);
  assert.match(p.modeWarning(), /c\.vani\.ai\/c/);
  w.close(); }

// Free-allowance and limit messages count as busy.
{ const {w, p} = load('https://c.vani.ai/c', '<textarea></textarea>');
  for (const text of ['You have reached your daily limit.', 'Sign up to continue chatting', 'Usage limit reached', 'Rate limit exceeded']) assert(p.isBusyMsg(text), text);
  assert(!p.isBusyMsg('Here is the script you asked for.'));
  w.close(); }

console.log('PASS Vani AI: registered on c.vani.ai only, reads Vani turns, anonymous chat works, login page and limits recognised.');
