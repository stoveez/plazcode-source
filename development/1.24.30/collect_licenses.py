"""Retain dependency notices without changing their licences or shipping sources."""
from pathlib import Path
import hashlib, json, re, subprocess

OUTPUT = 'THIRD-PARTY-RUST-LICENSES.txt'

def collect(reports, destination):
    components, texts = {}, {}
    for report in reports:
        packages = {p['id']: p for p in report['packages']}
        nodes = {n['id']: n for n in report['resolve']['nodes']}
        root = report['resolve']['root']
        visited, todo = set(), [root]
        while todo:
            item = todo.pop()
            if item in visited:
                continue
            visited.add(item)
            todo.extend(d['pkg'] for d in nodes[item]['deps'])
        for item in sorted(visited - {root}):
            package = packages[item]
            licence = package.get('license') or ''
            assert licence and not re.search(r'\b(?:A?GPL|LGPL)-', licence), 'Review dependency licence: ' + package['name']
            folder = Path(package['manifest_path']).parent
            def notices(directory):
                return {p for p in directory.rglob('*') if p.is_file() and (p.name.upper().startswith(('LICENSE', 'COPYING', 'COPYRIGHT', 'NOTICE')) or any(part.upper() in {'LICENSES', 'LICENSE'} for part in p.relative_to(directory).parts[:-1]))}
            paths = notices(folder)
            # A few crate archives omit their upstream licence files. These
            # exact-version originals were retrieved from their recorded commits.
            shared = None
            base = Path(__file__).with_name('dependency-notices')
            overrides = json.loads((base / 'OVERRIDES.json').read_text())
            name = package['name'] + '@' + package['version']
            if not paths and name in overrides:
                base = Path(__file__).with_name('dependency-notices')
                folder = base / overrides[name]
                rows = json.loads((base / 'PROVENANCE.json').read_text())
                paths = set()
                for row in rows:
                    if row['file'].split('/')[0] == overrides[name]:
                        path = base / row['file']
                        assert hashlib.sha256(path.read_bytes()).hexdigest() == row['sha256'], 'Upstream licence pin changed'
                        paths.add(path)
                shared = 'Pinned upstream originals; see dependency-notices/PROVENANCE.json in the maintainer repository'
            if package.get('license_file'):
                path = Path(package['license_file'])
                paths.add(path if path.is_absolute() else folder / path)
            assert paths, 'Missing dependency notices: ' + package['name']
            refs = []
            for path in sorted(paths):
                relative = path.resolve().relative_to(folder.resolve()).as_posix()
                raw = path.read_bytes()
                digest = hashlib.sha256(raw).hexdigest()
                texts[digest] = raw
                refs.append(relative + ' -> ' + digest)
            name = package['name'] + '@' + package['version']
            row = {'licence': licence, 'authors': package.get('authors', []), 'notices': refs, 'source': 'https://crates.io/crates/' + package['name'] + '/' + package['version']}
            if shared:
                row['shared_notices_from'] = shared
            if name in components:
                assert components[name] == row, 'Platform dependency notices differ: ' + name
            components[name] = row
    # Some original notices link to the standard MIT terms rather than printing
    # them. Include those terms verbatim as well, with component notices above.
    mit = Path(__file__).with_name('dependency-notices').joinpath('rbx-dom/LICENSE.txt').read_bytes()
    permission = mit[mit.index(b'Permission is hereby granted'):]
    terms = hashlib.sha256(permission).hexdigest()
    texts[terms] = permission
    lines = ['Third-party Rust dependency notices', '',
             'These components retain their own licences. They do not change the licence of first-party PlazCode.',
             'MPL-2.0 component source is unmodified and available from its exact version link below.', '',
             'Standard MIT permission terms: NOTICE SHA256 ' + terms, '',
             json.dumps(components, ensure_ascii=False, sort_keys=True, indent=2), '']
    out = '\n'.join(lines).encode('utf-8')
    for digest, raw in sorted(texts.items()):
        out += ('\n===== NOTICE SHA256 ' + digest + ' =====\n').encode() + raw + b'\n'
    Path(destination).parent.mkdir(parents=True, exist_ok=True)
    Path(destination).write_bytes(out)
    return len(components)

def build(manifest, destination):
    host = next(line.split(': ', 1)[1] for line in subprocess.check_output(['rustc', '-vV'], text=True).splitlines() if line.startswith('host: '))
    targets = ['x86_64-apple-darwin', 'aarch64-apple-darwin'] if 'apple-darwin' in host else [host]
    reports = [json.loads(subprocess.check_output(['cargo', 'metadata', '--locked', '--format-version', '1', '--filter-platform', target, '--manifest-path', str(manifest)], text=True)) for target in targets]
    print('Retained notices for', collect(reports, destination), 'Rust dependencies; no first-party source archive.')

if __name__ == '__main__':
    import sys
    build(Path(sys.argv[1]), Path(sys.argv[2]))
