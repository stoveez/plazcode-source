#!/usr/bin/env python3
"""TypeScript's checker run over PlazCode's JavaScript, without changing or building anything (owner, 2026-11-15: step 1
of the gradual move to TypeScript). Each file is checked on its own (every provider defines its own RSProvider).

  python3 development/1.25.0/typecheck/check.py            # the starting set
  python3 development/1.25.0/typecheck/check.py --strict   # also flag values that may be missing (null)

  python3 development/1.25.0/typecheck/check.py --page     # every script the extension puts on an AI page (Kimi's list,
                                                             # as one program, so shared names resolve) plus background.js

Needs Node and npm; installs TypeScript 5.6.3 and Chrome's extension types into typecheck/.cache the first time.
--page needs the assembled tree: run python3 development/1.25.0/prepare.py first. Not part of the build or CI yet."""
import json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
OVERLAY = os.path.join(HERE, '..', 'overlay')
FILES = ['providers/kimi.js', 'providers/freebuff.js', 'providers/gemini.js', 'core/parser.js']
# Messages that are about the setup, not the code: the provider's diag() starts as a do-nothing function and is replaced in
# init(), the bar's click handlers read event.target, and the parser refers to the page's provider.
NOISE = re.compile(r"TS2554|Property 'diag' does not exist|Property 'closest' does not exist on type 'EventTarget'|Cannot find name 'RSProvider'")
strict = '--strict' in sys.argv
CACHE = os.path.join(HERE, '.cache')
def tsc():
    if not os.path.exists(os.path.join(CACHE, 'node_modules', 'typescript')):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(['npm', 'install', '--prefix', CACHE, '--no-save', 'typescript@5.6.3', '@types/chrome@0.0.287'], check=True, capture_output=True)
    return os.path.join(CACHE, 'node_modules', '.bin', 'tsc')
if '--page' in sys.argv:
    tree = os.path.join(HERE, '..', '..', '..', 'build-src-1.25.0', 'PlazCode')
    manifest = json.load(open(os.path.join(tree, 'manifest.json')))
    page = [cs['js'] for cs in manifest['content_scripts'] if 'https://www.kimi.com/*' in cs['matches'] and len(cs['js']) > 10][0]
    base = {"allowJs": True, "checkJs": True, "noEmit": True, "target": "es2022", "lib": ["dom", "dom.iterable", "es2022"], "skipLibCheck": True,
            "types": ["chrome"], "typeRoots": [os.path.join(CACHE, 'node_modules', '@types')], "noUnusedLocals": True, "noImplicitReturns": True}
    for label, files in (('page scripts', page), ('background.js', ['background.js'])):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as cfg:
            json.dump({"compilerOptions": base, "files": [os.path.abspath(os.path.join(tree, f)) for f in files] + [os.path.join(HERE, 'globals.d.ts')]}, cfg)
        out = subprocess.run([tsc(), '-p', cfg.name], capture_output=True, text=True).stdout
        os.unlink(cfg.name)
        codes = {}
        for l in out.splitlines():
            m = re.search(r'error (TS\d+)', l)
            if m: codes[m.group(1)] = codes.get(m.group(1), 0) + 1
        print(f"{label}: {sum(codes.values())} message(s) " + ', '.join(f'{k} x{v}' for k, v in sorted(codes.items(), key=lambda x: -x[1])))
        for l in out.splitlines():
            if re.search(r'TS2552|TS2551|TS2367|TS1345', l): print('  ' + re.sub(r'^.*?PlazCode/', '', l))
    sys.exit(0)
total = 0
for f in FILES:
    opts = {"allowJs": True, "checkJs": True, "noEmit": True, "target": "es2022", "lib": ["dom", "es2022"], "skipLibCheck": True,
            "noUnusedLocals": True, "noImplicitReturns": True, "noFallthroughCasesInSwitch": True, "allowUnreachableCode": False,
            "strictNullChecks": strict}
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as cfg:
        json.dump({"compilerOptions": opts, "files": [os.path.abspath(os.path.join(OVERLAY, f)), os.path.join(HERE, 'globals.d.ts')]}, cfg)
    out = subprocess.run([tsc(), '-p', cfg.name], capture_output=True, text=True).stdout
    os.unlink(cfg.name)
    found = [re.sub(r'^.*?overlay/', '', l) for l in out.splitlines() if 'error TS' in l and not NOISE.search(l)]
    total += len(found)
    print(f"{f}: {len(found)} finding(s)")
    for l in found: print('  ' + l)
print(f"TOTAL {total}")
