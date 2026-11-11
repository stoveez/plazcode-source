# SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
# PlazCode's controller for Blender in the background (no window).
#
# The PlazCode app starts it like this and talks to it over stdin / stdout, one JSON object per line:
#     blender --background --factory-startup --python blender_controller.py -- --session <folder>
# Every reply is one line that starts with "PZ1 " followed by JSON. Anything else Blender prints is ignored by the
# app. There is no network port. When stdin closes (PlazCode stopped or crashed) the controller ends, and Blender
# with it.
#
# Safe mode is enforced HERE, where the code runs: free Python ("execute_code") only runs when the app itself marks
# the request with allow_code = true, which it does only when the person switched "Allow free Python" on. The
# structured actions come from blender_ops.py, which the app writes next to this file from its own built-in copy.
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
OUT = sys.__stdout__
SESSION = os.getcwd()
if "--" in sys.argv:
    extra = sys.argv[sys.argv.index("--") + 1:]
    if "--session" in extra and extra.index("--session") + 1 < len(extra):
        SESSION = extra[extra.index("--session") + 1]
OPS_FILE = os.path.join(SESSION, "blender_ops.py")
CMD_TOKEN = '"""__PLAZCODE_CMD__"""'
ARGS_TOKEN = 'r"""__PLAZCODE_ARGS__"""'


def send(payload):
    # The leading newline keeps a half-written Blender progress line from gluing itself onto the reply.
    OUT.write("\nPZ1 " + json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n")
    OUT.flush()


def fail(request_id, code, message):
    send({"id": request_id, "ok": False, "error": code, "message": str(message)[:4000]})


def load_ops():
    with open(OPS_FILE, "r", encoding="utf-8") as handle:
        source = handle.read()
    # The command and its arguments are handed over as variables, never pasted into the program text.
    if source.count(CMD_TOKEN) != 1 or source.count(ARGS_TOKEN) != 1 or "__PLAZCODE_OUT__" not in source or "__PLAZCODE_MESH__" not in source:
        raise RuntimeError("PlazCode's Blender actions file is not the expected one.")
    source = source.replace(CMD_TOKEN, "_PZ_CMD").replace(ARGS_TOKEN, "_PZ_ARGS")
    source = source.replace("__PLAZCODE_OUT__", repr("plazcode_status.json")).replace("__PLAZCODE_MESH__", repr("plazcode_mesh.json"))
    return compile(source, "blender_ops.py", "exec")


def known_ops(source_path):
    try:
        text = open(source_path, "r", encoding="utf-8").read()
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
    return {"name": scene.name, "object_count": len(scene.objects), "objects": objects, "materials_count": len(bpy.data.materials), "background": True}


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


def shot(filepath, max_size):
    """A picture of the scene. There is no viewport in the background, so this is a small render:
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


def handle(request, ops):
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
        return {"executed": True, "result": shot(str(params.get("filepath") or os.path.join(SESSION, "preview.png")), params.get("max_size"))}
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


def main():
    try:
        ops = load_ops()
    except Exception as error:
        send({"event": "failed", "message": str(error)})
        return
    send({"event": "ready", "blender": bpy.app.version_string, "protocol": PROTOCOL, "ops": known_ops(OPS_FILE), "safe": True})
    while True:
        line = sys.stdin.readline()
        if not line:
            break  # PlazCode is gone: end, and Blender ends with this script.
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except Exception:
            continue
        if not isinstance(request, dict):
            continue
        if request.get("type") == "quit":
            break
        request_id = request.get("id")
        try:
            send({"id": request_id, "ok": True, "result": handle(request, ops)})
        except PermissionError:
            fail(request_id, "safe_mode", "Safe mode is on: free Python is blocked.")
        except LookupError:
            fail(request_id, "unknown_op", "PlazCode's Blender controller does not know this command.")
        except BaseException as error:  # a failed action must never end the session
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                fail(request_id, "stopped", "The action tried to stop Blender.")
                continue
            text = str(error) or error.__class__.__name__
            if not isinstance(error, (ValueError, RuntimeError)):
                text += "\n" + traceback.format_exc()[-1500:]
            fail(request_id, "failed", text)


main()
