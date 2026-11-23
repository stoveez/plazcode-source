-- PlazCode Skill Workshop D1 schema

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'skill',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  author TEXT NOT NULL,
  author_key TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  category TEXT NOT NULL DEFAULT 'Tools',
  engine TEXT NOT NULL DEFAULT 'general',
  tags TEXT NOT NULL DEFAULT '[]',
  files_json TEXT NOT NULL,
  body_bytes INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  featured INTEGER NOT NULL DEFAULT 0,
  reviewed_by TEXT NOT NULL DEFAULT '',
  reject_reason TEXT NOT NULL DEFAULT '',
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  install_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skills_public ON skills (status, kind, category, engine, created_at);
CREATE INDEX IF NOT EXISTS idx_skills_author ON skills (author_key, status);

CREATE TABLE IF NOT EXISTS ratings (
  skill_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (skill_id, user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  skill_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (skill_id, user_id)
);

CREATE TABLE IF NOT EXISTS installs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'anonymous',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_installs_skill ON installs (skill_id, created_at);

CREATE TABLE IF NOT EXISTS banned_authors (
  author_key TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  banned_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
