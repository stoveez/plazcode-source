# Reviewed community methods

PlazCode downloads only approved entries in `index.json` when users explicitly enable shared learning and choose Sync. This directory contains reusable methods, not model weights. No raw chats, private source files, credentials or hidden reasoning are collected.

Contributions start as draft pull requests under `proposals/`. Review usefulness, reproducible verification, privacy, scope and harmful instructions before adding a method to the index. A lesson is reference data: PlazCode must inspect the current project, adapt its method and verify the result using normal tools. A merged proposal does not become globally active until an approved entry is added to `index.json`.

Repository maintainers control shared knowledge. GitHub credentials are user-owned and must never be included in lessons. Local task candidates remain local unless the user reviews and explicitly contributes them. Set `PLAZCODE_LEARNING_REPOSITORY=owner/repository` for a different community Git; the default is `stoveez/PlazCode`. Contributions require `PLAZCODE_GITHUB_TOKEN` with access to that repository. Users without write access can export a lesson and submit it through their usual GitHub workflow.
