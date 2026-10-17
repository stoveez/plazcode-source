"""Compact feeds for existing native updaters (64 KiB maximum)."""
import json
MAX_FEED_BYTES = 65536
TARGET_FEED_BYTES = 48 * 1024

def encode(feed):
    return (json.dumps(feed, indent=2, ensure_ascii=False) + '\n').encode('utf-8')

def validate(feed, raw=None):
    raw = encode(feed) if raw is None else raw
    if len(raw) > MAX_FEED_BYTES:
        raise ValueError(f'Release feed is {len(raw)} bytes; existing clients accept at most {MAX_FEED_BYTES}. Use compact_feed; full history belongs in release-notes.json.')
    if not any(entry.get('version') == feed.get('version') for entry in feed.get('release_notes', [])):
        raise ValueError('Release feed must contain notes for its current version')
    return feed

def compact_feed(feed, notes):
    current = next((n for n in notes if n.get('version') == feed['version']), None)
    if current is None:
        raise ValueError('Missing current release notes')
    result = {**feed, 'release_notes': [current] + [n for n in notes if n.get('version') != feed['version']][:4]}
    while len(encode(result)) > TARGET_FEED_BYTES and len(result['release_notes']) > 1:
        result['release_notes'].pop()
    if len(encode(result)) > TARGET_FEED_BYTES:
        raise ValueError('Current release metadata alone exceeds the 48 KiB feed budget; shorten current notes')
    return validate(result)
