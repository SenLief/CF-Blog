ALTER TABLE site_settings
  ADD COLUMN enable_memos INTEGER NOT NULL DEFAULT 1
  CHECK (enable_memos IN (0, 1));
