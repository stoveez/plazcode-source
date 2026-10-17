"""Extract the immutable verified source baseline and overlay reviewed changes."""
from pathlib import Path
import hashlib,zipfile,shutil,json
root=Path(__file__).resolve().parents[2]
archive=root/'PlazCode-source-1.23.0.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='c9fb6ac55f6399f150680a0bb7bb94e23cee876c277756743f16f61484db7996','Source baseline checksum mismatch'
destination=root/'build-src'
with zipfile.ZipFile(archive) as z:
 for name in z.namelist():
  path=Path(name)
  assert not path.is_absolute() and '..' not in path.parts,'Unsafe archive path'
 z.extractall(destination)
source=destination/'PlazCode'
for path in (Path(__file__).parent/'overlay').rglob('*'):
 if path.is_file():
  target=source/path.relative_to(Path(__file__).parent/'overlay');target.parent.mkdir(parents=True,exist_ok=True)
  # Git on Windows may use autocrlf; embedded source and extraction fixtures
  # must have the same line endings on every host. Do not alter binary assets.
  if path.suffix in {".js",".cjs",".rs",".html",".luau",".json",".py",".toml",".lock",".command"}:target.write_bytes(path.read_bytes().replace(b"\r\n",b"\n"))
  else:shutil.copy2(path,target)
  if path.suffix==".command":target.chmod(0o755)
# Keep the supplied third-party reference pack intact and separate from GPL code.
starter_archive=Path(__file__).with_name('syphodev-starter-skills.zip')
assert hashlib.sha256(starter_archive.read_bytes()).hexdigest()=='14c07a4db8f28c6cfbd38d6ae1f66f7dcfd94c7ae4a889789729e8e612119250','Starter pack checksum mismatch'
starter=source/'PlazCode-Extension/starter-skills/syphodev';starter.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(starter_archive) as z:
 for info in z.infolist():
  path=Path(info.filename);assert not path.is_absolute() and '..' not in path.parts
  relative=path.relative_to('roblox-ai-skills-main')
  assert not relative.as_posix().endswith('/LOCAL.md')
  if info.is_dir():continue
  target=starter/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(info))
(starter/'PLAZCODE-ADAPTER.md').write_text('SyphoDev Roblox Skills, redistributed free as PlazCode starter references. Source: https://www.youtube.com/@SyphoDev . Original LICENSE.txt applies to this pack; it is not relicensed under PlazCode GPL. Fonts and external tools keep their own terms.\n\nRead full instructions and required references through plazcode_skills read. Resolve relative helper paths against bundle_root. Adapt Claude Code names and sub-agent instructions to actual available PlazCode tools; do not claim unavailable capabilities. Personal LOCAL.md, credentials and generated assets belong in the current project, outside this update-managed pack. If a helper expects LOCAL.md next to its own skill, copy that skill and its required references into a project-owned working directory and configure the copy there. Never edit the bundled reference pack. Helpers are never automatically executed by importing a skill.\n', encoding='utf-8', newline='\n')
(starter/'skills/roblox-ui/references/fonts/OFL.txt').write_bytes(Path(__file__).with_name('font-OFL.txt').read_bytes().replace(b'\r\n',b'\n'))
# Desktop embeds the nested compatibility extension. Keep both byte-identical.
for folder in ['core','providers']:
 shutil.copytree(source/folder,source/'PlazCode-Extension'/folder,dirs_exist_ok=True)
for name in ['manifest.json','background.js']:
 shutil.copy2(source/name,source/'PlazCode-Extension'/name)
assert json.loads((source/'manifest.json').read_text())['version']=='1.24.1'
print(source)
