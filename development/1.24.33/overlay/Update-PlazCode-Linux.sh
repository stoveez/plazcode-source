#!/usr/bin/env bash
# PlazCode for Linux: install a downloaded update (1.24.33, owner: Linux automatic updates and a one-line installer).
# Used by the app's updater and by install-linux.sh when PlazCode is already installed.
#   Update-PlazCode-Linux.sh <archive.tar.gz> <sha256> <version> <pid|0> <foreground|background|restore|none> <install folder> [signed]
# pid 0: close any PlazCode running from the install folder (the installer does not know its process).
# Mode none: do not start PlazCode afterwards (the installer starts it itself).
# Your settings, skills, notes and data stay: only PlazCode's own program folders and helper files are replaced, the
# old ones are kept until the new ones are in place, and anything that fails puts the old ones back.
set -euo pipefail
archive=${1:?Update archive required}
expectedhash=${2:?Checksum required}
version=${3:?Version required}
pid=${4:?Running process required}
mode=${5:-foreground}
root=$(cd -- "${6:?Install folder required}" && pwd -P)
signed=${7:-}
[[ "$expectedhash" =~ ^[a-fA-F0-9]{64}$ && "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$pid" =~ ^[0-9]+$ ]] || { echo 'Invalid update arguments.' >&2; exit 2; }
[[ "$mode" =~ ^(foreground|background|restore|none)$ ]] || { echo 'Invalid update mode.' >&2; exit 2; }
version_order(){ awk -v left="$1" -v right="$2" 'BEGIN{split(left,a,".");split(right,b,".");for(i=1;i<=3;i++){if(a[i]+0<b[i]+0){print -1;exit}if(a[i]+0>b[i]+0){print 1;exit}}print 0}'; }
json_version(){ sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9][0-9.]*\)".*/\1/p' "$1" | head -n1; }
[[ "$(sha256sum "$archive" | awk '{print $1}')" == "${expectedhash,,}" ]] || { echo 'Update checksum mismatch. Installation unchanged.' >&2; exit 3; }
# Only plain files and folders under PlazCode/: no absolute paths, no "..", no links.
tar -tzf "$archive" | awk 'BEGIN{bad=0} /(^\/|(^|\/)\.\.(\/|$))/{bad=1} !/^PlazCode(\/|$)/{bad=1} END{exit bad}' || { echo 'The update contains unexpected paths. Installation unchanged.' >&2; exit 4; }
if tar -tvzf "$archive" | grep -q '^[lh]'; then echo 'Links are not accepted in updates. Installation unchanged.' >&2; exit 4; fi
stage=$(mktemp -d "$(dirname -- "$root")/.PlazCode-update.XXXXXX")
backup="$stage/backup"; mkdir -p "$backup" "$stage/extracted"
tar -xzf "$archive" -C "$stage/extracted" --no-same-owner
source="$stage/extracted/PlazCode"
[[ -f "$source/PlazCode" && "$(head -c4 "$source/PlazCode" | od -An -tx1 | tr -d ' \n')" == 7f454c46 ]] || { echo 'The update has no Linux PlazCode program. Installation unchanged.' >&2; exit 4; }
chmod 755 "$source/PlazCode"
if [[ "$signed" == signed || -f "$root/PlazCode-Extension/plazcode-installation-integrity.json" ]]; then
 verified=0
 for wait in 0 3 8; do
  [[ "$wait" == 0 ]] || { echo "Package check did not pass yet; checking again in $wait seconds."; sleep "$wait"; }
  if "$root/PlazCode" --verify-package "$source" --verify-version "$version"; then verified=1; break; fi
 done
 [[ "$verified" == 1 ]] || { echo 'Release signature or file verification failed. Installation unchanged.' >&2; exit 1; }
