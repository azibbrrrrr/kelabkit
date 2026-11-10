-- Proof attachments in signed-in mode. Hand-written (drizzle custom migration). Additive only:
-- two new functions, no table or column changes (the attachments table and its storage_key
-- column exist since 0000). Old application code never calls them, so applying this ahead of
-- the deploy is safe, and reverting the deploy leaves them unused.
--
-- The bytes live in private object storage under
--   clubs/<club id>/payments/<payment id>/<attachment id>
-- and only this metadata row says an object is part of the record. Both writers follow the
-- 0003 pattern: SECURITY DEFINER, pinned search_path, kk_assert_member first, audit through
-- kk_audit. A payment id from another club finds no row under the club filter and is refused
-- as FORBIDDEN, the same answer as a non-member, so ids cannot be probed across clubs.

CREATE FUNCTION public.kk_add_attachment(
  p_club_id uuid, p_payment_id uuid, p_attachment_id uuid, p_file_name text, p_mime_type text,
  p_size_bytes bigint, p_sha256 text, p_storage_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_assert_member(p_club_id);
  v_payment record;
  v_member text;
  v_active int;
BEGIN
  -- The row lock serialises concurrent adds (the active count below) with a reversal.
  SELECT p.state, p.amount, p.member_id INTO v_payment
    FROM public.payments p WHERE p.club_id = p_club_id AND p.id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN'; END IF;
  IF v_payment.state = 'reversed' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_PAYMENT_REVERSED'; END IF;
  IF p_attachment_id IS NULL OR p_storage_key IS DISTINCT FROM
     ('clubs/' || p_club_id || '/payments/' || p_payment_id || '/' || p_attachment_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_TYPE';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_EMPTY'; END IF;
  IF p_size_bytes > 10 * 1024 * 1024 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_TOO_LARGE'; END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' OR length(btrim(coalesce(p_file_name, ''))) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_TYPE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.attachments WHERE id = p_attachment_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_DUPLICATE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.attachments WHERE club_id = p_club_id AND payment_id = p_payment_id
             AND removed_at IS NULL AND sha256 = p_sha256) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_DUPLICATE';
  END IF;
  SELECT count(*) INTO v_active FROM public.attachments
    WHERE club_id = p_club_id AND payment_id = p_payment_id AND removed_at IS NULL;
  IF v_active >= 5 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_LIMIT'; END IF;

  INSERT INTO public.attachments (id, club_id, payment_id, file_name, mime_type, size_bytes, sha256, storage_key)
    VALUES (p_attachment_id, p_club_id, p_payment_id, btrim(p_file_name), p_mime_type, p_size_bytes, p_sha256, p_storage_key);
  SELECT name INTO v_member FROM public.members WHERE club_id = p_club_id AND id = v_payment.member_id;
  PERFORM public.kk_audit(p_club_id, NULL, 'attachment.add', p_attachment_id,
    'Bukti "' || btrim(p_file_name) || '" dilampirkan pada bayaran ' || public.kk_money(v_payment.amount)
      || ' daripada ' || coalesce(v_member, 'Ahli'));
  RETURN p_attachment_id;
END
$$;--> statement-breakpoint

-- Soft remove: the row stays with removed_at and the reason (nothing about money is deleted).
-- Returns the storage key so the caller can delete the object after this transaction commits.
CREATE FUNCTION public.kk_remove_attachment(p_club_id uuid, p_attachment_id uuid, p_reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_assert_member(p_club_id);
  v_att record;
  v_payment record;
  v_member text;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT a.payment_id, a.file_name, a.storage_key, a.removed_at INTO v_att
    FROM public.attachments a WHERE a.club_id = p_club_id AND a.id = p_attachment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_NOT_FOUND'; END IF;
  IF v_att.removed_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_ALREADY_REMOVED'; END IF;
  SELECT p.state, p.amount, p.member_id INTO v_payment
    FROM public.payments p WHERE p.club_id = p_club_id AND p.id = v_att.payment_id FOR UPDATE;
  IF v_payment.state = 'reversed' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_PAYMENT_REVERSED'; END IF;
  IF v_reason = '' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REASON_REQUIRED'; END IF;

  UPDATE public.attachments SET removed_at = now(), removed_reason = v_reason
    WHERE club_id = p_club_id AND id = p_attachment_id;
  SELECT name INTO v_member FROM public.members WHERE club_id = p_club_id AND id = v_payment.member_id;
  PERFORM public.kk_audit(p_club_id, NULL, 'attachment.remove', p_attachment_id,
    'Bukti "' || v_att.file_name || '" dibuang daripada bayaran ' || public.kk_money(v_payment.amount)
      || ' daripada ' || coalesce(v_member, 'Ahli'), v_reason);
  RETURN v_att.storage_key;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION
  public.kk_add_attachment(uuid, uuid, uuid, text, text, bigint, text, text),
  public.kk_remove_attachment(uuid, uuid, text)
FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION
  public.kk_add_attachment(uuid, uuid, uuid, text, text, bigint, text, text),
  public.kk_remove_attachment(uuid, uuid, text)
TO kelabkit_app;
