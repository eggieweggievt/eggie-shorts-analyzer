-- ============================================================
--  PLANNER MANAGERS — OPEN INVITES migration
--  Run AFTER planner-managers.sql (and ideally after planner-manager-hub-v2.sql).
--  Supabase Dashboard → SQL Editor → New query.
--
--  Adds support for "open" manager invites — invite links that aren't locked
--  to a specific email up front. The claimer signs in with whatever email
--  they want, and that email gets bound to the row at claim time.
--
--  Existing email-locked invites still work exactly as before.
--
--  Idempotent — safe to re-run.
-- ============================================================

-- 1. Allow planner_managers.email to be NULL.
--    NULL = "open invite, not yet claimed". Once claimed, email is populated.
ALTER TABLE planner_managers ALTER COLUMN email DROP NOT NULL;

-- 2. The existing UNIQUE (owner_id, lower(email)) index is fine: Postgres treats
--    NULL values as distinct, so multiple open invites per creator are allowed.
--    Once claim sets the email, the unique constraint kicks in normally.

-- 3. Replace the "managers read own delegations" SELECT policy so it doesn't
--    crash on NULL emails. We still want a signed-in user to see only rows
--    that belong to them — but for OPEN invites (email IS NULL) we don't want
--    anyone to peek through the rows. The peek_invite RPC (SECURITY DEFINER)
--    is the only authorized read path for those.
DROP POLICY IF EXISTS "managers read own delegations" ON planner_managers;
CREATE POLICY "managers read own delegations" ON planner_managers
  FOR SELECT
  USING (
    email IS NOT NULL
    AND lower(email) = lower(coalesce(auth.email(), ''))
  );

DROP POLICY IF EXISTS "managers update own delegations" ON planner_managers;
CREATE POLICY "managers update own delegations" ON planner_managers
  FOR UPDATE
  USING (
    email IS NOT NULL
    AND lower(email) = lower(coalesce(auth.email(), ''))
  )
  WITH CHECK (
    email IS NOT NULL
    AND lower(email) = lower(coalesce(auth.email(), ''))
  );

-- ============================================================
-- 4. RPC: peek_invite — return whether the invite is open (email IS NULL)
--    The signature changes (extra boolean column), so we DROP+CREATE.
-- ============================================================
DROP FUNCTION IF EXISTS planner_manager_peek_invite(text);
CREATE FUNCTION planner_manager_peek_invite(p_token text)
RETURNS TABLE (
  manager_id uuid,
  email text,
  name text,
  creator_email text,
  claimed boolean,
  revoked boolean,
  is_open boolean
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
    (m.revoked_at IS NOT NULL) AS revoked,
    (m.email IS NULL) AS is_open
  FROM planner_managers m
  JOIN auth.users u ON u.id = m.owner_id
  WHERE m.invite_token = p_token;
$$;
GRANT EXECUTE ON FUNCTION planner_manager_peek_invite(text) TO anon, authenticated;

-- ============================================================
-- 5. RPC: claim_invite — for OPEN invites, bind the caller's email to the
--    row at claim time. For locked invites, behavior is unchanged.
--
--    Edge cases handled:
--    - Locked invite, wrong email → error
--    - Open invite + caller already has an active row on this hub → error
--      ("you're already a manager")
--    - Open invite + caller has a REVOKED row on this hub → restore it,
--      then delete the open row to avoid a stale duplicate
--    - Open invite, fresh → bind email and claim normally
-- ============================================================
CREATE OR REPLACE FUNCTION planner_manager_claim_invite(p_token text)
RETURNS planner_managers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row planner_managers;
  v_existing planner_managers;
  v_caller_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;
  v_caller_email := lower(coalesce(auth.email(), ''));
  IF v_caller_email = '' THEN
    RAISE EXCEPTION 'Signed-in user has no email — cannot claim' USING ERRCODE = 'P0005';
  END IF;

  SELECT * INTO v_row FROM planner_managers WHERE invite_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite has been revoked' USING ERRCODE = 'P0003';
  END IF;

  IF v_row.email IS NULL THEN
    -- OPEN invite. Bind the caller's email to this row, unless they already
    -- have a row on this hub (active or revoked).
    SELECT * INTO v_existing FROM planner_managers
      WHERE owner_id = v_row.owner_id
        AND lower(email) = v_caller_email
        AND id <> v_row.id
      LIMIT 1;

    IF FOUND THEN
      IF v_existing.revoked_at IS NULL THEN
        -- Already an active manager. Just touch last_seen and bin the open row.
        UPDATE planner_managers
          SET last_seen_at = now()
          WHERE id = v_existing.id
          RETURNING * INTO v_existing;
        DELETE FROM planner_managers WHERE id = v_row.id;
        RETURN v_existing;
      ELSE
        -- They had access before but it was revoked. We DON'T auto-restore
        -- (the creator chose to revoke them) — fail with a clear error.
        DELETE FROM planner_managers WHERE id = v_row.id;
        RAISE EXCEPTION 'Your manager access to this hub was revoked. Ask the creator to restore it.' USING ERRCODE = 'P0006';
      END IF;
    END IF;

    -- Fresh open claim — set email, mark claimed.
    UPDATE planner_managers
      SET email              = v_caller_email,
          claimed_at         = COALESCE(claimed_at, now()),
          claimed_by_user_id = COALESCE(claimed_by_user_id, auth.uid()),
          last_seen_at       = now()
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    RETURN v_row;
  ELSE
    -- LOCKED invite. Email must match.
    IF lower(v_row.email) <> v_caller_email THEN
      RAISE EXCEPTION 'This invite is locked to a different email address' USING ERRCODE = 'P0004';
    END IF;
    UPDATE planner_managers
      SET claimed_at         = COALESCE(claimed_at, now()),
          claimed_by_user_id = COALESCE(claimed_by_user_id, auth.uid()),
          last_seen_at       = now()
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    RETURN v_row;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION planner_manager_claim_invite(text) TO authenticated;

-- ============================================================
--  Done!
--
--  Creator workflow:
--   - Leave the email blank when generating an invite to make it OPEN — anyone
--     with the link can claim it with whatever email they sign in as.
--   - Provide an email to make it LOCKED to that specific address.
--
--  Manager workflow:
--   - Open the link → if locked, sign in with that exact email; if open,
--     sign in with any email and that becomes your bound email going forward.
--   - You can also paste the link/token into the Manager Hub's "Add a client"
--     panel without leaving the page.
-- ============================================================
