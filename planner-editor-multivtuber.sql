-- ============================================================
--  EDITOR DASHBOARD — MULTI-VTUBER + BATCH DOWNLOAD
--  Run this in Supabase Dashboard → SQL Editor → New query.
--  Safe to re-run (idempotent — IF NOT EXISTS guards on every column).
--
--  Why: an editor (e.g. NakaFrow) can be assigned items by SEVERAL creators
--  who all use this hub. planner-editor.html now groups their dashboard into
--  one "column" per VTuber. To label each column and give the editor one
--  download-everything link per batch, the creator-wide brand kit row gains:
--    • creator_name        — the VTuber display name shown as the column header
--    • batch_download_url   — Google Drive (or any) link to grab the whole batch
--    • batch_deadline       — when that batch is due
--    • batch_label          — optional name for the current batch (e.g. "June drop")
--
--  These live on planner_brand_kit (one row per owner_id), which editors can
--  already READ for any creator who assigned them at least one item — so no
--  new RLS policies are needed.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='planner_brand_kit' AND column_name='creator_name') THEN
    ALTER TABLE planner_brand_kit ADD COLUMN creator_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='planner_brand_kit' AND column_name='batch_download_url') THEN
    ALTER TABLE planner_brand_kit ADD COLUMN batch_download_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='planner_brand_kit' AND column_name='batch_deadline') THEN
    ALTER TABLE planner_brand_kit ADD COLUMN batch_deadline timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='planner_brand_kit' AND column_name='batch_label') THEN
    ALTER TABLE planner_brand_kit ADD COLUMN batch_label text;
  END IF;
END$$;

-- ============================================================
--  Done! Reload planner-editor.html — each VTuber who assigned you work
--  shows up as its own column with its branding, editing styles, batch
--  download link, deadline, and the videos to edit.
-- ============================================================
