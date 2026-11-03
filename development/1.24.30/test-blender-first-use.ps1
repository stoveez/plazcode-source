param([Parameter(Mandatory=$true)][string]$Package)
$ErrorActionPreference = 'Stop'
$RuntimeTestRoot = Join-Path $env:RUNNER_TEMP ('plazcode-first-use-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $RuntimeTestRoot | Out-Null
Expand-Archive -LiteralPath $Package -DestinationPath $RuntimeTestRoot
$AppRoot = Join-Path $RuntimeTestRoot 'PlazCode'
$RuntimeCache = Join-Path $RuntimeTestRoot 'fresh local data'
$UserRoot = Join-Path $RuntimeTestRoot 'fresh user'
$SystemOnlyPath = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
$EmptyUvRoot = Join-Path $RuntimeTestRoot 'no UV here'
foreach ($Folder in @($RuntimeCache, $UserRoot, $EmptyUvRoot)) { New-Item -ItemType Directory -Path $Folder | Out-Null }
if (Test-Path (Join-Path $AppRoot 'runtimes/uv/uvx.exe')) { throw 'This test requires UV to be absent from the application as well.' }
$ServerEnv = @{
    PATH = $SystemOnlyPath
    UV_INSTALL_DIR = $EmptyUvRoot
    UV_CACHE_DIR = (Join-Path $RuntimeTestRoot 'package cache')
    UV_NO_BUILD_PACKAGE = 'cryptography'
    DISABLE_TELEMETRY = 'true'
    BLENDER_HOST = '127.0.0.1'
    BLENDER_PORT = '19876'
}
@{mcpServers=@{blender=@{command='uvx';args=@('--from','mcp-for-blender==2.1.9','mcp-for-blender');env=$ServerEnv}}} |
    ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $AppRoot 'config.json') -Encoding UTF8

$Info = New-Object System.Diagnostics.ProcessStartInfo
$Info.FileName = Join-Path $AppRoot 'PlazCode.exe'
$Info.Arguments = '--headless --workspace "' + (Join-Path $RuntimeTestRoot 'workspace') + '"'
$Info.WorkingDirectory = $AppRoot
$Info.UseShellExecute = $false
$Info.CreateNoWindow = $true
$Info.RedirectStandardOutput = $true
$Info.RedirectStandardError = $true
$Info.EnvironmentVariables['LOCALAPPDATA'] = $RuntimeCache
$Info.EnvironmentVariables['APPDATA'] = (Join-Path $RuntimeTestRoot 'fresh roaming data')
$Info.EnvironmentVariables['USERPROFILE'] = $UserRoot
$Info.EnvironmentVariables['PATH'] = $SystemOnlyPath
$Info.EnvironmentVariables['UV_INSTALL_DIR'] = $EmptyUvRoot
$App = New-Object System.Diagnostics.Process
$App.StartInfo = $Info
$LastServers = $null
try {
    if (-not $App.Start()) { throw 'The packaged application did not start.' }
    $Output = $App.StandardOutput.ReadToEndAsync()
    $Errors = $App.StandardError.ReadToEndAsync()
    $Deadline = [DateTime]::UtcNow.AddMinutes(8)
    $Ready = $false
    $KeyFile = Join-Path $RuntimeCache 'PlazCode/bridge-key'
    while ([DateTime]::UtcNow -lt $Deadline -and -not $App.HasExited) {
        if (Test-Path -LiteralPath $KeyFile) {
            $Key = (Get-Content -LiteralPath $KeyFile -Raw).Trim()
            try {
                $State = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/desktop/state' -Headers @{Authorization=('Bearer ' + $Key)} -TimeoutSec 3
                $LastServers = $State.servers | Select-Object id,alive,tools,error
                $Blender = $State.servers | Where-Object id -eq 'blender'
                if ($Blender.alive -and $Blender.tools -gt 0) { $Ready = $true; break }
            } catch { }
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $Ready) {
        $SafeStatus = $LastServers | ConvertTo-Json -Compress
        throw "Clean first-use setup did not complete. Server status: $SafeStatus"
    }
    $Installed = Join-Path $RuntimeCache 'PlazCode/runtimes/uv-0.12.21'
    foreach ($File in @('uv.exe','uvx.exe','.complete')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Installed $File) -PathType Leaf)) { throw "Automatic setup did not install $File in the fresh cache." }
    }
    $ExpectedHash = '8c7c3eb32d84c711906dedd09df7379cf4d9f5bb84b8e58a1244ca0a8a1209d4'
    if ((Get-Content -LiteralPath (Join-Path $Installed '.complete') -Raw).Trim() -ne $ExpectedHash) { throw 'The installed runtime was not the pinned verified download.' }
    & (Join-Path $Installed 'uv.exe') --version
    if ($LASTEXITCODE -ne 0) { throw 'The automatically installed UV executable could not run.' }
    Write-Host ('PASS: signed Windows app automatically installed UV from an empty cache without UV on PATH and initialized ' + $Blender.tools + ' Blender MCP tools. No Blender scene was edited.')
} finally {
    if ($App.Id -and -not $App.HasExited) {
        & "$env:SystemRoot\System32\taskkill.exe" /PID $App.Id /T /F | Out-Null
    }
    $App.Dispose()
}
