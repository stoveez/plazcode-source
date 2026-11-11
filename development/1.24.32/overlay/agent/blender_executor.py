# SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
# PlazCode's Blender executor: everything that runs INSIDE Blender, the same for both ways of connecting.
#
# The PlazCode app puts this text in front of one of two small programs:
#   - blender_controller.py  Blender in the background (no window), talking over stdin / stdout;
#   - blender_addon.py       PlazCode's helper inside an open Blender window, talking over a local socket.
# One code path: a built-in action, the scene check and the safe-mode rule behave the same in both.
#
# Safe mode is enforced HERE, where the code runs: free Python ("execute_code") only runs when the app itself marks
# the request with allow_code = true, which it does only when the person switched "Allow free Python" on.
import contextlib
import hashlib
import io
import json
import math
import os
import re
import sys
import time
import traceback

import bpy

PROTOCOL = 1
CMD_TOKEN = '"""__PLAZCODE_CMD__"""'
ARGS_TOKEN = 'r"""__PLAZCODE_ARGS__"""'


def compile_ops(source):
    # The command and its arguments are handed over as variables, never pasted into the program text.
    if source.count(CMD_TOKEN) != 1 or source.count(ARGS_TOKEN) != 1 or "__PLAZCODE_OUT__" not in source or "__PLAZCODE_MESH__" not in source:
        raise RuntimeError("PlazCode's Blender actions file is not the expected one.")
    source = source.replace(CMD_TOKEN, "_PZ_CMD").replace(ARGS_TOKEN, "_PZ_ARGS")
    source = source.replace("__PLAZCODE_OUT__", repr("plazcode_status.json")).replace("__PLAZCODE_MESH__", repr("plazcode_mesh.json"))
    return compile(source, "blender_ops.py", "exec")


def known_ops(text):
    try:
        block = text[text.index("DISPATCH = {"):]
        block = block[:block.index("\n}")]
        return sorted(set(re.findall(r'^\s*"([a-z0-9_]+)"\s*:', block, re.M)))
    except Exception:
        return []


def captured(run):
    """Run something and return what it printed. Blender's own C-level output is not part of the result."""
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        run()
    return buffer.getvalue()


def scene_info():
    scene = bpy.context.scene
    objects = []
    for index, obj in enumerate(scene.objects):
        if index >= 10:
            break
        objects.append({"name": obj.name, "type": obj.type, "location": [round(float(v), 2) for v in obj.location]})
    return {"name": scene.name, "object_count": len(scene.objects), "objects": objects, "materials_count": len(bpy.data.materials), "background": bool(bpy.app.background)}


def object_info(name):
    obj = bpy.data.objects.get(str(name))
    if obj is None:
        raise ValueError("Object not found: " + str(name))
    info = {"name": obj.name, "type": obj.type, "location": list(obj.location), "rotation": list(obj.rotation_euler), "scale": list(obj.scale),
            "visible": obj.visible_get(), "materials": [slot.material.name for slot in obj.material_slots if slot.material]}
    if obj.type == "MESH" and obj.data:
        info["mesh"] = {"vertices": len(obj.data.vertices), "edges": len(obj.data.edges), "polygons": len(obj.data.polygons)}
    return info


def frame_camera(scene):
    """A temporary camera and sun that look at everything, for scenes that have none."""
    from mathutils import Vector
    points = []
    for obj in scene.objects:
        if obj.type in {"CAMERA", "LIGHT"} or obj.hide_render:
            continue
        try:
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
        except Exception:
            points.append(obj.matrix_world.translation.copy())
    if points:
        low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
        high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    else:
        low, high = Vector((-1, -1, -1)), Vector((1, 1, 1))
    centre = (low + high) / 2
    radius = max((high - low).length / 2, 0.5)
    made = []
    if scene.camera is None:
        data = bpy.data.cameras.new("_plazcode_preview_camera")
        camera = bpy.data.objects.new("_plazcode_preview_camera", data)
        scene.collection.objects.link(camera)
        direction = Vector((1.0, -1.0, 0.75)).normalized()
        camera.location = centre + direction * (radius / math.tan(data.angle / 2) * 1.25)
        camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
        data.clip_end = max(data.clip_end, radius * 20)
        scene.camera = camera
        made.append((camera, data, bpy.data.cameras))
    if not any(obj.type == "LIGHT" and not obj.hide_render for obj in scene.objects):
        data = bpy.data.lights.new("_plazcode_preview_sun", "SUN")
        data.energy = 3.0
        sun = bpy.data.objects.new("_plazcode_preview_sun", data)
        scene.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(50), 0, math.radians(30))
        made.append((sun, data, bpy.data.lights))
    return made


