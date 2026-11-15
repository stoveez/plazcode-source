#!/bin/sh
# PlazCode for Linux, one-line install (1.24.33, owner: "much more easier and beginner friendly"):
#   curl -fsSL https://raw.githubusercontent.com/stoveez/PlazCode/main/install-linux.sh | sh
# It downloads the official PlazCode for Linux, checks it, puts it in ~/PlazCode (no admin password), adds it to your
# app menu and opens it. Run the same line again to update. To remove PlazCode:
#   curl -fsSL https://raw.githubusercontent.com/stoveez/PlazCode/main/install-linux.sh | sh -s -- --uninstall
# Options: --uninstall, --remove-data (with --uninstall: also delete your PlazCode data), --no-start.
set -eu

FEED="${PLAZCODE_FEED:-https://raw.githubusercontent.com/stoveez/PlazCode/main/latest-linux.json}"
DEST="$HOME/PlazCode"
action=install start=yes remove_data=no
for arg in "$@"; do
  case "$arg" in
    --uninstall) action=uninstall ;;
    --remove-data) remove_data=yes ;;
    --no-start) start=no ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
fail() { printf 'PlazCode: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Close any PlazCode running from ~/PlazCode (it is started again at the end).
stop_running() {
  for proc in /proc/[0-9]*; do
    exe=$(readlink "$proc/exe" 2>/dev/null || true)
    [ "$exe" = "$DEST/PlazCode" ] && kill -TERM "${proc#/proc/}" 2>/dev/null || true
  done
}

if [ "$action" = uninstall ]; then
  [ -x "$DEST/PlazCode" ] || fail "PlazCode is not installed in $DEST."
  stop_running; sleep 1
  "$DEST/PlazCode" --linux-setup uninstall
  if [ "$remove_data" = yes ]; then
    rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/PlazCode" "${XDG_CACHE_HOME:-$HOME/.cache}/PlazCode"
    say "Your PlazCode data is deleted too."
  fi
  exit 0
fi

[ "$(uname -s)" = Linux ] || fail "This installer is for Linux. Windows and Mac downloads: https://github.com/stoveez/PlazCode/releases"
case "$(uname -m)" in x86_64|amd64) ;; *) fail "PlazCode for Linux needs a 64-bit Intel or AMD computer (this one is $(uname -m))." ;; esac
for tool in bash tar sha256sum; do have "$tool" || fail "Please install '$tool' first, then run this again."; done
if have curl; then fetch() { curl -fsSL --retry 2 -o "$2" "$1"; }
elif have wget; then fetch() { wget -q -O "$2" "$1"; }
else fail "Please install curl (or wget) first, then run this again."; fi

# Only the official addresses, over HTTPS (a local test feed on 127.0.0.1 is allowed for PlazCode's own tests).
official() {
  case "$1" in
    https://raw.githubusercontent.com/stoveez/PlazCode/*|https://github.com/stoveez/PlazCode/releases/download/*) return 0 ;;
    http://127.0.0.1:*) [ "${FEED#http://127.0.0.1:}" != "$FEED" ] && return 0 ;;
  esac
  return 1
}
official "$FEED" || fail "Refusing an unofficial update address: $FEED"

work=$(mktemp -d "$HOME/.PlazCode-install.XXXXXX")
trap 'rm -rf "$work"' EXIT INT TERM
say "Checking the latest PlazCode for Linux..."
fetch "$FEED" "$work/feed.json" || fail "Could not reach GitHub. Check your internet connection and try again."
# The feed is written by PlazCode's release tooling with two-space indentation: its own fields are the lines
# indented by exactly two spaces (release notes and the signature are deeper or inside a quoted string).
field() { sed -n "s/^  \"$1\": \"\\([^\"]*\\)\",\\{0,1\\}\$/\\1/p" "$work/feed.json" | head -n1; }
version=$(field version); url=$(field url); sha=$(field sha256)
printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "The release information looks wrong (version)."
printf '%s' "$sha" | grep -Eq '^[0-9a-f]{64}$' || fail "The release information looks wrong (checksum)."
official "$url" || fail "Refusing an unofficial download address: $url"
case "$url" in *.tar.gz) ;; *) fail "The Linux release is not a .tar.gz download." ;; esac

say "Downloading PlazCode $version..."
fetch "$url" "$work/PlazCode.tar.gz" || fail "The download failed. Try again in a minute."
[ "$(sha256sum "$work/PlazCode.tar.gz" | cut -d' ' -f1)" = "$sha" ] || fail "The download does not match its checksum, so nothing was installed. Try again."
# Only plain files and folders under PlazCode/.
tar -tzf "$work/PlazCode.tar.gz" | awk 'BEGIN{bad=0} /(^\/|(^|\/)\.\.(\/|$))/{bad=1} !/^PlazCode(\/|$)/{bad=1} END{exit bad}' || fail "The download contains unexpected files, so nothing was installed."
if tar -tvzf "$work/PlazCode.tar.gz" | grep -q '^[lh]'; then fail "The download contains links, so nothing was installed."; fi
mkdir "$work/x"
tar -xzf "$work/PlazCode.tar.gz" -C "$work/x" --no-same-owner
new="$work/x/PlazCode"
[ -f "$new/PlazCode" ] || fail "The download has no PlazCode program."
chmod 755 "$new/PlazCode"
# Signed releases carry their own file check; development builds have no release key and skip it.
signed=
if "$new/PlazCode" --protection-info 2>/dev/null | grep -Eq '"public_key":"[0-9a-f]{64}"'; then signed=signed; fi

if [ -x "$DEST/PlazCode" ] && [ -f "$DEST/PlazCode-Extension/manifest.json" ]; then
  say "Updating the PlazCode in $DEST (your settings and data stay)..."
  bash "$new/Update-PlazCode-Linux.sh" "$work/PlazCode.tar.gz" "$sha" "$version" 0 none "$DEST" $signed
elif [ -e "$DEST" ]; then
  fail "A different folder named PlazCode is already in your home folder. Rename or move it, then run this again."
else
  if [ -n "$signed" ]; then
    "$new/PlazCode" --verify-package "$new" --verify-version "$version" >/dev/null || fail "The download did not pass PlazCode's file check, so nothing was installed."
  fi
  mv "$new" "$DEST"
  say "PlazCode $version is installed in $DEST."
fi

"$DEST/PlazCode" --linux-setup menu
if [ "$start" = yes ] && { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
  ( cd "$DEST" && if have setsid; then exec setsid "$DEST/PlazCode"; else exec nohup "$DEST/PlazCode"; fi ) </dev/null >/dev/null 2>&1 &
  say "Opening PlazCode. Next, it shows you how to add the browser extension."
else
  say "Open PlazCode from your app menu. It then shows you how to add the browser extension."
fi
