-- Per-user rate limiting for mutating actions. Additive only: one new table and one new function, no
-- change to any existing table, column or function. Old application code never calls them, so applying
-- this ahead of the deploy is safe, and reverting the deploy leaves them unused.
--
-- Fixed window, one row per bucket. The table has row level security on and NO privilege for
-- kelabkit_app, so the only way to touch it is kk_rate_hit(), which is SECURITY DEFINER, pins
-- search_path, and keys the bucket on the session user (app.user_id) and never on an argument: a caller
-- can neither spend nor reset another user's budget. The scope is a short lowercase word chosen by the
-- application ("mutation"); limit and window are bounded so a bad call cannot create a pathological row.
--
-- Returns true when the call is within the limit, false when it is over. It never raises for being over:
-- the caller decides what to do (the application answers RATE_LIMITED). The counter write belongs to the
-- caller's transaction, so a request that is rolled back is not counted here; the application charges
-- those separately after the rollback (lib/db/with-club.ts).

CREATE TABLE "rate_limits" (
	"bucket" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public.rate_limits FROM PUBLIC, kelabkit_app;--> statement-breakpoint

CREATE FUNCTION public.kk_rate_hit(p_scope text, p_limit integer, p_window_seconds integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.kk_current_user();
  v_bucket text;
  v_hits integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN'; END IF;
  IF p_scope IS NULL OR p_scope !~ '^[a-z_]{1,24}$'
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100000
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 3600 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
  v_bucket := p_scope || ':' || v_user::text;
  -- A hit in an expired window starts a new window at 1; otherwise it adds one. The row lock taken by
  -- the upsert serialises concurrent calls for one user, so the count is exact.
  INSERT INTO public.rate_limits AS r (bucket, window_start, hits) VALUES (v_bucket, now(), 1)
    ON CONFLICT (bucket) DO UPDATE SET
      window_start = CASE WHEN r.window_start <= now() - make_interval(secs => p_window_seconds) THEN now() ELSE r.window_start END,
      hits = CASE WHEN r.window_start <= now() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.hits + 1 END
    RETURNING r.hits INTO v_hits;
  -- Housekeeping without a scheduler: about one call in a hundred drops buckets idle for a day.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;
  RETURN v_hits <= p_limit;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.kk_rate_hit(text, integer, integer) FROM PUBLIC;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.kk_rate_hit(text, integer, integer) TO kelabkit_app;
