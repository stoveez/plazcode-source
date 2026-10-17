#!/bin/bash
set -euo pipefail
root=$(cd -- "${6:-$(dirname -- "$0")}" && pwd)
version_order(){
 /usr/bin/awk -v left="$1" -v right="$2" 'BEGIN{split(left,a,".");split(right,b,".");for(i=1;i<=3;i++){if(a[i]+0<b[i]+0){print -1;exit}if(a[i]+0>b[i]+0){print 1;exit}}print 0}'
}
zip=${1:?Update ZIP path required}
expectedhash=${2:?Checksum required}
version=${3:?Version required}
pid=${4:?Running process required}
mode=${5:-foreground}
restore_args=();[[ "$mode" == restore ]]&&restore_args=(--restore-window)&&mode=background
relaunch(){ if [[ "$mode" == background ]];then /usr/bin/open -g "$root/PlazCode.app" --args --background ${restore_args[@]+"${restore_args[@]}"};else /usr/bin/open "$root/PlazCode.app";fi; }
relaunch_updated(){
 local ready="$stage/desktop-ready.json" attempt tick child
 for attempt in 1 2;do
  /bin/rm -f "$ready"
  if [[ "$mode" == background ]];then /usr/bin/open -n -g "$root/PlazCode.app" --args --background ${restore_args[@]+"${restore_args[@]}"} --update-ready-file "$ready";else /usr/bin/open -n "$root/PlazCode.app" --args --update-ready-file "$ready";fi
  for ((tick=0;tick<250;tick++));do
   if [[ -f "$ready" ]] && [[ "$(/usr/bin/plutil -extract version raw -o - "$ready" 2>/dev/null)" == "$version" ]] && [[ "$(/usr/bin/plutil -extract desktop_ready raw -o - "$ready" 2>/dev/null)" == true ]];then
    child=$(/usr/bin/plutil -extract pid raw -o - "$ready")
    if [[ "$(/bin/ps -ww -p "$child" -o comm=)" == "$root/PlazCode.app/Contents/MacOS/PlazCode" ]];then return 0;fi
   fi
   if ((tick>=20 && tick%10==0)) && ! /bin/ps -ax -o comm= | /usr/bin/grep -Fx "$root/PlazCode.app/Contents/MacOS/PlazCode" >/dev/null;then break;fi
   /bin/sleep .1
  done
  # Retry only after an exited launch, never create a second running desktop.
  if /bin/ps -ax -o comm= | /usr/bin/grep -Fx "$root/PlazCode.app/Contents/MacOS/PlazCode" >/dev/null;then break;fi
 done
 echo "The update is installed, but desktop startup did not confirm readiness. See $HOME/Library/Application Support/PlazCode/logs/agent.log and updater.log." >&2
 return 1
}
[[ "$expectedhash" =~ ^[a-fA-F0-9]{64}$ && "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$pid" =~ ^[0-9]+$ ]] || exit 2
[[ "$(/usr/bin/shasum -a 256 "$zip" | /usr/bin/awk '{print $1}')" == "$expectedhash" ]] || { echo 'Update checksum mismatch. Installation unchanged.' >&2; exit 3; }
# Reject traversal, absolute paths, symlinks and unexpected package roots before extraction.
/usr/bin/unzip -Z -1 "$zip" | /usr/bin/awk 'BEGIN{bad=0} /(^\/|\\|(^|\/)\.\.(\/|$)|:)/{bad=1} !/^PlazCode\//{bad=1} END{exit bad}'
if /usr/bin/unzip -Z -l "$zip" | /usr/bin/grep -q '^l'; then echo 'Symlinks are not accepted in updates.' >&2; exit 4; fi
stage=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/PlazCode-update.XXXXXX")
backup="$stage/backup";mkdir -p "$backup"
/usr/bin/ditto -x -k "$zip" "$stage/extracted"
source="$stage/extracted/PlazCode"
[[ "$(/usr/bin/plutil -extract version raw -o - "$source/PlazCode-Extension/manifest.json")" == "$version" ]]
nativeversion=$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$source/PlazCode.app/Contents/Info.plist")
installednative=$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$root/PlazCode.app/Contents/Info.plist")
[[ "$nativeversion" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$installednative" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
# Extension-only updates may retain the signed native app; never downgrade it.
[[ "$(version_order "$installednative" "$nativeversion")" != 1 && "$(version_order "$nativeversion" "$version")" != 1 ]]
/usr/bin/file "$source/PlazCode.app/Contents/MacOS/PlazCode" | /usr/bin/grep -q 'Mach-O'
/usr/bin/codesign --verify --deep --strict "$source/PlazCode.app"
[[ "$(/bin/ps -ww -p "$pid" -o comm=)" == "$root/PlazCode.app/Contents/MacOS/PlazCode" ]] || { echo 'Running installation changed. Retry from the app.' >&2; exit 5; }
if [[ "$mode" == background ]];then /usr/bin/osascript -e 'display notification "PlazCode is installing an update and will restart in the background." with title "PlazCode update"' || true;fi
/bin/kill -TERM "$pid"
for ((attempt=0;attempt<100;attempt++));do if ! /bin/kill -0 "$pid" 2>/dev/null;then break;fi;/bin/sleep .1;done
if /bin/kill -0 "$pid" 2>/dev/null;then echo 'PlazCode did not exit. Installation unchanged.' >&2;exit 6;fi
rollback(){
 for name in PlazCode.app PlazCode-Extension;do
  if [[ -e "$backup/$name" ]];then
   if [[ -e "$root/$name" ]];then /bin/mv "$root/$name" "$stage/failed-$name";fi
   /bin/mv "$backup/$name" "$root/$name"
  fi
 done
 relaunch || true
 echo "Update failed; restored installation. Diagnostic files: $stage" >&2
}
trap rollback ERR
for name in PlazCode.app PlazCode-Extension;do
 [[ ! -e "$root/$name" ]] || /bin/mv "$root/$name" "$backup/$name"
 /bin/mv "$source/$name" "$root/$name"
done
# Only owned launchers/docs are refreshed; settings, MCP configuration and user data are preserved.
for name in MacOS_Setup.command Start-PlazCode.command Update-PlazCode.command Configure-MacOS-Updates.command UPDATE.txt README.md release-notes.json;do
 if [[ -f "$source/$name" ]];then /bin/cp "$source/$name" "$root/$name";fi
done
/bin/chmod 755 "$root/PlazCode.app/Contents/MacOS/PlazCode" "$root/Start-PlazCode.command" "$root/MacOS_Setup.command" "$root/Update-PlazCode.command"
/bin/bash "$root/Configure-MacOS-Updates.command"
# File installation succeeded: a startup timeout must not replace a running
# updated app with the backup or undo a successfully installed release.
trap - ERR
relaunch_updated
echo 'Update installed. Reload the extension and refresh open AI tabs.'
