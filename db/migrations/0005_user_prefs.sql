-- Per-user display preferences. Additive only: one new table and two new functions, no change to
-- any existing table, column or function. Old application code never touches them, so applying this
-- ahead of the deploy is safe, and reverting the deploy leaves them unused.
--
-- Why a table and not a column: no existing table is per user. club_members is per (club, user),
-- and a theme must follow the person, not a membership.
--
-- Why only functions: the table has row level security on and NO privilege for kelabkit_app, so a
-- direct statement as the app role is refused. kk_get_prefs() and kk_save_prefs() are SECURITY
-- DEFINER, pin search_path, and key every row on the session user (app.user_id), never on an
-- argument, so one user cannot read or write another's row. The shape of the document is validated
-- by the application (lib/prefs.ts, unknown keys dropped); the database enforces what must hold
-- whoever calls it: a JSON object, at most 16 KiB.

CREATE TABLE "user_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public.user_prefs FROM PUBLIC, kelabkit_app;--> statement-breakpoint

-- The caller's stored preferences, or NULL when they never saved any (the client then migrates
-- what it has in localStorage).
CREATE FUNCTION public.kk_get_prefs() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_current_user();
  v_prefs jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN'; END IF;
  SELECT prefs INTO v_prefs FROM public.user_prefs WHERE user_id = v_user;
  RETURN v_prefs;
END
$$;--> statement-breakpoint

-- Merges a patch into the caller's document, key by key at the top level: a key in the patch
-- replaces the stored value, a key absent from it is kept. Two devices therefore do not erase each
-- other's unrelated changes; for the same key the later write wins.
CREATE FUNCTION public.kk_save_prefs(p_prefs jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_current_user();
  v_merged jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN'; END IF;
  IF p_prefs IS NULL OR jsonb_typeof(p_prefs) <> 'object' OR octet_length(p_prefs::text) > 16384 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PREFS_INVALID';
  END IF;
  INSERT INTO public.user_prefs AS u (user_id, prefs) VALUES (v_user, p_prefs)
    ON CONFLICT (user_id) DO UPDATE SET prefs = u.prefs || EXCLUDED.prefs, updated_at = now()
    RETURNING u.prefs INTO v_merged;
  IF octet_length(v_merged::text) > 16384 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PREFS_INVALID';
  END IF;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.kk_get_prefs(), public.kk_save_prefs(jsonb) FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.kk_get_prefs(), public.kk_save_prefs(jsonb) TO kelabkit_app;
