# project-layout

Use this user-provided reference only when it helps the current project request. Adapt paths, assets, style and APIs to the actual project and available PlazCode tools. The current user scope takes priority. Keep working features. Do not impose extra search loops or ask the user to continue after every component. Use actual tests when tools permit; report what remains untested.

When relevant: starting a project, adding a system, or deciding where interface code belongs.

- Interface code goes in StarterGui or in a Controller under src/client/. Screen logic that
  does not touch Instances, such as "is this item affordable" or "what text does this show",
  goes in src/shared/Core/ as plain functions.
- The server decides game state. The interface only asks, and shows what the server says.
- Every remote the interface uses is declared in the Net module, with its name in one place.
- Every number a screen uses, such as sizes, colours, prices or timers, comes from a Config module.
- Anything the game must keep has to be in the source files Rojo serves. Rojo removes instances
  in its folders that are not in source on every connect, so a runtime-made screen in those
  folders is lost the next time Studio syncs.