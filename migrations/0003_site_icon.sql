PRAGMA foreign_keys = ON;

ALTER TABLE site_settings
  ADD COLUMN favicon_media_id TEXT REFERENCES media(id) ON DELETE SET NULL;