fi
[[ "$(json_version "$source/PlazCode-Extension/manifest.json")" == "$version" ]] || { echo 'The update does not carry the expected version. Installation unchanged.' >&2; exit 4; }
nativeversion=$("$source/PlazCode" --version | awk '{print $NF}')
installednative=$("$root/PlazCode" --version 2>/dev/null | awk '{print $NF}' || true)
[[ "$nativeversion" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'The new program did not start. Installation unchanged.' >&2; exit 4; }
# Never downgrade the program; the program never claims a newer version than the release.
[[ ! "$installednative" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ || "$(version_order "$installednative" "$nativeversion")" != 1 ]] || { echo 'Refusing to install an older PlazCode. Installation unchanged.' >&2; exit 4; }
[[ "$(version_order "$nativeversion" "$version")" != 1 ]] || exit 4
# A process that has finished but was not collected by its parent yet ("zombie") counts as closed.
alive(){ [[ -r "/proc/$1/stat" ]] && [[ "$(sed 's/^.*) //' "/proc/$1/stat" 2>/dev/null | cut -d' ' -f1)" != Z ]]; }
running_here(){ local exe; for proc in /proc/[0-9]*; do exe=$(readlink "$proc/exe" 2>/dev/null || true); [[ "$exe" == "$root/PlazCode" ]] && alive "${proc#/proc/}" && echo "${proc#/proc/}"; done; return 0; }
was_running=0
if [[ "$pid" != 0 ]]; then
 [[ "$(readlink "/proc/$pid/exe" 2>/dev/null || true)" == "$root/PlazCode" ]] || { echo 'Running installation changed. Retry from the app.' >&2; exit 5; }
 pids=$pid
else
 pids=$(running_here)
fi
for one in $pids; do was_running=1; kill -TERM "$one" 2>/dev/null || true; done
for one in $pids; do
 for ((attempt=0;attempt<100;attempt++)); do alive "$one" || break; sleep .1; done
 # Still open after ten seconds: close it for good, but only if it is still this installation's PlazCode.
 if alive "$one" && [[ "$(readlink "/proc/$one/exe" 2>/dev/null || true)" == "$root/PlazCode" ]]; then
  kill -KILL "$one" 2>/dev/null || true
  for ((attempt=0;attempt<50;attempt++)); do alive "$one" || break; sleep .1; done
 fi
 if alive "$one"; then
  echo "PlazCode did not close. Installation unchanged. ($(ps -o pid=,stat=,args= -p "$one" 2>/dev/null | head -c 300))" >&2; exit 6
 fi
done
# Start PlazCode fully detached: its own session (closing a terminal or this script never stops it) and no
# inherited output, so nothing waits on it.
launch(){ ( cd "$root" && if command -v setsid >/dev/null 2>&1; then exec setsid "$root/PlazCode" "$@"; else exec nohup "$root/PlazCode" "$@"; fi ) </dev/null >/dev/null 2>&1 & }
start_app(){
 local ready="$stage/desktop-ready.json" args=()
 case "$mode" in background) args=(--background);; restore) args=(--background --restore-window);; esac
 rm -f "$ready"
 launch "${args[@]}" --update-ready-file "$ready"
 for ((tick=0;tick<250;tick++)); do
  if [[ -f "$ready" ]] && [[ "$(json_version "$ready")" == "$version" ]] && grep -q '"desktop_ready":true' "$ready"; then
   child=$(sed -n 's/.*"pid":\([0-9][0-9]*\).*/\1/p' "$ready")
   [[ "$(readlink "/proc/$child/exe" 2>/dev/null || true)" == "$root/PlazCode" ]] && return 0
  fi
  sleep .1
 done
 echo "The update is installed, but PlazCode did not confirm it started. See $HOME/.config/PlazCode/logs." >&2
 return 1
}
: > "$stage/installed-list"
rollback(){
 while IFS= read -r name; do
  if [[ -e "$root/$name" ]]; then mv "$root/$name" "$stage/failed-$name"; fi
  if [[ -e "$backup/$name" ]]; then mv "$backup/$name" "$root/$name"; fi
 done < "$stage/installed-list"
 if [[ "$was_running" == 1 && "$mode" != none ]]; then launch || true; fi
 echo "Update failed; restored installation. Diagnostic files: $stage" >&2
}
install_owned(){
 local name="$1"
 [[ -e "$source/$name" ]] || return 0
 [[ ! -e "$root/$name" ]] || mv "$root/$name" "$backup/$name"
 echo "$name" >> "$stage/installed-list"
 mv "$source/$name" "$root/$name"
}
trap rollback ERR
for name in PlazCode PlazCode-Extension PlazCode-Extension-Firefox core providers runtime ui agent; do install_owned "$name"; done
# Refresh only program helpers and release documents. User settings, skills, notes and caches stay in place.
for candidate in "$source"/*; do
 [[ -f "$candidate" ]] || continue
 name="${candidate##*/}"
 case "$name" in
  *.js|*.cjs|*.py|*.sh|manifest.json|overlay.css|popup.html|ollama.html|icon.png|plazcode-extension-integrity.json|UPDATE.txt|README.md|release-notes.json|LICENSE|*NOTICE*.txt|SOURCE.txt|SHA256SUMS.txt)
   install_owned "$name";;
 esac
done
chmod 755 "$root/PlazCode" "$root/Update-PlazCode-Linux.sh" 2>/dev/null || chmod 755 "$root/PlazCode"
trap - ERR
# Files are installed: a slow start must not undo a successful update.
if [[ "$mode" != none ]]; then start_app || exit 7; fi
rm -rf "$stage"
echo "PlazCode $version is installed. Reload the extension and refresh open AI tabs."
