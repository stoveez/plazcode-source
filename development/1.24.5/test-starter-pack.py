"""Verify that shipping the starter pack preserves complete source and licensing."""
from pathlib import Path
import hashlib, json, zipfile

dev=Path(__file__).resolve().parent
pack=dev.parents[1]/'build-src/PlazCode/PlazCode-Extension/starter-skills/syphodev'
archive=dev/'syphodev-starter-skills.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='14c07a4db8f28c6cfbd38d6ae1f66f7dcfd94c7ae4a889789729e8e612119250'
with zipfile.ZipFile(archive) as z:
    count=0
    for item in z.infolist():
        if item.is_dir(): continue
        relative=Path(item.filename).relative_to('roblox-ai-skills-main')
        assert (pack/relative).read_bytes()==z.read(item), relative
        assert relative.name!='LOCAL.md'
        count+=1
    assert count==217
cards=json.loads((dev/'overlay/agent/src/starter-skills-index.json').read_text())
assert len(cards)==11 and len({s['id'] for s in cards})==11
for card in cards:
    assert card['scope']=='' and not card['community'] and card['confirmed']
    assert len(card['description'].encode())<=2000
    assert all(0<len(step.encode())<=1000 for step in card['steps'])
    assert (pack/'skills'/card['title']/'SKILL.md').stat().st_size>1000
assert 'paid bundle' in (pack/'LICENSE.txt').read_text()
assert 'OPEN FONT LICENSE Version 1.1' in (pack/'skills/roblox-ui/references/fonts/OFL.txt').read_text()
assert 'https://www.youtube.com/@SyphoDev' in (pack/'PLAZCODE-ADAPTER.md').read_text()
print('PASS all 11 default skill cards, all 217 original resources byte-for-byte, no personal LOCAL.md, attribution and separate original/font licenses')