def render_shot(filepath, max_size):
    """A picture of the scene when there is no viewport (Blender in the background): a small render,
    Workbench first (fast, needs a graphics context), then Cycles on the processor (works everywhere)."""
    scene = bpy.context.scene
    render = scene.render
    biggest = max(64, min(4096, int(max_size or 1000)))
    width, height = biggest, max(64, int(biggest * 9 / 16))
    keep = {"engine": render.engine, "x": render.resolution_x, "y": render.resolution_y, "pct": render.resolution_percentage,
            "path": render.filepath, "format": render.image_settings.file_format, "camera": scene.camera}
    cycles = getattr(scene, "cycles", None)
    keep_cycles = (cycles.samples, cycles.device) if cycles else None
    made = frame_camera(scene)
    result = {"filepath": filepath}
    errors = []
    try:
        render.resolution_x, render.resolution_y, render.resolution_percentage = width, height, 100
        render.image_settings.file_format = "PNG"
        render.filepath = filepath
        for engine in ("BLENDER_WORKBENCH", "CYCLES"):
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
                render.engine = engine
                if engine == "CYCLES" and cycles:
                    cycles.samples = 16
                    cycles.device = "CPU"
                bpy.ops.render.render(write_still=True)
                if os.path.isfile(filepath) and os.path.getsize(filepath) > 0:
                    result["method"] = "render_workbench" if engine == "BLENDER_WORKBENCH" else "render_cycles"
                    break
                errors.append(engine + ": no picture was written")
            except Exception as error:
                errors.append(engine + ": " + str(error)[:160])
    finally:
        render.engine, render.resolution_x, render.resolution_y, render.resolution_percentage = keep["engine"], keep["x"], keep["y"], keep["pct"]
        render.filepath, render.image_settings.file_format = keep["path"], keep["format"]
        if keep_cycles:
            cycles.samples, cycles.device = keep_cycles
        for obj, data, store in made:
            bpy.data.objects.remove(obj, do_unlink=True)
            store.remove(data)
        scene.camera = keep["camera"]
    if "method" not in result:
        raise RuntimeError("Blender could not make a picture of the scene. " + " | ".join(errors))
    if len(errors):
        result["offscreen_error"] = " | ".join(errors)[:200]
    raw = open(filepath, "rb").read()
    result.update({"bytes": len(raw), "sha1": hashlib.sha1(raw).hexdigest()[:12], "size": [width, height], "taken": time.strftime("%H:%M:%S")})
    return "PLAZCODE_SHOT_JSON:" + json.dumps(result)


# How a picture is made. The background controller renders one; the open-window helper swaps in the viewport picture.
PICTURE = render_shot


def handle(request, ops, folder):
    kind = request.get("type")
    params = request.get("params") if isinstance(request.get("params"), dict) else {}
    if kind == "get_scene_info":
        return scene_info()
    if kind == "get_object_info":
        return object_info(params.get("name", ""))
    if kind == "plazcode_op":
        command = str(request.get("cmd") or params.get("cmd") or "")
        arguments = request.get("args") if isinstance(request.get("args"), dict) else params.get("args")
        if not re.fullmatch(r"[a-z0-9_]{1,64}", command):
            raise LookupError("unknown_op")
        scope = {"__name__": "__plazcode_op__", "_PZ_CMD": command, "_PZ_ARGS": json.dumps(arguments if isinstance(arguments, dict) else {})}
        return {"executed": True, "result": captured(lambda: exec(ops, scope))}
    if kind == "plazcode_shot":
        return {"executed": True, "result": PICTURE(str(params.get("filepath") or os.path.join(folder, "preview.png")), params.get("max_size"))}
    if kind == "plazcode_save":
        bpy.ops.wm.save_as_mainfile(filepath=str(params["filepath"]), copy=True)
        return {"saved": str(params["filepath"])}
    if kind == "execute_code":
        if request.get("allow_code") is not True:
            raise PermissionError("safe_mode")
        scope = {"__name__": "__plazcode_code__", "bpy": bpy}
        code = str(params.get("code") or "")
        return {"executed": True, "result": captured(lambda: exec(compile(code, "<plazcode>", "exec"), scope))}
    raise LookupError("unknown_op")


def answer(request, ops, folder):
    """Run one request and return its reply. A failed action is a reply, never the end of the session."""
    request_id = request.get("id")

    def fail(code, message):
        return {"id": request_id, "ok": False, "error": code, "message": str(message)[:4000]}

    try:
        return {"id": request_id, "ok": True, "result": handle(request, ops, folder)}
    except PermissionError:
        return fail("safe_mode", "Safe mode is on: free Python is blocked.")
    except LookupError:
        return fail("unknown_op", "PlazCode's Blender helper does not know this command.")
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            return fail("stopped", "The action tried to stop Blender.")
        text = str(error) or error.__class__.__name__
        if not isinstance(error, (ValueError, RuntimeError)):
            text += "\n" + traceback.format_exc()[-1500:]
        return fail("failed", text)
