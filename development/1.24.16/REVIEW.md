# PlazCode 1.24.16 release review — ClickUp startup

## Report and scope
ClickUp startup can stop with “send was not confirmed” despite a visible acknowledgement of part 2/9. Some users receive nine context parts while another installation receives three. ClickUp-hosted Claude can explicitly refuse the connection request. The affected accounts and exact saved settings were not available here.

## Changes
- Preserve a single send per message. For known startup feedback only, a persisted new user row followed by its exact new assistant acknowledgement can confirm delivery when rich-text rendering changes the user row. Observe a slow acknowledgement using the existing bounded response timeout. Never infer delivery from arbitrary text, an old acknowledgement, optimistic row, another conversation or a native failed label; never automatically resend an uncertain message.
- Receipt observation stops on Stop or a known conversation change. Initial blank-chat route assignment remains supported.
- Use the existing compact prompt path and bounded saved-note previews for ClickUp. Full notes remain available through plazcode_memory. Custom instructions are preserved exactly and still split if large; a fixed part count is not promised. Selected Ultra instructions remain present. Other provider prompt profiles are unchanged.
- Frame the initial ClickUp request as the user's extension connection request, without a purported system-message override. Recognize the explicit refusal wording from both screenshots before the generic protocol correction. Initial and context-stage refusals stop startup and unlock the composer. Acceptance by a model is not guaranteed or forced; the message suggests another available model in a fresh chat.

## Evidence
- A real Chromium fixture using unmodified published 1.24.15 code reproduces the exact “ClickUp send was not confirmed” error after a context row is reformatted despite its acknowledgement. The old code also sends two handshake requests after “I don't run handshakes for anything outside ClickUp.”
- New real-browser fixtures cover accepted nine-part startup; single-part and delayed acknowledgements; wrong-part and old acknowledgements; optimistic and failed rows; Stop and chat change; initial/context-stage model refusals; complete core startup with large exact Unicode custom preferences.
- Chromium fixtures pass for the new cases and the existing Brain/agent/Ultra startup, real production watcher/parser/feedback loop with mocked Studio/Blender/files, images, toolbar alignment, masking, rejection and ambiguous-delivery cases.
- In the production prompt/memory fixture, compact selected-Ultra context is 18,022 characters versus 58,261 with the old unbounded profile. This is a fixture measurement, not a prediction of affected users' note/catalog sizes.
- Protected source tests pass: 1,028 original provider function bodies preserve healthy behavior; 1,989 published source files are unchanged byte-for-byte outside the declared overlays and synchronized copies.
- Windows CRLF preparation, exact custom-instruction preservation, all 217 original starter resources/licenses, and platform package byte/mode preservation pass locally.

Validation: all exact-source platform CI jobs and the packaged macOS desktop check passed. See release-validation-1.24.16.

## Limits
All account/browser fixtures use sanitized local DOM and a mocked bridge. No live affected ClickUp account, arbitrary custom agent, or affected person's Studio/Blender installation is claimed tested. Model acceptance depends on the selected ClickUp model and workspace rules. Windows artifacts are unsigned; macOS uses ad-hoc signing and is not notarized. The user explicitly waived private build delivery and authorized direct publication. No affected-account live test result is implied.

## Build
Run `python3 development/1.24.16/prepare.py` from the repository root. It verifies the published 1.24.15 complete-source checksum, applies the persistent overlay, and synchronizes extension copies into `build-src-1.24.16/PlazCode`. Earlier prepared source is preserved. CI rebuilds native executables and creates native, Firefox and complete-source development ZIPs. Stable feeds and published releases remain unchanged.
