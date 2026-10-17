# Shared learning service

Production: https://plazcode-learning.still-crow-5311.chatgpt.site

Vinext/Cloudflare Workers with managed D1. Source is mirrored here for review; the Site source repository owns deployment. Migrations are applied by hosting before deployment. `LEARNING_ADMIN_TOKEN` is a server-only Sites secret; never embed it in desktop builds. Maintainers can rotate it in Sites and redeploy.

`POST /api/v1/challenge` issues a 120-second one-use proof-of-work ticket. `POST /api/v1/report` accepts exactly schema, recipe, outcome, ticket and nonce. Unknown fields are rejected. `GET /api/v1/lessons` returns only three known IDs and bounded aggregate counters, revisions and retractions; clients expand IDs to built-in methods. `POST /api/v1/retract` requires the admin bearer secret.

Anonymous reporting is deliberately restricted: no arbitrary solutions, user content, identities or task hashes. Clients send at most one report per recipe per day; server daily capacity is 10,000 challenges, with expired tickets deleted. This limits spam but does not prove independent users or task correctness. Replayed tickets cannot increment counts. Retractions persist through later reports.

Run `node --experimental-strip-types test-protocol.mjs` and `python test-sql.py`. The live service was checked for rejecting private-field uploads and unauthorized admin access; no synthetic successful reports were added to the production dataset.
