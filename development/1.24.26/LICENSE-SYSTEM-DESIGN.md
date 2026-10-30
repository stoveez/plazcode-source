# PlazCode login and license system — design (draft for owner sign-off)

> **Owner, 2026-10-25: PlazCode stays free. No paid plan or paid features.** Everything about paid keys and paid features below is cancelled. License keys, key types, HWID lock and the 24-hour key are dropped. Accounts stay: users sign in once with a username and password (no email); accounts carry settings and skills across computers and the username on shared skills; only the owner sees users, on a private owner page; signed-in users can change their password and may add an optional recovery email (Forgot password emails a reset link to it; otherwise the owner resets it from the owner page; the Forgot password screen must never attach a new email). See `docs/vault/decisions.md`.

**Implemented subset (2026-10-30):** desktop username/password profiles, encrypted remembered sessions, per-profile local data and portable settings/private-skills sync are in the verified 1.24.27 test builds (source 9c175eb, full CI 40989215099). Owner approved the actual rectangular-profile/gloss/background design. The account API is Public by explicit authorization; GitHub source must return to Private after delivery (authorized change denied HTTP 403). Latest stable remains 1.24.26. Password-change/recovery flows, owner administration and future shared-skill attribution from the broader plan are not implemented by this profile test build. See [current feature/verification](../../docs/vault/desktop-profile-sign-in.md).

Decisions made: Cloudflare Workers + D1 server; separate release after 1.24.21; login enforced in the desktop app only.

## Roles
- Owner (you): everything below. Created once by a setup secret only you hold.
- Developer: lifetime key; can generate license keys, reset HWIDs, see all users. Cannot remove keys or other devs.
- Admin: reset HWIDs and see every user only. No key generation, no removals.
- User: username + password + a license key.

## Keys
- Format: 20 characters in total including one underscore after the 10th: XXXXXXXXXX_XXXXXXXXX (19 random uppercase letters and digits, no 0/O/1/I, plus the underscore), generated randomly on the server. Stored hashed.
- Types: free license (has a duration you choose; basic features), paid license (has a duration; paid features too), developer (lifetime), admin (lifetime). The owner and developers can generate free and paid keys; only the owner makes developer and admin keys. The "Get a 24-hour key" button on the login screen gives a free key only.
- Paid features: the list is decided by the owner later (the owner will go over which features are paid); the server keeps it as a setting so it can change without an app update. The server stores each account's tier; the app turns the paid features on only for paid, developer, admin and owner accounts, and a free account that tries one sees a plain "this needs a paid key" message. Redeeming a paid key on a free account upgrades it; when the paid time ends the account falls back to free (if it still has free time) or to the key prompt.
- Redeeming: logged-in user enters a key; the time starts when redeemed and adds to any time left.

## HWID lock
- The app computes a stable hardware fingerprint (hashed on the PC; the raw serials never leave it).
- First login binds the account to it. A different PC is refused until the HWID is reset (owner, developer or admin, by username or from the user's row).

## Login screen (desktop app)
- Username, password, Log in, Redeem key. Below it: "Get a 24-hour key" (one per account/HWID, rate limited). Expired keys show the same screen with a short message.
- The app keeps a short-lived server-signed token; tools do not run without it. It re-checks while running, so Remove / Remove all take effect within minutes.

## Owner / Developer / Admin page (inside the app)
- Users catalogue with search: username, online now (heartbeat), key pattern (first/last letters only), time left, title (Developer / Admin badge).
- Owner: Generate key (choose duration), Generate developer / admin key, Remove key (per user), Remove all, Add time to every user (users without a key get one with that time), Remove developer title, filter "developers only", HWID reset button per user plus a general reset by username.
- Developer: generate license keys, HWID reset, see users. Admin: see users, HWID reset only. The server enforces every permission; the screen only hides buttons.

## Privacy and security
- Passwords stored with a slow salted hash (Argon2/scrypt), never in plain text. HTTPS only.
- The server stores username, key, HWID hash, last-seen time. Notices and release notes must say so (today they say there is no telemetry service); lawyer review recommended.
- The extension stays plain JavaScript and can't be the lock; the app is.
- Existing users: after the update they see the login screen. Whether current users get an automatic key is your choice (the owner "Add time to everyone" does exactly that).

## Build order
1. Server (Worker + D1 schema, endpoints, tests) 2. App login screen + token + HWID 3. Owner/dev/admin page 4. Notices/release notes 5. Validation build on Windows and Mac.
You create the Cloudflare account and deploy; I never see its secrets.
