"use strict";
// Freebuff chat box (owner, 2026-11-14, two screenshots): (1) the bar jumped onto the "What could be better?" feedback
// box under a reply, (2) the bar sat on the inner text strip of the chat box, so it was narrower than the box and its
// buttons wrapped. Runs the real Freebuff provider in real Chromium on a page shaped like Freebuff's.
// Run: node test-freebuff-composer.js
const fs = require("fs"), assert = require("node:assert/strict");
const SOURCE = fs.readFileSync(__dirname + "/providers/freebuff.js", "utf8");

const COMPOSER = `
  <div id="box" class="rounded-xl" style="display:flex;align-items:center;gap:8px;width:720px;margin:0 auto;padding:6px 10px;border:1px solid #333;border-radius:14px;background:#151515">
    <button id="plus" aria-label="Add files" style="width:28px;height:28px">+</button>
    <div id="strip" class="rounded-md" style="flex:1;border-radius:6px">
      <textarea id="main" placeholder="Ask Freebuff" style="width:100%;height:28px;border:0;background:none;color:#ddd"></textarea>
    </div>
    <button id="mode" style="width:80px;height:28px">Balanced</button>
    <button id="send" aria-label="Send message" type="submit" style="width:28px;height:28px">^</button>
  </div>`;
const FEEDBACK = `
  <div data-message-role="assistant" style="width:720px;margin:0 auto">
    <p>PlazCode is ready.</p>
    <div class="feedback">
      <textarea id="fb" placeholder="What could be better?" style="width:700px;height:50px"></textarea>
      <button id="fbcancel">Cancel</button><button id="fbsend" type="submit">Send</button>
    </div>
  </div>`;

