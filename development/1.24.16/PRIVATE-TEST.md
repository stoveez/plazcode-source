# Private ClickUp startup test

Use the Windows or Mac validation artifact from the successful 1.24.16 workflow; it includes the matching native development ZIP, Firefox ZIP and complete source. Extract into a separate folder, close the existing PlazCode app normally, and start this build. Reload the extension from the extracted matching extension folder, then refresh the ClickUp tab. Confirm both extension and desktop report 1.24.16. Do not delete existing settings, notes or custom instructions.

1. In a fresh Ask Brain chat, choose the model that previously stopped after part 2, then Start. Record the part count, whether it reaches Ready, and any visible error. Repeat in an existing AI-agent DM if applicable.
2. Keep Ultra and the same custom instructions/notes used when it failed. Long custom instructions can still require several parts; every acknowledged part should continue once, without duplicate messages.
3. Use a harmless local read operation to verify the actual selected project's connection. Automated bridge fixtures do not prove your Studio/Blender connection.
4. For the refusing model, Start once in a fresh chat. If it declines, PlazCode should stay stopped, unlock the composer and explain that the selected model declined, without sending another handshake request. A model can still decline the plain user request. Choose another available model and a fresh chat to test its support.
5. Test Stop during startup: no later startup part should be sent. Switching to another existing conversation must not confirm the old conversation's delivery or continue startup there.

If it fails, copy the PlazCode debug report and provide the selected ClickUp model, whether it was Ask Brain or an agent DM, last visible part/acknowledgement, and whether custom instructions or saved notes are large. Avoid sending private workspace content or credentials.

This is an unpublished test build, with no stable update-feed changes. Public publication follows only after user testing and explicit approval.
