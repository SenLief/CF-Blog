PRAGMA foreign_keys = ON;

CREATE TABLE "groups" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE posts
  ADD COLUMN group_id TEXT REFERENCES "groups"(id) ON DELETE SET NULL;

ALTER TABLE posts
  ADD COLUMN group_position INTEGER
  CHECK (group_position IS NULL OR group_position >= 0);

CREATE INDEX idx_posts_group_position
  ON posts(group_id, group_position);

CREATE TABLE group_redirects (
  from_slug TEXT PRIMARY KEY COLLATE NOCASE,
  group_id TEXT NOT NULL REFERENCES "groups"(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
