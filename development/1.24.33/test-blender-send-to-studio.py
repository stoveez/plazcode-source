# What "send to Studio" takes out of a real Blender (owner, 2026-11-12: one command, whole model, right way round,
# with colours). Runs PlazCode's real blender_ops.py inside a real Blender engine:
#   blender --background --python development/1.24.33/test-blender-send-to-studio.py
# or with the bpy module installed:  python3 development/1.24.33/test-blender-send-to-studio.py
# Without Blender it says so and passes nothing. It cannot check the Studio half (needs Roblox Studio).
import contextlib, io, json, os, sys, tempfile
try:
    import bpy
except ImportError:
    print("SKIPPED: no Blender here (run with blender --background --python, or install bpy)"); sys.exit(0)
here = os.path.dirname(os.path.abspath(__file__))
source = open(os.path.join(here, "overlay", "blender_ops.py"), encoding="utf-8").read()
scratch = tempfile.mkdtemp(prefix="plazcode-send-")
def op(cmd, args):
    code = (source.replace("__PLAZCODE_CMD__", cmd).replace("__PLAZCODE_ARGS__", json.dumps(args))
            .replace("__PLAZCODE_OUT__", json.dumps(os.path.join(scratch, "out.json"))).replace("__PLAZCODE_MESH__", json.dumps(os.path.join(scratch, "mesh.json"))))
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        exec(compile(code, "<blender_ops>", "exec"), {"__name__": "plazcode_ops"})
    line = [l for l in out.getvalue().splitlines() if l.startswith("PLAZCODE_MESH_JSON:")][-1]
    reply = json.loads(line[len("PLAZCODE_MESH_JSON:"):])
    assert reply.get("ok"), (cmd, reply)
    return reply
def box(mesh):
    return [(min(v[i] for v in mesh["verts"]), max(v[i] for v in mesh["verts"])) for i in range(3)]
near = lambda a, b: abs(a - b) < 1e-4

bpy.ops.wm.read_factory_settings(use_empty=True)
# A body 1 m wide, 0.5 m deep, 2 m tall standing on the ground, and a red nose on its FRONT (Blender's front is -Y).
op("add_cube", {"name": "Body", "size": 1, "location": [0, 0, 1]})
bpy.data.objects["Body"].scale = (1, 0.5, 2)
op("add_cube", {"name": "Nose", "size": 0.2, "location": [0.3, -0.35, 1.6]})
op("set_material", {"name": "Nose", "material": "Red", "color": [1, 0, 0, 1]})
op("add_cube", {"name": "Hidden", "size": 1, "location": [9, 9, 9]})
bpy.data.objects["Hidden"].hide_viewport = True

# The last piece made is the selected one. The whole model still goes, minus what is hidden.
sent = op("dump", {})
names = sorted(m["name"] for m in sent["meshes"])
assert names == ["Body", "Nose"], names
body, nose = (next(m for m in sent["meshes"] if m["name"] == n) for n in ("Body", "Nose"))
# Up stays up: the body stands from 0 to 2 on Roblox's Y.
(bx, by, bz) = box(body)
assert near(by[0], 0) and near(by[1], 2) and near(bx[1] - bx[0], 1) and near(bz[1] - bz[0], 0.5), box(body)
# The front arrives as the front (Roblox's front is -Z), and left/right are not mirrored: Blender's +X is the
# model's left when it faces -Y, and Roblox's -X is the model's left when it faces -Z.
(nx, ny, nz) = box(nose)
assert nz[1] < 0, ("the nose must be on -Z", box(nose))
assert nx[1] < 0, ("the nose must be on the same side of the body", box(nose))
# Not turned inside out: a proper turn keeps each triangle's outward side (checked on the nose: normals point away from its centre).
centre = [sum(v[i] for v in nose["verts"]) / len(nose["verts"]) for i in range(3)]
for a, b, c in nose["faces"]:
    p, q, r = nose["verts"][a], nose["verts"][b], nose["verts"][c]
    u, w = [q[i] - p[i] for i in range(3)], [r[i] - p[i] for i in range(3)]
    normal = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]]
    assert sum(normal[i] * (p[i] - centre[i]) for i in range(3)) > 0, "a triangle faces inward"
# Colours: the red set through PlazCode's material action arrives; a part with no material is plain grey.
assert all(near(c[0], 1) and near(c[1], 0) and near(c[2], 0) for c in nose["face_colors"]), nose["face_colors"][0]
assert all(near(c[0], 0.7) for c in body["face_colors"])
# Naming pieces still sends exactly those, hidden or not; a wrong name is an error, nothing is left out silently.
assert [m["name"] for m in op("dump", {"objects": ["Nose"]})["meshes"]] == ["Nose"]
assert [m["name"] for m in op("dump", {"objects": ["Hidden"]})["meshes"]] == ["Hidden"]
try:
    op("dump", {"objects": ["Nope"]}); raise SystemExit("a missing piece must be an error")
except AssertionError:
    pass
print("PASS send to Studio, Blender half, in a real Blender " + bpy.app.version_string + ": whole model, hidden pieces left out, upright, front to the front, not mirrored, not inside out, colours kept")
