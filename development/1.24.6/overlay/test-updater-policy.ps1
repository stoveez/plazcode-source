$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('PlazCode policy '+[guid]::NewGuid())
New-Item $root -ItemType Directory | Out-Null
$old=$env:PSExecutionPolicyPreference
$oldModules=$env:PSModulePath
try {
 Copy-Item (Join-Path $PSScriptRoot 'Update-PlazCode.bat') $root
 [IO.File]::WriteAllText((Join-Path $root 'Update-PlazCode.ps1'),"if ((Get-ExecutionPolicy -Scope Process) -ne 'Bypass') { exit 17 }; if (!(Get-FileHash -LiteralPath `$PSCommandPath -Algorithm SHA256).Hash) { exit 18 }; [IO.File]::WriteAllText((Join-Path `$PSScriptRoot 'ran.txt'),'helper-ran')")
 $env:PSExecutionPolicyPreference='Restricted'
 $env:PSModulePath=Join-Path $root 'invalid-parent-modules'
 & cmd.exe /D /C ('"'+(Join-Path $root 'Update-PlazCode.bat')+'"')
 if ($LASTEXITCODE -ne 0) { throw 'Manual updater launcher failed under Restricted process policy.' }
 if ((Get-Content (Join-Path $root 'ran.txt')) -ne 'helper-ran') { throw 'Manual updater helper did not execute.' }
 Write-Output 'PASS manual updater launcher runs its unsigned helper under a Restricted parent process policy.'
} finally { $env:PSExecutionPolicyPreference=$old;$env:PSModulePath=$oldModules;Remove-Item $root -Recurse -Force }
