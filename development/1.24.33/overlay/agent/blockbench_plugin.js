// PlazCode helper for Blockbench. Made by PlazCode on this computer; load it in Blockbench with
// File > Plugins > Load Plugin from File. It only talks to the PlazCode app on this computer (127.0.0.1) and can
// only do PlazCode's named Blockbench actions. Safe to delete: PlazCode's "Disconnect" removes it too.
// plazcode-helper-file:blockbench
(function () {
  "use strict";
  var WORD = "__PLAZCODE_WORD__", PORT = __PLAZCODE_PORT__;
/*__PLAZCODE_TOOLSET__*/
  var tools = (typeof window !== "undefined" ? window : globalThis).__plazcodeBlockbench;
  var socket = null, timer = null, beat = null, stopped = true, wait = 1000, refused = 0;
  function say(text) { try { if (typeof Blockbench !== "undefined" && Blockbench.showQuickMessage) Blockbench.showQuickMessage(text, 2500); } catch (ignored) {} }
  function again() {
    if (stopped) return;
    clearTimeout(timer);
    // A refused pairing word will not start working by itself: after a few tries, ask only now and then.
    timer = setTimeout(connect, refused >= 3 ? 120000 : wait);
    wait = Math.min(wait * 2, 15000);
  }
  function connect() {
    if (stopped || socket) return;
    var paired = false, mine;
    try { mine = socket = new WebSocket("ws://127.0.0.1:" + PORT + "/helper"); } catch (error) { socket = null; again(); return; }
    mine.onopen = function () { mine.send(JSON.stringify({ hello: 1, app: "blockbench", word: WORD, version: String(typeof Blockbench !== "undefined" && Blockbench.version || ""), variant: "desktop" })); };
    mine.onmessage = function (event) {
      var message; try { message = JSON.parse(event.data); } catch (error) { return; }
      if (message.paired === true) { paired = true; refused = 0; wait = 1000; say("Connected to PlazCode"); return; }
      if (typeof message.id !== "number" || typeof message.cmd !== "string") return;
      tools.run(message.cmd, message.args).then(function (reply) { if (mine.readyState === 1) mine.send(JSON.stringify({ id: message.id, ok: reply.ok, result: reply.result, message: reply.message })); });
    };
    mine.onerror = function () {};
    mine.onclose = function (event) { if (socket === mine) socket = null; if (!paired && event && event.wasClean !== false && mine.opened) refused += 1; again(); };
    mine.addEventListener("open", function () { mine.opened = true; });
  }
  Plugin.register("plazcode_blockbench", {
    title: "PlazCode", author: "PlazCode", icon: "link", version: "1.0.0", variant: "desktop", min_version: "4.8.0",
    description: "Lets the AI you use with PlazCode build and edit models in this Blockbench.",
    onload: function () { stopped = false; refused = 0; wait = 1000; connect(); beat = setInterval(function () { if (socket && socket.readyState === 1) socket.send("{\"beat\":1}"); }, 20000); },
    onunload: function () { stopped = true; clearTimeout(timer); clearInterval(beat); if (socket) { try { socket.close(); } catch (ignored) {} socket = null; } }
  });
})();
