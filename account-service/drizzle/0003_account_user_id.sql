ALTER TABLE accounts ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id);
CREATE TABLE IF NOT EXISTS device_user_links (
  device_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS device_user_links_user_idx ON device_user_links (user_id);
CREATE TABLE IF NOT EXISTS owner_grants (
  target_key TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  user_id TEXT,
  username TEXT,
  granted_by TEXT,
  granted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS owner_grants_user_idx ON owner_grants (user_id);
