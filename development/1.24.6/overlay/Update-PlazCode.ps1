# PlazCode updater, Windows PowerShell 5.1. Accepts an optional local release ZIP.
param([string]$InstallRoot, [string]$ZipPath, [string]$ExpectedSha256, [string]$ExpectedVersion, [switch]$ShowProgress, [switch]$BackgroundUpdate, [switch]$RestoreWindow, [string]$Theme="default", [string]$Glow="subtle", [switch]$NoGradients)
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 redraws Invoke-WebRequest progress per chunk, which slows a
# 40 MB download many times over. The updater window shows its own progress.
$ProgressPreference = 'SilentlyContinue'
$install = if ($InstallRoot) { [IO.Path]::GetFullPath($InstallRoot) } else { $PSScriptRoot }
$stage = Join-Path ([IO.Path]::GetTempPath()) ('PlazCode-update-' + [guid]::NewGuid())
$backup = Join-Path $stage 'backup'
$written = New-Object 'System.Collections.Generic.List[string]'
$stopped = $false
$installed = $false
$uiReady = $false
function Get-PlazCodeSha256([string]$Path) {
    # Use the built-in .NET implementation even when a parent PowerShell 7
    # process supplies a module path that hides Windows PowerShell cmdlets.
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}
function Set-UpdaterProgress([int]$Percent, [string]$Title, [string]$Detail) {
    if ($uiReady) { [PlazCode.UpdateProgress]::Set($Percent, $Title, $Detail) }
}
# Windows lets a running or scanned executable be renamed even when it cannot be
# overwritten. Renaming the locked file aside frees its path for the new copy;
# the aside copy is deleted on the next update or desktop start.
$movedAside = New-Object 'System.Collections.Generic.List[string]'
$asideList = Join-Path $install 'logs/update-moved-aside.txt'
function Move-LockedAside([string]$Path) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $aside = $Path + '.plazcode-old-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
    try { [IO.File]::Move($Path, $aside) } catch { return $false }
    $movedAside.Add($aside)
    try {
        New-Item (Split-Path $asideList) -ItemType Directory -Force | Out-Null
        Add-Content -LiteralPath $asideList -Value $aside -Encoding UTF8
    } catch { }
    return $true
}
function Remove-MovedAside {
    if (!(Test-Path -LiteralPath $asideList)) { return }
    $remaining = @()
    foreach ($line in @(Get-Content -LiteralPath $asideList -ErrorAction SilentlyContinue)) {
        $path = ([string]$line).Trim()
        if (!$path -or $path -notmatch '\.plazcode-old-[0-9a-f]{8}$') { continue }
        try { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force -ErrorAction Stop } }
        catch { $remaining += $path }
    }
    if ($remaining.Count) { Set-Content -LiteralPath $asideList -Value $remaining -Encoding UTF8 }
    else { Remove-Item -LiteralPath $asideList -Force -ErrorAction SilentlyContinue }
}
# Antivirus, OneDrive and indexers briefly open new or changed files. Retry a
# locked copy, then rename the locked target aside, before failing the update.
function Copy-UpdateFile([string]$Source, [string]$Target) {
    for ($attempt = 1; $attempt -le 6; $attempt++) {
        try { Copy-Item -LiteralPath $Source -Destination $Target -Force -ErrorAction Stop; return }
        catch {
            if ($attempt -eq 6) { throw ('Could not replace ' + $Target + ': ' + $_.Exception.Message) }
            if ($attempt -ge 3) { Move-LockedAside $Target | Out-Null }
            Start-Sleep -Milliseconds (300 * $attempt)
        }
    }
}
$failureRecord = Join-Path $install 'logs/update-failure.json'
function Write-UpdateFailure([string]$Version, [string]$Message, [bool]$Installed) {
    try {
        $count = 1
        if (Test-Path -LiteralPath $failureRecord) {
            try { $previous = Get-Content -LiteralPath $failureRecord -Raw | ConvertFrom-Json; if ($previous.version -eq $Version) { $count = [int]$previous.count + 1 } } catch { }
        }
        New-Item (Split-Path $failureRecord) -ItemType Directory -Force | Out-Null
        @{ version = $Version; count = $count; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); message = $Message; installed = $Installed } | ConvertTo-Json -Compress | Set-Content -LiteralPath $failureRecord -Encoding UTF8
    } catch { }
}
function Start-UpdatedPlazCode([string]$Version) {
    $ready = Join-Path $stage 'desktop-ready.json'
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        Remove-Item -LiteralPath $ready -Force -ErrorAction SilentlyContinue
        $arguments = @('--update-ready-file', ('"' + $ready + '"'))
        if ($BackgroundUpdate) { $arguments += '--background'; if ($RestoreWindow) { $arguments += '--restore-window' } }
        $process = Start-Process -FilePath (Join-Path $install 'PlazCode.exe') -ArgumentList $arguments -WorkingDirectory $install -PassThru
        $deadline = [DateTime]::UtcNow.AddSeconds(25)
        do {
            if (Test-Path -LiteralPath $ready) {
                try {
                    $result = Get-Content -LiteralPath $ready -Raw | ConvertFrom-Json
                    if ($result.desktop_ready -and $result.version -eq $Version -and $result.pid -eq $process.Id) { return }
                } catch { }
            }
            $process.Refresh()
            if ($process.HasExited) { break }
            Start-Sleep -Milliseconds 200
        } while ([DateTime]::UtcNow -lt $deadline)
        if (!$process.HasExited) { throw 'The updated process is running, but its desktop did not confirm loading. See logs/agent.log for startup details.' }
        Set-UpdaterProgress 98 'Retrying PlazCode startup' 'The first launch exited before the desktop loaded. Retrying automatically.'
    }
    throw 'The updated desktop exited before loading after two launch attempts. See logs/agent.log for startup details.'
}
function Get-ExtensionRoot([string]$Root) {
    $nested = Join-Path $Root 'PlazCode-Extension'
    if (Test-Path -LiteralPath (Join-Path $nested 'manifest.json')) { return $nested }
    return $Root
}
$extensionRoot = Get-ExtensionRoot $install
$splitInstall = $extensionRoot -ne $install -and !(Test-Path -LiteralPath (Join-Path $install 'manifest.json'))
try {
    Remove-MovedAside
    if ($ShowProgress) {
        try {
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing
            Add-Type -Path (Join-Path $install 'Updater-Progress.cs') -ReferencedAssemblies ([Windows.Forms.Form].Assembly.Location),([Drawing.Color].Assembly.Location),'System.dll'
            $Preferencespath = Join-Path $install 'plazcode-settings.json'
            if (Test-Path -LiteralPath $Preferencespath) {
                try { $Appearance = (Get-Content -LiteralPath $Preferencespath -Raw | ConvertFrom-Json).rsAppearance
                    if ($Appearance) { $Theme=$Appearance.theme; $Glow=$Appearance.glow; $NoGradients=$Appearance.gradients -eq 'off' }
                } catch { }
            }
            [PlazCode.UpdateProgress]::Open($ExpectedVersion,$Theme,[bool]$BackgroundUpdate,$Glow,!$NoGradients,(Join-Path $install 'agent/assets/plazcode.ico'))
            $uiReady = $true
        } catch { Write-Host ('Progress window unavailable: ' + $_.Exception.Message) -ForegroundColor Yellow }
    }
    Set-UpdaterProgress -1 'Checking release' 'Reading the verified update information.'
    Write-Host 'PlazCode updater' -ForegroundColor Yellow
    $current = [version](Get-Content (Join-Path $extensionRoot 'manifest.json') -Raw | ConvertFrom-Json).version
    $source = if (Test-Path -LiteralPath (Join-Path $install 'update-source.json')) { Get-Content (Join-Path $install 'update-source.json') -Raw | ConvertFrom-Json } else { $null }
    $feedUrl = [string]$source.feedUrl
    if ($feedUrl -eq 'https://raw.githubusercontent.com/stoveez/PlazCodeneww/main/latest.json') { $feedUrl='https://raw.githubusercontent.com/stoveez/PlazCode/main/latest.json' }
    if ($feedUrl -eq 'https://raw.githubusercontent.com/stoveez/PlazCodeneww/main/latest-macos.json') { $feedUrl='https://raw.githubusercontent.com/stoveez/PlazCode/main/latest-macos.json' }
    if ($feedUrl -eq 'https://raw.githubusercontent.com/stoveez/PlazCode/main/latest-macos.json') { $feedUrl='https://raw.githubusercontent.com/stoveez/PlazCode/main/latest.json' }
    if (!$feedUrl) { $feedUrl = "https://raw.githubusercontent.com/stoveez/PlazCode/main/latest.json" }
    New-Item $stage -ItemType Directory | Out-Null
    if (!$ZipPath -and $feedUrl) {
        if ($feedUrl -notmatch '^https://') { throw 'The release feed must use HTTPS.' }
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $feedUri = [UriBuilder]$feedUrl
        $query = $feedUri.Query.TrimStart('?')
        $feedUri.Query = ($query + $(if ($query) { '&' } else { '' }) + 'plazcode_check=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
        $release = Invoke-RestMethod -Uri $feedUri.Uri.AbsoluteUri -Headers @{ 'Cache-Control' = 'no-cache, max-age=0' } -TimeoutSec 30
        $latest = [version]$release.version
        if ($latest -le $current) { Write-Host "Already up to date (v$current)."; exit 0 }
        if ($release.url -notmatch '^https://' -or $release.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid release feed: expected version, HTTPS url and SHA256.' }
        if ($feedUrl -eq 'https://raw.githubusercontent.com/stoveez/PlazCode/main/latest.json') {
            $name = 'PlazCode-' + $release.version + '.zip'
            $assetUrl = 'https://github.com/stoveez/PlazCode/releases/download/v' + $release.version + '/' + $name
            $rawPattern = '^https://raw\.githubusercontent\.com/stoveez/PlazCode/(main|[a-fA-F0-9]{40})/' + [regex]::Escape($name) + '$'
            if ($release.url -ne $assetUrl -and $release.url -notmatch $rawPattern) { throw 'Official update URL does not identify the expected release package.' }
            $rateLimited = $false
            try {
                $official = Invoke-RestMethod -Uri ('https://api.github.com/repos/stoveez/PlazCode/releases/tags/v' + $release.version) -Headers @{ 'User-Agent' = 'PlazCode-Updater'; 'Cache-Control' = 'no-cache' } -TimeoutSec 15
            } catch {
                $statusCode = 0
                try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
                $rateLimited = $statusCode -eq 429 -or ($statusCode -eq 403 -and ($_.ErrorDetails.Message -match 'rate limit' -or $_.Exception.Response.Headers['X-RateLimit-Remaining'] -eq '0'))
                if (!$rateLimited) { throw }
            }
            if ($rateLimited) {
                $release.url = $assetUrl
            } else {
                $asset = @($official.assets | Where-Object { $_.name -eq $name })
                if ($official.tag_name -ne ('v' + $release.version) -or $official.draft -or $official.prerelease -or $asset.Count -ne 1 -or $asset[0].state -ne 'uploaded' -or $asset[0].browser_download_url -ne $assetUrl -or $asset[0].digest -ne ('sha256:' + $release.sha256)) { throw 'Update checksum could not be confirmed against the published official GitHub release. No installed files were changed.' }
            }
        }
        $ZipPath = Join-Path $stage 'release.zip'
        Set-UpdaterProgress -1 'Downloading update' 'Downloading the release package. This step depends on your connection.'
        Write-Host "Downloading v$latest..."
        Invoke-WebRequest -UseBasicParsing -Uri $release.url -OutFile $ZipPath -TimeoutSec 180
        if ((Get-PlazCodeSha256 $ZipPath) -ne $release.sha256) { throw 'Download checksum mismatch. No installed files were changed.' }
    }
    if (!$ZipPath) {
        Write-Host 'No release feed configured. Select a downloaded PlazCode release ZIP.'
        Add-Type -AssemblyName System.Windows.Forms
        $picker = New-Object System.Windows.Forms.OpenFileDialog
        $picker.Filter = 'PlazCode release (*.zip)|*.zip'
        if ($picker.ShowDialog() -ne 'OK') { Write-Host 'Update cancelled.'; exit 0 }
        $ZipPath = $picker.FileName
    }
    $ZipPath = (Resolve-Path -LiteralPath $ZipPath).Path
    Set-UpdaterProgress 15 'Verifying package' 'Checking the download before any installed files are changed.'
    if ($ExpectedSha256) {
        if ($ExpectedSha256 -notmatch '^[a-fA-F0-9]{64}$' -or (Get-PlazCodeSha256 $ZipPath) -ne $ExpectedSha256) { throw 'Package checksum mismatch. Installed files were not changed.' }
    }
    Set-UpdaterProgress 25 'Inspecting package' 'Validating the release contents and installation layout.'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $unpacked = Join-Path $stage 'unpacked'
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    $packageRoot = $null
    try {
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('\','/')
            if ($name -notmatch '^(PlazCode|PlazCode-Extension)/' -or $name -match '(^|/)\.\.(/|$)|:|(^|/)(logs|target|\.git)(/|$)') { throw "Unexpected ZIP entry: $name" }
            $root = $name.Split('/')[0]
            if (!$packageRoot) { $packageRoot = $root } elseif ($root -ne $packageRoot) { throw 'Release ZIP contains mixed installation folders.' }
            $destination = [IO.Path]::GetFullPath((Join-Path $unpacked $name))
            if (!$destination.StartsWith([IO.Path]::GetFullPath($unpacked) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid ZIP path.' }
        }
    } finally { $archive.Dispose() }
    Set-UpdaterProgress 35 'Unpacking update' 'Extracting the verified files to a temporary folder.'
    [IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $unpacked)
    if (!$packageRoot) { throw 'Release ZIP is empty.' }
    $package = Join-Path $unpacked $packageRoot
    $packageExtension = Get-ExtensionRoot $package
    $next = [version](Get-Content (Join-Path $packageExtension 'manifest.json') -Raw | ConvertFrom-Json).version
    if ($ExpectedVersion -and $next -ne [version]$ExpectedVersion) { throw 'Release version does not match the verified feed.' }
    # A verified native download may repair an older executable at the same extension version.
    if ($next -lt $current -or ($next -eq $current -and !($ExpectedVersion -and $ExpectedSha256))) { Write-Host "Already up to date (v$current; selected package v$next)."; exit 0 }
    foreach ($required in @('PlazCode.exe','WebView2Loader.dll','Start-PlazCode-Agent.cmd')) {
        if (!(Test-Path -LiteralPath (Join-Path $package $required))) { throw "Release is missing $required." }
    }
    foreach ($required in @('background.js','core/main.js')) {
        if (!(Test-Path -LiteralPath (Join-Path $packageExtension $required))) { throw "Extension is missing $required." }
    }
    if ($release -and $next -ne $latest) { throw 'Release feed version does not match the downloaded package.' }
    $preservedNames = @('config.json','config.local.json','plazcode-settings.json','bridge-pairing.json','memory.json','chat-history.json','checkpoints.json','catalog.json','creations.json','update-source.json')
    $preservedFolders = '^(?:logs|backups|templates|runtimes|PlazCode\.exe\.WebView2)(?:[\\/]|$)'
    # Compatibility ZIPs also carry legacy root extension copies for old installers.
    # Do not add those duplicates to installations already using the split layout.
    $legacyExtensionFiles = '^(?:manifest\.json|background\.js|popup\.(?:html|js)|overlay\.css|icon\.png|ollama\.html|ollama-page\.js|(?:core|providers|ui)[\\/].*)$'
    $files = @(Get-ChildItem $package -File -Recurse | Where-Object {
        $relative = $_.FullName.Substring($package.Length + 1)
        $_.Name -notin $preservedNames -and $relative -notmatch $preservedFolders -and !($splitInstall -and $packageExtension -ne $package -and $relative -match $legacyExtensionFiles)
    })
    # Compare before shutdown so unchanged runtimes/source files need no backup
    # or rewrite, shortening the interval while the desktop is closed.
    $files = @($files | Where-Object {
        $relative = $_.FullName.Substring($package.Length + 1)
        $old = Join-Path $install $relative
        !(Test-Path -LiteralPath $old -PathType Leaf) -or
            (Get-Item -LiteralPath $old).Length -ne $_.Length -or
            (Get-PlazCodeSha256 $old) -ne (Get-PlazCodeSha256 $_.FullName)
    })
    Set-UpdaterProgress 45 'Saving recovery copies' 'Backing up installed files. Your preferences and templates are preserved.'
    $backedUp = 0
    # Back up overwritten files before stopping the app or modifying the installation.
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($package.Length + 1)
        $old = Join-Path $install $relative
        if (Test-Path -LiteralPath $old) {
            $copy = Join-Path $backup $relative
            New-Item (Split-Path $copy) -ItemType Directory -Force | Out-Null
            Copy-Item -LiteralPath $old -Destination $copy
        }
        $backedUp++
        Set-UpdaterProgress (45 + [int](15 * $backedUp / [Math]::Max(1, $files.Count))) 'Saving recovery copies' ("Preparing files: $backedUp of $($files.Count).")
    }
    Set-UpdaterProgress 60 'Closing PlazCode' 'Waiting for this installation to release its files. Roblox Studio stays open.'
    # Stop only agent processes belonging to this installation. Leave Studio running.
    $agentPaths = @('PlazCode.exe','plazcode-agent.exe') | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $install $_)) }
    $lockStarted = [DateTime]::UtcNow
    $deadline = $lockStarted.AddSeconds(60)
    do {
        # Process.Path works for our same-user app even if CIM omits ExecutablePath.
        $agents = @(Get-Process -Name 'PlazCode','plazcode-agent' -ErrorAction SilentlyContinue | Where-Object {
            try { $_.Path -and $agentPaths -contains [IO.Path]::GetFullPath($_.Path) } catch { $false }
        })
        foreach ($agent in $agents) {
            $stopped = $true
            try { Stop-Process -Id $agent.Id -Force -ErrorAction Stop }
            catch { if (Get-Process -Id $agent.Id -ErrorAction SilentlyContinue) { throw } }
            # Stop-Process can return before Windows releases the executable image.
            Wait-Process -Id $agent.Id -Timeout 5 -ErrorAction SilentlyContinue
        }
        $locked = $false
        foreach ($path in $agentPaths) {
            if (!(Test-Path -LiteralPath $path)) { continue }
            $handle = $null
            try { $handle = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
            catch [IO.IOException] { $locked = $true }
            finally { if ($handle) { $handle.Dispose() } }
        }
        if ($locked -and [DateTime]::UtcNow -ge $lockStarted.AddSeconds(10)) {
            # Every visible process of this installation was stopped. A remaining
            # lock belongs to a scanner or an elevated copy; free the path by
            # renaming. An elevated old copy is replaced by the relaunch, which
            # asks the running older version to shut down.
            $locked = $false
            foreach ($path in $agentPaths) {
                if (!(Test-Path -LiteralPath $path)) { continue }
                $handle = $null
                try { $handle = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
                catch [IO.IOException] { if (!(Move-LockedAside $path)) { $locked = $true } }
                finally { if ($handle) { $handle.Dispose() } }
            }
        }
        if (!$locked) { break }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'PlazCode.exe is still locked. Close other PlazCode windows (including any started as administrator), wait for antivirus scans to finish or restart Windows, then retry. No update files were copied.' }
        if ($ShowProgress) { Set-UpdaterProgress 60 'Waiting for PlazCode to close' 'Finishing process shutdown before replacing files.' }
        Start-Sleep -Milliseconds 250
    } while ($true)
    $copied = 0
    Set-UpdaterProgress 65 'Installing update' 'Replacing application and extension files.'
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($package.Length + 1)
        $target = Join-Path $install $relative
        $written.Add($relative)
        New-Item (Split-Path $target) -ItemType Directory -Force | Out-Null
        Copy-UpdateFile $file.FullName $target
        $copied++
        Set-UpdaterProgress (65 + [int](30 * $copied / [Math]::Max(1, $files.Count))) 'Installing update' ("Replacing files: $copied of $($files.Count).")
    }
    $installed = $true
    Set-UpdaterProgress 98 'Relaunching PlazCode' 'Waiting for the updated desktop to finish loading.'
    Start-UpdatedPlazCode ([string]$next)
    Remove-Item -LiteralPath $failureRecord -Force -ErrorAction SilentlyContinue
    Set-UpdaterProgress 100 'Update complete' 'Reload the extension and refresh your open AI chat tabs.'
    Write-Host "Updated v$current -> v$next. Reload the extension, then refresh open AI chat tabs." -ForegroundColor Green
} catch {
    $failedVersion = if ($ExpectedVersion) { [string]$ExpectedVersion } elseif ($latest) { [string]$latest } else { '' }
    Write-UpdateFailure $failedVersion ([string]$_.Exception.Message) $installed
    if ($installed) { Set-UpdaterProgress -1 'Desktop restart needs attention' 'The update is installed, but startup did not confirm readiness. See logs/agent.log.' }
    else { Set-UpdaterProgress -1 'Restoring installation' 'The update failed. Restoring recovery copies before reporting the error.' }
    if (!$installed) { foreach ($relative in $written) {
        $target = Join-Path $install $relative
        $saved = Join-Path $backup $relative
        try {
            if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination $target -Force }
            else { Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue }
        } catch { Write-Host "Could not restore $relative. Backup retained at $backup" -ForegroundColor Red }
    }
    # A file renamed aside whose replacement was never written goes back in place.
    foreach ($aside in $movedAside) {
        $original = $aside -replace '\.plazcode-old-[0-9a-f]{8}$', ''
        try { if (!(Test-Path -LiteralPath $original) -and (Test-Path -LiteralPath $aside)) { [IO.File]::Move($aside, $original) } }
        catch { Write-Host "Could not restore $original from $aside" -ForegroundColor Red }
    }
    }
    if ($stopped -and !$installed) { if ($BackgroundUpdate) { Start-Process -FilePath (Join-Path $install 'PlazCode.exe') -ArgumentList $(if ($RestoreWindow) { @('--background','--restore-window') } else { '--background' }) -WorkingDirectory $install -ErrorAction SilentlyContinue } else { Start-Process -FilePath (Join-Path $install 'PlazCode.exe') -WorkingDirectory $install -ErrorAction SilentlyContinue } }
    if ($ShowProgress -and !$BackgroundUpdate) { [Windows.Forms.MessageBox]::Show(('Update failed: ' + $_.Exception.Message + [Environment]::NewLine + 'Recovery files: ' + $stage), 'PlazCode updater') | Out-Null }
    if ($uiReady -and $BackgroundUpdate) { [PlazCode.UpdateProgress]::NotifyFailure(); Start-Sleep -Seconds 3 }
    Write-Host ('Update failed: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host "Recovery files: $stage"
    if ($uiReady) { [PlazCode.UpdateProgress]::Close() }
    exit 1
}
if ($uiReady) { [PlazCode.UpdateProgress]::Close() }
# Keep backup for recovery; downloaded/extracted staging files can be removed.
Remove-Item (Join-Path $stage 'unpacked') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $stage 'release.zip') -Force -ErrorAction SilentlyContinue
