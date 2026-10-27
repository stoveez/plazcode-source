# PlazCode 1.24.17 — ClickUp result transport and Blender catalogs

## Report and reproduction
Affected users are on 1.24.16 and Blender shows connected. ClickUp reports an internal loop error because a tool-feedback message exceeds its conservative 18,000-character send bound. The AI also reports trouble requesting Blender's command list. Exact live UI-command examples were not supplied.

The published code allows 32,000-character result pages before appended state/debug/reference text, exceeding ClickUp's 18,000-character guard. Its shared parser also discards a top-level `server` on a `list_commands` request, so that read defaults to the current engine instead of Blender.

The new real Chromium production-core fixture fails on unchanged published 1.24.16 with the exact screenshot error. The parser regression also fails there: `server:"blender"` normalizes to empty arguments.

## Changes
- ClickUp opts into 10,000-character tool-result pages and a 15,000-character final-feedback budget. First pages and subsequent `plazcode_result_read` pages honor the provider page budget even with user limits disabled or an excessive requested read limit. The full output is retained exactly; retrieving it does not rerun the original operation.
- Recheck the final tool-feedback message after status/debug/reference additions, before Co-Work appends its exact requests. Oversized combined feedback is retained and paged, never silently cut. Other providers and user-entered messages keep their existing behavior. Co-Work receipt/queue semantics and uncertain-send protection are unchanged.
- Repair an unambiguous top-level `server` only for read-only `list_commands`/`list_tools` requests. Existing nested selectors work; conflicting/invalid top-level selectors are rejected. No server is inferred for project-editing commands and no engine is switched.
- Recognize the exact owned retained-result header as injected feedback so runtime result pages keep persistent masking when ClickUp resets row classes.
- Earlier startup, model-refusal, memory, Ultra, Studio connection, Skills, donation and updater behavior is preserved. Native code is unchanged; component versions are bumped and executables rebuilt.

## Validation
Local result/parser unit regressions pass: exact Unicode reconstruction through every page, complete appended context, explicit large read limits, disabled settings, chat/engine isolation, conflicting selectors and unchanged other-provider behavior.

Real Chromium production-core fixture passes: one large Blender operation, complete paged Blender catalog requested with top-level server, complete Roblox GUI catalog (including ui_create_screen/ui_create_component), then a Studio UI-inspection command. Every outgoing message stays under the ClickUp guard; owned pages remain masked after host class resets. Project operations execute once; pages only read retained output. Bridge responses are mocked, not live Blender/Studio.

Windows CRLF preparation, all 217 original starter resources/licenses and platform-only package byte/mode preservation pass. Local native tests: 147 passed, two existing exclusions, zero failures. The local full JavaScript suite passed 161 files; one isolated send-block harness initially lacked the newly used production helper. Loading that real helper corrected the harness without changing its assertions, and its focused rerun passes (162 checks overall). Exact-source CI remains required before release.

Validation: all exact-source platform CI jobs and the packaged macOS desktop check passed. See release-validation-1.24.17.

## Publication and limits
The user's latest preference is direct publication after validation, with no private-build review step. The publisher must still use exact-source Windows/macOS/Linux/browser artifacts, run the packaged Mac desktop lifetime/relaunch gate, verify final provenance, and upload assets before promoting feeds. No live affected ClickUp account, custom agent, real Blender model change or actual Studio GUI creation is claimed from fixtures. Windows remains unsigned and macOS is ad-hoc signed, not notarized.

Run `python3 development/1.24.17/prepare.py`; it verifies published 1.24.16 source and applies the persistent overlay into the isolated `build-src-1.24.17/PlazCode` directory. Existing prepared directories and stable feeds remain unchanged until the authorized publisher succeeds.
