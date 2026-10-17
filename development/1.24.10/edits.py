"""Apply the reviewed 1.24.10 source edits to the checksum-verified 1.24.9 source.
Every edit is an exact, unique block of the original file; nothing is fuzzy."""
import json
from pathlib import Path
def apply(source, edits_path):
    edits=json.loads(Path(edits_path).read_text(encoding='utf-8'))
    for name,hunks in edits.items():
        path=Path(source)/name;original=path.read_bytes().decode('utf-8')
        assert '\r' not in original,name
        spans=[]
        for hunk in hunks:
            count=original.count(hunk['old']);assert count==1,(name,count,hunk['old'][:80])
            at=original.index(hunk['old']);spans.append((at,at+len(hunk['old']),hunk['new']))
        spans.sort();out=[];cursor=0
        for start,end,new in spans:
            assert start>=cursor,(name,'overlapping edits');out.append(original[cursor:start]);out.append(new);cursor=end
        out.append(original[cursor:]);path.write_bytes(''.join(out).encode('utf-8'))
    return sorted(edits)
