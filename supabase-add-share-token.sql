-- Add share token to albums so users can share a view-only link.
-- Run this in Supabase SQL Editor after supabase-schema.sql.

ALTER TABLE albums ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

-- Optional: index for lookups by share_token
CREATE UNIQUE INDEX IF NOT EXISTS albums_share_token_key ON albums(share_token) WHERE share_token IS NOT NULL;
