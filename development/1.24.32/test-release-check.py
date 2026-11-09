"""The report must reject missing or divergent cross-platform sealed content."""
from pathlib import Path
import contextlib, io, json, os, runpy, sys, tempfile, types
from unittest import mock

HERE=Path(__file__).parent
with tempfile.TemporaryDirectory() as temporary:
    root=Path(temporary)
    descriptor={'schema':1,'mark':'a'*16,'seed_sha256':'b'*64,'layout':1}
    sealed={'version':'1.24.32','text_pack_sha256':'c'*64}
    for platform in ['Windows','Darwin','Linux']:
        (root/(platform+'-release-variant.json')).write_text(json.dumps(descriptor))
        (root/(platform+'-sealed-text.json')).write_text(json.dumps(sealed))
    jobs=[{'name':name,'conclusion':'success','steps':[{'name':'Check','conclusion':'success'}]} for name in ['browsers','native (ubuntu-latest)','native (windows-latest)','native (macos-latest)']]
    def gh(command,**kwargs):
        assert command[:3]==['gh','api','--paginate']
        value={'jobs':jobs} if '/jobs?' in command[-1] else {'head_sha':'a'*40,'head_branch':'claude/plazcode-dev'}
        return types.SimpleNamespace(stdout=json.dumps(value))
    def run():
        output=io.StringIO()
        with mock.patch.object(sys,'argv',['release-check.py','123','stoveez/plazcode-source']), mock.patch.dict(os.environ,{'PLAZCODE_VARIANT_REPORTS':str(root)}), mock.patch('subprocess.run',side_effect=gh), contextlib.redirect_stdout(output):
            try:runpy.run_path(str(HERE/'release-check.py'),run_name='__main__')
            except SystemExit as exit:return exit.code,output.getvalue()
        raise AssertionError('Missing readiness exit code')
    code,text=run();assert code==0 and 'everything passed' in text and 'Sealed text across platforms: PASS' in text
    (root/'Windows-sealed-text.json').write_text(json.dumps(dict(sealed,text_pack_sha256='d'*64)))
    code,text=run();assert code==1 and 'NOT ready' in text and 'Sealed text across platforms: FAIL' in text
    (root/'Windows-sealed-text.json').unlink()
    code,text=run();assert code==1 and 'NOT ready' in text
    (root/'Windows-sealed-text.json').write_text(json.dumps(dict(sealed,raw_seed='must not be public')))
    try:run()
    except AssertionError:pass
    else:raise AssertionError('Unexpected secret-like fields must be rejected')
print('PASS report requires three matching sealed-text hashes and refuses divergent, missing or malformed proofs.')
