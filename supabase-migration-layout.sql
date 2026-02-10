-- Run if album_photos already exists without layout column
ALTER TABLE album_photos ADD COLUMN IF NOT EXISTS layout JSONB DEFAULT NULL;
