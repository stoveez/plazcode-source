# PlazCode bar redesign (1.24.33, owner 2026-11-13)

Owner: "I want an entire extension/PlazCode bar redesign as well to match the app redesign and new traits."

## Owner answers (all 8 questions, 2026-11-13)
1. Scope: all of it: the bar, the settings menu, the pop-ups and cards, the toolbar popup + Ask PlazCode + live card.
2. Settings menu: tabs + search, like the app (a few groups, a sliding tab highlight, a search box).
3. Bar buttons: same buttons, grouped. Nothing moves out of reach: status on the left, Enhance / attach / Start-Restart / Fix as one group, Co-Work and Ask PlazCode as pills, Discord / settings / hide as small icon buttons.
4. Motion: follow the app's Feel settings (Motion, Click ripples, Animated theme), synced from the app; sliding highlights, sparks and ripples on clicks; a slow drift only inside the settings menu; nothing moves constantly next to the chat box.
5. Version: 1.24.33 (the release waits until the redesign is done and tested).
6. Look: the app's Studio look (serif titles, small spaced mono labels, glass cards with a gradient rim, theme glow, same palettes).
7. RS / AS: theme colour everywhere; the RS/AS switch (sliding highlight) and a small mode tag show the mode. (The purple in the owner's screenshot came from the Ultra effort level, which keeps its own purple mark.)
8. Check-ins: real screenshots after each part.

## How it is built (findings from the code)
- The bar lives in the AI site's own page (not a shadow root), `#rs-bar` + panels as body children, styled by `overlay.css` (6,100 lines of layers since 1.17) and per-site layout rules (`.rs-prov-*`, `providers/clickup.js`).
- Colours already follow the app: `applySharedAppearance` (core/main.js) sets `data-rs-palette`, `data-rs-glow`, `data-rs-gradients` and `--pc-accent/--pc-light/--pc-bg/--pc-rgb` from `rsAppearance`, which the app sends through `/api/preferences`.
- Approach (same as the app's Studio look): keep every id, the geometry per site and the behaviour; add one new layer at the END of `overlay.css`, scoped to `html[data-rs-studio]`, that restyles. main.js sets `data-rs-studio`. Small markup changes only where the look needs them (icons instead of emoji in button labels, button groups, brand word, mode tag, tab rail in the menu).
- Feel sync: `rsAppearance` gains `motion` (full/reduced/off), `anim`, `ripple` (Rust `Appearance` struct + desktop page send them; the extension sets `data-rs-motion/anim/ripple`). Needs the new app; with an old app the bar uses Full / on / on.
- Translation: button labels keep plain words ("Enhance", "Restart Agent"...), which already have translations; icons are separate SVG elements.

## Steps
1. The bar itself (+ Feel sync). Screenshots.
2. Settings menu: tab rail (General, AI, Safety, Automation, Instructions, Connections) with a sliding highlight + search across all sections. Screenshots.
3. Pop-ups and cards: Run log, Prompt enhancer, Fix connection, Co-work, Helpers, media, approval card, tool cards, continue card, task plan. Screenshots.
4. Toolbar popup, Ask PlazCode panel, live control card / view. Screenshots.
5. Full tests, Firefox package, notes, test build.

## Log
- 2026-11-13: plan written; questions answered.
- 2026-11-13, step 1 (the bar), first pass: Studio layer at the end of overlay.css; `data-rs-studio`, `data-rs-motion/anim/ripple` set by `applySharedAppearance`; serif "Plaz*Code*" name (`.brand-word`, never translated), CSS-only mode tag (RobloxScript / AgentScript), mono effort/approval labels, gradient RS/AS thumb; button groups `.rs-grp-main` (Enhance, attach, Start/Restart, Fix, Stop), `.rs-grp-pills`, `.rs-grp-icons`; line icons via `setBarLabel` (the old emoji become icons, labels keep plain translated words); ripple + spark burst (`rsFeelHooks`). The app sends its Feel with rsAppearance (`Pzfeelshare`/`Pzfeelsync` in desktop.html; Rust `Appearance` gained motion/anim/ripple).
- 2026-11-13, owner on the first pass: "needs to be enhanced/better with the gradients and shape. I don't want rounded corners." Now square everywhere (only the status light stays round), a gradient rim (`border-image`), lit corner brackets (top-left in the light colour, bottom-right in the accent), a diagonal colour sweep across the bar, gradient fills on every button. Ultra keeps its purple rim and purple main button (owner's earlier Ultra choice). Waiting for the owner's go before step 2.
- 2026-11-13, owner: Ask PlazCode "should only show in AgentScript since it's an AgentScript feature". The bar button now shows only in AgentScript mode (`showAskButton`, run by renderBar and setStatus); Alt+P and the toolbar menu still open it from any mode.
- 2026-11-13, step 2 (settings menu): `studioMenu()` runs at the end of `buildMenu()`: each section gets `data-rs-tab` from its English label (MENU_TAB_OF; unknown = General), a sticky `.rs-menu-tools` (search + 6 tabs AI / Safety / Automation / Instructions / Connections / General with `.rs-menu-glide`) goes under a compact header; the tab and the query survive rebuilds (`menuTab`, `menuQuery`); the heart button opens General. Search shows matching sections from every tab and hides non-matching rows. Tests adjusted: test-extension-language clicks the General tab; test-clickup-browser's site-tab check skips PlazCode's own tabs.
- 2026-11-13, owner: "then buttons/switches can be rounded". Panels (bar, menu, sections, cards) stay square with the gradient rim; buttons, pills, the RS/AS switch, menu tabs and on/off switches are rounded (coloured border instead of border-image there).
- 2026-11-13, step 3 (pop-ups and cards): one shared panel look (`--st-panel`: corner brackets + sweep, `--st-rim`) on Fix connection, Helpers, Prompt enhancer, Co-work, activity, memory, Run log, the media card, the effort / approval lists (`.pc-effort-menu`, outside #rs-root), the approval card, the continue question and the task plan; serif titles, round close buttons, square fields, rounded buttons with the gradient on the main one (`button:is(...)` so it outranks the generic rule); tool cards square with their category stripe; the docked approval root no longer draws its own rounded box.
