ALTER TABLE accounts ADD COLUMN terminated_at INTEGER;
ALTER TABLE accounts ADD COLUMN last_device_hash TEXT;
CREATE TABLE IF NOT EXISTS banned_devices (
  device_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  permanent INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  banned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS banned_devices_account_idx ON banned_devices (account_id);
