ALTER TABLE memos ADD COLUMN location_name TEXT NOT NULL DEFAULT '';

ALTER TABLE memos ADD COLUMN location_latitude REAL;

ALTER TABLE memos ADD COLUMN location_longitude REAL;

ALTER TABLE memos ADD COLUMN location_precision TEXT NOT NULL DEFAULT 'approximate'
  CHECK (location_precision IN ('exact', 'approximate'));
