---
title: New version checklist
updated: 2026-10-28
---
# When the version number changes (1.24.26, 1.24.27, ...)

Many notes, rules and scripts name the current version, published **1.24.25**, working development **1.24.26**. When the owner moves to a new number, update all of them in one commit, so no AI follows a stale path. Do not touch old `development/<old version>` folders; they stay as history.

## Steps
1. Copy the latest finished development tree (currently working in `development/1.24.26`, based on released 1.24.25) to `development/<new>`; rename the workflows `publish-<new>.yml` and `validate-<new>.yml`; change the version inside the scripts (details: [releasing](releasing.md)).
2. Find every mention in notes and rules: `git grep -n "1\.24\.25" -- . ':!development' ':!build-src*'`. Change the live ones (current version, release branch name, test-zip names, build folder `build-src-<new>`). Leave historical lines (milestones, decisions) as they were.
3. Files that always carry it: `CLAUDE.md`, `AGENTS.md`, `docs/HANDOFF.md`, `docs/MAINTAINER-GUIDE.md`, `docs/TASK-BOARD.md`, and these vault notes: Home, app-and-guides, build-and-tests, open-work, owner-rules, project-overview, releasing, test-builds, vault-memory.
4. Rewrite [`../NOW.md`](../NOW.md) and say plainly what moved to the new version and what is still open.
5. Re-pin the protected files' hashes in the new overlay's `test-desktop-regression.js` ([build-and-tests](build-and-tests.md)).
6. Copy the changed notes into the owner's PC vault folder and refresh `.pc-sync.json`.
7. The feature guide is version independent, but `guides/build_guides.py` takes the newest overlay's `core/feature-guide.js`: copy it into the new overlay unchanged (the test `test-feature-guide.js` goes with it).
8. Never change the updater addresses (`latest.json`, release download URLs) while doing this.
9. Also: the copied `ultralab/ultracode.template.js` names its folder, so run `development/<new>/ultralab/build_ultralab.py` once after the copy (test-ultralab-generated fails otherwise); in the overlay change only the real version spots (manifest version and title, SOURCE.txt line 1, agent/Cargo.toml and the plazcode-agent entry in Cargo.lock, the version checks in test-desktop-regression.js and test-clickup-provider.js); reset VALIDATED_SHA/VALIDATION_RUN in the new publish workflow; add `build-src-*/` stays ignored. Done this way for 1.24.24 on 2026-10-25.

Publication pins: reset to the single-quoted placeholders `VALIDATED_SHA: 'SET_VALIDATED_SHA_AFTER_SUCCESS'` and `VALIDATION_RUN: 'SET_VALIDATION_RUN_AFTER_SUCCESS'`; replace both with the exact successful source/run before publishing. Run the new version's test-promote-permissions.py before starting publication.
