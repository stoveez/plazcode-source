#!/usr/bin/env python3
"""Build the PlazCode Documentation files (guides and troubleshooting).

Source:  guides/<slug>/guide.md (+ pictures in the same folder)
Output:  <out>/index.json, <out>/<slug>/guide.md and the pictures.
The app reads index.json and each guide.md from the public downloads repo.
Run:  python3 guides/build_guides.py [out_dir]     (default: dist/guides)
"""
import json, math, os, re, shutil, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = {'download','user','plug','rocket','brain','palette','refresh','cube','eye','warning','bug','book','bolt','folder','terminal','wrench','shield','question','link','heart'}
GRADIENTS = {'violet','lime','sky','orange','rose','teal','mint','sunset'}
CATEGORIES = ('guides', 'troubleshooting')
LANGS = ('ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'ru', 'tr', 'zh-CN', 'zh-TW')
IMAGE_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
MAX_IMAGE = 3 * 1024 * 1024
SLUG = re.compile(r'^[a-z0-9][a-z0-9-]{2,59}$')
IMG = re.compile(r'!\[([^\]]*)\]\(([^)\s]+)\)')
LINK = re.compile(r'(?<!!)\[([^\]]+)\]\(([^)\s]+)\)')

def fail(message):
    sys.exit('guides: ' + message)

def parse(path, slug):
    text = open(path, encoding='utf-8').read().replace('\r\n', '\n')
    m = re.match(r'---\n(.*?)\n---\n(.*)$', text, re.S)
    if not m:
        fail(f'{slug}: guide.md must start with a --- front matter block')
    meta = {}
    for line in m.group(1).split('\n'):
        if not line.strip():
            continue
        k, _, v = line.partition(':')
        meta[k.strip()] = v.strip()
    return meta, m.group(2).strip() + '\n'

FEATURE_GUIDE = re.compile(r'/\*GUIDE-JSON-START\*/(.*?)/\*GUIDE-JSON-END\*/', re.S)

def feature_guide_source():
    """The one list of PlazCode features (also read by the AI inside the extension): newest overlay that has it."""
    root = os.path.join(os.path.dirname(HERE), 'development')
    if not os.path.isdir(root):
        return None
    def key(name):
        return tuple(int(x) if x.isdigit() else 0 for x in name.split('.'))
    for version in sorted(os.listdir(root), key=key, reverse=True):
        path = os.path.join(root, version, 'overlay', 'core', 'feature-guide.js')
        if os.path.isfile(path):
            return path
    return None

def build_feature_guide(out):
    """Write <out>/features.json from the extension's feature guide, or nothing if the source is not there."""
    path = feature_guide_source()
    if not path:
        return 0
    m = FEATURE_GUIDE.search(open(path, encoding='utf-8').read())
    if not m:
        fail('feature-guide.js: the GUIDE-JSON markers are missing')
    try:
        entries = json.loads(m.group(1))
    except ValueError as error:
        fail('feature-guide.js: the list between the markers is not valid JSON (%s)' % error)
    for entry in entries:
        for key in ('id', 'title', 'group', 'where', 'does', 'steps', 'keywords'):
            if not entry.get(key):
                fail('feature-guide.js: entry "%s" has no "%s"' % (entry.get('id'), key))
    open(os.path.join(out, 'features.json'), 'w', encoding='utf-8', newline='\n').write(
        json.dumps({'version': 1, 'features': entries}, indent=1, ensure_ascii=False) + '\n')
    return len(entries)

def build(out):
    slugs = sorted(d for d in os.listdir(HERE) if os.path.isfile(os.path.join(HERE, d, 'guide.md')))
    entries, files = [], {}
    for slug in slugs:
        if not SLUG.match(slug):
            fail(f'{slug}: folder name must be lowercase letters, numbers and dashes (3-60 characters)')
        meta, body = parse(os.path.join(HERE, slug, 'guide.md'), slug)
        for key in ('title', 'summary', 'category', 'icon', 'gradient', 'order', 'date'):
            if not meta.get(key):
                fail(f'{slug}: missing "{key}" in the front matter')
        if len(meta['title']) > 80: fail(f'{slug}: title is longer than 80 characters')
        if len(meta['summary']) > 200: fail(f'{slug}: summary is longer than 200 characters')
        if meta['category'] not in CATEGORIES: fail(f'{slug}: category must be one of {CATEGORIES}')
        if meta['icon'] not in ICONS: fail(f'{slug}: unknown icon "{meta["icon"]}" (use one of {sorted(ICONS)})')
        if meta['gradient'] not in GRADIENTS: fail(f'{slug}: unknown gradient "{meta["gradient"]}" (use one of {sorted(GRADIENTS)})')
        if not re.match(r'^\d+$', meta['order']): fail(f'{slug}: order must be a number')
        try: datetime.date.fromisoformat(meta['date'])
        except ValueError: fail(f'{slug}: date must look like 2026-10-21')
        used = []
        for alt, ref in IMG.findall(body):
            if ref.startswith(('http://', 'https://', '/')) or '..' in ref or '\\' in ref:
                fail(f'{slug}: pictures must be files in the guide folder, not "{ref}"')
            ext = os.path.splitext(ref)[1].lower()
            full = os.path.join(HERE, slug, ref)
            if ext not in IMAGE_EXT: fail(f'{slug}: "{ref}" must be png, jpg, gif or webp')
            if not os.path.isfile(full): fail(f'{slug}: picture "{ref}" is missing from the guide folder')
            if os.path.getsize(full) > MAX_IMAGE: fail(f'{slug}: picture "{ref}" is larger than 3 MB')
            used.append(ref)
        for label, ref in LINK.findall(body):
            if ref.startswith('https://') or ref in slugs or ref.startswith('#'):
                continue
            fail(f'{slug}: link "{ref}" must be an https:// address or the folder name of another guide')
        # optional translations: guide.<code>.md next to guide.md (title and summary, same structure)
        folder = os.path.join(HERE, slug)
        for name in sorted(os.listdir(folder)):
            m2 = re.match(r'^guide\.([A-Za-z-]+)\.md$', name)
            if m2 and m2.group(1) not in LANGS:
                fail(f'{slug}: "{name}" is not a supported language (use one of {LANGS})')
        langs, lang_files = {}, {}
        heads = [l for l in body.split('\n') if re.match(r'^##\s', l)]
        for code in LANGS:
            tpath = os.path.join(folder, f'guide.{code}.md')
            if not os.path.isfile(tpath):
                continue
            tmeta, tbody = parse(tpath, f'{slug} ({code})')
            if not tmeta.get('title') or not tmeta.get('summary'):
                fail(f'{slug} ({code}): the translation needs a title and a summary')
            if len(tmeta['title']) > 120 or len(tmeta['summary']) > 300:
                fail(f'{slug} ({code}): title or summary is too long')
            if len([l for l in tbody.split('\n') if re.match(r'^##\s', l)]) != len(heads):
                fail(f'{slug} ({code}): the translation must have the same number of ## headings as the English guide')
            if sorted(r for _, r in IMG.findall(tbody)) != sorted(r for _, r in IMG.findall(body)):
                fail(f'{slug} ({code}): the translation must use the same pictures as the English guide')
            for label, ref in LINK.findall(tbody):
                if not (ref.startswith('https://') or ref in slugs or ref.startswith('#')):
                    fail(f'{slug} ({code}): link "{ref}" must be an https:// address or another guide folder name')
            langs[code] = {'title': tmeta['title'], 'summary': tmeta['summary']}
            lang_files[code] = tbody
        words = len(re.findall(r'\w+', IMG.sub('', body)))
        minutes = max(1, math.ceil(words / 200) + len(used) // 2)
        entries.append({'id': slug, 'title': meta['title'], 'summary': meta['summary'], 'category': meta['category'],
                        'icon': meta['icon'], 'gradient': meta['gradient'], 'minutes': minutes, 'date': meta['date'],
                        'order': int(meta['order'])})
        if langs:
            entries[-1]['langs'] = langs
        files[slug] = (body, sorted(set(used)), meta, lang_files)
    entries.sort(key=lambda e: (CATEGORIES.index(e['category']), e['order'], e['title']))
    index = {'version': 1, 'updated': max((e['date'] for e in entries), default=datetime.date.today().isoformat()), 'guides': entries}
    if os.path.isdir(out): shutil.rmtree(out)
    os.makedirs(out)
    for slug, (body, used, meta, lang_files) in files.items():
        os.makedirs(os.path.join(out, slug))
        open(os.path.join(out, slug, 'guide.md'), 'w', encoding='utf-8', newline='\n').write(body)
        for code, tbody in lang_files.items():
            open(os.path.join(out, slug, f'guide.{code}.md'), 'w', encoding='utf-8', newline='\n').write(tbody)
        for ref in used:
            shutil.copyfile(os.path.join(HERE, slug, ref), os.path.join(out, slug, ref))
    open(os.path.join(out, 'index.json'), 'w', encoding='utf-8', newline='\n').write(json.dumps(index, indent=1, ensure_ascii=False) + '\n')
    build.features = build_feature_guide(out)
    return index

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'dist', 'guides')
    result = build(out)
    print('built %d guides and %d features into %s' % (len(result['guides']), getattr(build, 'features', 0), out))
