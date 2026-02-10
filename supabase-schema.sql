-- Run this in Supabase SQL Editor to create tables and storage buckets

-- Albums
CREATE TABLE IF NOT EXISTS albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  cover_id UUID,
  cover_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Album pages (each page can have multiple photos)
CREATE TABLE IF NOT EXISTS album_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  page_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photos on pages (layout: { x, y, w, h } in percent 0-100 for position/size on page)
CREATE TABLE IF NOT EXISTS album_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES album_pages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  photo_order INT NOT NULL DEFAULT 0,
  layout JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Base covers (optional: pre-defined cover options)
CREATE TABLE IF NOT EXISTS base_covers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PDF deliveries: link generated PDF to user email (e.g. when user downloads/sends PDF)
CREATE TABLE IF NOT EXISTS pdf_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf TEXT NOT NULL,
  mail TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create storage buckets in Supabase Dashboard > Storage:
-- 1. Bucket "covers" (public)
-- 2. Bucket "album-photos" (public)
-- 3. Bucket "pdfs" (public) – generated album PDFs

-- RLS (service_role bypasses RLS; these allow anon/authenticated if needed)
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_covers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "albums_allow_all" ON albums;
DROP POLICY IF EXISTS "album_pages_allow_all" ON album_pages;
DROP POLICY IF EXISTS "album_photos_allow_all" ON album_photos;
DROP POLICY IF EXISTS "base_covers_allow_all" ON base_covers;
DROP POLICY IF EXISTS "pdf_deliveries_allow_all" ON pdf_deliveries;

CREATE POLICY "albums_allow_all" ON albums FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "album_pages_allow_all" ON album_pages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "album_photos_allow_all" ON album_photos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "base_covers_allow_all" ON base_covers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pdf_deliveries_allow_all" ON pdf_deliveries FOR ALL USING (true) WITH CHECK (true);
