PRAGMA foreign_keys = ON;

CREATE TABLE site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  author_bio TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  accent TEXT NOT NULL DEFAULT '#1d4ed8',
  default_theme TEXT NOT NULL DEFAULT 'system'
    CHECK (default_theme IN ('system', 'light', 'dark')),
  show_toc INTEGER NOT NULL DEFAULT 1 CHECK (show_toc IN (0, 1)),
  show_reading_time INTEGER NOT NULL DEFAULT 1 CHECK (show_reading_time IN (0, 1)),
  nav_json TEXT NOT NULL DEFAULT '[]',
  social_json TEXT NOT NULL DEFAULT '[]',
  seo_image_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

INSERT INTO site_settings (
  id, title, description, author_name, author_bio, updated_at
) VALUES (
  1,
  '纸上',
  '关于技术、生活与长期思考',
  '作者',
  '写值得反复阅读的文字。',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content_markdown TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  reading_minutes INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_posts_status_published
  ON posts(status, published_at DESC);
CREATE INDEX idx_posts_updated
  ON posts(updated_at DESC);

CREATE TABLE post_revisions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  reason TEXT NOT NULL
    CHECK (reason IN ('manual', 'publish', 'unpublish', 'restore')),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_post_revisions_post
  ON post_revisions(post_id, created_at DESC);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX idx_post_tags_tag ON post_tags(tag_id, post_id);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE post_redirects (
  from_slug TEXT PRIMARY KEY COLLATE NOCASE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE preview_tokens (
  token_hash TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_preview_tokens_expiry ON preview_tokens(expires_at);
