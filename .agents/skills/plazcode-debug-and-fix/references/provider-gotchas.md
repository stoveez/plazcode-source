# PlazCode AI-Site Provider Gotchas

Summary of confirmed live-site quirks and failure modes across `development/<ver>/ts/providers/*.ts` and `core/`:

## ChatGPT (`providers/chatgpt.ts`, `chatgpt-cm.js`)
- **Blank / New chat vs old chat turns**: After clicking New chat, ChatGPT can leave hidden DOM turns from the previous chat (`test-chatgpt-hidden-old-chat.js`). Ignore hidden turns when checking whether a chat has started.
- **Strict send & startup receipts**: Generic test IDs are not unique. Require a real newly sent user turn matching the sent text before marking delivery confirmed; expand long-message previews once before verifying full content (`test-chatgpt-startup-memory-combined.js`).
- **Multiline burst & freeze**: Rapid multiline native edits can freeze the page or cause false delivery while Send is disabled. Preserve newer drafts and click Send at most once.
- **Compact completion & Codex**: Some layouts omit the outer `<article>` wrapper (`test-chatgpt-compact-completion.js`), and Codex composer uses fallback editor selectors (`test-codex-composer.js`).

## Claude (`providers/claude.ts`)
- **Busy composer & read-only delay**: Claude's composer stays read-only ~3s after a reply finishes and swaps the editor DOM node when streaming ends. Wait out the streaming reply, recognize localized Stop button labels, re-query the active composer after waiting, and retype if the editor drops text (`test-claude-send-busy.js`).
- **Empty turn / icon glyphs**: Ignore icon-font glyphs and action button text inside code frames when deciding whether a block contains only a command (`test-claude-empty-turn.js`).
- **12,000-char free-plan input limit**: Extras attached by `core/main.js` must fit `inputBudget`/`fitExtra` (`test-input-budget-usage.js`).

## Gemini (`providers/gemini.ts`)
- **Centered paragraph alignment**: `<message-content>` spans the whole turn width, while Gemini centers each paragraph via left margins. Anchor command cards to the first visible text block (`replyColumn` in `gemini.ts`, `test-gemini-chip-anchor.js`).
- **Typing lag**: Mutations while typing in the composer must not trigger whole-chat transcript sweeps (`ignoreMutationRecords`), and reply text extraction should cache `textWithout` (`test-gemini-typing.js`).
- **False "[SYSTEM_STATE] not present" replies**: User messages never carry `[SYSTEM_STATE]`. Startup text must clarify that only an explicit `RESULT` with `BRIDGE DOWN` / `OFFLINE` means offline (`test-state-line-wording.js`).
- **Open bug note (`2026-11-16`)**: Switching sidebar chats to an old Gemini chat while an agent is active can trigger `autoResume` on the old chat's last command because `bootBaselineId` only captures session start, not chat switch.

## DeepSeek (`providers/deepseek.ts`)
- **Shared queue & cooldown**: DeepSeek sends (including Creator/library calls) share one queue and a completion-based 8–9.8s cooldown (`agent/src/provider_pacing.rs`, `test-deepseek-pacing.js`). Never relax pacing.
- **Edge sleeping / frozen tabs**: Edge freezing background tabs stalls `setTimeout` and makes `waitForResponse` think the reply timed out quietly. `PlazCodeStallGuard.frozenGap` (`ts/core/stall-guard.ts`) shifts deadlines past frozen gaps.
- **Provisional URL before user row**: A fresh chat updates its URL before the user row renders. Allow one provisional route transition per committed send without treating it as navigation cancel (`test-deepseek-request-lifecycle.js`).
- **DSML tool markup**: `findToolBlockSpot` (`hasStart`/`hasEnd`) hides DeepSeek's native DSML blocks and orphan trailers cleanly (`test-dsml-tool-calls.js`, `test-dsml-orphan-recovery.js`).

## Kimi (`providers/kimi.ts`)
- **"Thinking complete" & code headers**: Strip Kimi's thinking headers and code-block header bars when extracting reply text so fenced JSON blocks parse cleanly (`test-kimi-reply-text.js`).
- **Temporary `/chat/p...` URL on first send**: Right after first send, Kimi assigns a provisional `/chat/p...` address before settling; allow one address swap during send (`test-kimi-chat-address.js`).

## Freebuff (`providers/freebuff.ts`)
- **Stuck "Freebuff is writing"**: Outline "Jump to prompt" buttons repeat the prompt text (which can mention `command_stop`) and look like Stop buttons. Exclude Copy code and side-panel tabs from Send/Stop matching (`test-freebuff-provider.js`).
- **Bar wrapper in Chat vs Code mode**: Attach the PlazCode bar to the visible chat box, not an invisible full-width wrapper or the feedback box under a reply (`test-freebuff-composer.js`).

## Notion (`providers/notion.ts`)
- **Leaf / rich text composer & clipboard**: Notion reformats drafts and shows pasted files as chips (`test-1.22.1-notion-leaf-composer.js`); Firefox creates a separate empty clipboard transfer (`pasteRichText`).
- **Split replies**: A command block followed by spoken text counts as one assistant turn (`test-notion-split-reply.js`).
- **Parser name**: Use `RSParse` (not legacy `ZSParse`) in watchdog checks.

## ClickUp (`providers/clickup.ts`)
- **Address rewrite on Ask Brain**: ClickUp changes the URL as soon as a new chat receives its first message; treat the provisional-to-thread transition as the same chat (`test-clickup-provider.js`).

## OxAlpha, Vani, Arena, MiMo (`providers/oxalpha.ts`, `vani.ts`, `arena.ts`, `mimo.ts`)
- **OxAlpha**: Reply Copy buttons inside `<form>` wrappers must never trigger default-submit send hooks (`test-oxalpha-copy-controls.js`).
- **Vani**: Page-root rewrites detach observers; always exclude `#rs-root` from submit/click hooks (`test-vani-provider.js`).
- **Arena**: Suppress opening the model picker automatically while working; handle dual-panel call shapes (`test-arena-reliability.js`).
- **MiMo**: Requires plain first-person startup text (`test-mimo-startup.js`) so MiMo does not refuse startup as prompt injection.
