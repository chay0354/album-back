# Create tables in Supabase

The backend needs these tables. Create them once:

1. Open your project: **https://supabase.com/dashboard** → select project `vmjjfshwktgbjvpwsjgv`.
2. Go to **SQL Editor** (left sidebar).
3. Click **New query**.
4. Copy the **entire** contents of `supabase-schema.sql` and paste into the editor.
5. Click **Run** (or press Ctrl+Enter).

You should see “Success. No rows returned.” Then the tables exist:

- `public.albums`
- `public.album_pages`
- `public.album_photos`
- `public.base_covers`
- `public.pdf_deliveries`

**Storage:** In **Storage** create three buckets (if they don’t exist):

- Name: `covers` → set to **Public**.
- Name: `album-photos` → set to **Public**.
- Name: `pdfs` → set to **Public** (for generated album PDFs).

If you see **"Bucket not found"** or **"StorageApiError: Bucket not found"** when generating a PDF, the `pdfs` bucket is missing. Create it in Supabase Dashboard → **Storage** → **New bucket** → name: `pdfs`, set **Public**.

After that, restart your backend and try again.
