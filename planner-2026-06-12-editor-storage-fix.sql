-- ============================================================
--  planner-2026-06-12-editor-storage-fix.sql
--  Run once in the Supabase SQL editor.
--
--  FIXES: "My editors can't download some files."
--
--  ROOT CAUSE
--  Attachments uploaded while creating a BRAND-NEW planner card get
--  stored under  {owner_id}/draft-<timestamp>/file  because the card
--  has no real id yet (planner.html uploadAttachments). The editor
--  storage policy only allowed reads where the path's second folder
--  equals a real planner_items.id — so every file attached during
--  card creation is invisible to editors: signing the download URL
--  fails and they're left with a long-expired link. Files attached
--  to already-saved cards worked, which is why only SOME files broke.
--  Owners never noticed because the owner policy covers their whole
--  folder.
--
--  THE FIX (least-privilege preserved)
--  Editors may now read a file if EITHER:
--    a) it lives under a real item folder assigned to them (as before), OR
--    b) the file's exact path is listed in the `attachments` of an item
--       assigned to them — which is precisely the draft-folder files.
--  Nothing else in the creator's folder becomes visible.
--  Also: email comparisons now use lower() on both sides, matching the
--  2026-06-10 audit fix that covered the table policies but missed
--  these two storage policies.
-- ============================================================

DROP POLICY IF EXISTS "editor storage read" ON storage.objects;
CREATE POLICY "editor storage read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'planner-files'
    AND EXISTS (
      SELECT 1 FROM planner_items
      WHERE lower(planner_items.assignee_email) = lower(auth.email())
        AND (
          planner_items.id::text = (storage.foldername(name))[2]
          OR planner_items.attachments @> jsonb_build_array(jsonb_build_object('path', name))
        )
    )
  );

DROP POLICY IF EXISTS "editor storage upload" ON storage.objects;
CREATE POLICY "editor storage upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'planner-files'
    AND EXISTS (
      SELECT 1 FROM planner_items
      WHERE planner_items.id::text = (storage.foldername(name))[2]
        AND lower(planner_items.assignee_email) = lower(auth.email())
    )
  );

-- ============================================================
--  Done! Check: sign in as an editor → open a project whose files were
--  attached while the card was first created (path contains /draft-) →
--  Download now opens. No storage objects were moved; the attachments
--  list on each card is the source of truth.
-- ============================================================
