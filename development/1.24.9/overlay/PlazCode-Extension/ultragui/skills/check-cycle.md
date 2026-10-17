# check-cycle

Use this user-provided reference only when it helps the current project request. Adapt paths, assets, style and APIs to the actual project and available PlazCode tools. The current user scope takes priority. Keep working features. Do not impose extra search loops or ask the user to continue after every component. Use actual tests when tools permit; report what remains untested.

When relevant: every item, before it is marked done. This is the check step of the cycle.

Read the item's code against this list. Say pass or fail for each line.
- It parses: every function, if, for and do is closed, and no stray characters remain.
- Names exist: every require path, service name, and instance name the code depends on
  is spelled the same place it is defined.
- Remote arguments match at all three ends: the sender, the server handler and the receiver.
- The server validates every value that came from a client: type, range, ownership, then
  distance or cooldown. A button must never be the only thing that decides a purchase.
- Every tunable number, such as prices, sizes or timers, comes from a Config module.
- No wait(), spawn() or delay(). Use task.wait, task.spawn and task.delay.
- Every connection is kept or disconnected. Nothing rebuilds the whole screen every frame.
- Every Roblox API the item uses was looked up in this cycle, or is listed as unverified.
- A check that cannot find its target fails. "Not found" is a fail, not a pass.
If any line fails, fix it and run this list again.