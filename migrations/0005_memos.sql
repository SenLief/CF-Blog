CREATE TABLE memos (
  id TEXT PRIMARY KEY,
  content_markdown TEXT NOT NULL,
  content_html TEXT NOT NULL,
  content_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_memos_public_timeline
  ON memos(status, is_pinned DESC, published_at DESC, id DESC);

CREATE INDEX idx_memos_updated
  ON memos(updated_at DESC, id DESC);
