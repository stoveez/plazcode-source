# PlazCode 1.24.14 — private test build

This build addresses sent Co-Work cards, completed Claude replies being read as
empty, and initial Studio MCP connection/discovery. It is not a public release.
The stable releases and update feeds remain unchanged.

## Windows test installation

1. Close your running PlazCode app normally, including its tray instance.
2. Extract the Windows development ZIP into a separate test folder. Keep your
   existing installation available; do not delete settings, memory or projects.
3. Launch the extracted `PlazCode/PlazCode.exe`.
4. In Edge or Chrome's extension manager, disable the existing PlazCode extension
   and load the test package's `PlazCode/PlazCode-Extension` folder as an unpacked
   extension. Use one enabled PlazCode extension at a time.
5. Refresh existing AI tabs. Confirm the app and extension both report 1.24.14.

The Windows executable is unsigned, as with the existing development pipeline.
The accompanying source ZIP contains the preferred editable source. No release
provenance, publisher signing or Apple notarization is claimed for this test.

## Checks to try

- **Co-Work:** queue several follow-ups while a task is running. Each card should
  disappear immediately after its send is confirmed. Queued/sending cards and
  requests whose delivery cannot be confirmed must remain visible.
- **Claude in Edge:** try the workflow that previously finished with
  “Claude sent nothing.” A completed reply, including its tool command, should
  be read normally. Commands must not run twice.
- **Studio first connection:** open a place in Studio before launching PlazCode,
  then repeat with Studio opened after PlazCode. The native connection should
  appear without reinstalling a browser or restarting the extension. Close and
  reopen Studio to check reconnection as well.

Studio must have its own MCP server enabled in Assistant → Manage MCP Servers →
Enable Studio as MCP server. PlazCode cannot establish a connection to a disabled
or unavailable Studio server, and must not display a false connected status.
With multiple Studios, select the intended Studio; the app must not silently
switch targets.

If a problem remains, report which check failed, Windows/Edge/Studio versions,
the app and extension versions, and the exact message or PlazCode's redacted
Copy debug report. Local fixtures and CI do not replace this live testing.

Public publication requires your explicit green light after testing.
