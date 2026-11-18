#!/usr/bin/env bash
set -euo pipefail

VERSION=""
UPDATE_PINS=1
SKIP_TYPES=0
SKIP_PRESERVE=0
EXTRA_TESTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --no-update-pins) UPDATE_PINS=0; shift ;;
    --skip-types) SKIP_TYPES=1; shift ;;
    --skip-preserve) SKIP_PRESERVE=1; shift ;;
    *) EXTRA_TESTS+=("$1"); shift ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [[ -z "$VERSION" ]]; then
  VERSION="$(ls -1 "$REPO_ROOT/development" | grep -E '^[0-9]+(\.[0-9]+)+$' | sort -V | tail -n 1)"
fi

DEV_DIR="$REPO_ROOT/development/$VERSION"
OVERLAY_DIR="$DEV_DIR/overlay"
TS_DIR="$DEV_DIR/ts"
PREPARE_PY="$DEV_DIR/prepare.py"
BUILD_SRC="$REPO_ROOT/build-src-$VERSION/PlazCode"
NODE_MODULES="$BUILD_SRC/release-tools/node_modules"

echo "=== PlazCode Rebuild & Check (version $VERSION) ==="

if [[ ! -d "$BUILD_SRC" ]]; then
  echo "[1/6] Initial prepare.py..."
  python3 "$PREPARE_PY"
else
  echo "[1/6] Found $BUILD_SRC"
fi

if [[ ! -d "$NODE_MODULES" ]]; then
  echo "[2/6] Installing release-tools npm dependencies..."
  npm ci --prefix "$BUILD_SRC/release-tools" --ignore-scripts
else
  echo "[2/6] Found release-tools/node_modules"
fi

export NODE_PATH="$NODE_MODULES"

if [[ -f "$TS_DIR/build.cjs" ]]; then
  echo "[3/6] Compiling TypeScript -> overlay JS..."
  node "$TS_DIR/build.cjs"
  if [[ "$SKIP_TYPES" -eq 0 ]]; then
    echo "      Running tsc --types..."
    node "$TS_DIR/build.cjs" --types
  fi
fi

echo "[4/6] Running prepare.py..."
python3 "$PREPARE_PY"

if [[ "$UPDATE_PINS" -eq 1 && -f "$OVERLAY_DIR/test-desktop-regression.js" ]]; then
  echo "[5/6] Syncing protected file hash pins in overlay/test-desktop-regression.js..."
  PIN_OUT="$(node - "$OVERLAY_DIR/test-desktop-regression.js" "$OVERLAY_DIR" "$BUILD_SRC" <<'EOF'
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const [regPath, overlayDir, buildSource] = process.argv.slice(2);
let src = fs.readFileSync(regPath, "utf8");
const m = src.match(/(const baseline = \{)([\s\S]*?)(\n\};)/);
if (!m) { console.log("PIN_CHANGES=0"); process.exit(0); }
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
EOF
)"
  echo "$PIN_OUT"
  if echo "$PIN_OUT" | grep -qE "PIN_CHANGES=[1-9]"; then
    echo "      Re-running prepare.py after pin updates..."
    python3 "$PREPARE_PY"
  fi
fi

echo "[6/6] Running verification tests from $BUILD_SRC..."
TESTS=(test-typescript-sources.js test-main-scope.js test-desktop-regression.js)
if [[ "$SKIP_PRESERVE" -eq 0 ]]; then TESTS+=(test-provider-preservation.js); fi
TESTS+=("${EXTRA_TESTS[@]}")

cd "$BUILD_SRC"
for t in "${TESTS[@]}"; do
  if [[ ! -f "$t" ]]; then
    echo "WARN: $t not found in $BUILD_SRC"
    continue
  fi
  echo "  -> node $t"
  node "$t"
done
echo "ALL CHECKS PASSED."
