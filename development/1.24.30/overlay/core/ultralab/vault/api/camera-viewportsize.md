---
title: Camera ViewportSize
type: api
status: verified
source: https://create.roblox.com/docs/reference/engine/classes/Camera
date: 2026-10-16
tags: [camera, viewport, safe-area]
---

Camera.ViewportSize is the device safe area: it excludes notches and cutouts, and includes the Roblox top bar. Only the CurrentCamera updates it each PreRender. For the full screen, use ScreenGui.AbsoluteSize. FieldOfView uses the full screen, not ViewportSize.

- See also [[responsive-scale-uses-the-safe-area-by-mistake]]
