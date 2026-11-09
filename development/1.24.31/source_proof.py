"""Hash-only proof of prepared source; source ZIPs are never created or uploaded."""
from pathlib import Path
import hashlib, json

NAME = 'PlazCode-1.24.31-source-proof.json'

def source_files(root):
    files = {}
    for path in sorted(Path(root).rglob('*')):
        if not path.is_file() or any(part in {'node_modules', 'target', '__pycache__'} for part in path.relative_to(root).parts) or path.name == 'PlazCode.exe':
            continue
        assert not path.is_symlink(), 'Source proof cannot follow symlinks'
        files['PlazCode/' + path.relative_to(root).as_posix()] = (path.read_bytes(), (path.stat().st_mode & 0o777 | 0o100000) << 16)
    return files

def proof(files):
    return {'schema': 1, 'version': '1.24.31', 'files': {name: {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()} for name, (raw, _) in sorted(files.items())}}

def verify(files, reports):
    expected = proof(files)
    assert len(reports) == 2 and all(report == expected for report in reports), 'Prepared source differs from Windows/Mac validated source proofs'
    return files

def write(root, destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(proof(source_files(root)), sort_keys=True, indent=2) + '\n', encoding='utf-8')