(async () => {
  let browser = null, why = "";
  if (process.env.PLAZCODE_TEST_BROWSER !== "skip") {
    try { const { chromium } = require("playwright"); browser = await chromium.launch(process.env.PLAZCODE_CHROMIUM ? { executablePath: process.env.PLAZCODE_CHROMIUM } : {}); } catch (error) { why = String((error && error.message) || error).split("\n")[0]; }
  } else why = "PLAZCODE_TEST_BROWSER=skip";
  if (!browser) {
    if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw new Error("Chromium is required for the Freebuff chat box check: " + why);
    console.log("SKIP Freebuff chat box check (" + why.slice(0, 120) + ")"); return;
  }
  let checks = 0;
  const ok = (name, fn) => { fn(); checks++; console.log("ok - " + name); };
  try {
    const page = await browser.newPage({ viewport: { width: 1040, height: 640 } });
    const probe = async (body) => {
      await page.setContent(`<!doctype html><html><body style="margin:0;background:#111;color:#ddd"><main style="padding-top:40px">${body}</main></body></html>`);
      await page.addScriptTag({ content: SOURCE + ";window.__p=RSProvider;window.__p.init({diag(){}});" });
      return page.evaluate(() => {
        const p = window.__p, id = (el) => (el && el.id) || null;
        const a = p.barAnchor(), ar = a && a.getBoundingClientRect(), boxEl = document.getElementById("box"), box = boxEl ? boxEl.getBoundingClientRect() : {width:0,left:0};
        return { editor: id(p.getEditor()), anchor: id(a), anchorWidth: ar && Math.round(ar.width), boxWidth: Math.round(box.width), anchorLeft: ar && Math.round(ar.left), boxLeft: Math.round(box.left) };
      });
    };

    const plain = await probe(COMPOSER);
    ok("the bar anchors to the whole chat box, not its inner text strip", () => {
      assert.equal(plain.editor, "main"); assert.equal(plain.anchor, "box");
      assert.equal(plain.anchorWidth, plain.boxWidth); assert.equal(plain.anchorLeft, plain.boxLeft);
    });

    // The feedback form comes first in the page, above the chat box.
    const withFeedback = await probe(FEEDBACK + COMPOSER);
    ok("the feedback box under a reply is never taken for the chat box", () => {
      assert.equal(withFeedback.editor, "main"); assert.equal(withFeedback.anchor, "box");
    });

    // A feedback box with no telling placeholder still loses to the chat box: it sits inside a reply.
    const unnamed = await probe(FEEDBACK.replace('placeholder="What could be better?"', "") + COMPOSER);
    ok("a box inside a reply is skipped even without a telling placeholder", () => assert.equal(unnamed.editor, "main"));

    // Feedback box alone (chat box gone for a moment): PlazCode finds no chat box rather than the feedback box.
    const alone = await probe(FEEDBACK);
    ok("with only the feedback box on the page there is no chat box", () => assert.equal(alone.editor, null));

    // Two plain boxes with no labels: the lower one (the chat box sits at the bottom) wins.
    const two = await probe(`<div style="width:720px;margin:0 auto"><textarea id="top" style="width:600px;height:30px"></textarea></div><div style="height:200px"></div>` + COMPOSER.replace('placeholder="Ask Freebuff"', ""));
    ok("of two unlabelled boxes the lower one is the chat box", () => assert.equal(two.editor, "main"));

    // Freebuff Chat mode (structure read from the live page, 2026-11-14): an invisible, wider "composer" wrapper with side
    // padding around the visible "composer-box"; the editor is a contenteditable inside "composer-input-scroll".
    const chatMode = await probe(`<div class="composer workspace-composer composer-chat-mode" style="width:720px;margin:0 auto;padding:12px 24px">
      <div id="box" class="composer-box" style="display:flex;align-items:center;gap:8px;border:1px solid #333;border-radius:24px;background:#131514;padding:4px 10px">
        <button aria-label="Attach files" style="width:28px;height:28px">+</button>
        <div class="composer-input-scroll" style="flex:1"><div id="main" contenteditable="true" style="min-height:36px"></div></div>
        <button aria-label="Start dictation" style="width:28px;height:28px">m</button>
      </div></div>`);
    ok("Chat mode: the bar takes the visible chat box, not its wider invisible wrapper", () => {
      assert.equal(chatMode.editor, "main"); assert.equal(chatMode.anchor, "box"); assert.equal(chatMode.anchorWidth, chatMode.boxWidth);
    });

    await page.setContent(`<!doctype html><html><head><style>.rs-hidden > *:not(.rs-chip){display:none!important}</style></head><body style="margin:0;background:#111;color:#ddd"><main style="padding-top:40px">
      <div id="a1" data-message-role="assistant" data-message-id="m-a1"><pre><code>{"command":"list_commands"}</code></pre></div>
      <div id="u1" class="rs-hidden" data-message-role="user" data-message-id="m-u1"><div class="body">Output of 'list_commands':\nworkspace_info, read_file</div></div>
      <div id="hiddenWrap" style="display:none"><div id="uHidden" class="rs-hidden" data-message-role="user">Output of 'read_file':\nhidden</div></div>
      <div id="a2" data-message-role="assistant" data-message-id="m-a2"><div class="prose">PlazCode is ready.</div></div>
      ${COMPOSER}
    </main></body></html>`);
    await page.addScriptTag({ content: SOURCE + ";window.__p=RSProvider;window.__p.init({diag(){}});" });
    const hiddenCheck = await page.evaluate(() => {
      const p = window.__p, u1 = document.getElementById("u1"), items = p.allItems();
      return {
        u1Height: Math.round(u1.getBoundingClientRect().height),
        ids: items.map((el) => el.id),
        userCount: p.userCount(),
        u1IsUser: p.isUserItem(items[1]),
        u1Text: p.classifyText(items[1], ".rs-chip"),
        a1Key: p.itemKey(document.getElementById("a1")),
      };
    });
    ok("real Chromium: 0px pre-hidden result turn stays in allItems between command and follow-up turns", () => {
      assert.equal(hiddenCheck.u1Height, 0);
      assert.deepEqual(hiddenCheck.ids, ["a1", "u1", "a2"]);
      assert.equal(hiddenCheck.userCount, 1);
      assert.equal(hiddenCheck.u1IsUser, true);
      assert(hiddenCheck.u1Text.includes("Output of 'list_commands':"));
      assert.equal(hiddenCheck.a1Key, "m-a1");
    });
  } finally { await browser.close(); }
  console.log("PASS " + checks + " Freebuff chat box checks.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
