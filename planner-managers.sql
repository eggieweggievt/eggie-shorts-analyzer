-- ============================================================
--  PLANNER MANAGERS — Supabase migration
--  Run AFTER planner-supabase-v2.sql, in Supabase Dashboard → SQL Editor → New query.
--
--  Adds the ability to delegate full co-owner ("manager") access to your
--  creator hub via an email-locked invite link. A manager signs in with their
--  own magic link and can then operate on the creator's data as if they were
--  the creator themself — see/edit items, manage editors, edit brand kit,
--  upload files, etc. Managers do NOT see the creator's auth credentials.
--
--  Idempotent — safe to re-run.
-- ============================================================

-- 1. planner_managers table
CREATE TABLE IF NOT EXISTS planner_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,                                       -- always stored lowercase + trimmed
  invite_token text NOT NULL UNIQUE,                         -- random URL-safe slug used in claim link
  claimed_at timestamptz,                                    -- when the manager first signed in + claimed
  claimed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_seen_at timestamptz,                                  -- updated on sign-in / page load
  revoked_at timestamptz,                                    -- soft-delete / temporary revoke
  created_at timestamptz DEFAULT now()
);

-- One pending/active delegation per (owner, email) pair — re-inviting the
-- same email should reuse the existing row instead of duplicating it.
CREATE UNIQUE INDEX IF NOT EXISTS planner_managers_owner_email_idx
  ON planner_managers(owner_id, lower(email));
CREATE INDEX IF NOT EXISTS planner_managers_email_idx ON planner_managers(lower(email));
CREATE INDEX IF NOT EXISTS planner_managers_token_idx ON planner_managers(invite_token);

ALTER TABLE planner_managers ENABLE ROW LEVEL SECURITY;

-- Owners (creators) manage their own manager roster
DROP POLICY IF EXISTS "owners manage own managers" ON planner_managers;
CREATE POLICY "owners manage own managers" ON planner_managers
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- A signed-in user can read their OWN delegation rows (to know which hubs they manage)
DROP POLICY IF EXISTS "managers read own delegations" ON planner_managers;
CREATE POLICY "managers read own delegations" ON planner_managers
  FOR SELECT
  USING (lower(email) = lower(auth.email()));

-- A signed-in user can update last_seen_at on their own delegation rows
DROP POLICY IF EXISTS "managers update own delegations" ON planner_managers;
CREATE POLICY "managers update own delegations" ON planner_managers
  FOR UPDATE
  USING (lower(email) = lower(auth.email()))
  WITH CHECK (lower(email) = lower(auth.email()));

