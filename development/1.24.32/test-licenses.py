"""Check prospective first-party terms and unchanged dependency notices."""
from pathlib import Path
import copy, hashlib, json, tempfile, re
from collect_licenses import collect

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).parent
SOURCE=ROOT/'build-src-1.24.32/PlazCode'
own=(HERE/'overlay/LICENSE').read_bytes()
assert b'PROPRIETARY SOFTWARE LICENSE' in own and b'Earlier releases' in own
for path in [ROOT/'LICENSE',SOURCE/'LICENSE',SOURCE/'PlazCode-Extension/LICENSE']:
    assert path.read_bytes()==own,path
for name in ['BRANDING-NOTICE.txt','THIRD-PARTY-NOTICES.txt']:
    assert (SOURCE/name).read_bytes()==(SOURCE/'PlazCode-Extension'/name).read_bytes(),name
assert 'license-file = "../LICENSE"' in (SOURCE/'agent/Cargo.toml').read_text()
for path in SOURCE.rglob('*'):
    if not path.is_file() or any(part in {'node_modules','target','__pycache__','test-support','ultralab','starter-skills'} for part in path.relative_to(SOURCE).parts):continue
    with path.open('rb') as stream:header=stream.read(1024)
    assert not re.search(rb'SPDX-License-Identifier:\s*(?:A?GPL|LGPL)-',header),path
for row in json.loads((HERE/'dependency-notices/PROVENANCE.json').read_text()):
    assert hashlib.sha256((HERE/'dependency-notices'/row['file']).read_bytes()).hexdigest()==row['sha256']

with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);crate=root/'dependency';crate.mkdir();(crate/'LICENSE').write_bytes(b'Original dependency copyright and permission.\n')
    report={'packages':[{'id':'own','name':'PlazCode'}, {'id':'dep','name':'example','version':'1.0','manifest_path':str(crate/'Cargo.toml'),'license':'MIT'}],
            'resolve':{'root':'own','nodes':[{'id':'own','deps':[{'pkg':'dep'}]},{'id':'dep','deps':[]}]}}
    target=root/'notices.txt'
    assert collect([report],target)==1
    out=target.read_bytes();assert b'Original dependency copyright and permission.\n' in out and b'example@1.0' in out
    modified=copy.deepcopy(report);modified['packages'][1]['license']='GPL-3.0-only'
    try:collect([modified],target)
    except AssertionError:pass
    else:raise AssertionError('New GPL dependency needs review rather than proprietary relabelling')
print('PASS current proprietary first-party terms, mirror notices, original upstream licence pins and dependency-notice retention.')
