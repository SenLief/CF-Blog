ALTER TABLE memos ADD COLUMN video_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE memo_tags (
  memo_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (memo_id, tag_id)
);

CREATE INDEX idx_memo_tags_tag ON memo_tags(tag_id, memo_id);

CREATE TABLE memo_images (
  memo_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (memo_id, media_id),
  UNIQUE (memo_id, sort_order)
);

CREATE INDEX idx_memo_images_media ON memo_images(media_id, memo_id);
