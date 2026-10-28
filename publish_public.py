"""Publish an assembled release from the private source repo into the public release repo.

Inputs (environment): PUBLIC_REPO (owner/name), PUBLIC_REPO_TOKEN, VERSION, optional RELEASE_DIR
(default: current directory), PLAZCODE_PUBLISH_SOURCE / PLAZCODE_PROVENANCE (see publish_release.py).
Order is fail-closed: push a release branch, publish every asset, and only then fast-forward main
(which is what installed copies read as the update feed).
"""
import os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

def run(*args, cwd=None, env=None):
    return subprocess.run(args, cwd=cwd, env=env, check=True, text=True, capture_output=True).stdout.strip()

def main():
    repo = os.environ['PUBLIC_REPO']; version = os.environ['VERSION']
    # PUBLIC_REPO_AUTH=proxy is for local dry runs only: the session's own git/gh credentials are used.
    proxy_auth = os.environ.get('PUBLIC_REPO_AUTH') == 'proxy'
    token = 'proxy' if proxy_auth else os.environ['PUBLIC_REPO_TOKEN']
    source = Path(os.environ.get('RELEASE_DIR', '.')).resolve()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or not re.fullmatch(r'\d+\.\d+\.\d+', version) or not token:
        raise SystemExit('Invalid repository, version or token')
    with_source = os.environ.get('PLAZCODE_PUBLISH_SOURCE', '1') != '0'
    with_provenance = os.environ.get('PLAZCODE_PROVENANCE', '1') != '0'
    files = [f'PlazCode-{version}.zip', f'PlazCode-macOS-{version}.zip', f'PlazCode-Firefox-{version}.zip',
             'latest.json', 'latest-macos.json', 'release-notes.json', 'release-metadata.json', f'release-description-{version}.txt']
    if with_source: files.append(f'PlazCode-source-{version}.zip')
    if with_provenance: files.append(f'PlazCode-{version}.sigstore.json')
    missing = [f for f in files if not (source / f).is_file()]
    if missing: raise SystemExit('Release files missing: ' + ', '.join(missing))
    env = {**os.environ, 'GITHUB_REPOSITORY': repo, 'GIT_TERMINAL_PROMPT': '0'}
    if proxy_auth: env.pop('GH_TOKEN', None)
    else: env['GH_TOKEN'] = token
    work = Path(tempfile.mkdtemp(prefix='public-release-')) / 'repo'
    url = f'https://github.com/{repo}.git' if proxy_auth else f'https://x-access-token:{token}@github.com/{repo}.git'
    run('git', 'clone', '--depth', '1', '--branch', 'main', url, str(work), env=env)
    base = run('git', 'rev-parse', 'HEAD', cwd=work)
    # Keep the public root tidy: only the current version's downloads stay in main.
    # Installed copies only follow latest*.json, which this same commit replaces.
    stale = [p.name for p in work.iterdir() if p.is_file() and p.name not in files and
             re.fullmatch(r'(PlazCode(-macOS|-Firefox|-source)?-\d+\.\d+\.\d+\.zip|PlazCode-\d+\.\d+\.\d+\.sigstore\.json|release-description-\d+\.\d+\.\d+\.txt)', p.name)]
    if stale: run('git', 'rm', '-q', '--', *stale, cwd=work)
    for name in files: shutil.copy2(source / name, work / name)
    run('git', 'config', 'user.name', 'stoveez', cwd=work)
    run('git', 'config', 'user.email', '', cwd=work)
    run('git', 'add', *files, cwd=work)
    run('git', 'commit', '-m', f'Release PlazCode {version}', cwd=work)
    commit = run('git', 'rev-parse', 'HEAD', cwd=work)
    branch = f'release-v{version}'
    run('git', 'push', url, f'HEAD:refs/heads/{branch}', cwd=work, env=env)
    # Publish and verify every asset from the pushed commit before exposing the feed.
    pub = subprocess.run([sys.executable, str(Path(__file__).with_name('publish_release.py'))], cwd=work, env={**env, 'GITHUB_SHA': commit}, text=True)
    if pub.returncode: raise SystemExit('publish_release.py failed; update feed NOT exposed')
    if run('git', 'ls-remote', url, 'refs/heads/main', env=env).split()[0] != base:
        raise SystemExit('Public main moved during release; update feed NOT exposed')
    run('git', 'push', url, f'{commit}:refs/heads/main', cwd=work, env=env)
    subprocess.run(['gh', 'release', 'edit', f'v{version}', '--repo', repo, '--latest'], env=env, check=True)
    # The temporary release branch is no longer needed once main carries the commit.
    subprocess.run(['git', 'push', url, '--delete', f'refs/heads/{branch}'], cwd=work, env=env, check=False, capture_output=True)
    print(f'Exposed {version} on {repo}')

if __name__ == '__main__':
    main()
