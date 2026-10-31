// A settings backup carries choices, never secrets or live state, and a bad one cannot do harm.
const assert = require('node:assert/strict');
const B = require('./core/settings-backup.js');
const stored = { rsTheme: 'night', rsSounds: true, rsToolBudget: 40, rsCommandCooldown: 2, rsAllowedFolders: ['C:\\Work'], rsCustomPrompt: 'be brief',
  rsApiKey: 'sk-secret', rsGithubToken: 'abc', rsCustomMcpServers: { x: { command: 'evil.exe' } }, rsStartedSessions: { a: 1 }, rsLatestHandoff: { big: 'x' },
  rsPassword: 'p', rsWebhookUrl: 'https://x', somethingElse: 1, rsBad: () => 1, rsSiteSetups: { roblox: { auto: true } } };
const text = B.create(stored, new Date('2026-10-18T12:00:00Z'));
const backup = JSON.parse(text);
assert.equal(backup.format, 'plazcode-settings'); assert.equal(backup.version, 1);
assert.deepEqual(Object.keys(backup.settings), ['rsAllowedFolders', 'rsCommandCooldown', 'rsCustomPrompt', 'rsSiteSetups', 'rsSounds', 'rsTheme', 'rsToolBudget']);
for (const secret of ['sk-secret', 'abc', 'evil.exe', 'https://x']) assert(!text.includes(secret), secret + ' must not be in a backup');

// Restoring onto a clean profile applies everything; onto the same profile changes nothing.
let r = B.parse(text, {}); assert.equal(r.ok, true); assert.equal(Object.keys(r.changes).length, 7);
r = B.parse(text, backup.settings); assert.deepEqual(r.changes, {}); assert.deepEqual(r.skipped, []);
// Only differences are reported.
r = B.parse(text, { ...backup.settings, rsTheme: 'sakura' }); assert.deepEqual(r.changes, { rsTheme: 'night' });

// A hand-edited backup cannot smuggle secrets, launch commands or the wrong kind of value.
const evil = JSON.stringify({ format: 'plazcode-settings', version: 1, settings: { rsApiKey: 'x', rsCustomMcpServers: {}, rsToolBudget: 'lots', rsTheme: 'ok', notRs: 1 } });
r = B.parse(evil, { rsToolBudget: 40, rsTheme: 'night' });
assert.deepEqual(r.changes, { rsTheme: 'ok' }); assert.deepEqual(r.skipped.sort(), ['notRs', 'rsApiKey', 'rsCustomMcpServers', 'rsToolBudget'].sort());

// Anything that is not a usable backup is refused with a reason.
for (const [input, why] of [['', 'empty'], ['hello', 'not-json'], ['{"a":1}', 'not-backup'], [JSON.stringify({ format: 'plazcode-settings', version: 9, settings: {} }), 'newer'],
  [JSON.stringify({ format: 'plazcode-settings', version: 1, settings: [] }), 'not-backup'], ['x'.repeat(300000), 'too-big']]) assert.equal(B.parse(input, {}).error, why, why);
console.log('Settings backup keeps choices only, refuses secrets and bad values, and reports just the differences.');
