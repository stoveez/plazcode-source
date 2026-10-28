---
title: Instance Destroying
type: api
status: verified
source: https://create.roblox.com/docs/reference/engine/classes/Instance
date: 2026-10-16
tags: [instance, lifecycle]
---

Instance.Destroying fires when Instance:Destroy() is called. With Deferred signal behaviour, a script connected to its own Destroying event may be destroyed before the callback runs. Use it on a container you do not own to disconnect your own connections.

