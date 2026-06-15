-- ============================================================
--  CONTENT BUCKET (per-item) — 2026-06-15
--  Run in Supabase Dashboard -> SQL Editor -> New query.
--
--  Adds a per-item content bucket so each planner item can be tagged as
--  Retention / Growth / Experimental (the creator picks, on the card). The
--  planner shows the live mix vs a 60 / 30 / 10 target. Nothing is inferred.
--
--  Safe to re-run (guarded with IF NOT EXISTS).
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_items' AND column_name='content_bucket') THEN
    ALTER TABLE planner_items ADD COLUMN content_bucket text;   -- 'retention' | 'growth' | 'experimental' | NULL
  END IF;
END$$;

-- Optional: keep the values clean (only the three buckets or NULL).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='planner_items_content_bucket_check') THEN
    ALTER TABLE planner_items
      ADD CONSTRAINT planner_items_content_bucket_check
      CHECK (content_bucket IS NULL OR content_bucket IN ('retention','growth','experimental'));
  END IF;
END$$;

-- ============================================================
--  Done! Reload planner.html -> each card shows 🎯 / 🌱 / 🧪 buttons to tag it,
--  and 🧩 Content mix shows your live Retention / Growth / Experimental balance.
-- ============================================================
