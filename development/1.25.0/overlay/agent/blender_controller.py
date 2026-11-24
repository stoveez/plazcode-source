# SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
# PlazCode's controller for Blender in the background (no window). The app writes blender_executor.py in front of
# this text, so everything above this line is the shared executor.
#
# The PlazCode app starts it like this and talks to it over stdin / stdout, one JSON object per line:
#     blender --background --factory-startup --python blender_controller.py -- --session <folder>
# Every reply is one line that starts with "PZ1 " followed by JSON. Anything else Blender prints is ignored by the
# app. There is no network port. When stdin closes (PlazCode stopped or crashed) the controller ends, and Blender
# with it. The structured actions come from blender_ops.py, which the app writes next to this file from its own
# built-in copy.
OUT = sys.__stdout__
SESSION = os.getcwd()
if "--" in sys.argv:
    extra = sys.argv[sys.argv.index("--") + 1:]
    if "--session" in extra and extra.index("--session") + 1 < len(extra):
        SESSION = extra[extra.index("--session") + 1]
OPS_FILE = os.path.join(SESSION, "blender_ops.py")


def send(payload):
    # The leading newline keeps a half-written Blender progress line from gluing itself onto the reply.
    OUT.write("\nPZ1 " + json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n")
    OUT.flush()


def main():
    try:
        with open(OPS_FILE, "r", encoding="utf-8") as handle:
            source = handle.read()
        ops = compile_ops(source)
    except Exception as error:
        send({"event": "failed", "message": str(error)})
        return
    send({"event": "ready", "blender": bpy.app.version_string, "protocol": PROTOCOL, "ops": known_ops(source), "safe": True})
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
        send(answer(request, ops, SESSION))


main()
