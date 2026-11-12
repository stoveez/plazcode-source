"""1.24.33: the Mac package refuses an app that would not open on macOS 10.15 Catalina."""
from pathlib import Path
import struct, sys, tempfile, zipfile, plistlib

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import macos_floor  # noqa: E402

def thin(cpu, command, version):
    major, minor = version
    packed = (major << 16) | (minor << 8)
    if command == 'build':
        load = struct.pack('<IIIIII', macos_floor.LC_BUILD_VERSION, 24, macos_floor.PLATFORM_MACOS, packed, packed, 0)
    else:
        load = struct.pack('<IIII', macos_floor.LC_VERSION_MIN_MACOSX, 16, packed, packed)
    header = struct.pack('<IiiIIIII', 0xFEEDFACF, cpu, 3, 2, 1, len(load), 0, 0)
    return header + load

def universal(*parts):
    offset = 4096
    table, body = b'', b''
    for cpu, data in parts:
        table += struct.pack('>iiIII', cpu, 3, offset + len(body), len(data), 12)
        body += data + b'\0' * (-len(data) % 4096)
    head = b'\xca\xfe\xba\xbe' + struct.pack('>I', len(parts)) + table
    return head + b'\0' * (offset - len(head)) + body

with tempfile.TemporaryDirectory() as folder:
    folder = Path(folder)
    good = folder / 'good'
    good.write_bytes(universal((0x01000007, thin(0x01000007, 'build', (10, 15))), (0x0100000C, thin(0x0100000C, 'build', (11, 0)))))
    assert macos_floor.minimum_versions(good) == {'x86_64': (10, 15), 'arm64': (11, 0)}, macos_floor.minimum_versions(good)
    old = folder / 'old-style'
    old.write_bytes(thin(0x01000007, 'min', (10, 12)))
    assert macos_floor.minimum_versions(old) == {'x86_64': (10, 12)}
    bad = folder / 'bad'
    bad.write_bytes(universal((0x01000007, thin(0x01000007, 'build', (11, 0))), (0x0100000C, thin(0x0100000C, 'build', (11, 0)))))
    floors = macos_floor.minimum_versions(bad)
    assert not macos_floor.at_most(floors['x86_64'], (10, 15)), 'an Intel half built for macOS 11 must be refused'
    assert macos_floor.at_most((10, 15), (10, 15)) and macos_floor.at_most((10, 12), (10, 15)) and not macos_floor.at_most(None, (10, 15))

# The real 1.23.0 baseline: its app said 11.0 in Info.plist (why Catalina refused it), and the memory helper
# (Go 1.25) needs macOS 12, which is why engram.rs switches memory off below 12.
baseline = HERE.parents[1] / 'PlazCode-macOS-1.23.0.zip'
if baseline.is_file():
    with zipfile.ZipFile(baseline) as archive, tempfile.TemporaryDirectory() as folder:
        plist = plistlib.loads(archive.read('PlazCode/PlazCode.app/Contents/Info.plist'))
        assert plist['LSMinimumSystemVersion'] == '11.0'
        app = Path(folder) / 'app'
        app.write_bytes(archive.read('PlazCode/PlazCode.app/Contents/MacOS/PlazCode'))
        assert macos_floor.minimum_versions(app) == {'x86_64': (10, 12), 'arm64': (11, 0)}, macos_floor.minimum_versions(app)
        for arch in ['amd64', 'arm64']:
            helper = Path(folder) / arch
            helper.write_bytes(archive.read(f'PlazCode/PlazCode.app/Contents/Resources/engram/engram-darwin-{arch}'))
            assert list(macos_floor.minimum_versions(helper).values()) == [(12, 0)]

package = (HERE / 'package.py').read_text(encoding='utf-8')
assert "value['LSMinimumSystemVersion']='10.15'" in package and 'macos_floor.minimum_versions' in package
workflow = (HERE.parents[1] / '.github/workflows/validate-1.24.33.yml').read_text(encoding='utf-8')
assert 'MACOSX_DEPLOYMENT_TARGET=10.15 cargo +stable build --release --locked --manifest-path agent/Cargo.toml --target x86_64-apple-darwin' in workflow
print('macOS 10.15 floor: package check, Intel build target and baseline facts passed.')
