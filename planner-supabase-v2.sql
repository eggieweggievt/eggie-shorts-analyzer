-- ============================================================
--  PLANNER V2 — Supabase migration
--  Run this in Supabase Dashboard → SQL Editor → New query
--  Adds: editor profiles, file uploads, footage / editor file links,
--        editor-facing access for assigned items.
-- ============================================================

-- 1. Add new columns to planner_items
-- (use IF NOT EXISTS-style guards so re-running is safe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_items' AND column_name='footage_url') THEN
    ALTER TABLE planner_items ADD COLUMN footage_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_items' AND column_name='editor_files_url') THEN
    ALTER TABLE planner_items ADD COLUMN editor_files_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_items' AND column_name='attachments') THEN
    ALTER TABLE planner_items ADD COLUMN attachments jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_items' AND column_name='editor_id') THEN
    ALTER TABLE planner_items ADD COLUMN editor_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_items' AND column_name='assignee_email') THEN
    ALTER TABLE planner_items ADD COLUMN assignee_email text;
  END IF;
  -- V2.2 — Additional asset folders (array of {label, url} pairs for BGM, fonts, refs, etc.)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_items' AND column_name='additional_assets') THEN
    ALTER TABLE planner_items ADD COLUMN additional_assets jsonb DEFAULT '[]'::jsonb;
  END IF;
  -- V2.12 — Per-item star/priority flag (for filtering + sorting starred items first)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_items' AND column_name='is_priority') THEN
    ALTER TABLE planner_items ADD COLUMN is_priority boolean DEFAULT false;
  END IF;
END$$;

-- 2. New table: planner_editors
CREATE TABLE IF NOT EXISTS planner_editors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  color text DEFAULT '#90A5FF',
  asset_folder_url text,
  reference_links jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 3. Enable Row Level Security on editors table
ALTER TABLE planner_editors ENABLE ROW LEVEL SECURITY;

-- Owners can do anything with their own editor profiles
DROP POLICY IF EXISTS "owners manage their editors" ON planner_editors;
CREATE POLICY "owners manage their editors" ON planner_editors
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Editors can read their own profile (so they can see asset folder, references)
DROP POLICY IF EXISTS "editors read own profile" ON planner_editors;
CREATE POLICY "editors read own profile" ON planner_editors
  FOR SELECT
  USING (email = auth.email());

-- Editors can UPDATE their own profile fields (asset folder, references, notes)
DROP POLICY IF EXISTS "editors update own profile" ON planner_editors;
CREATE POLICY "editors update own profile" ON planner_editors
  FOR UPDATE
  USING (email = auth.email());

-- 4. Extend planner_items policies for editor-facing access
-- Editors see items where their email matches assignee_email
DROP POLICY IF EXISTS "editors see assigned items" ON planner_items;
CREATE POLICY "editors see assigned items" ON planner_items
  FOR SELECT
  USING (
    auth.uid() = owner_id
    OR assignee_email = auth.email()
  );

-- Editors can UPDATE limited fields on items assigned to them
-- (Supabase row-level UPDATE is whole-row; column-level restriction is enforced client-side)
DROP POLICY IF EXISTS "editors update assigned items" ON planner_items;
CREATE POLICY "editors update assigned items" ON planner_items
  FOR UPDATE
  USING (assignee_email = auth.email());

-- 5. Storage bucket for file uploads
-- V2.2 — file_size_limit raised to 500MB so editors can upload final edits + raw clips.
--        NOTE: free-tier Supabase caps storage uploads at 50MB. Pro tier ($25/mo) lifts to 5GB.
--        If you're on free, set the limit to 52428800 (50MB) and use the Drive links instead.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('planner-files', 'planner-files', false, 524288000)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

-- Storage policies — owners can read/write everything in their folder.
-- Path scheme: {owner_id}/{item_id}/{filename}
DROP POLICY IF EXISTS "owner storage all" ON storage.objects;
CREATE POLICY "owner storage all" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'planner-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'planner-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Editors can read files for items assigned to them.
-- The path's second segment is the item_id; we join against planner_items.
DROP POLICY IF EXISTS "editor storage read" ON storage.objects;
CREATE POLICY "editor storage read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'planner-files'
    AND EXISTS (
      SELECT 1 FROM planner_items
      WHERE planner_items.id::text = (storage.foldername(name))[2]
        AND planner_items.assignee_email = auth.email()
    )
  );

-- Editors can upload their edits back into the same folder for items assigned to them.
DROP POLICY IF EXISTS "editor storage upload" ON storage.objects;
CREATE POLICY "editor storage upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'planner-files'
    AND EXISTS (
      SELECT 1 FROM planner_items
      WHERE planner_items.id::text = (storage.foldername(name))[2]
        AND planner_items.assignee_email = auth.email()
    )
  );

-- ============================================================
--  V2.3 — CREATOR-WIDE BRAND KIT (Branding & Assets section)
--  Shown to every editor on their dashboard — like a Notion board with
--  branding images, editing style refs, and asset folder links.
-- ============================================================
CREATE TABLE IF NOT EXISTS planner_brand_kit (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  branding_images jsonb DEFAULT '[]'::jsonb,        -- [{url, label}] — images of brand sheets, color palettes, fonts
  editing_style_videos jsonb DEFAULT '[]'::jsonb,   -- [{url, label, kind}] — YouTube / Shorts / TikTok / direct video URLs
  asset_links jsonb DEFAULT '[]'::jsonb,            -- [{url, label}] — Drive folders, Figma files, Notion pages
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- V2.13 — Recurring weekly stream schedule lives on the brand kit row (creator-wide)
-- Format: [{day: 0-6 (Sun-Sat), start: 'HH:MM', end: 'HH:MM', title: 'Apex', color: '#FFB2F0'}]
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_brand_kit' AND column_name='stream_schedule') THEN
    ALTER TABLE planner_brand_kit ADD COLUMN stream_schedule jsonb DEFAULT '[]'::jsonb;
  END IF;
END$$;

ALTER TABLE planner_brand_kit ENABLE ROW LEVEL SECURITY;

-- Owners (creators) manage their own brand kit
DROP POLICY IF EXISTS "owners manage brand kit" ON planner_brand_kit;
CREATE POLICY "owners manage brand kit" ON planner_brand_kit
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Editors can READ the brand kit of any creator who has assigned them at least one item.
-- This is what makes the kit show up on planner-editor.html for the right people.
DROP POLICY IF EXISTS "editors read brand kit" ON planner_brand_kit;
CREATE POLICY "editors read brand kit" ON planner_brand_kit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM planner_items
      WHERE planner_items.owner_id = planner_brand_kit.owner_id
        AND planner_items.assignee_email = auth.email()
    )
  );

-- ============================================================
--  Done! Reload planner.html — V2 features will light up automatically.
--  Check: editor profiles button, footage/editor file links, file uploads,
--  inline title-scoring, planner-editor.html access for editors,
--  brand kit button in toolbar, branding & assets section on editor dashboard.
-- ============================================================
