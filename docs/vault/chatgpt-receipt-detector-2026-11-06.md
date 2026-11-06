---
title: Native ChatGPT receipt detector follow-up
updated: 2026-11-06
---
# Native ChatGPT receipt detector follow-up

Status: **Markdown source candidate implemented / focused9PASS / full checks next / field diagnosis open**. The owner retested delivered CI42157003472/runtime3d1135f and still sees Send paused after a valid list_commands response. Actual loaded beacon/latest content-free send.unconfirmed metrics requested, pending. No connected live browser/document sessions. No fixture is a live preview.

## Direct native source finding

Public ChatGPT client assets named by the owner's original console loaded anonymously (38 assets, HTTP200); retained outside Git. Asset879981.e2e5aa2c5c.js uses a user text component with original text prop, wraps .text-size-chat.whitespace-pre-wrap, and renders Markdown with user-message styling. Visible DOM therefore loses formatting syntax. Only data-markdown-copy metadata was found, not a complete original-source DOM attribute. This explains a concrete compatibility defect in the previous exact DOM-only check, without establishing the owner's precise failure yet. No native proprietary source was copied into the product or tests.

A new independent real React19.3.1 fixture renders formatted text inside a native user bubble. Runtime40c1d54 rejects a complete submitted source after one click, and its user reader loses formatting across committed updates. Two red cases recorded outside Git. Earlier56browser fixtures/full262JS passed but missed native user Markdown. Full CI42235579551 was therefore CANCELLED and must not be delivered; nothing from it was uploaded.

## Current adapter

Extend existing MAIN-world chatgpt-cm.js rather than inject another script. Request only one native user bubble. Select its single top-level .whitespace-pre-wrap surface, read committed React host props/fiber chain strictly inside that bubble, verify the current committed root, and require one unambiguous source string. Reject stale alternate data, missing/detached roots, conflicting source props, multiple text parts, assistant/composer/own UI. Never inspect pendingProps, broad stores, clipboard or request bodies; never mutate native framework state. The isolated provider dispatches a synchronous cancelable DOM event and accepts the source attribute only after fresh acknowledgement, preventing stale attribute reuse if the bridge disappears. Source attributes change only with content/status, not on every poll.

Keep complete normalized source equality, new native identity, one Send click, no automatic resend, bounded native preview expansion, own-mask-only visibility and Stop/chat/session ownership. Successful exact source receipt still feeds the scoped startup context proof; parsed list_commands/fresh native health/unchanged catalog remain required. Failure metrics add source availability without message text or IDs. Provider and MAIN bridge beacon:2026-11-06_committed-user-markdown.

Nine new native Markdown cases use real React commits/alternates, exact full original source, stale/multiple parts, real Chrome isolated world, complete startup, genuinely partial committed body (reject with one click), and composer/assistant/detached exclusions. These are independent equivalents of observed markup, not copied native code. React/ReactDOM are pinned test-only dependencies; release archive inventory must remain unchanged.

## Earlier retained changes

Native receipt collection is independent of visual allItems. Historical hidden nodes and real keys are captured before send; generic layout test IDs do not establish identity. Read through only own masks; reuse exclusive own-card roots; reject native-hidden/own UI/history. Preview search stays within four single-user ancestors, excluding page/other-user/assistant controls. Full normalized equality remains mandatory. Successful proof is scoped to exact text/chat/session/Stop/generation and invalidated on every attempt. Shared ownership scans remain linear across500bubble history.

Real ProseMirror with deferred native form state separately reproduced an actual partial submission (7449editor versus6946submitted chars). Wait two render frames plus a task, recheck the complete draft and enabled Send control, click once. Render deadline1000ms/Stop reject before clicking; newer drafts survive. These producer safeguards are retained.

## Verification and delivery

Current focused9PASS, healthy70/preservation956/DOM325/pins34/input-cleanup19/image transportPASS. Full checks next. Before this edit runtime40c1d54 had browser56PASS, full262JS PASS/0fail/3existing skips, healthy70/preservation956/DOM325/pins34/input-cleanup19/image transportPASS. Do not apply those counts to untested source changes. Next run focused/full browser/fullJS and then full Windows/universal Mac CI, validate exact signed inner packages/published inventory and Drive metadata. New delivery remains null. No stable release authorized. Matching extension reload+AI tab refresh applies the extension fix; prior native append needs its earlier app. PC vault not connected. Source Public at last check; owner must restore Private after delivery at settings→Danger Zone→Change visibility.

Native long previews have a truncated nearest text prop and a full committed parent text prop. A third red test reproduced this shape. Accept only outward prefix extensions inside the same user boundary; conflicting sources reject. Superseded local full runs stopped intentionally before source regeneration; final source full gates must rerun.

Fresh full CI42241715359 ACTIVE on exact source325561d3577f4ecaa7767fcb16ea53eb90295df5. New stage contains scripts only, no old artifacts. Source Public; approved branch build/deliver/Private plan resent before dispatch.
