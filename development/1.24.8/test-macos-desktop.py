"""Check the packaged macOS desktop's lifetime and real updater relaunch function."""
from pathlib import Path
import ctypes, json, os, signal, subprocess, tempfile, time

install = Path(os.environ['PLAZCODE_MAC_TEST_INSTALL']).resolve()
binary = install / 'PlazCode.app/Contents/MacOS/PlazCode'
version = json.loads((install / 'PlazCode-Extension/manifest.json').read_text())['version']
helper = (install / 'Update-PlazCode.command').read_text()
function = helper[helper.index('relaunch_updated(){'):helper.index('\n[[ "$expectedhash"')]
results = []
# Window metadata is enough to detect a disappearing desktop; no screenshot or
# accessibility permission is requested and no unrelated window contents are read.
cf=ctypes.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
cg=ctypes.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
cg.CGWindowListCopyWindowInfo.argtypes=[ctypes.c_uint32,ctypes.c_uint32];cg.CGWindowListCopyWindowInfo.restype=ctypes.c_void_p
cf.CFArrayGetCount.argtypes=[ctypes.c_void_p];cf.CFArrayGetCount.restype=ctypes.c_long
cf.CFArrayGetValueAtIndex.argtypes=[ctypes.c_void_p,ctypes.c_long];cf.CFArrayGetValueAtIndex.restype=ctypes.c_void_p
cf.CFStringCreateWithCString.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_uint32];cf.CFStringCreateWithCString.restype=ctypes.c_void_p
cf.CFDictionaryGetValue.argtypes=[ctypes.c_void_p,ctypes.c_void_p];cf.CFDictionaryGetValue.restype=ctypes.c_void_p
cf.CFNumberGetValue.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_void_p];cf.CFNumberGetValue.restype=ctypes.c_bool
cf.CFRelease.argtypes=[ctypes.c_void_p];cf.CFRelease.restype=None
owner_key=cf.CFStringCreateWithCString(None,b'kCGWindowOwnerPID',0x08000100)
layer_key=cf.CFStringCreateWithCString(None,b'kCGWindowLayer',0x08000100)

def on_screen(pid):
    windows=cg.CGWindowListCopyWindowInfo(17,0) # On-screen only, excluding desktop elements.
    assert windows, 'CoreGraphics could not enumerate on-screen window metadata'
    try:
        for index in range(cf.CFArrayGetCount(windows)):
            record=cf.CFArrayGetValueAtIndex(windows,index)
            owner=ctypes.c_int32();layer=ctypes.c_int32()
            owner_value=cf.CFDictionaryGetValue(record,owner_key)
            layer_value=cf.CFDictionaryGetValue(record,layer_key)
            if owner_value and layer_value and cf.CFNumberGetValue(owner_value,3,ctypes.byref(owner)) and cf.CFNumberGetValue(layer_value,3,ctypes.byref(layer)):
                if owner.value==pid and layer.value==0: return True
        return False
    finally:
        cf.CFRelease(windows)

def alive(pid):
    result = subprocess.run(['/bin/ps', '-ww', '-p', str(pid), '-o', 'comm='], capture_output=True, text=True)
    return result.stdout.strip() == str(binary)

def stop(pid):
    if not pid or not alive(pid):
        return
    os.kill(pid, signal.SIGTERM)
    for _ in range(100):
        if not alive(pid):
            return
        time.sleep(.1)
    if alive(pid):
        os.kill(pid, signal.SIGKILL)

with tempfile.TemporaryDirectory(prefix='plazcode-macos-desktop-') as temporary:
    stage = Path(temporary)
    config = stage / 'config'
    config.mkdir()
    env = {**os.environ, 'LOCALAPPDATA': str(config), 'XDG_CONFIG_HOME': str(config),
           'PLAZCODE_WORKSPACE_ROOT': str(stage / 'workspace')}
    for mode in ['foreground', 'background', 'restore']:
        ready = stage / 'desktop-ready.json'
        ready.unlink(missing_ok=True)
        script = stage / 'relaunch.command'
        script.write_text('set -euo pipefail\nroot=$1; stage=$2; version=$3; mode=$4\n'
                          'restore_args=(); if [[ "$mode" == restore ]]; then restore_args=(--restore-window); mode=background; fi\n'
                          + function + '\nrelaunch_updated\n')
        pid = None
        try:
            result = subprocess.run(['/bin/bash', str(script), str(install), str(stage), version, mode],
                                    env=env, capture_output=True, text=True, timeout=65)
            if ready.exists():
                pid = json.loads(ready.read_text())['pid']
            assert result.returncode == 0, (mode, result.stdout, result.stderr)
            record = json.loads(ready.read_text())
            assert record['desktop_ready'] and record['version'] == version and alive(pid), record
            # Cross the three-minute automatic-update idle interval in the visible desktop.
            expected_visible=mode!='background'
            for _ in range(50):
                if on_screen(pid)==expected_visible: break
                time.sleep(.1)
            assert on_screen(pid)==expected_visible, f'{mode} window visibility was wrong after updater relaunch'
            duration = 210 if mode == 'foreground' else 15
            deadline = time.monotonic() + duration
            while time.monotonic() < deadline:
                assert alive(pid), f'{mode} desktop exited without an explicit quit; inspect agent.log'
                assert on_screen(pid)==expected_visible, f'{mode} desktop window disappeared or changed visibility without a requested action'
                time.sleep(.2)
            results.append({'mode': mode, 'version': version, 'alive_seconds': duration, 'desktop_ready': True, 'window_visible': expected_visible})
            print('PASS macOS desktop readiness, updater relaunch and process lifetime:', results[-1], flush=True)
        finally:
            Path("mac-desktop-result.json").write_text(json.dumps(results, indent=2) + "\n")
            stop(pid)
            subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(install/'PlazCode.app')],check=True)

Path('mac-desktop-result.json').write_text(json.dumps(results, indent=2) + '\n')
