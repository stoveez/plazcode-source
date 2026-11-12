"""1.24.33 (owner: one-line Linux install): install-linux.sh run with /bin/sh (dash on Ubuntu) against a local stand-in
of the release feed, with the real PlazCode program.

Fresh install into ~/PlazCode with an app-menu entry; running it again updates in place (a running PlazCode is closed,
your settings stay); a wrong checksum, an unofficial address and a different folder named PlazCode change nothing;
--uninstall removes the program and menu entry and keeps your data unless --remove-data is given.
"""
import hashlib, http.server, io, json, os, shutil, subprocess, sys, tarfile, tempfile, threading, time
from pathlib import Path

if not sys.platform.startswith('linux'):
    print('Linux installer test runs on Linux only.'); sys.exit(0)
here = Path(__file__).resolve().parent
version = json.loads((here / 'PlazCode-Extension/manifest.json').read_text())['version']

def running_from(root):
    out = []
    for proc in Path('/proc').iterdir():
        if proc.name.isdigit():
            try:
                state = (proc / 'stat').read_text().rsplit(') ', 1)[1].split()[0]
                if os.readlink(proc / 'exe') == str(root / 'PlazCode') and state != 'Z': out.append(int(proc.name))
            except (OSError, IndexError): pass
    return out

def release(folder, readme):
    root = folder / 'PlazCode'; root.mkdir(parents=True)
    shutil.copy2(here / 'agent/target/debug/PlazCode', root / 'PlazCode'); (root / 'PlazCode').chmod(0o755)
    shutil.copytree(here / 'PlazCode-Extension', root / 'PlazCode-Extension')
    shutil.copy2(here / 'Update-PlazCode-Linux.sh', root / 'Update-PlazCode-Linux.sh')
    (root / 'README.md').write_text(readme)
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode='w:gz') as archive: archive.add(root, arcname='PlazCode')
    return data.getvalue()

with tempfile.TemporaryDirectory(prefix='plazcode-install-') as temp:
    temp = Path(temp); site = temp / 'site'; site.mkdir(); home = temp / 'home'; home.mkdir()
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(site), **k)
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler); port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    def publish(readme, url=None, sha=None):
        raw = release(temp / ('build-' + str(time.time_ns())), readme)
        (site / f'PlazCode-Linux-{version}.tar.gz').write_bytes(raw)
        feed = {'version': version, 'desktop_version': version, 'url': url or f'http://127.0.0.1:{port}/PlazCode-Linux-{version}.tar.gz',
                'sha256': sha or hashlib.sha256(raw).hexdigest(), 'release_notes': [{'version': '0.0.1', 'url': 'https://example.com/x', 'sha256': 'f' * 64}],
                'security': {'payload': json.dumps({'version': '9.9.9', 'sha256': 'e' * 64}), 'signature': '0' * 128}}
        (site / 'latest-linux.json').write_text(json.dumps(feed, indent=2) + '\n')
    env = {k: v for k, v in os.environ.items() if not k.startswith('XDG_')}
    env.update(HOME=str(home), PLAZCODE_FEED=f'http://127.0.0.1:{port}/latest-linux.json', PLAZCODE_WORKSPACE_ROOT=str(temp / 'workspace'))
    env.pop('DISPLAY', None); env.pop('WAYLAND_DISPLAY', None)
    sh = lambda *args, **extra: subprocess.run(['/bin/sh', str(here / 'install-linux.sh'), *args], env={**env, **extra}, capture_output=True, text=True, timeout=180)
    dest = home / 'PlazCode'; menu = home / '.local/share/applications/plazcode.desktop'; config = home / '.config/PlazCode'
    try:
        # A different folder named PlazCode is never touched.
        (dest / 'mine').mkdir(parents=True); publish('one\n')
        result = sh('--no-start'); assert result.returncode != 0 and 'different folder' in result.stderr, result
        assert (dest / 'mine').is_dir(); shutil.rmtree(dest)
        # Fresh install.
        result = sh(); assert result.returncode == 0, (result.stdout, result.stderr)
        assert (dest / 'README.md').read_text() == 'one\n' and os.access(dest / 'PlazCode', os.X_OK)
        assert f'Exec="{dest}/PlazCode"' in menu.read_text(), 'added to the app menu'
        assert (home / '.local/share/icons/hicolor/128x128/apps/plazcode.png').is_file()
        assert 'Open PlazCode from your app menu' in result.stdout, 'without a desktop session it says how to open it'
        assert not list(home.glob('.PlazCode-install.*')), 'the download folder is cleaned up'
        # Refused: wrong checksum and an unofficial address. The installed PlazCode is unchanged.
        publish('two\n', sha='0' * 64); result = sh('--no-start'); assert result.returncode != 0 and 'checksum' in result.stderr, result
        publish('two\n', url='https://example.com/PlazCode-Linux.tar.gz'); result = sh('--no-start'); assert result.returncode != 0 and 'unofficial' in result.stderr, result
        result = subprocess.run(['/bin/sh', str(here / 'install-linux.sh'), '--no-start'], env={**env, 'PLAZCODE_FEED': 'https://example.com/latest-linux.json'}, capture_output=True, text=True, timeout=60)
        assert result.returncode != 0 and 'unofficial' in result.stderr, result
        assert (dest / 'README.md').read_text() == 'one\n'
        # Update while PlazCode runs: it is closed, files are replaced, settings stay.
        (dest / 'plazcode-settings.json').write_text('{"mine":true}')
        log = open(temp / 'agent.log', 'w')
        agent = subprocess.Popen([str(dest / 'PlazCode'), '--background'], cwd=dest, env=env, stdout=log, stderr=log)
        for _ in range(300):
            if subprocess.run(['curl', '-s', '-o', '/dev/null', 'http://127.0.0.1:3000/desktop-start'], capture_output=True).returncode == 0: break
            time.sleep(0.1)
        publish('two\n'); result = sh('--no-start'); assert result.returncode == 0, (result.stdout, result.stderr)
        agent.wait(timeout=20); log.close()
        assert (dest / 'README.md').read_text() == 'two\n' and json.loads((dest / 'plazcode-settings.json').read_text())['mine'] is True
        assert not running_from(dest), 'the installer leaves starting PlazCode to the person (no desktop here)'
        # Uninstall keeps your data; --remove-data removes it too.
        config.mkdir(parents=True, exist_ok=True); (config / 'memory.json').write_text('{}')
        result = sh('--uninstall'); assert result.returncode == 0, (result.stdout, result.stderr)
        assert not dest.exists() and not menu.exists() and (config / 'memory.json').is_file() and 'still in' in result.stdout
        assert sh().returncode == 0 and dest.is_dir()
        result = sh('--uninstall', '--remove-data'); assert result.returncode == 0 and not dest.exists() and not config.exists(), result
    finally:
        for pid in running_from(dest):
            try: os.kill(pid, 15)
            except OSError: pass
        server.shutdown()
print('PASS Linux one-line installer (/bin/sh): fresh install with app menu entry and icon, update in place while PlazCode runs (settings kept), wrong checksum / unofficial address / foreign ~/PlazCode refused with nothing changed, uninstall keeps data unless --remove-data.')
