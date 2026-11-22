// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/ask-site.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// Which AI chat site runs "Ask PlazCode" (split out of background.js, split as you go). Owner (2026-11-18): "instead of a backup
// DeepSeek, make Ask PlazCode powered by the current AI chat you're using". The background chat now opens on the site of the
// AI chat the person last used PlazCode in (a new chat there, so their own chat is not touched); DeepSeek is only the
// fallback when no AI chat has been seen yet. Loaded by background.js (importScripts; Firefox: the background script list).
const PlazCodeAskSite = (() => {
                                            
  // Each supported AI site's new-chat page (the same addresses as the app's "All supported AIs" buttons, agent/src/gui.rs).
  const SITES                                                        = [
    { hosts: ["chat.deepseek.com", "deepseek.com"], url: "https://chat.deepseek.com/", name: "DeepSeek" },
    { hosts: ["chatgpt.com", "chat.openai.com"], url: "https://chatgpt.com/", name: "ChatGPT" },
    { hosts: ["claude.ai", "claude.com"], url: "https://claude.ai/new", name: "Claude" },
    { hosts: ["gemini.google.com"], url: "https://gemini.google.com/app", name: "Gemini" },
    { hosts: ["kimi.com", "kimi.ai"], url: "https://www.kimi.com/", name: "Kimi" },
    { hosts: ["chat.z.ai"], url: "https://chat.z.ai/", name: "GLM" },
    { hosts: ["chat.qwen.ai"], url: "https://chat.qwen.ai/", name: "Qwen" },
    { hosts: ["arena.ai"], url: "https://arena.ai/", name: "Arena" },
    { hosts: ["freebuff.ai", "freebuff.com"], url: "https://freebuff.ai/chat", name: "Freebuff" },
    { hosts: ["gpt.crax.lol"], url: "https://gpt.crax.lol/", name: "Crax" },
    { hosts: ["use.ai"], url: "https://use.ai/", name: "UseAI" },
    { hosts: ["c.vani.ai"], url: "https://c.vani.ai/c", name: "Vani" },
    { hosts: ["aistudio.xiaomimimo.com"], url: "https://aistudio.xiaomimimo.com/#/c", name: "MiMo" },
    { hosts: ["oxalpha.com", "oxalpha.org"], url: "https://oxalpha.com/chat", name: "Oxalpha" },
    { hosts: ["notion.so", "notion.com", "app.notion.so"], url: "https://www.notion.so/ai", name: "Notion AI" },
    { hosts: ["grok.com"], url: "https://grok.com/", name: "Grok" },
    { hosts: ["aistudio.google.com"], url: "https://aistudio.google.com/prompts/new_chat", name: "Google AI Studio" },
    { hosts: ["chat.mistral.ai"], url: "https://chat.mistral.ai/work", name: "Mistral" },
    { hosts: ["workbuddy.ai"], url: "https://www.workbuddy.ai/app", name: "WorkBuddy" },
  ];
  const FALLBACK       = { url: "https://chat.deepseek.com/", name: "DeepSeek" };
  // The AI chat site a page belongs to, or null (any other page, a sign-in page of one still counts as that site).
  function siteFor(address        )              {
    let host = "";
    try { const u = new URL(address); if (u.protocol !== "https:") return null; host = u.hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
    const hit = SITES.find((s) => s.hosts.some((h) => host === h || host.endsWith("." + h)));
    return hit ? { url: hit.url, name: hit.name } : null;
  }
  // The site for Ask PlazCode: a site the person chose (rsAskSite), else the AI chat they last used, else DeepSeek.
  function choose(chosen         , last         )                                                    {
    const ok = (v     )            => !!v && typeof v.url === "string" && /^https:\/\//.test(v.url);
    if (ok(chosen)) return { url: String(chosen.url), name: String(chosen.name || ""), why: "chosen" };
    if (ok(last)) { const known = siteFor(last.url); if (known) return { ...known, why: "current" }; }
    return { ...FALLBACK, why: "fallback" };
  }
  return { SITES, FALLBACK, siteFor, choose };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeAskSite;
