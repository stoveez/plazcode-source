#!/usr/bin/env python3
"""TypeScript's checker run over PlazCode's JavaScript, without changing or building anything (owner, 2026-11-15: step 1
of the gradual move to TypeScript). Each file is checked on its own (every provider defines its own RSProvider).

  python3 development/1.24.33/typecheck/check.py            # the starting set
  python3 development/1.24.33/typecheck/check.py --strict   # also flag values that may be missing (null)

Needs Node; fetches TypeScript 5.6.3 with npx the first time. Not part of the build or CI yet."""
import json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
OVERLAY = os.path.join(HERE, '..', 'overlay')
FILES = ['providers/kimi.js', 'providers/freebuff.js', 'providers/gemini.js', 'core/parser.js']
# Messages that are about the setup, not the code: the provider's diag() starts as a do-nothing function and is replaced in
# init(), the bar's click handlers read event.target, and the parser refers to the page's provider.
NOISE = re.compile(r"TS2554|Property 'diag' does not exist|Property 'closest' does not exist on type 'EventTarget'|Cannot find name 'RSProvider'")
strict = '--strict' in sys.argv
total = 0
for f in FILES:
    opts = {"allowJs": True, "checkJs": True, "noEmit": True, "target": "es2022", "lib": ["dom", "es2022"], "skipLibCheck": True,
            "noUnusedLocals": True, "noImplicitReturns": True, "noFallthroughCasesInSwitch": True, "allowUnreachableCode": False,
            "strictNullChecks": strict}
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as cfg:
        json.dump({"compilerOptions": opts, "files": [os.path.abspath(os.path.join(OVERLAY, f)), os.path.join(HERE, 'globals.d.ts')]}, cfg)
    out = subprocess.run(['npx', '-y', '-p', 'typescript@5.6.3', 'tsc', '-p', cfg.name], capture_output=True, text=True).stdout
    os.unlink(cfg.name)
    found = [re.sub(r'^.*?overlay/', '', l) for l in out.splitlines() if 'error TS' in l and not NOISE.search(l)]
    total += len(found)
    print(f"{f}: {len(found)} finding(s)")
    for l in found: print('  ' + l)
print(f"TOTAL {total}")
