-- Money invariants in Postgres. Hand-written (drizzle custom migration).
--
-- Every kk_* function is SECURITY INVOKER, runs as one statement-level transaction in the
-- caller's transaction, and sets app.club_id (transaction-local) from p_club_id before it
-- touches a tenant table, so RLS applies when the caller is kelabkit_app.
--
-- Errors are RAISE EXCEPTION with SQLSTATE 'P0001' and MESSAGE equal to a code in
-- lib/errors.ts (OVERPAYMENT, AMOUNT_BELOW_PAID, REASON_REQUIRED, ...). The next PR maps
-- error.message to KelabError 1:1.
--
-- Isolation: written for READ COMMITTED (the default). The ledger is re-read after the
-- target charge rows are locked FOR UPDATE, so a concurrent writer's committed allocations
-- are visible. Under REPEATABLE READ the snapshot would predate the lock and the check
-- could be stale; do not call these functions in such a transaction.
--
-- Lock order, to rule out deadlocks: collections (FOR SHARE), then charges (FOR UPDATE, by
-- id), then payments. Single-row writers (confirm, reverse, set amount) take one lock.

CREATE OR REPLACE FUNCTION public.kk_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.kk_money(p_sen bigint) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'RM ' || to_char(p_sen / 100.0, 'FM999,999,990.00') $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.kk_use_club(p_club_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.club_id', coalesce(p_club_id::text, ''), true);
END
$$;--> statement-breakpoint

-- Mirrors checkAmount in lib/backend/demo.ts. 10,000,000 sen = RM100,000.00 (MAX_AMOUNT_SEN).
CREATE OR REPLACE FUNCTION public.kk_check_amount(p_amount bigint, p_allow_zero boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_amount IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AMOUNT_INVALID'; END IF;
  IF p_amount < 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AMOUNT_NEGATIVE'; END IF;
  IF p_amount = 0 AND NOT p_allow_zero THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AMOUNT_ZERO'; END IF;
  IF p_amount > 10000000 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AMOUNT_TOO_LARGE'; END IF;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.kk_audit(
  p_club_id uuid, p_actor uuid, p_action text, p_entity_id uuid, p_summary text,
  p_reason text DEFAULT NULL, p_before jsonb DEFAULT NULL, p_after jsonb DEFAULT NULL
) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.audit_logs (club_id, actor_user_id, action, entity_id, summary, reason, before, after)
  VALUES (p_club_id, p_actor, p_action, p_entity_id, p_summary, p_reason, p_before, p_after)
$$;--> statement-breakpoint

-- What each charge owes and has received. Mirrors chargeLedger in lib/money/ledger.ts:
--   required  = 0 when exempt, else amount
--   confirmed = allocations of confirmed payments (the only money that counts as collected)
--   pending   = allocations of pending payments
--   remaining = max(0, required - confirmed)
--   payable   = max(0, required - confirmed - pending): what a new payment may still cover
-- security_invoker makes the view run with the caller's rights, so RLS applies to it.
CREATE OR REPLACE VIEW public.charge_ledger WITH (security_invoker = true) AS
SELECT
  c.club_id,
  c.id AS charge_id,
  c.collection_id,
  c.period_id,
  c.member_id,
  r.required,
  m.confirmed,
  m.pending,
  greatest(0, r.required - m.confirmed) AS remaining,
  greatest(0, r.required - m.confirmed - m.pending) AS payable,
  CASE
    WHEN c.exempt THEN 'exempt'
    WHEN m.confirmed >= r.required THEN 'paid'
    WHEN m.confirmed > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS status,
  m.last_paid_on
FROM public.charges c
CROSS JOIN LATERAL (SELECT (CASE WHEN c.exempt THEN 0 ELSE c.amount END)::bigint AS required) r
CROSS JOIN LATERAL (
  SELECT
    coalesce(sum(a.amount) FILTER (WHERE p.state = 'confirmed'), 0)::bigint AS confirmed,
    coalesce(sum(a.amount) FILTER (WHERE p.state = 'pending'), 0)::bigint AS pending,
    max(p.paid_on) FILTER (WHERE p.state = 'confirmed') AS last_paid_on
  FROM public.payment_allocations a
  JOIN public.payments p ON p.club_id = a.club_id AND p.id = a.payment_id
  WHERE a.club_id = c.club_id AND a.charge_id = c.id
) m;--> statement-breakpoint

-- Validates [{"charge_id": uuid, "amount": sen}, ...] and merges duplicate charges, so two
-- lines for one charge cannot each pass the payable check and jointly overpay.
CREATE OR REPLACE FUNCTION public.kk_parse_allocations(p_allocations jsonb)
RETURNS TABLE (charge_id uuid, amount bigint)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  e jsonb;
  v_charge uuid;
  v_text text;
  v_amount bigint;
  v_seen jsonb := '{}'::jsonb;
BEGIN
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_EMPTY';
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHARGE_NOT_FOUND'; END IF;
    BEGIN
      v_charge := (e ->> 'charge_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHARGE_NOT_FOUND';
    END;
    IF v_charge IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHARGE_NOT_FOUND'; END IF;
    v_text := e ->> 'amount';
    IF jsonb_typeof(e -> 'amount') IS DISTINCT FROM 'number' OR v_text !~ '^-?[0-9]+$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AMOUNT_INVALID';
    END IF;
    IF length(v_text) > 15 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = CASE WHEN left(v_text, 1) = '-' THEN 'AMOUNT_NEGATIVE' ELSE 'AMOUNT_TOO_LARGE' END;
    END IF;
    v_amount := v_text::bigint;
    PERFORM public.kk_check_amount(v_amount);
    v_seen := jsonb_set(v_seen, ARRAY[v_charge::text], to_jsonb(coalesce((v_seen ->> v_charge::text)::bigint, 0) + v_amount));
  END LOOP;
  RETURN QUERY
    SELECT k::uuid, (v_seen ->> k)::bigint FROM jsonb_object_keys(v_seen) k;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.kk_record_payment(
  p_club_id uuid,
  p_idempotency_key text,
  p_member_id uuid,
  p_method public.payment_method,
  p_paid_on date,
  p_reference text,
  p_note text,
  p_confirmed boolean,
  p_allocations jsonb,
  p_actor uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_existing uuid;
  v_member text;
  v_cols uuid[];
  v_ids uuid[];
  v_locked int;
  v_row record;
  v_total bigint := 0;
  v_id uuid;
BEGIN
  PERFORM public.kk_use_club(p_club_id);

  -- Idempotency: serialise same-key callers, then return the first result untouched.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_club_id::text || ':' || p_idempotency_key, 0));
  SELECT id INTO v_existing FROM public.payments WHERE club_id = p_club_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT name INTO v_member FROM public.members WHERE club_id = p_club_id AND id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NOT_FOUND'; END IF;

  IF p_paid_on IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_INVALID'; END IF;
  IF p_paid_on > public.kk_today() THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_IN_FUTURE'; END IF;

  SELECT array_agg(a.charge_id ORDER BY a.charge_id) INTO v_ids FROM public.kk_parse_allocations(p_allocations) a;

  -- Lock: collections FOR SHARE (blocks a concurrent archive), then the charges FOR UPDATE.
  SELECT array_agg(DISTINCT c.collection_id) INTO v_cols
    FROM public.charges c WHERE c.club_id = p_club_id AND c.id = ANY (v_ids) AND c.member_id = p_member_id;
  PERFORM 1 FROM public.collections WHERE club_id = p_club_id AND id = ANY (coalesce(v_cols, '{}')) ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.charges c
    WHERE c.club_id = p_club_id AND c.id = ANY (v_ids) AND c.member_id = p_member_id ORDER BY c.id FOR UPDATE;
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked <> cardinality(v_ids) THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHARGE_NOT_FOUND'; END IF;

  -- Read the ledger only now, after the locks, so concurrent committed payments are seen.
  FOR v_row IN
    SELECT a.charge_id, a.amount, c.exempt, col.status, l.payable
    FROM public.kk_parse_allocations(p_allocations) a
    JOIN public.charges c ON c.club_id = p_club_id AND c.id = a.charge_id
    JOIN public.collections col ON col.club_id = p_club_id AND col.id = c.collection_id
    JOIN public.charge_ledger l ON l.club_id = p_club_id AND l.charge_id = c.id
    ORDER BY a.charge_id
  LOOP
    IF v_row.exempt THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHARGE_EXEMPT'; END IF;
    IF v_row.status = 'archived' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_ARCHIVED'; END IF;
    IF v_row.amount > v_row.payable THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OVERPAYMENT'; END IF;
    v_total := v_total + v_row.amount;
  END LOOP;
  PERFORM public.kk_check_amount(v_total);

  INSERT INTO public.payments (
    club_id, idempotency_key, member_id, collection_id, amount, method, paid_on, reference, note,
    state, confirmed_at, created_by_user_id
  ) VALUES (
    p_club_id, p_idempotency_key, p_member_id, NULL, v_total, p_method, p_paid_on,
    nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''),
    CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending' END::public.payment_state,
    CASE WHEN p_confirmed THEN now() END, p_actor
  ) RETURNING id INTO v_id;

  INSERT INTO public.payment_allocations (club_id, payment_id, charge_id, amount)
    SELECT p_club_id, v_id, a.charge_id, a.amount FROM public.kk_parse_allocations(p_allocations) a;

  PERFORM public.kk_audit(
    p_club_id, p_actor, 'payment.record', v_id,
    'Bayaran ' || public.kk_money(v_total) || ' daripada ' || v_member || ' direkod'
      || CASE WHEN p_confirmed THEN '' ELSE ' (menunggu semakan)' END,
    NULL, NULL,
    jsonb_build_object('amount', v_total, 'state', CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending' END,
                       'paid_on', p_paid_on, 'allocations', p_allocations)
  );
  RETURN v_id;