-- ============================================================
-- 2. RPC: peek at an invite by token (unauthenticated callers OK)
--    Used by manager-claim.html to display the invite preview before
--    the user signs in. Tokens are long-enough random strings that
--    guessing is infeasible.
-- ============================================================
CREATE OR REPLACE FUNCTION planner_manager_peek_invite(p_token text)
RETURNS TABLE (
  manager_id uuid,
  email text,
  name text,
  creator_email text,
  claimed boolean,
  revoked boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    m.id          AS manager_id,
    m.email,
    m.name,
    u.email::text AS creator_email,
    (m.claimed_at IS NOT NULL) AS claimed,
    (m.revoked_at IS NOT NULL) AS revoked
  FROM planner_managers m
  JOIN auth.users u ON u.id = m.owner_id
  WHERE m.invite_token = p_token;
$$;
GRANT EXECUTE ON FUNCTION planner_manager_peek_invite(text) TO anon, authenticated;

-- ============================================================
-- 3. RPC: claim an invite (caller must be signed in with the locked email)
-- ============================================================
CREATE OR REPLACE FUNCTION planner_manager_claim_invite(p_token text)
RETURNS planner_managers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row planner_managers;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM planner_managers WHERE invite_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite has been revoked' USING ERRCODE = 'P0003';
  END IF;
  IF lower(v_row.email) <> lower(coalesce(auth.email(), '')) THEN
    RAISE EXCEPTION 'This invite is locked to a different email address' USING ERRCODE = 'P0004';
  END IF;

  UPDATE planner_managers
     SET claimed_at         = COALESCE(claimed_at, now()),
         claimed_by_user_id = COALESCE(claimed_by_user_id, auth.uid()),
         last_seen_at       = now()
   WHERE id = v_row.id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION planner_manager_claim_invite(text) TO authenticated;

-- ============================================================
-- 4. RPC: list active delegations for the signed-in user
--    Returns one row per creator who has delegated this user as manager.
--    Used by planner.html to populate the "Switch hub" picker.
-- ============================================================
CREATE OR REPLACE FUNCTION planner_list_my_delegations()
RETURNS TABLE (
  manager_id uuid,
  owner_id uuid,
  owner_email text,
  manager_name text,
  manager_email text,
  claimed_at timestamptz,
  last_seen_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT m.id, m.owner_id, u.email::text,
         m.name, m.email, m.claimed_at, m.last_seen_at
  FROM planner_managers m
  JOIN auth.users u ON u.id = m.owner_id
  WHERE lower(m.email) = lower(coalesce(auth.email(), ''))
    AND m.revoked_at IS NULL
    AND m.claimed_at IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION planner_list_my_delegations() TO authenticated;

-- ============================================================
-- 5. Helper: is the caller a claimed, non-revoked manager of <owner>?
--    Used in RLS policies below. STABLE so Postgres can memoize within a query.
-- ============================================================
CREATE OR REPLACE FUNCTION planner_is_manager_of(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM planner_managers
    WHERE owner_id = p_owner_id
      AND lower(email) = lower(coalesce(auth.email(), ''))
      AND claimed_at IS NOT NULL
      AND revoked_at IS NULL
  );
$$;
GRANT EXECUTE ON FUNCTION planner_is_manager_of(uuid) TO authenticated;

-- ============================================================
-- 6. Extend RLS on existing tables — managers act as co-owners.
--    These policies are ADDITIVE: the original "owners manage own X" and
--    "editors see assigned items" policies still grant their access. PG
--    OR's the policies together at the FOR-command level.
-- ============================================================

-- planner_items
DROP POLICY IF EXISTS "managers manage items" ON planner_items;
CREATE POLICY "managers manage items" ON planner_items
  FOR ALL
  USING (planner_is_manager_of(owner_id))
  WITH CHECK (planner_is_manager_of(owner_id));

-- planner_editors
DROP POLICY IF EXISTS "managers manage editors" ON planner_editors;
CREATE POLICY "managers manage editors" ON planner_editors
  FOR ALL
  USING (planner_is_manager_of(owner_id))
  WITH CHECK (planner_is_manager_of(owner_id));

-- planner_brand_kit
DROP POLICY IF EXISTS "managers manage brand kit" ON planner_brand_kit;
CREATE POLICY "managers manage brand kit" ON planner_brand_kit
  FOR ALL
  USING (planner_is_manager_of(owner_id))
  WITH CHECK (planner_is_manager_of(owner_id));

-- planner_todos (only if the table exists from planner-supabase-todos.sql)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='planner_todos') THEN
    EXECUTE 'DROP POLICY IF EXISTS "managers manage todos" ON planner_todos';
    EXECUTE 'CREATE POLICY "managers manage todos" ON planner_todos
               FOR ALL
               USING (planner_is_manager_of(owner_id))
               WITH CHECK (planner_is_manager_of(owner_id))';
  END IF;
END $$;

-- Storage: managers can read/write any file under {creator_uuid}/... in
-- the planner-files bucket, mirroring the owner storage policy. The
-- first path segment is the creator's auth.users.id (UUID).
DROP POLICY IF EXISTS "manager storage all" ON storage.objects;
CREATE POLICY "manager storage all" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'planner-files'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND planner_is_manager_of(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'planner-files'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND planner_is_manager_of(((storage.foldername(name))[1])::uuid)
  );

-- ============================================================
--  Done! Reload planner.html — the Managers button will appear in the toolbar.
--  Generate an invite link, send it to your manager, they sign in and land in
--  your hub with full co-owner access.
-- ============================================================
