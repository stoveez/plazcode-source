"""The generated Ultra files must match their generator and the pack on disk."""
import subprocess, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
r = subprocess.run([sys.executable, str(here / 'ultralab' / 'build_ultralab.py'), '--check'], capture_output=True, text=True)
print(r.stdout.strip(), r.stderr.strip())
assert r.returncode == 0 and 'up to date' in r.stdout, 'Ultra generated files are out of date; run build_ultralab.py'
print('PASS Ultra generated files are up to date.')
