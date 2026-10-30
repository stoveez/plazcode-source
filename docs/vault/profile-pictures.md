# Profile pictures
Updated: 2026-10-30. Implemented and verified locally; public service deployed, replacement full CI 41085855952 running on 38fd7d2.

Account change/remove controls support JPEG/PNG resizing and original animated GIF upload. Pictures render on account, sidebar and saved-profile cards; bounded private image files are loaded on demand through authenticated reads. Status polls and the remembered-sign-in registry carry revisions only. Settings sync carries the picture; older clients preserve it server-side and explicit null removes it. Actual compiled upload/preview, two-install integration, all 15 translations and public service deployment are complete. Replacement full packages are being built; older Drive ZIPs do not include pictures.

Pictures belong to the account. JPEG/PNG are resized to at most 512 pixels in the desktop; GIF bytes remain animated and must be at most 1 MB. Native/cloud validation permits only bounded JPEG/PNG/GIF data with matching magic bytes; SVG/external URLs are rejected. Pictures are user data, excluded from program integrity checks. Profile switching and write epochs isolate changes. Saved-profile reads require the device bearer and a saved account ID. Cloud storage is private to the account.

## Actual feature preview, delivered immediately
Actual compiled native app + real local Worker/SQL accounts, actual file input upload; no recreated UI or JS errors. Account/sidebar/saved picker show the chosen picture.
- [Drive Account screenshot](https://drive.google.com/file/d/1ee8T7B8Ueg7jJYKoYieh0ykrPIIfWaKh/view?usp=drivesdk)
- [Drive actual upload/saved-profile recording](https://drive.google.com/file/d/1y12-wIsPf63DjPZDcBb3XI4KS5D-JFJ7/view?usp=drivesdk)
- Repo copies: `previews/desktop-profile-picture-account.png`, `previews/desktop-profile-picture-picker.png`, `previews/desktop-profile-picture.mp4`.

Two native picture tests, five Worker/SQL tests and real native two-install sync/isolation checks pass. UI/design/desktop regressions pass. Eleven new labels translated into all 15 catalogs; strict reproducibility checks pass. Bold Account sync status is included in the refreshed compiled preview. The matching public account API update is deployed.

## Public service and final checks
Public service source 1326d5e092d046e9383a6f01dd38ba938cc8ff41 deployed successfully as appgdep_6ae4b3127f048191806e270b5fc43de6 (saved version 2). Existing Public audience preserved. Live authenticated picture save/read, old-client retention, explicit removal, SVG rejection, unauthorized rejection and session revoke passed. No new schema required. Images are returned by the native bridge with Cache-Control: no-store.

Final native suite: 234 + 4 library tests pass (2 ignored). Actual native+Worker two-install picture/sync/no-store tests pass. Actual compiled UI tests PNG/JPEG/two-frame animated GIF (exact bytes retained), removal, SVG rejection and restore pass. Actual 15-language desktop, strict catalogs, profile/storage/design/approval checks pass. Up to date is bold; the same Drive screenshot/video links above now show it. Source is verified Public and full replacement CI 41085855952 is running on 38fd7d2. Older Drive ZIPs do not include this feature.
