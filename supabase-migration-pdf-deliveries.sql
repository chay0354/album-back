-- Run this in Supabase SQL Editor to add the pdf_deliveries table
-- (if you already have the DB and only need this table)

CREATE TABLE IF NOT EXISTS pdf_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf TEXT NOT NULL,
  mail TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pdf_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pdf_deliveries_allow_all" ON pdf_deliveries;
CREATE POLICY "pdf_deliveries_allow_all" ON pdf_deliveries FOR ALL USING (true) WITH CHECK (true);
