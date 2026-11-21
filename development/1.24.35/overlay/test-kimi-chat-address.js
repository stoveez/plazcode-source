// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Kimi startup (owner, 2026-11-14, checked live on kimi.ai): right after the first send of a new chat Kimi shows a
// temporary address (/chat/p<7 hex>-...) and moves to the real one about a second later. PlazCode took the temporary
// address for the chat, saw the move as the person leaving, stopped reading the reply, and list_commands stayed a raw
// JSON block. The temporary address now counts as a new chat; the core also accepts one more address swap for a chat
// that only got its address during this send.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const src = fs.readFileSync('providers/kimi.js', 'utf8');
const key = (url) => {
  const d = new JSDOM('<main></main>', {url, runScripts: 'outside-only', pretendToBeVisual: true});
  vm.runInContext(src + ';this.P=RSProvider;', d.getInternalVMContext());
  const out = d.window.P.conversationKey(); d.window.close(); return out;
};
assert.equal(key('https://www.kimi.ai/'), '', 'home page is a new chat');
assert.equal(key('https://www.kimi.ai/chat/p9425497-8250-43e4-9fcf-688875bb1723'), '', 'temporary address is still a new chat');
assert.equal(key('https://www.kimi.ai/chat/1a1dd10c-6112-8d47-8000-09182ea58842?chat_enter_method=home'), '/chat/1a1dd10c-6112-8d47-8000-09182ea58842', 'real address is the chat');
assert.equal(key('https://www.kimi.com/chat/abc123'), '/chat/abc123', 'other saved chats unchanged');
const main = fs.readFileSync('core/main.js', 'utf8');
assert(/sendChat = chat; adoptedAt = Date\.now\(\);/.test(main), 'core remembers when a new chat got its address during the send');
assert(/!!adoptedAt && Date\.now\(\) - adoptedAt < 6000/.test(main), 'and accepts one swap to the real address shortly after');
console.log('PASS Kimi temporary chat address checks.');
