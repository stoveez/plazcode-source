---
name: hyperlab-reliability
description: "Review Roblox remote handlers, persistence, cleanup and performance with reproducible compile and Studio checks."
---

# Studio reliability

## Remotes and gameplay

- Describe caller, payload and return path. Resolve price, rewards and authority on the server. Validate exact shape, allowed values, finite range, ownership, distance and current state where relevant.
- Reject malformed or oversized input before expensive queries or yielding. Use a bounded per-player rate limit keyed by known actions. Clean its state on leave.
- A request that yields needs a fresh permission and state check before committing or a transaction that serializes competing requests. Duplicate durable operations need a stable deduplication key.
- Verify one valid request, wrong types, NaN or infinity, another player's object, duplicate requests and a burst. Test cross-client visibility with two clients where available.
- `resources/hyperlab/FixedWindowBudget.luau` is a small server-side quota example. A fixed window permits adjacent bursts at a boundary. Use it where that behavior fits the endpoint and always clear player buckets on leave.

## Saving

- Separate successful absence, valid existing records, malformed records and failed reads. Only successful absence initializes defaults. Keep existing keys and schemas compatible.
- Use a pure, nonyielding UpdateAsync transform for atomic changes. It can run again. Commit a retryable grant with an operation ID and record the ID in the same write.
- Bound retries and saves. Coalesce concurrent requests for the same session. Use one save path for periodic, leave and shutdown handling. Exercise failure and shutdown against a mock or test place.

## Debugging and performance

- Reproduce with an observable expected result. Identify Edit versus Client versus Server, source revision, and actor that owns the state. Log bounded diagnostics at the boundary.
- Trace what registered the handler, what fired it and where the effect is visible. Test respawn, re-entry, repeated initialization and streamed-out dependencies when they affect the feature.
- Measure hotspot time, callbacks or network traffic before changing an update loop. Keep hot paths proportional to visible or active entities. Verify the same workload after the change.
- Compile exact saved sources. HyperLab includes a compile-only Lune runner. Use the project's type and lint configuration where available. Record a runtime result separately from syntax and static checks.

Find the bundled fwjelaa notes by title, including **Testing Your Own Remotes**, **Debugging DataStore Problems**, **Debugging Client-Server Desync**, and **MicroProfiler Guide**.

References: [Roblox client-server security](https://create.roblox.com/docs/scripting/security/client-server-boundary), [Data stores](https://create.roblox.com/docs/cloud-services/data-stores), [Studio testing modes](https://create.roblox.com/docs/studio/testing-modes).
