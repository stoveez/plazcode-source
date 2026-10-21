#!/usr/bin/env python3
"""Checks the guide source and the build tool. Run: python3 guides/test_guides.py"""
import json, os, subprocess, sys, tempfile, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_guides as B

with tempfile.TemporaryDirectory() as tmp:
    out = os.path.join(tmp, 'guides')
    index = B.build(out)
    assert index['version'] == 1 and len(index['guides']) >= 2
    cats = {g['category'] for g in index['guides']}
    assert cats == {'guides', 'troubleshooting'}, cats
    ids = [g['id'] for g in index['guides']]
    assert len(ids) == len(set(ids))
    for g in index['guides']:
        assert os.path.isfile(os.path.join(out, g['id'], 'guide.md')), g['id']
        assert 1 <= g['minutes'] <= 30
    data = json.load(open(os.path.join(out, 'index.json')))
    assert data == index
    # nothing but index.json and guide folders may leave the build
    assert sorted(os.listdir(out)) == sorted(ids + ['index.json'])

def must_fail(files, why):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'guides'); shutil.copytree(HERE, src, ignore=shutil.ignore_patterns('__pycache__'))
        for rel, text in files.items():
            os.makedirs(os.path.dirname(os.path.join(src, rel)), exist_ok=True)
            open(os.path.join(src, rel), 'w').write(text)
        r = subprocess.run([sys.executable, os.path.join(src, 'build_guides.py'), os.path.join(tmp, 'o')], capture_output=True, text=True)
        assert r.returncode != 0, 'build accepted: ' + why

ok = '---\ntitle: T\nsummary: S\ncategory: guides\nicon: book\ngradient: sky\norder: 9\ndate: 2026-10-21\n---\n'
must_fail({'bad-icon/guide.md': ok.replace('book', 'nope') + 'x'}, 'unknown icon')
must_fail({'bad-cat/guide.md': ok.replace('guides', 'blog') + 'x'}, 'unknown category')
must_fail({'bad-img/guide.md': ok + '![a](missing.png)'}, 'missing picture')
must_fail({'bad-url/guide.md': ok + '![a](https://evil.example/x.png)'}, 'remote picture')
must_fail({'bad-link/guide.md': ok + '[x](javascript:alert(1))'}, 'script link')
must_fail({'bad-link2/guide.md': ok + '[x](http://insecure.example)'}, 'http link')
must_fail({'Bad_Slug/guide.md': ok + 'x'}, 'bad folder name')
must_fail({'no-front/guide.md': 'just text'}, 'no front matter')
print('guides: all checks passed')
