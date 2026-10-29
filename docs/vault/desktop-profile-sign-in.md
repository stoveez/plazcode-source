# Desktop profile sign-in
Updated: 2026-10-29. New owner request; not implemented yet.

## Requested experience
The existing desktop loading screen fades into an actual PlazCode sign-in/profile screen. Users create a username/password profile, select a saved profile and see its theme-colored glow. Only after selection, show a glowing green Log in button and red Remove profile button. The entire screen uses PlazCode's actual theme, glow settings, typography and premium panel styling. Respect reduced motion, keyboard focus and smaller windows. After successful login, fade into the desktop without flashing the unselected theme or guest screen. Match the owner's reference composition without copying its branding/assets. Preview must be a screenshot of the running real app, then deliver full Windows/Mac/Linux test packages.

## Existing account decisions
The vault previously agreed on online username/password accounts, sign in once per computer, settings/skills synced across computers and username attribution on shared skills. No required email or paid keys. Optional recovery email can be added only while signed in; password reset cannot attach a new email. These are prior decisions, not newly completed features.

## Clarification pending
Questions sent: online accounts versus local-only profiles; select saved profile and Log in without retyping versus password every time or automatic login; separate settings/theme/skills/memory per profile with existing data adopted by first profile versus shared data. Do not mark suggested answers as accepted. Remove profile is interpreted as removing this device's saved profile, with confirmation, rather than deleting the online account or underlying data.

## Findings
Desktop has a Guest/account placeholder and reusable theme/glow CSS, plus Nxstartup/NxSplash. The account plan is still deferred, not implemented. Native preferences/memory/skills/vault currently use global stores, so real per-profile isolation requires backend/storage work as well as the screen. Never implement cosmetic-only authentication or store plaintext passwords. Production shared-learning service exists at https://plazcode-learning.still-crow-5311.chatgpt.site, but the current Sites owner listing contains no projects; existing service access must be resolved before attempting edits. No deployment or synthetic account creation has occurred.

## Work and validation
Work directly on claude/plazcode-dev in the 1.24.27 overlay; keep stable 1.24.26 feeds unchanged. Preserve existing account-free tool behavior until the actual account flow and native/session boundary are ready, rather than shipping an unusable sign-in gate. Verify credential handling, login failure, saved selection, theme changes, remove confirmation/data preservation, keyboard/reduced motion, startup transitions and real native startup. Full test builds and actual screenshots remain outstanding.
