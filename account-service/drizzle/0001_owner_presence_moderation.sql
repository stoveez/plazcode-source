ALTER TABLE accounts ADD COLUMN last_seen_at INTEGER;
ALTER TABLE accounts ADD COLUMN app_version TEXT;
ALTER TABLE accounts ADD COLUMN banned_at INTEGER;
ALTER TABLE accounts ADD COLUMN ban_reason TEXT;
CREATE INDEX IF NOT EXISTS accounts_last_seen_idx ON accounts (last_seen_at);
CREATE INDEX IF NOT EXISTS accounts_banned_idx ON accounts (banned_at);
