# PlazCode 1.24.20 development

## What is changing

- Use PlazCode with Vani AI, including its public text chat. PlazCode sends through Vani's normal chat controls and stops safely if it cannot confirm a send.
- Ultra now uses the complete newest uploaded package, not the earlier version. All 813 supplied files are included unchanged, with the required legal notices and PlazCode's integration files.
- Ultra includes 53 methods, seven specialist guides, supporting tools, assets and saved reference notes. These remain internal references rather than extra cards in Your Skills.
- Ultra still activates only at Ultra effort. Its name and animated shine are unchanged.
- The latest package adds clearer interface-style guidance and warns that its example texture must be checked before use.

## Claude result-delivery safeguard

A local native-editing fixture reproduced prefix loss when selection or the editor changed during a long result insertion. The old sender checked only a tail fingerprint and could still click Send. Claude now checks the complete non-newline character sequence throughout composition and before committing, binds it to the same editor/chat, and stops on failed native edits, stop requests, remounts or caret drift. No result characters are stripped or encoded. This is a safe failure guard, not proof of the reported live cause or byte-exact backend/newline preservation; the exact user command/result is still needed to verify that case.

## Source and activation

Authoritative input: `UltraLab_pre-alpha_fixed (1).zip`.
SHA-256: `38e6e5f8ca728e3ab55a664c3bcffcb9d745734f400d713883db61ff56596fbc`.
Supersedes `UltraLab_pre-alpha_fixed.zip`; do not merge superseded functional resources.

The final bundle contains 819 files, 65 catalog entries, 53 skill folders and seven specialist agent guides. The 813 input file hashes are pinned separately and in the final inventory. The two missing legal notices were restored byte-for-byte from the matching baseline package. Root and packaged-extension copies must match exactly.

The reference reader is allowlisted and paginated, with binary asset paths available to applicable approved tools. Neither bundling a helper script nor reading a guide executes it. The seven agent guides do not create unavailable AI workers. External programs, services, credentials, asset permissions and a user's approvals are still required where applicable. Installation resources stay read-only; user learning belongs in approved memory or the working project.

## Verification boundaries

Public Vani markup and one harmless native send were checked live. Local provider and full-core fixtures cover startup, native sends, role/identity scope, locks, tool dispatch, images and uncertain outcomes. Actual Studio/Blender/files operations are mocked in these fixtures. Signed-in Vani and upload markup are synthetic; backend persistence is not established by a rendered submission. Firefox and native platforms require the hosted validation jobs. No guarantee of bug-free third-party-site compatibility is made.

## Release status

Development only. No permission has been given to publish 1.24.20. Do not update main, releases or update feeds until the user explicitly approves publication after final validation.

### Literal command markers and native validation
- JSON command source containing marker examples is preserved instead of dropping its prefix. Only actual leading/terminal Lua wrappers are unwrapped; completed JSON examples do not keep the response watcher waiting. MCP JSON is decoded before raw marker fallback.
- Native route test now supplies Ultra effort for hidden GUI reads and explicitly checks rejection at other efforts. Debug build, authenticated routes, and Studio reconnection use separate CI steps so failures are visible on every platform.
