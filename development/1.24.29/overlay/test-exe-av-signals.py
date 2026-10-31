"""1.24.23 antivirus false-positive fix: the built Windows PlazCode.exe must not carry the
patterns that made scanners (and Chrome's download check) flag 1.24.22 as a virus, and it must
carry a real application manifest and company details.
    python test-exe-av-signals.py [path-to-PlazCode.exe]      (default: PlazCode.exe here)
"""
import sys
from pathlib import Path

exe = Path(sys.argv[1] if len(sys.argv) > 1 else 'PlazCode.exe')
data = exe.read_bytes()
assert data[:2] == b'MZ', f'{exe} is not a Windows program'

def present(text):
    """Found as plain text or as Windows wide (UTF-16) text."""
    return text.encode() in data or text.encode('utf-16-le') in data

# Never again: base64 PowerShell, Bypass next to a PowerShell launch, rundll32 link launching.
forbidden = {
    '-EncodedCommand': 'PowerShell commands are run from a script file, not as base64 on the command line',
    'ExecutionPolicyBypass': 'PowerShell runs with RemoteSigned (adjacent literals "-ExecutionPolicy","Bypass")',
    '-ExecutionPolicy Bypass': 'PowerShell runs with RemoteSigned',
    'url.dll,FileProtocolHandler': 'links open with ShellExecuteW, not rundll32 url.dll,FileProtocolHandler',
}
problems = [f'{text!r} found: {why}' for text, why in forbidden.items() if present(text)]

# Must have: an embedded application manifest and full version details.
required = {
    'requestedExecutionLevel': 'application manifest (asInvoker) is embedded',
    'supportedOS': 'application manifest declares supported Windows versions',
    'CompanyName': 'version info has a company name',
    'LegalCopyright': 'version info has a copyright line',
    'FileDescription': 'version info has a description',
}
problems += [f'missing {text!r}: {why}' for text, why in required.items() if not present(text)]

if problems:
    print('FAIL ' + str(exe) + '\n  ' + '\n  '.join(problems))
    sys.exit(1)
print(f'PASS {exe}: no base64 PowerShell, no Bypass, no rundll32 links; manifest and company details embedded.')
