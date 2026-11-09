"""1.24.31: the Ro-Engineer pack (excaldev, MIT) ships byte-for-byte from the archive the owner supplied, with its
licence, PlazCode's adapter note, credit in THIRD-PARTY-NOTICES and one default card per topic."""
from pathlib import Path
import hashlib,json,zipfile,sys
here=Path(__file__).resolve().parent
archive=here/'ro-engineer-v1.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='0094b4dea5c0b4065df914d571a99ee7d596a3b01bbcb0b1e5c0a02d76e3f365','Ro-Engineer archive changed'
target=Path(sys.argv[1]) if len(sys.argv)>1 else here/'overlay'
pack=target/'PlazCode-Extension/starter-skills/ro-engineer'
names=set()
with zipfile.ZipFile(archive) as z:
    for item in z.infolist():
        if item.is_dir():continue
        relative=Path(item.filename).relative_to('ro-engineer')
        assert (pack/relative).read_bytes()==z.read(item),relative
        names.add(relative.as_posix())
assert len(names)==35 and 'LICENSE' in names
assert 'MIT License' in (pack/'LICENSE').read_text() and 'excaldev' in (pack/'LICENSE').read_text()
assert 'excaldev' in (pack/'PLAZCODE-ADAPTER.md').read_text()
shipped={p.relative_to(pack).as_posix() for p in pack.rglob('*') if p.is_file()}
assert shipped==names|{'PLAZCODE-ADAPTER.md'},shipped^(names|{'PLAZCODE-ADAPTER.md'})
overlay=here/'overlay'
resources=json.loads((overlay/'agent/src/roengineer-resources.json').read_text())
assert set(resources)==shipped
cards=json.loads((overlay/'agent/src/roengineer-index.json').read_text())
assert len(cards)==8 and sum(c['enabled'] for c in cards)==1
assert 'excaldev' in (overlay/'THIRD-PARTY-NOTICES.txt').read_text()
print('PASS Ro-Engineer: 35 original files byte-for-byte, MIT licence and credit, adapter note, 8 cards (1 always on)')
