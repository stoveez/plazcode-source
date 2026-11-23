# PlazCode Workshop Service

Cloudflare Worker + D1 registry backend for the PlazCode Skill & Specialist Workshop.

## Features
- Public read catalog (`GET /api/v1/skills`, `GET /api/v1/skills/:id`, `GET /api/v1/health`) serving only `approved` items.
- Submission pipeline (`POST /api/v1/skills`) with strict JSON bounds, path traversal validation, and safety/injection/secret/fetch-and-run scanning. Community submissions default to `pending` until owner-approved.
- Community feedback: 1-5 star ratings (`POST /api/v1/skills/:id/rate`, one rating per user per skill), install tracking (`POST /api/v1/skills/:id/install`), and abuse reporting (`POST /api/v1/skills/:id/report`, automatically hides after 3 distinct reports).
- Owner moderation (`GET /api/v1/owner/queue`, `POST /api/v1/owner/approve`, `/reject`, `/remove`, `/ban`) gated by the server-only `WORKSHOP_OWNER_TOKEN` secret.

## Deployment with Wrangler
1. Create a D1 database:
   ```bash
   npx wrangler d1 create plazcode-workshop
   ```
   Copy the returned `database_id` into `wrangler.toml`.
2. Initialize the D1 schema:
   ```bash
   npm run db:init:remote
   ```
3. Configure secrets (never commit or ship `WORKSHOP_OWNER_TOKEN` in client apps):
   ```bash
   npx wrangler secret put WORKSHOP_OWNER_TOKEN
   # Optional: verify PlazCode account tokens against your account-service
   npx wrangler secret put ACCOUNT_SESSION_URL
   ```
4. Deploy the Worker:
   ```bash
   npm run deploy
   ```
5. Paste the deployed `https://...workers.dev` URL into PlazCode's `workshopRegistryUrl` setting (on the Workshop page or Settings).

## Local Testing
Run the offline Worker + D1 mock suite:
```bash
node test-workshop-worker.mjs
```
