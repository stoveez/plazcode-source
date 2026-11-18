param(
    [string]$RepoRoot = "",
    [string]$PcVaultPath = "C:\Users\plazm\Downloads\PlazCode-Vault\vault",
    [switch]$ForceOverwritePc
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = (git rev-parse --show-toplevel 2>$null)
    if (-not $RepoRoot) { $RepoRoot = (Get-Location).Path }
}
$RepoRoot = (Resolve-Path $RepoRoot).Path

if (-not (Test-Path $PcVaultPath)) {
    throw "PC vault path not found: $PcVaultPath"
}

$syncPath = Join-Path $PcVaultPath ".pc-sync.json"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

# 1. Check whether any tracked file in the PC vault was edited locally since last sync
if ((Test-Path $syncPath) -and (-not $ForceOverwritePc)) {
    $editedOnPc = @()
    Get-Content $syncPath | ForEach-Object {
        if ($_ -match "^([0-9a-f]{64})\s+(.+)$") {
            $expected = $Matches[1]
            $rel = $Matches[2]
            $p = Join-Path $PcVaultPath $rel
            if (Test-Path $p) {
                $actual = (Get-FileHash -Path $p -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($actual -ne $expected) {
                    $editedOnPc += $rel
                }
            }
        }
    }
    if ($editedOnPc.Count -gt 0) {
        Write-Warning "PC vault files modified locally since last sync:"
        $editedOnPc | ForEach-Object { Write-Warning "  $_" }
        throw "Aborting so local Obsidian edits are not overwritten. Merge them back to docs/vault/ first or re-run with -ForceOverwritePc."
    }
}

# 2. Copy docs/vault/*, docs/NOW.md -> NOW.md, CLAUDE.md, and AGENTS.md
Copy-Item -Path (Join-Path $RepoRoot "docs\vault\*") -Destination $PcVaultPath -Recurse -Force
Copy-Item -Path (Join-Path $RepoRoot "docs\NOW.md") -Destination (Join-Path $PcVaultPath "NOW.md") -Force
Copy-Item -Path (Join-Path $RepoRoot "CLAUDE.md") -Destination (Join-Path $PcVaultPath "CLAUDE.md") -Force
Copy-Item -Path (Join-Path $RepoRoot "AGENTS.md") -Destination (Join-Path $PcVaultPath "AGENTS.md") -Force

# 3. Rewrite ../NOW.md -> NOW.md for the PC vault copy only
foreach ($name in @("Home.md", "how-we-work.md")) {
    $p = Join-Path $PcVaultPath $name
    if (Test-Path $p) {
        $text = [System.IO.File]::ReadAllText($p, $utf8NoBom)
        $updated = $text.Replace("../NOW.md", "NOW.md")
        if ($updated -ne $text) {
            [System.IO.File]::WriteAllText($p, $updated, $utf8NoBom)
            Write-Host "Updated NOW.md link in $name"
        }
    }
}

# 4. Rebuild .pc-sync.json and verify 0 mismatches
$prefixLen = $PcVaultPath.TrimEnd('\', '/').Length + 1
$syncLines = Get-ChildItem -Path $PcVaultPath -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($prefixLen)
    -not ($rel -split '[\\/]' | Where-Object { $_.StartsWith('.') })
} | Sort-Object { $_.FullName.Substring($prefixLen).Replace('\', '/') } | ForEach-Object {
    $rel = $_.FullName.Substring($prefixLen).Replace('\', '/')
    $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $rel"
}

[System.IO.File]::WriteAllText($syncPath, (($syncLines -join "`n") + "`n"), $utf8NoBom)

$mismatches = 0
foreach ($line in $syncLines) {
    $parts = $line -split '  ', 2
    $expected = $parts[0]
    $rel = $parts[1]
    $actual = (Get-FileHash -Path (Join-Path $PcVaultPath $rel) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { $mismatches++ }
}

Write-Host "Synced $($syncLines.Count) files to $PcVaultPath (verification mismatches: $mismatches)" -ForegroundColor Green
if ($mismatches -ne 0) { exit 1 }
