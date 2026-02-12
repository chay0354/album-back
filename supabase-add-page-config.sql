-- ============================================================
-- FIX: "Could not find the 'page_config' column of 'album_pages'"
-- ============================================================
-- 1. Open Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project
-- 3. Go to SQL Editor (left sidebar)
-- 4. Click "New query"
-- 5. Paste and run the statement below
-- 6. Wait a few seconds; the schema cache updates automatically
-- ============================================================

ALTER TABLE album_pages
ADD COLUMN IF NOT EXISTS page_config JSONB DEFAULT '{}';

-- 7. Force Supabase API to reload its schema cache (fixes "schema cache" error):
NOTIFY pgrst, 'reload schema';

-- If you still get the error, wait 30 seconds and retry your app, or restart the backend.
