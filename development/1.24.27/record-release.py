"""Keep publication status in the same commit as each automated source push."""
from datetime import datetime, timezone
from pathlib import Path
import argparse, os

ROOT = Path(__file__).resolve().parents[2]
VERSION = '1.24.27'

def prepend_current(path, text):
    p = ROOT / path
    lines = p.read_text().splitlines()
    # These handoff files already have a single current-status paragraph.
    lines = [line for line in lines if not line.startswith('**Current, ')]
    lines.insert(2, text)
    p.write_text('\n'.join(lines) + '\n')

def record(phase):
    stamp = datetime.now(timezone.utc).date().isoformat()
    sha = os.environ['VALIDATED_SHA']
    run = os.environ['VALIDATION_RUN']
    publish = os.environ['GITHUB_RUN_ID']
    live = phase == 'published'
    status = 'published' if live else 'assembled; public publication pending'
    result = f'1.24.27 {status}. Validation {run} on `{sha[:7]}`; publish run {publish}.'
    (ROOT / 'docs/NOW.md').write_text(
        f'# NOW\nUpdated: {stamp}. No helper agents.\n\n'
        f'**Latest: {result}** DeepSeek sends share one queue and a completion-based 8–9.8 second cooldown, including Creator/library calls. Existing program protection and permanent approvals are retained. '
        'No app signing, login requirement or extra setup; offline use and editable user skills/notes/settings are preserved.\n\n'
        '**Validation:** all four production gates passed on the exact source, plus the packaged Mac desktop lifetime/relaunch gate. '
        'Browser fixtures and real protected Chromium/Firefox cryptography passed; original affected Studio/account setups were not tested live. '
        'No separate test build was delivered. Full app update plus extension reload and AI-tab refresh is required for the complete security update.\n\n'
        + (f'**Release:** https://github.com/stoveez/PlazCode/releases/tag/v{VERSION}\n\n' if live else '**Publication:** archives/feed checks passed; public release has not yet been confirmed.\n\n')
        + '**Visibility:** temporary public build window; restore Private after publication. Owner authorized automatic restore; integration administration previously returned 403. '
        'Check the actual visibility before stopping.\n\n'
        '**Handoff:** work directly on `claude/plazcode-dev`; after publication merge private main ancestry back into dev without changing validated program source. '
        'Other account/Workshop/Brickwire plans remain deferred. GitHub vault updated; the separate PC PlazCode-Vault folder is not linked. '
        'See [open work](vault/open-work.md) and [code protection](vault/code-protection.md).\n'
    )
    p = ROOT / 'docs/vault/open-work.md'
    text = p.read_text()
    # Supersede only this release's active status, preserving unrelated bugs/history.
    lines = [line for line in text.splitlines() if not line.startswith('- 2026-10-28:')]
    index = lines.index('# Open work') + 1
    lines[index:index] = ['', f'- {stamp}: {result} Permanent approvals and code protection are complete. '
        + ('Live feed/download verification and Private visibility restoration remain.' if live else 'Public publication remains.')
        + ' Other deferred features and original live Studio/account checks remain open. No separate test-build delivery.', '']
    p.write_text('\n'.join(lines) + '\n')
    if live:
        p = ROOT / 'docs/vault/milestones.md'
        text = p.read_text().replace('# Finished work\n', '# Finished work\n\n'
            f'## {stamp}: 1.24.27 published\n'
            f'DeepSeek shared send serialization and completion-based pacing for all programmatic calls. Validation {run} (`{sha[:7]}`), publication {publish}, packaged Mac lifetime/relaunch passed. '
            'No app signing or new end-user setup. User data stays editable; original affected live Studio/account setups were not tested.\n', 1)
        p.write_text(text)
        current = f'**Current, {stamp}:** {result} Start with `docs/NOW.md`. Older entries below are historical.'
        for name in ['docs/HANDOFF.md', 'docs/TASK-BOARD.md', 'docs/MAINTAINER-GUIDE.md']:
            prepend_current(name, current)
        p = ROOT / 'docs/vault/code-protection.md'
        p.write_text(p.read_text().replace('No protected release has shipped; Windows/Mac and installed-extension gates are still required.',
            f'Protected release 1.24.27 shipped after all platform/browser and packaged Mac gates passed (validation {run}, publication {publish}).'))
        p = ROOT / 'development/1.24.27/NEXT-UPDATE-PLAN.md'
        text = p.read_text()
        text = text.replace('code protection and permanent tool approvals are now in progress.', 'code protection and permanent tool approvals shipped in 1.24.27.')
        p.write_text(text)
        p = ROOT / 'docs/vault/test-builds.md'
        p.write_text(p.read_text() + f'\n## 1.24.27 ({stamp})\nOwner requested direct release. Full production validation and packaged Mac desktop lifetime gate passed; validated bytes were published without rebuilding. No separate test zips were delivered.\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['prepared', 'published'])
    record(parser.parse_args().phase)
