# Automatic shared solution learning — next update requirement

Shared solution learning is a core PlazCode feature, not an opt-in add-on. This requirement supersedes the optional community-learning design in 1.23.0. It is a product requirement, not a claim that the published binary already implements it.

## Required behavior

- Fetch and apply verified global lessons automatically, including for installations whose older settings have shared learning disabled.
- Before solving a task, retrieve relevant successful methods and corrections, inspect the current project, and adapt the method to its structure and constraints.
- After a task succeeds and its relevant checks pass, automatically derive a reusable candidate from observable actions and outcomes. A task marked complete without successful checks is insufficient.
- Automatically contribute only candidates that pass local privacy checks and server validation. Require no shared-learning toggle, per-contribution user interaction or repository-write token for ordinary users.
- Exclude raw conversations, hidden reasoning, project source/assets, credentials, personal information, user/project identifiers, private paths, URLs containing private identifiers, and user content embedded in errors or tool arguments.
- Use a bounded structured schema and fail-closed filtering before transmission. Arbitrary tool-step strings, raw logs, free-form model summaries or hashes of private text are not safe automatic-upload payloads.
- Keep any candidate that cannot be safely abstracted local. Mandatory shared learning does not authorize uploading private material.
- Deduplicate, version and validate candidates; reject poisoned instructions, unverified fixes and attempts to override project/user requirements. Automatically validated lessons can enter the global index; candidates outside automatic verification coverage require maintainer review before global reuse.
- Sync accepted lessons promptly with bounded requests and cached offline operation. Shared-service failure must not block or damage a project.
- Show clear in-app information about the limited data contributed and the shared methods used.
- Preserve existing working provider, tool, Studio, modeller, UI maker and Blender behavior.

## Infrastructure required

The current GitHub proposal path requires PLAZCODE_GITHUB_TOKEN with write access to the repository. It does not implement a general user collection service. Do not embed a maintainer token in the app or give every installation repository write access.

Implement a collection service with constrained public submission schemas, rate limits, abuse controls, replay/deduplication handling, server-side validation, and deletion/retraction of unsafe or incorrect lessons. The service holds publishing credentials; clients do not. A GitHub-backed approved index can remain the distribution mechanism. A real deployment and a published endpoint are required before claiming automatic cross-user contribution works.

## What improves and how to measure it

This improves PlazCode's orchestration, retrieval and project-adapted solution reuse. It does not update the weights of ChatGPT, Claude, DeepSeek or other provider models. Actual model-weight training would require a separate model training program and deployment.

Measure first-attempt correctness, successful completion rate, tool errors/retries, regression rate, latency and cost on held-out tasks. Compare identical provider/model versions with and without the shared index. Keep benchmark answers and evaluation tasks out of the learned index used for that evaluation. Report evidence, not a promised benchmark-score increase or guaranteed instant solution.

## Delivery gates

- New and upgraded installations retrieve global methods without opt-in.
- Newly verified public-safe methods can contribute without users providing GitHub write credentials.
- Tests prove private strings and unapproved payload fields never leave the device.
- Tests cover invalid lessons, poisoning, retries, duplicate submissions, service outages, retractions and project adaptation.
- End-to-end testing verifies one installation's safe validated lesson becomes usable on another installation.
- Existing regressions pass and future release descriptions retain the existing format with fewer than 2,000 characters.


## First automatic implementation (1.24.0)

The desktop now automatically retrieves and reports three predefined local edit/test workflows. It submits only canonical recipe IDs and a pass/fail enum after actual process results. Completion alone, unsupported tools/commands, failed mutations, uncertain checkpoint verification, missing reads and missing post-edit tests do not qualify. Offline reports queue locally; global sharing cannot be disabled through preferences.

The public service validates a closed schema, uses expiring one-use proof-of-work tickets, atomically deduplicates reports, bounds daily capacity, versions aggregate methods and supports server-authorized retractions. Service source and tests are in learning-service. Runtime administration credentials are server-only and absent from clients. Returned IDs expand to built-in methods; no external instructions are accepted.

This is a deliberately bounded first implementation: it shares workflow evidence, not arbitrary problem-specific answers or provider model weights. Anonymous reports do not prove independent users or correctness. Roblox/Blender and unsupported local tasks remain local. No benchmark improvement is claimed, and no benchmark answers are collected. Extending solution coverage requires adding reviewed typed schemas and authoritative checks, rather than uploading redacted free text.
