"""Compile installer-recording fixtures into a separate debug executable.
The release binary remains untouched. Test the production launch/download code
with a checksum-checking installer fixture, then restore the real helper sources.
"""
from pathlib import Path
import os,subprocess
root=Path(__file__).resolve().parent
windows='''param([string]$InstallRoot,[string]$ZipPath,[string]$ExpectedSha256,[string]$ExpectedVersion,[switch]$ShowProgress,[switch]$BackgroundUpdate,[switch]$RestoreWindow,[string]$Theme,[string]$Glow,[switch]$NoGradients)
if ((Get-ExecutionPolicy -Scope Process) -ne 'Bypass') { exit 17 }
if((Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash -ne $ExpectedSha256){exit 5}
@{version=$ExpectedVersion;sha256=$ExpectedSha256;bytes=(Get-Item $ZipPath).Length;background=[bool]$BackgroundUpdate;theme=$Theme;glow=$Glow;no_gradients=[bool]$NoGradients} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallRoot 'installer-called.json')
exit 0
'''
mac='''#!/bin/bash
set -eu
actual=$(shasum -a 256 "$1" | cut -d ' ' -f1)
[ "$actual" = "$2" ]
printf '{"version":"%s","sha256":"%s","mode":"%s"}' "$3" "$2" "$5" > "$6/installer-called.json"
'''
paths={root/'Update-PlazCode.ps1':windows,root/'Update-PlazCode.command':mac}
original={p:p.read_bytes() for p in paths}
try:
 for p,text in paths.items():p.write_text(text,encoding='utf-8',newline='\n')
 subprocess.run(['cargo','+stable','build','--locked','--manifest-path','agent/Cargo.toml'],cwd=root,check=True)
 env={**os.environ,'PLAZCODE_TEST_BINARY':str(root/'agent/target/debug'/('PlazCode.exe' if os.name=='nt' else 'PlazCode'))}
 if os.name=='nt':env['PSExecutionPolicyPreference']='Restricted'
 for test in ['test-auto-update-launch.py','test-auto-update-after-launch.py']:
  subprocess.run(['python',test],cwd=root,env=env,check=True)
finally:
 for p,raw in original.items():p.write_bytes(raw)
print('PASS launch and later auto-update checks with a separately compiled installer fixture; real release helper sources and executable unchanged.')
