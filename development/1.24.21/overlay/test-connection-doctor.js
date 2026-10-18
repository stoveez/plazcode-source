// Fix connection: every check path, safe fixes only, never auto-connects a chat.
const assert = require("assert");
const D = require("./core/connection-doctor.js");

const okStatus = { connected: true, roblox_connected: true, studioProc: true, studioApp: true, servers: [{ id: "roblox", alive: true, tools: 20 }] };
function actions(seq, extra = {}) {
  const calls = [];
  let i = 0;
  return { calls, act: {
    status: async () => { calls.push("status"); const s = seq[Math.min(i, seq.length - 1)]; i++; return s; },
    reconnect: async () => { calls.push("reconnect"); },
    restartMcp: async () => { calls.push("restartMcp"); },
    ...extra,
  } };
}
const fast = { bridgeWaitMs: 30, mcpWaitMs: 30, stepMs: 1 };
const ready = async () => ({ ready: true });
const ids = r => r.steps.map(s => s.id + ":" + s.state).join(" ");

(async () => {
  // All good: nothing is changed, chat is connected.
  { const { calls, act } = actions([okStatus]);
    const r = await D.run({ engine: "roblox", status: okStatus, chatConnected: true, composer: ready }, act, fast);
    assert.equal(ids(r), "extension:ok app:ok engine:ok chat-box:ok chat:ok");
    assert.equal(r.action, ""); assert.deepEqual(calls, []); }

  // Stale page: stop at once and offer Reload; touch nothing.
  { const { calls, act } = actions([okStatus]);
    const r = await D.run({ stale: true, engine: "roblox", status: okStatus, composer: ready }, act, fast);
    assert.equal(ids(r), "extension:action"); assert.equal(r.action, "reload"); assert.deepEqual(calls, []); }

  // App offline, comes back after reconnect: fixed.
  { const { calls, act } = actions([{ connected: false }, okStatus]);
    const r = await D.run({ engine: "roblox", status: { connected: false }, chatConnected: true, composer: ready }, act, fast);
    assert.equal(ids(r), "extension:ok app:fixed engine:ok chat-box:ok chat:ok");
    assert.equal(calls[0], "reconnect"); }

  // App stays offline: tell the user to open it, stop there.
  { const { act } = actions([{ connected: false }]);
    const r = await D.run({ engine: "roblox", status: { connected: false }, composer: ready }, act, fast);
    assert.equal(ids(r), "extension:ok app:action"); assert.match(r.steps[1].text, /Open PlazCode on your computer/); }

  // Only an explicit HTTP 401/403 refusal gets the "refused" message.
  { const { act } = actions([{ connected: false, bridge_error: "Local bridge pairing failed: Automatic pairing failed (HTTP 403). Update the desktop and extension together" }]);
    const r = await D.run({ engine: "roblox", status: { connected: false }, composer: ready }, act, fast);
    assert.match(r.steps[1].text, /refused this browser/); }
  // A closed app makes the pairing request fail to fetch: that is "not running", not "refused".
  { const { act } = actions([{ connected: false, bridge_error: "Local bridge pairing failed: Failed to fetch. In Edge or Brave, check that PlazCode is enabled" }]);
    const r = await D.run({ engine: "roblox", status: { connected: false }, composer: ready }, act, fast);
    assert.match(r.steps[1].text, /isn't running/); }

  // Studio open, MCP off: restart MCP once; comes back -> fixed.
  { const down = { connected: true, studioProc: true, studioApp: false, roblox_connected: false };
    const { calls, act } = actions([okStatus]);
    const r = await D.run({ engine: "roblox", status: down, chatConnected: true, composer: ready }, act, fast);
    assert.equal(ids(r), "extension:ok app:ok engine:fixed chat-box:ok chat:ok");
    assert.equal(calls.filter(c => c === "restartMcp").length, 1); }

  // Studio open, MCP still off after restart: explain the Studio setting.
  { const down = { connected: true, studioProc: true, studioApp: false, roblox_connected: false };
    const { calls, act } = actions([down]);
    const r = await D.run({ engine: "roblox", status: down, composer: ready }, act, fast);
    assert.equal(ids(r), "extension:ok app:ok engine:action"); assert.match(r.steps[2].text, /MCP Servers/);
    assert.equal(calls.filter(c => c === "restartMcp").length, 1); }

  // Studio closed: never restart anything, just say open Studio.
  { const closed = { connected: true, studioProc: false, roblox_connected: false };
    const { calls, act } = actions([closed]);
    const r = await D.run({ engine: "roblox", status: closed, composer: ready }, act, fast);
    assert.match(r.steps[2].text, /^Open Roblox Studio\.$/); assert.ok(!calls.includes("restartMcp")); }

  // No place loaded.
  { const noPlace = { connected: true, studioProc: true, studioApp: true, roblox_connected: false };
    const { act } = actions([noPlace]);
    const r = await D.run({ engine: "roblox", status: noPlace, composer: ready }, act, fast);
    assert.match(r.steps[2].text, /Open a place/); }

  // Other tool (e.g. Blender) alive: warn but continue to the chat checks.
  { const deg = { connected: true, studioProc: false, roblox_connected: false, servers: [{ id: "blender", alive: true, tools: 5 }] };
    const { act } = actions([deg]);
    const r = await D.run({ engine: "roblox", status: deg, chatAction: "start", composer: ready }, act, fast);
    assert.equal(ids(r), "extension:ok app:ok engine:action chat-box:ok chat:action"); assert.equal(r.action, "start"); }

  // AgentScript.
  { const loc = { connected: true, local_connected: true };
    const { act } = actions([loc]);
    const r = await D.run({ engine: "local", status: loc, chatConnected: true, composer: ready }, act, fast);
    assert.match(r.steps[2].text, /AgentScript is connected/); }

  // Chat box missing: the site's own hint is shown.
  { const { act } = actions([okStatus]);
    const r = await D.run({ engine: "roblox", status: okStatus, composer: async () => ({ ready: false, detail: "ClickUp — open Ask Brain" }) }, act, fast);
    assert.equal(ids(r), "extension:ok app:ok engine:ok chat-box:action"); assert.match(r.steps[3].text, /Ask Brain/); }

  // Not connected to this chat: offer Restart, never do it automatically.
  { const { calls, act } = actions([okStatus]);
    const r = await D.run({ engine: "roblox", status: okStatus, chatConnected: false, chatAction: "restart", composer: ready }, act, fast);
    assert.equal(r.action, "restart"); assert.equal(r.steps.at(-1).action, "restart"); assert.deepEqual(calls, []); }

  // A throwing composer check is treated as not ready, not a crash.
  { const { act } = actions([okStatus]);
    const r = await D.run({ engine: "roblox", status: okStatus, composer: async () => { throw Error("x"); } }, act, fast);
    assert.equal(r.steps.at(-1).id, "chat-box"); }

  console.log("connection doctor: all paths pass");
})().catch(e => { console.error(e); process.exit(1); });
