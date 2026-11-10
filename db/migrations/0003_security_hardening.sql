-- Security hardening for the first real (Neon Auth) login. Hand-written (drizzle custom migration).
--
-- Trust model. The application server connects as the migration owner over the pooled
-- connection and, inside every transaction, runs `SET LOCAL ROLE kelabkit_app` and sets
-- two transaction-local settings from the verified session: app.user_id (the Neon Auth user)
-- and app.club_id (validated against club_members before use, see lib/db/with-club.ts).
-- Nothing in this schema can authenticate: it trusts the server to set app.user_id only from
-- a verified session and to run only parameterised SQL. Inside that boundary:
--
--   1. kelabkit_app can no longer write any money table. Payments, allocations, charges,
--      audit rows, attachments, clubs and club_members change only through kk_* functions.
--   2. Every kk_* entry point is SECURITY DEFINER, owned by the owner, with a pinned
--      search_path, and first asserts that app.user_id is a member of p_club_id (FORBIDDEN
--      otherwise) and, for corrections, that the member is the owner. The audit actor is
--      always app.user_id; the p_actor argument is kept for signature compatibility and ignored.
--   3. A user's own clubs are found through kk_my_clubs() before any club is known, and a
--      club is created with its owner membership atomically by kk_create_club().
--   4. Direct writes that stay: members, collections, club settings, clubs (update). They are
--      confined to one club by RLS (club_id = app.club_id), and the server only sets
--      app.club_id after kk_assert_member() has passed. Their audit rows go through kk_audit.
--
-- The Phase 2 foundation functions (0002) are kept as `*_impl` (invoker, pinned search_path,
-- revoked from the app role) and called only by the new definer wrappers, so the money
-- logic has one definition.

-- 0. The owner must be able to SET ROLE kelabkit_app. Fail loudly instead of swallowing.
DO $$
BEGIN
  EXECUTE format('GRANT kelabkit_app TO %I WITH SET TRUE, INHERIT FALSE', current_user);
  IF NOT pg_has_role(current_user, 'kelabkit_app', 'SET') THEN
    RAISE EXCEPTION 'owner % cannot SET ROLE kelabkit_app', current_user;
  END IF;
END
$$;--> statement-breakpoint

-- 1. Session helpers --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kk_current_user() RETURNS uuid
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;--> statement-breakpoint

