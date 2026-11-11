# SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
# PlazCode's helper inside an open Blender window ("My open Blender window").
#
# PlazCode installs this as the add-on folder "plazcode_blender":
#     __init__.py      this text, with the shared executor put in at the marked line below
#     blender_ops.py   PlazCode's built-in Blender actions
#     blender_shot.py  the picture of the open 3D view
#     pairing.json     {"token": "...", "port": 9876}, written for this one PlazCode install
# It listens on this computer only (127.0.0.1) and answers one JSON request with one JSON reply:
#     {"type": ..., "params": {...}, "token": "..."}  ->  {"status": "success", "result": ...}
#                                                     or  {"status": "error", "message": "..."}
# Every request must carry the pairing word from pairing.json, so only the PlazCode that installed this helper
# can use it. Requests run on Blender's main thread, one at a time. The helper starts by itself when Blender opens.
bl_info = {
    "name": "PlazCode helper",
    "author": "PlazCode",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "Starts by itself; no panel",
    "description": "Lets the PlazCode app on this computer work in this Blender window.",
    "category": "Interface",
}

# __PLAZCODE_EXECUTOR__

import hmac
import queue
import socket
import threading

HELPER_VERSION = 1
HERE = os.path.dirname(os.path.abspath(__file__))
MAX_REQUEST = 8 * 1024 * 1024
WRONG_PAIR = "This Blender helper belongs to a different PlazCode install. Open PlazCode, go to Apps & servers, open Blender and press Disconnect, then connect again."

_state = {"server": None, "thread": None, "ops": None, "token": "", "port": 9876, "shot": None, "error": ""}
_jobs = queue.Queue()


def viewport_shot(filepath, max_size):
    """A picture of the open 3D view, made by the same code the older way used."""
    scope = {"__name__": "__plazcode_shot__", "FP": filepath, "MAX": max(64, min(4096, int(max_size or 1000)))}
    return captured(lambda: exec(_state["shot"], scope))


# In an open window the picture is the 3D view itself, not a render.
PICTURE = viewport_shot


def _load():
    with open(os.path.join(HERE, "pairing.json"), "r", encoding="utf-8") as handle:
        pairing = json.load(handle)
    token = str(pairing.get("token") or "")
    if len(token) < 32:
        raise RuntimeError("PlazCode's pairing file is incomplete. Connect Blender again from PlazCode.")
    with open(os.path.join(HERE, "blender_ops.py"), "r", encoding="utf-8") as handle:
        ops = compile_ops(handle.read())
    with open(os.path.join(HERE, "blender_shot.py"), "r", encoding="utf-8") as handle:
        shot = compile(handle.read(), "blender_shot.py", "exec")
    _state.update({"ops": ops, "shot": shot, "token": token, "port": int(pairing.get("port") or 9876)})


def _reply_for(request):
    """One request to one reply, in the shape PlazCode's app expects from the socket."""
    if not isinstance(request, dict) or not hmac.compare_digest(str(request.get("token") or ""), _state["token"]):
        return {"status": "error", "message": WRONG_PAIR, "code": "wrong_pair"}
    if request.get("type") == "plazcode_hello":
        return {"status": "success", "result": {"plazcode_helper": HELPER_VERSION, "blender": bpy.app.version_string}}
    reply = answer(request, _state["ops"], bpy.app.tempdir or HERE)
    if reply.get("ok"):
        return {"status": "success", "result": reply.get("result")}
    return {"status": "error", "message": reply.get("message") or "Blender could not do that.", "code": reply.get("error")}


def pump():
    """Run waiting requests on Blender's main thread. Returns the seconds until the next look."""
    for _ in range(8):
        try:
            request, done = _jobs.get_nowait()
        except queue.Empty:
            break
        try:
            done["reply"] = _reply_for(request)
        except BaseException as error:  # never let one request stop the helper
            done["reply"] = {"status": "error", "message": str(error) or error.__class__.__name__}
        done["event"].set()
    return 0.05


def _serve_one(connection):
    connection.settimeout(15)
    data = b""
    request = None
    while len(data) <= MAX_REQUEST:
        chunk = connection.recv(65536)
        if not chunk:
            return
        data += chunk
        try:
            request = json.loads(data.decode("utf-8"))
            break
        except ValueError:
            continue
    if request is None:
        return
    done = {"event": threading.Event(), "reply": None}
    _jobs.put((request, done))
    # The app has its own time limit and closes the connection when it stops waiting.
    if not done["event"].wait(600):
        done["reply"] = {"status": "error", "message": "Blender was busy for too long."}
    connection.settimeout(30)
    connection.sendall(json.dumps(done["reply"], ensure_ascii=True).encode("utf-8"))


def _listen(server):
    while _state["server"] is server:
        try:
            connection, _address = server.accept()
        except OSError:
            break
        try:
            with connection:
                _serve_one(connection)
        except Exception:
            pass


def start():
    if _state["server"] is not None:
        return True
    try:
        _load()
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(("127.0.0.1", _state["port"]))
        server.listen(4)
    except Exception as error:
        _state["error"] = str(error)
        print("PlazCode helper could not start: " + str(error))
        return False
    _state.update({"server": server, "error": ""})
    thread = threading.Thread(target=_listen, args=(server,), name="plazcode-helper", daemon=True)
    _state["thread"] = thread
    thread.start()
    return True


def stop():
    server = _state["server"]
    _state["server"] = None
    if server is not None:
        try:
            server.close()
        except Exception:
            pass


def register():
    # Blender in the background has no window to work in (PlazCode switches the add-on on that way): nothing to start.
    if bpy.app.background and os.environ.get("PLAZCODE_HELPER_TEST") != "1":
        return
    if start() and not bpy.app.timers.is_registered(pump):
        bpy.app.timers.register(pump, first_interval=0.2, persistent=True)


def unregister():
    stop()
    try:
        if bpy.app.timers.is_registered(pump):
            bpy.app.timers.unregister(pump)
    except Exception:
        pass
