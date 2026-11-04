"""Run the actual signed Windows app from intact and damaged installations.

No owner files, profiles, Studio scenes or registry settings are used.
"""
import argparse
from collections import deque
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--package', required=True, type=Path)
parser.add_argument('--expect-old-root-bug', action='store_true')
parser.add_argument('--preview-dir', type=Path)
args = parser.parse_args()
assert os.name == 'nt', 'This test needs real Windows filesystem/process behaviour.'
if args.expect_old_root_bug:
    assert hashlib.sha256(args.package.read_bytes()).hexdigest() in {
        '9450c04f74f7e4b0a62b1859a6216de036eec116672838e88f1da19bdf00866a',
        'e76879ba98b1ff37575be73b024e2b9bfaa66c336572b3baa99476d24ec40d08',
    }, 'Old-behaviour reproduction requires the exact previously verified official/test ZIP.'

def extended(path):
    path = str(path.resolve())
    return path if path.startswith('\\\\?\\') else '\\\\?\\' + path

def signed_check(root):
    process = subprocess.Popen([extended(root / 'PlazCode.exe'), '--verify-package', extended(root)],
                               executable=extended(root / 'PlazCode.exe'),
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    messages = []
    deadline = time.monotonic() + 60
    while process.poll() is None and time.monotonic() < deadline:
        messages.extend(close_own_error_dialogs(process.pid))
        time.sleep(0.05)
    if process.poll() is None:
        process.kill()
    out, err = process.communicate(timeout=10)
    return process.returncode == 0, '\n'.join(messages) + out + err

def close_own_error_dialogs(pid, preview=None):
    # The published release may still show a modal on --headless/check failure.
    # Read/close only error windows owned by THIS child, never other apps.
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowTextW.restype = ctypes.c_int
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user32.EnumWindows.restype = wintypes.BOOL
    user32.EnumChildWindows.argtypes = [wintypes.HWND, callback_type, wintypes.LPARAM]
    user32.EnumChildWindows.restype = wintypes.BOOL
    user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user32.PostMessageW.restype = wintypes.BOOL
    messages = []
    def text(hwnd):
        data = ctypes.create_unicode_buffer(4096)
        user32.GetWindowTextW(hwnd, data, len(data))
        return data.value
    def window(hwnd, _):
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value != pid or text(hwnd) != 'PlazCode Agent failed to start': return True
        parts = []
        def child(control, _):
            value = text(control)
            if value and value != 'OK': parts.append(value)
            return True
        user32.EnumChildWindows(hwnd, callback_type(child), 0)
        messages.append('\n'.join(parts))
        if preview is not None:
            from PIL import ImageGrab
            preview.mkdir(parents=True, exist_ok=True)
            time.sleep(0.4)  # Let the real native message box finish painting.
            ImageGrab.grab(window=int(hwnd)).save(preview / 'PlazCode-missing-files-startup-message.png')
            (preview / 'capture.json').write_text(json.dumps({'actual_native_window': True, 'pid': pid, 'title': text(hwnd), 'message': '\n'.join(parts)}, indent=2))
        user32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE, this process only.
        return True
    user32.EnumWindows(callback_type(window), 0)
    return messages

def start(root, home, preview=None):
    env = os.environ.copy()
    env['LOCALAPPDATA'] = str(home / 'local-data')
    env['APPDATA'] = str(home / 'roaming-data')
    env['USERPROFILE'] = str(home / 'user')
    # Standalone headless bridge, no profile/login or cloud service involved.
    lines = deque(maxlen=80)
    command = [extended(root / 'PlazCode.exe')]
    if preview is None: command.append('--headless')
    command.extend(['--workspace', str(home / 'workspace')])
    process = subprocess.Popen(command, cwd=home, env=env,
                               executable=extended(root / 'PlazCode.exe'),
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    readers = []
    def pump(stream):
        for line in stream: lines.append(line)
    for pipe in [process.stdout, process.stderr]:
        thread = threading.Thread(target=pump, args=(pipe,), daemon=True)
        thread.start(); readers.append(thread)
    ready = False
    deadline = time.monotonic() + 35
    keyfile = home / 'local-data/PlazCode/bridge-key'
    try:
        while time.monotonic() < deadline and process.poll() is None:
            messages = close_own_error_dialogs(process.pid, preview)
            if messages:
                lines.extend(messages)
                break
            if keyfile.is_file():
                try:
                    key = keyfile.read_text().strip()
                    req = urllib.request.Request('http://127.0.0.1:3000/api/desktop/state',
                                                 headers={'Authorization': 'Bearer ' + key})
                    with urllib.request.urlopen(req, timeout=1) as response:
                        json.load(response)
                    ready = True; break
                except (OSError, ValueError):
                    pass
            time.sleep(0.1)
    finally:
        # Only this test's child tree, never processes selected by executable name.
        if process.poll() is None:
            subprocess.run([str(Path(os.environ['SystemRoot']) / 'System32/taskkill.exe'),
                            '/PID', str(process.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        process.wait(timeout=10)
        for thread in readers: thread.join(timeout=2)
    return ready, ''.join(lines)

with tempfile.TemporaryDirectory(prefix='plazcode-verified-paths-', ignore_cleanup_errors=True) as temp:
    base = Path(temp)
    source = base / 'source'
    with zipfile.ZipFile(args.package) as archive:
        assert archive.testzip() is None
        for item in archive.infolist():
            parts = Path(item.filename).parts
            assert parts[0] == 'PlazCode' and not Path(item.filename).is_absolute() and '..' not in parts
        archive.extractall(source)
    original = source / 'PlazCode'
    ok, error = signed_check(original)
    assert ok, 'The downloaded package must pass its real pinned signature/full-file check: ' + error
    cases = [
        ('ordinary', base / 'ordinary/PlazCode', False),
        ('spaces-unicode', base / "Downloads/PlazCode user's copy é 日本語/PlazCode", False),
        ('app-suffix-parent', base / 'innocent.app/Downloads/PlazCode', True),
        ('app-suffix-install', base / 'download/PlazCode.app', True),
        ('long-path', base / ('long folder ' + 'a' * 55) / ('b' * 65) / ('c' * 65) / ('d' * 65) / 'PlazCode', False),
    ]
    report = []
    for name, root, root_bug in cases:
        shutil.copytree(extended(original), extended(root))
        intact, error = signed_check(root)
        assert intact, name + ': untouched files must pass the full signed check: ' + error
        home = base / ('state-' + name); home.mkdir()
        ready, error = start(root, home)
        if root_bug and args.expect_old_root_bug:
            assert not ready and 'os error 3' in error, name + ': reproduce the original wrong-folder/missing-path failure: ' + error[-2000:]
            print('REPRODUCED: complete signed package passes --verify-package, but ordinary .app-named Windows folder makes startup fail with os error 3.', flush=True)
        else:
            assert ready, name + ': intact signed installation must start: ' + error[-2000:]
            print('PASS intact installation:', name, '(all signed file hashes verified)', flush=True)
        report.append({'case': name, 'signed_package_check': True, 'bridge_started': ready})

    # An EXE copied/opened alone is genuinely incomplete, never authorized.
    lone = base / 'zip-open-only/PlazCode'; lone.mkdir(parents=True)
    shutil.copy2(original / 'PlazCode.exe', lone / 'PlazCode.exe')
    if (original / 'WebView2Loader.dll').exists(): shutil.copy2(original / 'WebView2Loader.dll', lone / 'WebView2Loader.dll')
    home = base / 'state-alone'; home.mkdir()
    ready, error = start(lone, home, args.preview_dir)
    assert not ready, 'An EXE without its signed installation must never start.'
    if not args.expect_old_root_bug:
        assert 'Extract' in error and 'PlazCode-Extension' in error, 'Incomplete extraction needs the missing path and actionable recovery, not a false edit accusation: ' + error[-2000:]
    else:
        assert 'os error 3' in error, 'The public EXE-only launch should reproduce the reported missing-path dialog.'
        print('REPRODUCED: opening the EXE without its extracted companion folders shows the same generic integrity dialog and os error 3.', flush=True)
    print('PASS EXE-only/incomplete extraction still refuses startup.', flush=True)

    for name, damage in [('changed', 'change'), ('missing', 'delete'), ('bad-signature', 'signature')]:
        root = base / ('damage-' + name) / 'PlazCode'
        shutil.copytree(extended(original), extended(root))
        target = root / 'PlazCode-Extension/background.js'
        if damage == 'change':
            data = bytearray(target.read_bytes()); data[-1] ^= 1; target.write_bytes(data)
        elif damage == 'delete': target.unlink()
        else:
            manifest = root / 'PlazCode-Extension/plazcode-installation-integrity.json'
            value = json.loads(manifest.read_text()); value['signature'] = ('0' if value['signature'][0] != '0' else '1') + value['signature'][1:]
            manifest.write_text(json.dumps(value))
        ok, _ = signed_check(root); assert not ok, name + ': signed-file verification must still refuse damage'
        home = base / ('state-' + name); home.mkdir()
        ready, error = start(root, home); assert not ready, name + ': actual app must refuse damage'
        if not args.expect_old_root_bug and damage != 'delete':
            assert 'Extract All' not in error, 'Real edits/invalid signatures must keep their integrity-failure verdict.'
        print('PASS protection still blocks:', name, flush=True)
    print(json.dumps({'cases': report, 'protection_refusals': ['EXE-only', 'same-size edit', 'missing signed file', 'invalid signature']}), flush=True)
