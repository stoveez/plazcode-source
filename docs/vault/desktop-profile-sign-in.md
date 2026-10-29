# Desktop profile sign-in
Updated: 2026-10-29. WIP frontend implemented; backend integration in progress; owner choices confirmed.

## Requested experience
The existing desktop loading screen fades into an actual PlazCode sign-in/profile screen. Users create a username/password profile, select a saved profile and see its theme-colored glow. Only after selection, show a glowing green Log in button and red Remove profile button. The entire screen uses PlazCode's actual theme, glow settings, typography and premium panel styling. Respect reduced motion, keyboard focus and smaller windows. After successful login, fade into the desktop without flashing the unselected theme or guest screen. Match the owner's reference composition without copying its branding/assets. Preview must be a screenshot of the running real app, then deliver full Windows/Mac/Linux test packages.

## Existing account decisions
The vault previously agreed on online username/password accounts, sign in once per computer, settings/skills synced across computers and username attribution on shared skills. No required email or paid keys. Optional recovery email can be added only while signed in; password reset cannot attach a new email. These are prior decisions, not newly completed features.

## Confirmed owner choices
Owner confirmed all recommended choices: online accounts with sync; choose a saved profile and Log in without retyping after the first sign-in; separate settings/theme/skills/memory per profile and retain existing data for the first profile. Remove profile is interpreted as removing this device's saved profile, with confirmation, rather than deleting the online account or underlying data.

## Findings
Desktop has a Guest/account placeholder and reusable theme/glow CSS, plus Nxstartup/NxSplash. The account plan is still deferred, not implemented. Native preferences/memory/skills/vault currently use global stores, so real per-profile isolation requires backend/storage work as well as the screen. Never implement cosmetic-only authentication or store plaintext passwords. Production shared-learning service exists at https://plazcode-learning.still-crow-5311.chatgpt.site, but the current Sites owner listing contains no projects; existing service access must be resolved before attempting edits. No deployment or synthetic account creation has occurred.

## Work and validation
Work directly on claude/plazcode-dev in the 1.24.27 overlay; keep stable 1.24.26 feeds unchanged. Preserve existing account-free tool behavior until the actual account flow and native/session boundary are ready, rather than shipping an unusable sign-in gate. Verify credential handling, login failure, saved selection, theme changes, remove confirmation/data preservation, keyboard/reduced motion, startup transitions and real native startup. Full test builds and actual screenshots remain outstanding.

## Frontend progress
The actual desktop HTML contains the themed responsive screen and controller, but it is not mounted yet. Account operations are explicit backend adapters; no fake authentication or credentials storage is shipped. Browser interaction tests use the actual extracted controller/markup/CSS with test adapters solely for unit QA, never as a user preview. Passed selection/theme callback, conditional buttons, untrusted-name text safety, confirmation before remove, remembered-profile username forwarding, failed-login password clearing, creation, empty/narrow/reduced-motion behavior and existing protected desktop regression. Quit remains usable while an account request is busy. Real native integration/screenshot and full test packages remain outstanding pending the account/storage choices.

## Account service / storage foundation
Private service https://plazcode-accounts-stoveez.mistysong24.chatgpt.site, project appgprj_6ae3b330d8b481919934a74c73dc7874, source 0176721. Four local tests plus actual hosted private signup/scrypt/session/private-sync/revoke checks passed. Per-service access credential is kept only in session memory, never in builds. New per-profile paths and cached-store wrappers are WIP; uploads/background indexers and Engram runtimes must retain their initiating profile. Signed native integration, encrypted remembered-token registry, migration, API epoch guards and extension partitioning remain. A public service audience change is not yet authorized; complete a reviewable integration before asking. Broader recovery/admin features remain separate from this request.
