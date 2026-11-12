"""1.24.33 (owner: Linux automatic updates and a one-line installer): the Linux update helper against the real program.

A running PlazCode is updated in place: the helper checks the archive, closes that PlazCode, replaces only PlazCode's
own files (settings, skills and notes stay), starts the new one in the background and waits for it to say it is ready.
Refused archives (wrong checksum, links, paths outside PlazCode/) change nothing.
PLAZCODE_NATIVE_INSTALL_ROOT=<signed package folder> (CI) runs the same with the release-signed package and its check.
"""
import hashlib, io, json, os, shutil, signal, subprocess, sys, tarfile, tempfile, time
from pathlib import Path

if not sys.platform.startswith('linux'):
    print('Linux update helper test runs on Linux only.'); sys.exit(0)
here = Path(__file__).resolve().parent
signed_root = os.environ.get('PLAZCODE_NATIVE_INSTALL_ROOT')
helper = here / 'Update-PlazCode-Linux.sh'
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

def make_install(target):
    if signed_root:
        shutil.copytree(signed_root, target, symlinks=False)
    else:
        target.mkdir(parents=True)
        shutil.copy2(here / 'agent/target/debug/PlazCode', target / 'PlazCode')
        shutil.copytree(here / 'PlazCode-Extension', target / 'PlazCode-Extension')
        (target / 'README.md').write_text('old readme\n')
    (target / 'PlazCode').chmod(0o755)

def tar_of(folder, extra=None):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode='w:gz') as archive:
        archive.add(folder, arcname='PlazCode')
        if extra: extra(archive)
    return data.getvalue()

with tempfile.TemporaryDirectory(prefix='plazcode-linux-update-') as temp:
    temp = Path(temp)
    home = temp / 'home'; root = home / 'PlazCode'; home.mkdir()
    make_install(root)
    # Your files: settings next to the program and a skills folder. They must survive every update.
    (root / 'plazcode-settings.json').write_text('{"rsAutoUpdate":false,"mine":true}')
    (root / 'Vault').mkdir(); (root / 'Vault' / 'note.md').write_text('my note')
    new = temp / 'new' / 'PlazCode'; make_install(new)
    if not signed_root: (new / 'README.md').write_text('new readme\n')
    archive = temp / 'release.tar.gz'; archive.write_bytes(tar_of(new))
    sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    env = {**os.environ, 'HOME': str(home), 'XDG_CONFIG_HOME': str(temp / 'config'), 'LOCALAPPDATA': str(temp / 'config'), 'PLAZCODE_WORKSPACE_ROOT': str(temp / 'workspace')}
    run = lambda *args, **kw: subprocess.run(['bash', str(helper), *map(str, args)], env=env, capture_output=True, text=True, timeout=180, **kw)
    mode = ['signed'] if signed_root else []

    # Refused archives first: nothing changes.
    before = (root / 'README.md').read_bytes() if (root / 'README.md').exists() else b''
    bad = run(archive, '0' * 64, version, 0, 'none', root, *mode)
    assert bad.returncode == 3 and 'checksum' in bad.stderr, bad
    def link(archive_):
        info = tarfile.TarInfo('PlazCode/evil'); info.type = tarfile.SYMTYPE; info.linkname = '/etc/passwd'; archive_.addfile(info)
    def escape(archive_):
        info = tarfile.TarInfo('PlazCode/../../escape.txt'); body = b'x'; info.size = len(body); archive_.addfile(info, io.BytesIO(body))
    for name, extra in [('link', link), ('escape', escape)]:
        evil = temp / f'{name}.tar.gz'; evil.write_bytes(tar_of(new, extra))
        result = run(evil, hashlib.sha256(evil.read_bytes()).hexdigest(), version, 0, 'none', root, *mode)
        assert result.returncode == 4, (name, result)
    assert not (temp / 'escape.txt').exists() and not (home / 'escape.txt').exists()
    assert ((root / 'README.md').read_bytes() if (root / 'README.md').exists() else b'') == before

    # A running PlazCode, updated in place.
    log = open(temp / 'agent.log', 'w')
    agent = subprocess.Popen([str(root / 'PlazCode'), '--background'], cwd=root, env=env, stdout=log, stderr=log)
    try:
        for _ in range(300):
            if subprocess.run(['curl', '-s', '-o', '/dev/null', 'http://127.0.0.1:3000/desktop-start'], capture_output=True).returncode == 0: break
            time.sleep(0.1)
        else: raise AssertionError('PlazCode did not start: ' + (temp / 'agent.log').read_text()[-2000:])
        result = run(archive, sha, version, agent.pid, 'background', root, *mode)
        assert result.returncode == 0, (result.stdout, result.stderr, (temp / 'agent.log').read_text()[-2000:])
        assert agent.wait(timeout=20) is not None, 'the old PlazCode was closed'
        now = running_from(root)
        assert len(now) == 1 and now[0] != agent.pid, ('the new PlazCode runs from the same folder', now)
        assert json.loads((root / 'plazcode-settings.json').read_text())['mine'] is True, 'settings kept'
        assert (root / 'Vault' / 'note.md').read_text() == 'my note', 'notes kept'
        if not signed_root: assert (root / 'README.md').read_text() == 'new readme\n', 'program files replaced'
        assert os.access(root / 'PlazCode', os.X_OK)
        assert not list(home.glob('.PlazCode-update.*')), 'no leftovers next to the install'

        # The installer's way (pid 0, mode none): it finds and closes the running PlazCode itself and does not restart it.
        again = run(archive, sha, version, 0, 'none', root, *mode)
        assert again.returncode == 0, (again.stdout, again.stderr, subprocess.run(['ps', '-eo', 'pid,ppid,stat,args'], capture_output=True, text=True).stdout[-3000:])
        for _ in range(100):
            if not running_from(root): break
            time.sleep(0.1)
        assert not running_from(root), 'mode none leaves PlazCode closed'
    finally:
        for pid in running_from(root):
            try: os.kill(pid, signal.SIGTERM)
            except OSError: pass
        if agent.poll() is None: agent.kill()
        log.close()
print('PASS Linux update helper' + (' (signed package)' if signed_root else '') + ': refused checksum, link and ../ archives change nothing; a running PlazCode is updated in place, settings and notes kept, the new one starts in the background and confirms; the installer way closes it and leaves it closed.')
