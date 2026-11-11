# SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
# Adds PlazCode's helper to Blender, or removes it. PlazCode runs Blender once without a window for this:
#     blender --background --python blender_addon_setup.py -- install <folder with the helper's files>
#     blender --background --python blender_addon_setup.py -- remove
# Blender itself says where its add-ons folder is, so this works for every Blender version and system.
# The one reply is a line that starts with "PZ1 " followed by JSON.
import json
import os
import shutil
import sys
import time

import bpy
import addon_utils

NAME = "plazcode_blender"


def say(payload):
    sys.stdout.write("\nPZ1 " + json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def is_ours(folder):
    return os.path.isdir(folder) and os.path.isfile(os.path.join(folder, "pairing.json")) and os.path.isfile(os.path.join(folder, "__init__.py"))


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    action = args[0] if args else ""
    addons = bpy.utils.user_resource("SCRIPTS", path="addons", create=True)
    if not addons:
        raise RuntimeError("Blender did not say where its add-ons folder is.")
    target = os.path.join(addons, NAME)
    single = target + ".py"
    if action == "install":
        payload = args[1]
        if not os.path.isfile(os.path.join(payload, "__init__.py")) or not os.path.isfile(os.path.join(payload, "pairing.json")):
            raise RuntimeError("PlazCode's helper files are incomplete.")
        backup = None
        stamp = time.strftime("%Y%m%d-%H%M%S")
        # Something else with the same name is kept, never deleted.
        for other in (target, single):
            if os.path.lexists(other) and not is_ours(other):
                backup = other + ".backup-" + stamp
                os.rename(other, backup)
        if os.path.isdir(target):
            shutil.rmtree(target)
        shutil.copytree(payload, target)
        # The add-ons folder may be brand new: let Blender look at it again before switching the helper on.
        if addons not in sys.path:
            sys.path.append(addons)
        try:
            bpy.utils.refresh_script_paths()
        except Exception:
            pass
        addon_utils.modules_refresh()
        addon_utils.enable(NAME, default_set=True, persistent=True)
        if not addon_utils.check(NAME)[0]:
            raise RuntimeError("Blender did not switch the PlazCode helper on. Open Blender, go to Edit > Preferences > Add-ons and switch on \"PlazCode helper\".")
        bpy.ops.wm.save_userpref()
        say({"ok": True, "folder": target, "backup": backup, "blender": bpy.app.version_string})
    elif action == "remove":
        try:
            addon_utils.disable(NAME, default_set=True)
            bpy.ops.wm.save_userpref()
        except Exception:
            pass
        removed = False
        if is_ours(target):  # only the folder PlazCode wrote
            shutil.rmtree(target)
            removed = True
        say({"ok": True, "folder": target, "removed": removed, "blender": bpy.app.version_string})
    else:
        raise RuntimeError("Unknown action.")


try:
    main()
except BaseException as error:
    say({"ok": False, "message": (str(error) or error.__class__.__name__)[:1000]})
