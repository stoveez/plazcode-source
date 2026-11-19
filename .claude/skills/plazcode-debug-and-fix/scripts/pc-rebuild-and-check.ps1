param(
    [string]$Version = "",
    [switch]$UpdatePins = $true,
    [string[]]$Tests = @(),
    [switch]$SkipTypes,
    [switch]$SkipPreserve
)

$ErrorActionPreference = "Stop"

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { $repoRoot = (Get-Location).Path }
$repoRoot = (Resolve-Path $repoRoot).Path

if (-not $Version) {
    $devDirs = Get-ChildItem -Path (Join-Path $repoRoot "development") -Directory | Where-Object { $_.Name -match '^\d+(\.\d+)+$' } | Sort-Object {
        [version]($_.Name -replace '[^\d.].*$', '')
    } -Descending
    if (-not $devDirs -or $devDirs.Count -eq 0) {
        throw "Could not find a development/<version> directory under $repoRoot"
    }
    $Version = $devDirs[0].Name
}

$devDir = Join-Path $repoRoot "development\$Version"
$overlayDir = Join-Path $devDir "overlay"
$tsDir = Join-Path $devDir "ts"
$preparePy = Join-Path $devDir "prepare.py"
$buildSource = Join-Path $repoRoot "build-src-$Version\PlazCode"
$nodeModules = Join-Path $buildSource "release-tools\node_modules"

function Invoke-Python {
    param([string[]]$PyArgs)
    if (Get-Command python -ErrorAction SilentlyContinue) {
        & python @PyArgs
    } elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
        & python3 @PyArgs
    } else {
        throw "Neither python nor python3 was found on PATH."
    }
    if ($LASTEXITCODE -ne 0) { throw "Python command failed: $($PyArgs -join ' ')" }
}

Write-Host "=== PlazCode Rebuild & Check (version $Version) ===" -ForegroundColor Cyan

# Ensure build-src and release-tools/node_modules exist so ts/build.cjs and JS tests have typescript/jsdom/acorn
if (-not (Test-Path $buildSource)) {
    Write-Host "[1/6] Initial prepare.py to create $buildSource..."
    Invoke-Python @($preparePy)
} else {
    Write-Host "[1/6] Found $buildSource"
}

if (-not (Test-Path $nodeModules)) {
    Write-Host "[2/6] Installing release-tools npm dependencies..."
    & npm ci --prefix (Join-Path $buildSource "release-tools") --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed in release-tools" }
} else {
    Write-Host "[2/6] Found release-tools/node_modules"
}

$prevNodePath = $env:NODE_PATH
$env:NODE_PATH = $nodeModules

try {
    if (Test-Path (Join-Path $tsDir "build.cjs")) {
        Write-Host "[3/6] Compiling TypeScript -> overlay JS (ts-blank-space)..."
        & node (Join-Path $tsDir "build.cjs")
        if ($LASTEXITCODE -ne 0) { throw "ts/build.cjs failed" }
        if (-not $SkipTypes) {
            Write-Host "      Running tsc typecheck (--types)..."
            & node (Join-Path $tsDir "build.cjs") "--types"
            if ($LASTEXITCODE -ne 0) { throw "ts/build.cjs --types failed" }
        }
    }

    Write-Host "[4/6] Running prepare.py..."
    Invoke-Python @($preparePy)

    if ($UpdatePins) {
        $regPath = Join-Path $overlayDir "test-desktop-regression.js"
        if (Test-Path $regPath) {
            Write-Host "[5/6] Syncing protected file hash pins in overlay/test-desktop-regression.js..."
            $pinScript = @'
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const [regPath, overlayDir, buildSource] = process.argv.slice(2);
let src = fs.readFileSync(regPath, "utf8");
const m = src.match(/(const baseline = \{)([\s\S]*?)(\n\};)/);
if (!m) { console.log("No baseline block found."); process.exit(0); }
function blobSha(p) {
  const body = Buffer.from(fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
  const hdr = Buffer.from("blob " + body.length + "\0");
  return crypto.createHash("sha1").update(hdr).update(body).digest("hex");
}
let changed = 0;
const updatedBody = m[2].replace(/"([^"]+)":\s*"([0-9a-f]{40})"/g, (full, rel, oldHash) => {
  const ov = path.join(overlayDir, rel);
  const bs = path.join(buildSource, rel);
  const target = fs.existsSync(ov) ? ov : (fs.existsSync(bs) ? bs : null);
  if (!target) return full;
  const actual = blobSha(target);
  if (actual !== oldHash) {
    changed++;
    console.log("  updated pin " + rel + ": " + oldHash.slice(0, 7) + " -> " + actual.slice(0, 7));
    return `"${rel}": "${actual}"`;
  }
  return full;
});
if (changed > 0) {
  fs.writeFileSync(regPath, src.slice(0, m.index) + m[1] + updatedBody + m[3] + src.slice(m.index + m[0].length), "utf8");
}
console.log("PIN_CHANGES=" + changed);
'@
            $pinOut = $pinScript | & node - $regPath $overlayDir $buildSource
            $pinOut | ForEach-Object { Write-Host $_ }
            if ($LASTEXITCODE -ne 0) { throw "Pin sync failed" }
            if ($pinOut -match "PIN_CHANGES=([1-9]\d*)") {
                Write-Host "      Re-running prepare.py after pin updates..."
                Invoke-Python @($preparePy)
            }
        }
    } else {
        Write-Host "[5/6] Skipping hash pin auto-update (-UpdatePins:`$false)"
    }

    Write-Host "[6/6] Running verification tests from $buildSource..."
    $defaultTests = @("test-typescript-sources.js", "test-main-scope.js", "test-desktop-regression.js")
    if (-not $SkipPreserve) { $defaultTests += "test-provider-preservation.js" }
    $allTests = @()
    foreach ($t in ($defaultTests + $Tests)) {
        if ($t -and -not ($allTests -contains $t)) { $allTests += $t }
    }

    Push-Location $buildSource
    try {
        foreach ($t in $allTests) {
            if (-not (Test-Path $t)) {
                Write-Warning "Test file not found in ${buildSource}: $t"
                continue
            }
            Write-Host "  -> node $t" -ForegroundColor Yellow
            & node $t
            if ($LASTEXITCODE -ne 0) { throw "Test failed: $t" }
        }
    } finally {
        Pop-Location
    }

    Write-Host "ALL CHECKS PASSED." -ForegroundColor Green
} finally {
    $env:NODE_PATH = $prevNodePath
}