-- Returns the caller's user id, or raises FORBIDDEN unless the caller belongs to p_club_id
-- (as owner when p_owner_only).
CREATE OR REPLACE FUNCTION public.kk_assert_member(p_club_id uuid, p_owner_only boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_current_user();
  v_role public.club_role;
BEGIN
  IF v_user IS NULL OR p_club_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
  SELECT role INTO v_role FROM public.club_members WHERE club_id = p_club_id AND user_id = v_user;
  IF NOT FOUND OR (p_owner_only AND v_role <> 'owner') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
  RETURN v_user;
END
$$;--> statement-breakpoint

-- The audit writer. Actor is the session user, never an argument.
CREATE OR REPLACE FUNCTION public.kk_audit(
  p_club_id uuid, p_actor uuid, p_action text, p_entity_id uuid, p_summary text,
  p_reason text DEFAULT NULL, p_before jsonb DEFAULT NULL, p_after jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.kk_assert_member(p_club_id);
BEGIN
  INSERT INTO public.audit_logs (club_id, actor_user_id, action, entity_id, summary, reason, before, after)
  VALUES (p_club_id, v_user, p_action, p_entity_id, p_summary, p_reason, p_before, p_after);
END
$$;--> statement-breakpoint

-- 2. Money functions: keep the 0002 bodies as *_impl, add asserting definer wrappers ------

ALTER FUNCTION public.kk_record_payment(uuid, text, uuid, public.payment_method, date, text, text, boolean, jsonb, uuid) RENAME TO kk_record_payment_impl;--> statement-breakpoint
ALTER FUNCTION public.kk_record_contribution(uuid, text, uuid, uuid, public.payment_method, date, text, text, boolean, bigint, uuid) RENAME TO kk_record_contribution_impl;--> statement-breakpoint
ALTER FUNCTION public.kk_confirm_payment(uuid, uuid, uuid) RENAME TO kk_confirm_payment_impl;--> statement-breakpoint
ALTER FUNCTION public.kk_reverse_payment(uuid, uuid, text, uuid) RENAME TO kk_reverse_payment_impl;--> statement-breakpoint
ALTER FUNCTION public.kk_set_charge_amount(uuid, uuid, bigint, text, uuid) RENAME TO kk_set_charge_amount_impl;--> statement-breakpoint

ALTER FUNCTION public.kk_record_payment_impl(uuid, text, uuid, public.payment_method, date, text, text, boolean, jsonb, uuid) SET search_path = public, pg_temp;--> statement-breakpoint
ALTER FUNCTION public.kk_record_contribution_impl(uuid, text, uuid, uuid, public.payment_method, date, text, text, boolean, bigint, uuid) SET search_path = public, pg_temp;--> statement-breakpoint
ALTER FUNCTION public.kk_confirm_payment_impl(uuid, uuid, uuid) SET search_path = public, pg_temp;--> statement-breakpoint
ALTER FUNCTION public.kk_reverse_payment_impl(uuid, uuid, text, uuid) SET search_path = public, pg_temp;--> statement-breakpoint
ALTER FUNCTION public.kk_set_charge_amount_impl(uuid, uuid, bigint, text, uuid) SET search_path = public, pg_temp;--> statement-breakpoint

CREATE FUNCTION public.kk_record_payment(
  p_club_id uuid, p_idempotency_key text, p_member_id uuid, p_method public.payment_method, p_paid_on date,
  p_reference text, p_note text, p_confirmed boolean, p_allocations jsonb, p_actor uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.kk_assert_member(p_club_id);
BEGIN
  RETURN public.kk_record_payment_impl(p_club_id, p_idempotency_key, p_member_id, p_method, p_paid_on,
                                       p_reference, p_note, p_confirmed, p_allocations, v_user);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.kk_record_contribution(
  p_club_id uuid, p_idempotency_key text, p_member_id uuid, p_collection_id uuid, p_method public.payment_method,
  p_paid_on date, p_reference text, p_note text, p_confirmed boolean, p_amount bigint, p_actor uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.kk_assert_member(p_club_id);
BEGIN
  RETURN public.kk_record_contribution_impl(p_club_id, p_idempotency_key, p_member_id, p_collection_id, p_method,
                                            p_paid_on, p_reference, p_note, p_confirmed, p_amount, v_user);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.kk_confirm_payment(p_club_id uuid, p_payment_id uuid, p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.kk_assert_member(p_club_id);
BEGIN
  PERFORM public.kk_confirm_payment_impl(p_club_id, p_payment_id, v_user);
END
$$;--> statement-breakpoint

-- Corrections (reverse, change what is owed, exempt) are owner-only.
CREATE FUNCTION public.kk_reverse_payment(p_club_id uuid, p_payment_id uuid, p_reason text, p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.kk_assert_member(p_club_id, true);
BEGIN
  PERFORM public.kk_reverse_payment_impl(p_club_id, p_payment_id, p_reason, v_user);
END
$$;--> statement-breakpoint

CREATE FUNCTION public.kk_set_charge_amount(
  p_club_id uuid, p_charge_id uuid, p_amount bigint, p_reason text, p_actor uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.kk_assert_member(p_club_id, true);
BEGIN
  PERFORM public.kk_set_charge_amount_impl(p_club_id, p_charge_id, p_amount, p_reason, v_user);
END
$$;--> statement-breakpoint

-- 3. New writers for the tables the app role may no longer touch -------------------------

-- Creates charges for participants. No assert, no audit: internal, called by definer functions.
-- One charge per period (monthly), one (one-off), none (voluntary). Mirrors chargesFor in
-- lib/backend/demo.ts. Input: [{"member_id", "amount_override", "exempt", "note"}].
CREATE FUNCTION public.kk_insert_participants(p_club_id uuid, p_collection_id uuid, p_participants jsonb) RETURNS text
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_col record;
  e jsonb;
  v_member uuid;
  v_name text;
  v_names text[] := '{}';
  v_text text;
  v_override bigint;
  v_exempt boolean;
  v_note text;
  v_amount bigint;
BEGIN
  SELECT type, default_amount, due_date INTO v_col FROM public.collections WHERE club_id = p_club_id AND id = p_collection_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_NOT_FOUND'; END IF;
  IF p_participants IS NULL OR jsonb_typeof(p_participants) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NOT_FOUND';
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_participants) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NOT_FOUND'; END IF;
    BEGIN
      v_member := (e ->> 'member_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NOT_FOUND';
    END;
    SELECT name INTO v_name FROM public.members WHERE club_id = p_club_id AND id = v_member;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NOT_FOUND'; END IF;
    IF EXISTS (SELECT 1 FROM public.participants WHERE club_id = p_club_id AND collection_id = p_collection_id AND member_id = v_member) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PARTICIPANT_EXISTS';
    END IF;

    v_override := NULL;
    IF e -> 'amount_override' IS NOT NULL AND jsonb_typeof(e -> 'amount_override') <> 'null' THEN
      v_text := e ->> 'amount_override';
      IF jsonb_typeof(e -> 'amount_override') <> 'number' OR v_text !~ '^-?[0-9]{1,15}$' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AMOUNT_INVALID';
      END IF;
      v_override := v_text::bigint;
    END IF;
    v_exempt := coalesce((e ->> 'exempt')::boolean, false);
    v_note := e ->> 'note';
    v_amount := coalesce(v_override, v_col.default_amount, 0);
    IF v_col.type <> 'voluntary' AND NOT v_exempt THEN PERFORM public.kk_check_amount(v_amount); END IF;

    INSERT INTO public.participants (club_id, collection_id, member_id, amount_override, exempt, note)
      VALUES (p_club_id, p_collection_id, v_member, v_override, v_exempt, v_note);

    IF v_col.type = 'one_off' THEN
      INSERT INTO public.charges (club_id, collection_id, period_id, member_id, amount, exempt, exempt_reason, due_date, note)
        VALUES (p_club_id, p_collection_id, NULL, v_member, v_amount, v_exempt,
                CASE WHEN v_exempt THEN coalesce(nullif(btrim(v_note), ''), 'Dikecualikan semasa kutipan dicipta') END,
                v_col.due_date, CASE WHEN v_exempt THEN NULL ELSE v_note END);
    ELSIF v_col.type = 'monthly' THEN
      INSERT INTO public.charges (club_id, collection_id, period_id, member_id, amount, exempt, exempt_reason, due_date, note)
        SELECT p_club_id, p_collection_id, pr.id, v_member, v_amount, v_exempt,
               CASE WHEN v_exempt THEN coalesce(nullif(btrim(v_note), ''), 'Dikecualikan semasa kutipan dicipta') END,
               pr.due_date, CASE WHEN v_exempt THEN NULL ELSE v_note END
        FROM public.collection_periods pr WHERE pr.club_id = p_club_id AND pr.collection_id = p_collection_id;
    END IF;
    v_names := v_names || v_name;
  END LOOP;
  RETURN array_to_string(v_names, ', ');
END
$$;--> statement-breakpoint

-- Input: p_collection {"name","type","activate","icon","description","notes","default_amount",
-- "due_date","start_month","end_month","due_day"}, p_periods [{"month":"YYYY-MM-01","due_date"}],
-- p_participants as for kk_insert_participants. The server validates names, icon and month
-- ranges first (lib/server/service.ts); this function owns the integrity of the writes.
CREATE FUNCTION public.kk_create_collection(
  p_club_id uuid, p_collection jsonb, p_periods jsonb, p_participants jsonb, p_actor uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_assert_member(p_club_id);
  v_type public.collection_type := (p_collection ->> 'type')::public.collection_type;
  v_name text := btrim(coalesce(p_collection ->> 'name', ''));
  v_activate boolean := coalesce((p_collection ->> 'activate')::boolean, false);
  v_default bigint := (p_collection ->> 'default_amount')::bigint;
  v_periods int := CASE WHEN jsonb_typeof(p_periods) = 'array' THEN jsonb_array_length(p_periods) ELSE 0 END;
  v_count int := CASE WHEN jsonb_typeof(p_participants) = 'array' THEN jsonb_array_length(p_participants) ELSE 0 END;
  v_id uuid;
  p jsonb;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NAME_REQUIRED'; END IF;
  IF v_type <> 'voluntary' THEN PERFORM public.kk_check_amount(coalesce(v_default, 0)); END IF;
  IF v_type = 'monthly' THEN
    IF v_periods = 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MONTH_RANGE_INVALID'; END IF;
    IF v_periods > 36 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MONTH_RANGE_TOO_LONG'; END IF;
  ELSIF v_periods <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MONTH_RANGE_INVALID';
  END IF;
  IF v_activate AND v_count = 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_NO_MEMBERS'; END IF;

  INSERT INTO public.collections (
    club_id, name, type, status, icon, description, notes, default_amount, due_date, start_month, end_month, due_day
  ) VALUES (
    p_club_id, v_name, v_type, CASE WHEN v_activate THEN 'active' ELSE 'draft' END::public.collection_status,
    nullif(p_collection ->> 'icon', ''), nullif(btrim(coalesce(p_collection ->> 'description', '')), ''),
    nullif(btrim(coalesce(p_collection ->> 'notes', '')), ''),
    CASE WHEN v_type = 'voluntary' THEN NULL ELSE v_default END,
    CASE WHEN v_type = 'one_off' THEN (p_collection ->> 'due_date')::date END,
    CASE WHEN v_type = 'monthly' THEN (p_collection ->> 'start_month')::date END,
    CASE WHEN v_type = 'monthly' THEN (p_collection ->> 'end_month')::date END,
    CASE WHEN v_type = 'monthly' THEN (p_collection ->> 'due_day')::smallint END
  ) RETURNING id INTO v_id;

  IF v_type = 'monthly' THEN
    FOR p IN SELECT * FROM jsonb_array_elements(p_periods) LOOP
      INSERT INTO public.collection_periods (club_id, collection_id, month, due_date)
        VALUES (p_club_id, v_id, (p ->> 'month')::date, (p ->> 'due_date')::date);
    END LOOP;
  END IF;

  PERFORM public.kk_insert_participants(p_club_id, v_id, p_participants);
  PERFORM public.kk_audit(p_club_id, v_user, 'collection.create', v_id,
    'Kutipan "' || v_name || '" dicipta untuk ' || v_count || ' ahli');
  RETURN v_id;
END
$$;--> statement-breakpoint

CREATE FUNCTION public.kk_add_participants(p_club_id uuid, p_collection_id uuid, p_participants jsonb, p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_assert_member(p_club_id);
  v_name text;
  v_status public.collection_status;
  v_names text;
BEGIN
  SELECT name, status INTO v_name, v_status
    FROM public.collections WHERE club_id = p_club_id AND id = p_collection_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_NOT_FOUND'; END IF;
  IF v_status = 'archived' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_ARCHIVED'; END IF;
  v_names := public.kk_insert_participants(p_club_id, p_collection_id, p_participants);
  PERFORM public.kk_audit(p_club_id, v_user, 'collection.participants', p_collection_id,
    v_names || ' ditambah ke "' || v_name || '"');
END
$$;--> statement-breakpoint

-- Exempting is refused once money exists on the charge (reverse the payment first).
CREATE FUNCTION public.kk_set_charge_exempt(
  p_club_id uuid, p_charge_id uuid, p_exempt boolean, p_reason text, p_actor uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_assert_member(p_club_id, true);
  v_reason text := nullif(btrim(p_reason), '');
  v_member uuid;
  v_collection uuid;
  v_confirmed bigint;
  v_pending bigint;
  v_member_name text;
  v_collection_name text;
BEGIN
  SELECT member_id, collection_id INTO v_member, v_collection
    FROM public.charges WHERE club_id = p_club_id AND id = p_charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHARGE_NOT_FOUND'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REASON_REQUIRED'; END IF;
  SELECT confirmed, pending INTO v_confirmed, v_pending
    FROM public.charge_ledger WHERE club_id = p_club_id AND charge_id = p_charge_id;
  IF p_exempt AND v_confirmed + v_pending > 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AMOUNT_BELOW_PAID'; END IF;
  UPDATE public.charges
    SET exempt = p_exempt, exempt_reason = CASE WHEN p_exempt THEN v_reason END, updated_at = now()
    WHERE club_id = p_club_id AND id = p_charge_id;
  SELECT name INTO v_member_name FROM public.members WHERE club_id = p_club_id AND id = v_member;
  SELECT name INTO v_collection_name FROM public.collections WHERE club_id = p_club_id AND id = v_collection;
  PERFORM public.kk_audit(p_club_id, v_user, 'charge.exempt', p_charge_id,
    v_member_name || CASE WHEN p_exempt THEN ' dikecualikan daripada' ELSE ' tidak lagi dikecualikan daripada' END
      || ' "' || v_collection_name || '"', v_reason);
END
$$;--> statement-breakpoint

-- One-off collections only: moves the collection's due date and every charge's.
CREATE FUNCTION public.kk_set_collection_due_date(p_club_id uuid, p_collection_id uuid, p_due_date date, p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_assert_member(p_club_id);
  v_name text;
  v_type public.collection_type;
  v_status public.collection_status;
BEGIN
  SELECT name, type, status INTO v_name, v_type, v_status
    FROM public.collections WHERE club_id = p_club_id AND id = p_collection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_NOT_FOUND'; END IF;
  IF v_status = 'archived' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_ARCHIVED'; END IF;
  IF v_type <> 'one_off' THEN RETURN; END IF;
  UPDATE public.collections SET due_date = p_due_date, updated_at = now() WHERE club_id = p_club_id AND id = p_collection_id;
  UPDATE public.charges SET due_date = p_due_date, updated_at = now() WHERE club_id = p_club_id AND collection_id = p_collection_id;
  PERFORM public.kk_audit(p_club_id, v_user, 'collection.update', p_collection_id,
    'Tarikh akhir "' || v_name || '" ditukar');
END
$$;--> statement-breakpoint

-- 4. Clubs: find mine, create one ---------------------------------------------------------

CREATE FUNCTION public.kk_my_clubs() RETURNS TABLE (
  id uuid, name text, session text, school text, treasurer_name text, role public.club_role, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name, c.session, c.school, c.treasurer_name, m.role, c.created_at
  FROM public.club_members m JOIN public.clubs c ON c.id = m.club_id
  WHERE m.user_id = public.kk_current_user()
  ORDER BY c.created_at, c.id
$$;--> statement-breakpoint

-- Creates the club and the caller's owner membership in one transaction. Seeds nothing.
-- At most 5 clubs per owner: sign-up is open to any Google account.
CREATE FUNCTION public.kk_create_club(p_name text, p_session text, p_school text, p_treasurer_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_current_user();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_session text := btrim(coalesce(p_session, ''));
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NAME_REQUIRED'; END IF;
  IF length(v_name) > 120 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NAME_TOO_LONG'; END IF;
  IF v_session = '' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SESSION_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('kk_create_club:' || v_user::text, 0));
  IF (SELECT count(*) FROM public.club_members WHERE user_id = v_user AND role = 'owner') >= 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CLUB_LIMIT';
  END IF;
  INSERT INTO public.clubs (name, session, school, treasurer_name, created_by_user_id)
    VALUES (v_name, v_session, nullif(btrim(coalesce(p_school, '')), ''), nullif(btrim(coalesce(p_treasurer_name, '')), ''), v_user)
    RETURNING id INTO v_id;
  INSERT INTO public.club_members (club_id, user_id, role) VALUES (v_id, v_user, 'owner');
  INSERT INTO public.audit_logs (club_id, actor_user_id, action, entity_id, summary)
    VALUES (v_id, v_user, 'club.update', v_id, 'Kelab "' || v_name || '" dicipta');
  RETURN v_id;
END
$$;--> statement-breakpoint

-- Display names for audit rows: club members' names from Neon Auth. plpgsql, so the
-- neon_auth reference is resolved when called, not when this migration runs.
CREATE FUNCTION public.kk_actor_names(p_club_id uuid) RETURNS TABLE (user_id uuid, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.kk_assert_member(p_club_id);
  RETURN QUERY
    SELECT m.user_id, u.name FROM public.club_members m JOIN neon_auth."user" u ON u.id = m.user_id
    WHERE m.club_id = p_club_id;
END
$$;--> statement-breakpoint

-- 5. RLS for club_members: my own rows (to find my clubs) or the current club's -------------

DROP POLICY IF EXISTS tenant_isolation ON public.club_members;--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.club_members
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid
         OR club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint

-- 6. Privileges ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON public.payments, public.payment_allocations, public.charges,
  public.audit_logs, public.attachments, public.club_members FROM kelabkit_app;--> statement-breakpoint
REVOKE INSERT, DELETE ON public.clubs FROM kelabkit_app;--> statement-breakpoint

-- Internal implementations and helpers are not entry points.
REVOKE ALL ON FUNCTION
  public.kk_record_payment_impl(uuid, text, uuid, public.payment_method, date, text, text, boolean, jsonb, uuid),
  public.kk_record_contribution_impl(uuid, text, uuid, uuid, public.payment_method, date, text, text, boolean, bigint, uuid),
  public.kk_confirm_payment_impl(uuid, uuid, uuid), public.kk_reverse_payment_impl(uuid, uuid, text, uuid),
  public.kk_set_charge_amount_impl(uuid, uuid, bigint, text, uuid), public.kk_insert_participants(uuid, uuid, jsonb),
  public.kk_use_club(uuid), public.kk_parse_allocations(jsonb)
FROM PUBLIC, kelabkit_app;--> statement-breakpoint

REVOKE ALL ON FUNCTION
  public.kk_current_user(), public.kk_assert_member(uuid, boolean),
  public.kk_record_payment(uuid, text, uuid, public.payment_method, date, text, text, boolean, jsonb, uuid),
  public.kk_record_contribution(uuid, text, uuid, uuid, public.payment_method, date, text, text, boolean, bigint, uuid),
  public.kk_confirm_payment(uuid, uuid, uuid), public.kk_reverse_payment(uuid, uuid, text, uuid),
  public.kk_set_charge_amount(uuid, uuid, bigint, text, uuid),
  public.kk_create_collection(uuid, jsonb, jsonb, jsonb, uuid), public.kk_add_participants(uuid, uuid, jsonb, uuid),
  public.kk_set_charge_exempt(uuid, uuid, boolean, text, uuid), public.kk_set_collection_due_date(uuid, uuid, date, uuid),
  public.kk_my_clubs(), public.kk_create_club(text, text, text, text), public.kk_actor_names(uuid),
  public.kk_audit(uuid, uuid, text, uuid, text, text, jsonb, jsonb)
FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION
  public.kk_current_user(), public.kk_assert_member(uuid, boolean),
  public.kk_record_payment(uuid, text, uuid, public.payment_method, date, text, text, boolean, jsonb, uuid),
  public.kk_record_contribution(uuid, text, uuid, uuid, public.payment_method, date, text, text, boolean, bigint, uuid),
  public.kk_confirm_payment(uuid, uuid, uuid), public.kk_reverse_payment(uuid, uuid, text, uuid),
  public.kk_set_charge_amount(uuid, uuid, bigint, text, uuid),
  public.kk_create_collection(uuid, jsonb, jsonb, jsonb, uuid), public.kk_add_participants(uuid, uuid, jsonb, uuid),
  public.kk_set_charge_exempt(uuid, uuid, boolean, text, uuid), public.kk_set_collection_due_date(uuid, uuid, date, uuid),
  public.kk_my_clubs(), public.kk_create_club(text, text, text, text), public.kk_actor_names(uuid),
  public.kk_audit(uuid, uuid, text, uuid, text, text, jsonb, jsonb)
TO kelabkit_app;
