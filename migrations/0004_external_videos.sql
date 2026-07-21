CREATE TABLE external_videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('youtube', 'bilibili', 'vimeo', 'direct')),
  provider_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_external_videos_created_at
  ON external_videos(created_at DESC, id DESC);
