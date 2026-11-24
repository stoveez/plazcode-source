# SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
# Fresh picture of Blender's open 3D viewport ("My open Blender window" mode). PlazCode puts FP (the file to write)
# and MAX (the longest side in pixels) in front of this text. Rendered off-screen from the live scene, so the
# picture is current even while Blender's window is in the background.
import bpy, json, os, hashlib, time
res = {'filepath': FP}
win = area = reg = None
for w in bpy.context.window_manager.windows:
    for a in w.screen.areas:
        if a.type == 'VIEW_3D' and area is None:
            for r in a.regions:
                if r.type == 'WINDOW': win, area, reg = w, a, r
if area is None: raise RuntimeError('No 3D Viewport is open in Blender, so there is nothing to capture.')
space = area.spaces.active; rv3d = space.region_3d
if os.path.exists(FP): os.remove(FP)
W, H = reg.width, reg.height
s = min(1.0, MAX / float(max(W, H)))
W2, H2 = max(64, int(W * s)), max(64, int(H * s))
try:
    import gpu
    off = gpu.types.GPUOffScreen(W2, H2)
    try:
        try: off.draw_view3d(bpy.context.scene, bpy.context.view_layer, space, reg, rv3d.view_matrix, rv3d.window_matrix, do_color_management=True)
        except TypeError: off.draw_view3d(bpy.context.scene, bpy.context.view_layer, space, reg, rv3d.view_matrix, rv3d.window_matrix)
        with off.bind():
            buf = gpu.state.active_framebuffer_get().read_color(0, 0, W2, H2, 4, 0, 'UBYTE')
    finally:
        off.free()
    buf.dimensions = W2 * H2 * 4
    try:
        import numpy as np
        px = (np.array(buf, dtype=np.float32) / 255.0)
        px[3::4] = 1.0
        flat = px
    except Exception:
        flat = [v / 255.0 for v in buf]
        for i in range(3, len(flat), 4): flat[i] = 1.0
    img = bpy.data.images.new('_plazcode_shot', W2, H2, alpha=True)
    try:
        img.pixels.foreach_set(flat)
        img.filepath_raw = FP; img.file_format = 'PNG'; img.save()
    finally:
        bpy.data.images.remove(img)
    res['method'] = 'offscreen'
except Exception as e:
    res['offscreen_error'] = str(e)[:200]
    with bpy.context.temp_override(window=win, area=area, region=reg):
        try: bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP', iterations=1)
        except Exception: pass
        bpy.ops.screen.screenshot_area(filepath=FP)
    res['method'] = 'screenshot_area'
if not os.path.isfile(FP): raise RuntimeError('Blender did not write the capture file ' + FP)
raw = open(FP, 'rb').read()
res['bytes'] = len(raw); res['sha1'] = hashlib.sha1(raw).hexdigest()[:12]; res['size'] = [W2, H2]
res['taken'] = time.strftime('%H:%M:%S')
print('PLAZCODE_SHOT_JSON:' + json.dumps(res))