END
$$;--> statement-breakpoint

-- Voluntary collections: money with no charge, never debt. Same idempotency and date rules.
CREATE OR REPLACE FUNCTION public.kk_record_contribution(
  p_club_id uuid,
  p_idempotency_key text,
  p_member_id uuid,
  p_collection_id uuid,
  p_method public.payment_method,
  p_paid_on date,
  p_reference text,
  p_note text,
  p_confirmed boolean,
  p_amount bigint,
  p_actor uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_existing uuid;
  v_member text;
  v_type public.collection_type;
  v_status public.collection_status;
  v_id uuid;
BEGIN
  PERFORM public.kk_use_club(p_club_id);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_club_id::text || ':' || p_idempotency_key, 0));
  SELECT id INTO v_existing FROM public.payments WHERE club_id = p_club_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT type, status INTO v_type, v_status
    FROM public.collections WHERE club_id = p_club_id AND id = p_collection_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_NOT_FOUND'; END IF;
  IF v_type <> 'voluntary' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHARGE_NOT_FOUND'; END IF;
  IF v_status = 'archived' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COLLECTION_ARCHIVED'; END IF;

  SELECT name INTO v_member FROM public.members WHERE club_id = p_club_id AND id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NOT_FOUND'; END IF;

  IF p_paid_on IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_INVALID'; END IF;
  IF p_paid_on > public.kk_today() THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_IN_FUTURE'; END IF;
  PERFORM public.kk_check_amount(p_amount);

  INSERT INTO public.payments (
    club_id, idempotency_key, member_id, collection_id, amount, method, paid_on, reference, note,
    state, confirmed_at, created_by_user_id
  ) VALUES (
    p_club_id, p_idempotency_key, p_member_id, p_collection_id, p_amount, p_method, p_paid_on,
    nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''),
    CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending' END::public.payment_state,
    CASE WHEN p_confirmed THEN now() END, p_actor
  ) RETURNING id INTO v_id;

  PERFORM public.kk_audit(
    p_club_id, p_actor, 'payment.record', v_id,
    'Sumbangan ' || public.kk_money(p_amount) || ' daripada ' || v_member || ' direkod'
      || CASE WHEN p_confirmed THEN '' ELSE ' (menunggu semakan)' END,
    NULL, NULL,
    jsonb_build_object('amount', p_amount, 'state', CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending' END,
                       'paid_on', p_paid_on, 'collection_id', p_collection_id)
  );
  RETURN v_id;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.kk_confirm_payment(p_club_id uuid, p_payment_id uuid, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_state public.payment_state;
  v_amount bigint;
  v_member text;
BEGIN
  PERFORM public.kk_use_club(p_club_id);
  SELECT p.state, p.amount, m.name INTO v_state, v_amount, v_member
    FROM public.payments p JOIN public.members m ON m.club_id = p.club_id AND m.id = p.member_id
    WHERE p.club_id = p_club_id AND p.id = p_payment_id
    FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_NOT_FOUND'; END IF;
  IF v_state <> 'pending' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_NOT_PENDING'; END IF;

  UPDATE public.payments SET state = 'confirmed', confirmed_at = now() WHERE club_id = p_club_id AND id = p_payment_id;
  PERFORM public.kk_audit(
    p_club_id, p_actor, 'payment.confirm', p_payment_id,
    'Penerimaan ' || public.kk_money(v_amount) || ' daripada ' || v_member || ' disahkan',
    NULL, jsonb_build_object('state', 'pending'), jsonb_build_object('state', 'confirmed')
  );
END
$$;--> statement-breakpoint

-- Keeps the row and marks it reversed with a reason; never deletes.
CREATE OR REPLACE FUNCTION public.kk_reverse_payment(p_club_id uuid, p_payment_id uuid, p_reason text, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_state public.payment_state;
  v_amount bigint;
  v_member text;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  PERFORM public.kk_use_club(p_club_id);
  SELECT p.state, p.amount, m.name INTO v_state, v_amount, v_member
    FROM public.payments p JOIN public.members m ON m.club_id = p.club_id AND m.id = p.member_id
    WHERE p.club_id = p_club_id AND p.id = p_payment_id
    FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_NOT_FOUND'; END IF;
  IF v_state = 'reversed' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_ALREADY_REVERSED'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REASON_REQUIRED'; END IF;

  UPDATE public.payments
    SET state = 'reversed', reversed_at = now(), reversal_reason = v_reason, reversed_by_user_id = p_actor
    WHERE club_id = p_club_id AND id = p_payment_id;
  PERFORM public.kk_audit(
    p_club_id, p_actor, 'payment.reverse', p_payment_id,
    'Bayaran ' || public.kk_money(v_amount) || ' daripada ' || v_member || ' dibatalkan',
    v_reason, jsonb_build_object('state', v_state), jsonb_build_object('state', 'reversed')
  );
END
$$;--> statement-breakpoint

-- Changes what a member owes. Refused below confirmed + pending; a reason is required once
-- any money exists on the charge. Not a way to correct a payment (use kk_reverse_payment).
CREATE OR REPLACE FUNCTION public.kk_set_charge_amount(
  p_club_id uuid, p_charge_id uuid, p_amount bigint, p_reason text, p_actor uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_before bigint;
  v_member uuid;
  v_collection uuid;
  v_confirmed bigint;
  v_pending bigint;
  v_reason text := nullif(btrim(p_reason), '');
  v_member_name text;
  v_collection_name text;
BEGIN
  PERFORM public.kk_use_club(p_club_id);
  SELECT amount, member_id, collection_id INTO v_before, v_member, v_collection
    FROM public.charges WHERE club_id = p_club_id AND id = p_charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHARGE_NOT_FOUND'; END IF;
  PERFORM public.kk_check_amount(p_amount);

  -- After the lock: a payment recorded concurrently has committed or is waiting behind us.
  SELECT confirmed, pending INTO v_confirmed, v_pending
    FROM public.charge_ledger WHERE club_id = p_club_id AND charge_id = p_charge_id;
  IF p_amount < v_confirmed + v_pending THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AMOUNT_BELOW_PAID'; END IF;
  IF v_confirmed + v_pending > 0 AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REASON_REQUIRED';
  END IF;

  UPDATE public.charges SET amount = p_amount, updated_at = now() WHERE club_id = p_club_id AND id = p_charge_id;
  SELECT name INTO v_member_name FROM public.members WHERE club_id = p_club_id AND id = v_member;
  SELECT name INTO v_collection_name FROM public.collections WHERE club_id = p_club_id AND id = v_collection;
  PERFORM public.kk_audit(
    p_club_id, p_actor, 'charge.amount', p_charge_id,
    'Amaun ' || v_member_name || ' untuk "' || v_collection_name || '" ditukar dari '
      || public.kk_money(v_before) || ' ke ' || public.kk_money(p_amount),
    v_reason, jsonb_build_object('amount', v_before), jsonb_build_object('amount', p_amount)
  );
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION
  public.kk_today(), public.kk_money(bigint), public.kk_use_club(uuid), public.kk_check_amount(bigint, boolean),
  public.kk_audit(uuid, uuid, text, uuid, text, text, jsonb, jsonb), public.kk_parse_allocations(jsonb),
  public.kk_record_payment(uuid, text, uuid, public.payment_method, date, text, text, boolean, jsonb, uuid),
  public.kk_record_contribution(uuid, text, uuid, uuid, public.payment_method, date, text, text, boolean, bigint, uuid),
  public.kk_confirm_payment(uuid, uuid, uuid), public.kk_reverse_payment(uuid, uuid, text, uuid),
  public.kk_set_charge_amount(uuid, uuid, bigint, text, uuid)
FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION
  public.kk_today(), public.kk_money(bigint), public.kk_use_club(uuid), public.kk_check_amount(bigint, boolean),
  public.kk_audit(uuid, uuid, text, uuid, text, text, jsonb, jsonb), public.kk_parse_allocations(jsonb),
  public.kk_record_payment(uuid, text, uuid, public.payment_method, date, text, text, boolean, jsonb, uuid),
  public.kk_record_contribution(uuid, text, uuid, uuid, public.payment_method, date, text, text, boolean, bigint, uuid),
  public.kk_confirm_payment(uuid, uuid, uuid), public.kk_reverse_payment(uuid, uuid, text, uuid),
  public.kk_set_charge_amount(uuid, uuid, bigint, text, uuid)
TO kelabkit_app;--> statement-breakpoint

GRANT SELECT ON public.charge_ledger TO kelabkit_app;
