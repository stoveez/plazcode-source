"""Read the oldest macOS version each part of a Mac program says it runs on.

1.24.33 (owner: support macOS 10.15 Catalina). package.py uses this to refuse a Mac package whose Intel half would
not open on 10.15, so a future compiler default can never quietly raise the floor again. Reads the Mach-O load
commands directly (LC_BUILD_VERSION, or LC_VERSION_MIN_MACOSX for older targets), so it needs no Apple tools and
its test runs on any system.
"""
from pathlib import Path
import struct

CPU = {0x01000007: 'x86_64', 0x0100000C: 'arm64'}
LC_VERSION_MIN_MACOSX = 0x24
LC_BUILD_VERSION = 0x32
PLATFORM_MACOS = 1


def _version(packed):
    return (packed >> 16, (packed >> 8) & 0xFF)


def _slice(data, offset):
    magic, cputype = struct.unpack_from('<Ii', data, offset)
    if magic != 0xFEEDFACF:
        raise ValueError('not a 64-bit Mach-O program')
    ncmds = struct.unpack_from('<I', data, offset + 16)[0]
    position = offset + 32
    found = None
    for _ in range(ncmds):
        command, size = struct.unpack_from('<II', data, position)
        if command == LC_BUILD_VERSION and struct.unpack_from('<I', data, position + 8)[0] == PLATFORM_MACOS:
            found = _version(struct.unpack_from('<I', data, position + 12)[0])
        elif command == LC_VERSION_MIN_MACOSX and found is None:
            found = _version(struct.unpack_from('<I', data, position + 8)[0])
        position += size
    return CPU.get(cputype & 0xFFFFFFFF, hex(cputype & 0xFFFFFFFF)), found


def minimum_versions(path):
    """Return {'x86_64': (10, 15), 'arm64': (11, 0)} for a universal or single-architecture program."""
    data = Path(path).read_bytes()
    if data[:4] == b'\xca\xfe\xba\xbe':
        count = struct.unpack_from('>I', data, 4)[0]
        slices = [struct.unpack_from('>iiIII', data, 8 + 20 * index)[2] for index in range(count)]
    else:
        slices = [0]
    return dict(_slice(data, offset) for offset in slices)


def at_most(found, limit):
    return found is not None and tuple(found) <= tuple(limit)
