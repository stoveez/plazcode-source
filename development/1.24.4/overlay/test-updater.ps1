$ErrorActionPreference='Stop'
$Scriptpath=Join-Path $PSScriptRoot 'Update-PlazCode.ps1'
$tokens=$null;$errors=$null
[Management.Automation.Language.Parser]::ParseFile($Scriptpath,[ref]$tokens,[ref]$errors) | Out-Null
if($errors.Count){throw ($errors|Out-String)}
$source=Get-Content $Scriptpath -Raw
$start=$source.IndexOf('    $agentPaths =')
$end=$source.IndexOf('    foreach ($file in $files) {',$start)
$block=$source.Substring($start,$end-$start)
$install=Join-Path ([IO.Path]::GetTempPath()) ('PlazCode-test-'+[guid]::NewGuid())
New-Item $install -ItemType Directory | Out-Null
$exe=Join-Path $install 'PlazCode.exe';[IO.File]::WriteAllText($exe,'placeholder')
$global:Stoppedids=@();$global:Waitedids=@();$global:Removed=$false
$global:Lockedhandle=[IO.File]::Open($exe,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
function Get-Process { param($Name,$Id,$ErrorAction) if(!$global:Removed){[pscustomobject]@{Id=101;Path=$exe};[pscustomobject]@{Id=202;Path='/different-install/PlazCode.exe'}} }
function Stop-Process { param($Id,[switch]$Force,$ErrorAction) $global:Stoppedids+= $Id }
function Wait-Process { param($Id,$Timeout,$ErrorAction) $global:Waitedids+=$Id;$global:Lockedhandle.Dispose();$global:Removed=$true }
function Set-UpdaterProgress { param($Percent,$Title,$Detail) }
$ShowProgress=$false;$stopped=$false
Invoke-Expression $block
if(!$stopped -or $global:Stoppedids.Count -ne 1 -or $global:Stoppedids[0] -ne 101 -or $global:Waitedids[0] -ne 101){throw 'Wrong process stopped or wait missing'}
# Persistent file locks must time out before entering the copy loop.
$global:Lockedhandle=[IO.File]::Open($exe,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
$timeoutBlock=$block.Replace('AddSeconds(60)','AddMilliseconds(300)')
$failed=$false
try {Invoke-Expression $timeoutBlock}catch {if($_.Exception.Message -notlike '*still locked*'){throw};$failed=$true}finally{$global:Lockedhandle.Dispose()}
if(!$failed){throw 'Persistent lock did not abort'}
# A lock that survives stopping every visible process (scanner, OneDrive, an
# elevated copy) is renamed aside after the short wait instead of failing.
$fnStart=$source.IndexOf('$movedAside = New-Object');$fnEnd=$source.IndexOf('function Start-UpdatedPlazCode(')
Invoke-Expression $source.Substring($fnStart,$fnEnd-$fnStart)
$asideList=Join-Path $install 'logs/update-moved-aside.txt'
# Like a mapped executable image, this handle blocks writing but allows rename.
$global:Lockedhandle=[IO.File]::Open($exe,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Delete)
$global:Removed=$true
$asideBlock=$block.Replace('AddSeconds(10)','AddMilliseconds(100)')
Invoke-Expression $asideBlock
$global:Lockedhandle.Dispose()
if($movedAside.Count -ne 1 -or (Test-Path -LiteralPath $exe) -or !(Test-Path -LiteralPath $movedAside[0])){throw 'Persistent lock was not renamed aside'}
if((Get-Content -LiteralPath $asideList) -ne $movedAside[0]){throw 'Renamed file was not recorded for cleanup'}
# Cleanup removes recorded aside files once released, and ignores foreign paths.
Add-Content -LiteralPath $asideList -Value (Join-Path $install 'keep-me.txt');[IO.File]::WriteAllText((Join-Path $install 'keep-me.txt'),'x')
Remove-MovedAside
if((Test-Path -LiteralPath $movedAside[0]) -or (Test-Path -LiteralPath $asideList) -or !(Test-Path -LiteralPath (Join-Path $install 'keep-me.txt'))){throw 'Aside cleanup removed the wrong files'}
# Copy retries a transiently locked target and finally renames it aside.
$src=Join-Path $install 'new.bin';[IO.File]::WriteAllText($src,'new');$dst=Join-Path $install 'old.bin';[IO.File]::WriteAllText($dst,'old')
$global:CopyCalls=0
function Copy-Item { param($LiteralPath,$Destination,[switch]$Force,$ErrorAction) $global:CopyCalls++; if($global:CopyCalls -lt 4){throw [IO.IOException]'locked'}; [IO.File]::Copy($LiteralPath,$Destination,$true) }
function Start-Sleep { param($Milliseconds,$Seconds) }
Copy-UpdateFile $src $dst
if($global:CopyCalls -ne 4 -or [IO.File]::ReadAllText($dst) -ne 'new' -or $movedAside.Count -lt 2){throw 'Locked copy was not retried and renamed aside'}
$global:CopyCalls=-100
$failed=$false;try{Copy-UpdateFile $src $dst}catch{$failed=$_.Exception.Message -like 'Could not replace*'}
if(!$failed){throw 'Permanent copy failure was not reported'}
Remove-Item Function:\Copy-Item;Remove-Item Function:\Start-Sleep
# Failure records count repeated failures of the same version and reset for a new one.
$failureRecord=Join-Path $install 'logs/update-failure.json'
Write-UpdateFailure '1.19.36' 'locked' $false;Write-UpdateFailure '1.19.36' 'locked' $false
$record=Get-Content $failureRecord -Raw|ConvertFrom-Json
if($record.count -ne 2 -or $record.version -ne '1.19.36' -or $record.message -ne 'locked' -or $record.at -lt 1){throw 'Failure record count wrong'}
Write-UpdateFailure '1.19.37' 'other' $true
if((Get-Content $failureRecord -Raw|ConvertFrom-Json).count -ne 1){throw 'New version did not reset the failure count'}
Write-Host 'PASS: persistent lock renamed aside and recorded; aside cleanup; copy retry and rename; failure record counting.'
$copyStart=$source.IndexOf('    foreach ($file in $files) {',$start)
if($source.IndexOf('[IO.File]::Open',$start) -gt $copyStart){throw 'Lock verification occurs after copying'}
Remove-Item $install -Recurse -Force
Write-Host 'PASS: PowerShell syntax; exact installation process scope; stop/wait then lock release; persistent-lock abort before copying.'

# Execute the real same-version guard with its exit replaced by a test signal.
$guardStart=$source.IndexOf('    if ($next -lt $current -or')
$guardEnd=$source.IndexOf([Environment]::NewLine,$guardStart)
if($guardEnd -lt 0){$guardEnd=$source.IndexOf("`n",$guardStart)}
$guard=$source.Substring($guardStart,$guardEnd-$guardStart).Replace('exit 0',"throw 'skip-fixture'")
foreach($case in @(@('1.19.17','1.19.17',$true,$false),@('1.19.17','1.19.17',$false,$true),@('1.19.16','1.19.17',$true,$true),@('1.19.18','1.19.17',$false,$false))){
 $next=[version]$case[0];$current=[version]$case[1];$ExpectedVersion=if($case[2]){$case[0]}else{''};$ExpectedSha256=if($case[2]){'a'*64}else{''};$skipped=$false
 try{Invoke-Expression $guard}catch{if($_.Exception.Message -ne 'skip-fixture'){throw};$skipped=$true}
 if($skipped -ne $case[3]){throw 'Same-version repair or downgrade guard failed'}
}
Write-Host 'PASS verified same-version native repair; ordinary duplicate and older packages skip.'

# Exercise the actual restart function with exited/ready/unready launches.
$restart=$source.Substring($source.IndexOf('function Start-UpdatedPlazCode('),$source.IndexOf('function Get-ExtensionRoot(')-$source.IndexOf('function Start-UpdatedPlazCode('))
Invoke-Expression $restart
$stage=Join-Path ([IO.Path]::GetTempPath()) ('PlazCode-restart-test-'+[guid]::NewGuid());New-Item $stage -ItemType Directory|Out-Null
$global:Launches=0;$global:Scenario='retry';$BackgroundUpdate=$true
function Start-Process {param($FilePath,$ArgumentList,$WorkingDirectory,[switch]$PassThru)
 $global:Launches++
 if($ArgumentList -notcontains '--background' -or $ArgumentList -notcontains '--update-ready-file'){throw 'Restart flags missing'}
 $process=[pscustomobject]@{Id=400+$global:Launches;HasExited=($global:Scenario -eq 'retry' -and $global:Launches -eq 1)}
 $process|Add-Member -MemberType ScriptMethod -Name Refresh -Value {}
 if(!$process.HasExited -and $global:Scenario -ne 'timeout'){@{version='1.19.25';pid=$process.Id;desktop_ready=$true}|ConvertTo-Json|Set-Content (Join-Path $stage 'desktop-ready.json')}
 return $process
}
Start-UpdatedPlazCode '1.19.25';if($global:Launches -ne 2){throw 'Exited first launch did not retry'}
$global:Scenario='timeout';$global:Launches=0
$shortRestart=$restart.Replace('AddSeconds(25)','AddMilliseconds(250)').Replace('function Start-UpdatedPlazCode(', 'function Start-UpdatedPlazCodeTimeout(')
Invoke-Expression $shortRestart
$failed=$false;try{Start-UpdatedPlazCodeTimeout '1.19.25'}catch{if($_.Exception.Message -notlike '*did not confirm loading*'){throw};$failed=$true}
if(!$failed -or $global:Launches -ne 1){throw 'Unconfirmed live process duplicated or reported success'}
Remove-Item $stage -Recurse -Force
Write-Host 'PASS updater readiness handshake, retry of exited launch, no duplicate unready running process and startup timeout diagnostics.'
