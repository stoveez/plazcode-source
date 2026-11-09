"""1.24.31 (owner, 2026-10-31): a plain Release check report for every CI build: which checks ran, on which
system, and whether each passed. Written to the run's summary page and kept as a build artifact; the assistant
sends it with every test build. Reads this run's jobs and steps through the GitHub API (read-only).
Usage: python3 release-check.py <run id> <owner/repo>   (needs GH_TOKEN or an authenticated gh)"""
import json,subprocess,sys,datetime,os,re
from pathlib import Path
run_id,repo=sys.argv[1],sys.argv[2]
def api(path):return json.loads(subprocess.run(['gh','api','--paginate',path],check=True,capture_output=True,text=True).stdout or '{}')
run=api(f'repos/{repo}/actions/runs/{run_id}')
jobs=[]
page=1
while True:
    chunk=api(f'repos/{repo}/actions/runs/{run_id}/jobs?per_page=100&page={page}')
    jobs+=chunk.get('jobs',[]);
    if len(chunk.get('jobs',[]))<100:break
    page+=1
jobs=[j for j in jobs if j['name'] not in ('release-check','bootstrap-integrity')]
mark={'success':'PASS','failure':'FAIL','cancelled':'CANCELLED','skipped':'skipped',None:'running'}
lines=[f"# PlazCode release check",
       f"Run {run_id} on commit `{run.get('head_sha','')[:7]}` ({run.get('head_branch','')}), {datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d %H:%M} UTC.",""]
failed=0;passed=0
for job in sorted(jobs,key=lambda j:j['name']):
    steps=[s for s in job.get('steps',[]) if not s['name'].startswith(('Set up job','Complete job','Post ','Run actions/'))]
    real=[s for s in steps if s['conclusion']!='skipped']
    bad=[s for s in real if s['conclusion'] not in ('success',)]
    failed+=len(bad);passed+=len(real)-len(bad)
    lines.append(f"## {job['name']}: {mark.get(job['conclusion'],job['conclusion'])} ({len(real)-len(bad)} of {len(real)} checks passed)")
    for s in steps:
        lines.append(f"- {mark.get(s['conclusion'],s['conclusion'])}  {s['name']}")
    lines.append("")
ok=all(j['conclusion']=='success' for j in jobs) and len(jobs)>=4
lines.insert(3,f"**Result: {'everything passed' if ok else 'NOT ready'}** ({passed} checks passed, {failed} failed, across {len(jobs)} jobs: browsers, Windows, Mac and Linux).\n")
variant_dir=os.environ.get('PLAZCODE_VARIANT_REPORTS')
if variant_dir:
    descriptors=[]
    for path in sorted(Path(variant_dir).rglob('*-release-variant.json')):
        value=json.loads(path.read_text(encoding='utf-8'))
        assert set(value)=={'schema','seed_sha256','mark','layout'}, 'Public report must not contain seeds'
        descriptors.append(value)
    variant_ok=len(descriptors)==3 and all(row==descriptors[0] for row in descriptors)
    ok=ok and variant_ok
    if not variant_ok:lines[3]=lines[3].replace("everything passed","NOT ready")
    lines+=['## Per-release variation: '+('PASS' if variant_ok else 'FAIL'),
            'All three native packages must contain the same descriptor (hash and mark only).']
    if variant_ok:lines+=['Mark: `'+descriptors[0]['mark']+'`; seed SHA256: `'+descriptors[0]['seed_sha256']+'`.']
    sealed=[]
    for path in sorted(Path(variant_dir).rglob('*-sealed-text.json')):
        value=json.loads(path.read_text(encoding='utf-8'))
        assert set(value)=={'version','text_pack_sha256'} and value['version']=='1.24.31' and re.fullmatch('[a-f0-9]{64}',value['text_pack_sha256']), 'Invalid public sealed-text proof'
        sealed.append(value)
    sealed_ok=len(sealed)==3 and all(row==sealed[0] for row in sealed)
    ok=ok and sealed_ok
    if not sealed_ok:lines[3]=lines[3].replace('everything passed','NOT ready')
    lines+=['## Sealed text across platforms: '+('PASS' if sealed_ok else 'FAIL'),
            'Windows, Mac and Linux must package identical sealed content.']
    if sealed_ok:lines+=['SHA256: `'+sealed[0]['text_pack_sha256']+'`.']
print('\n'.join(lines))
sys.exit(0 if ok else 1)
