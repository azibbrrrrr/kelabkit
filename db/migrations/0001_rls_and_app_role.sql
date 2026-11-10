-- Tenancy guard and the application role. Hand-written (drizzle custom migration).
--
-- 1. kelabkit_app: the role the application connects as (login is decided in the next PR).
--    It owns nothing, has no BYPASSRLS, and is granted only what the money functions and
--    the backend need. NOLOGIN here: it can only be used via SET ROLE until then.
-- 2. Row level security on every tenant table, FORCEd so even the table owner is subject
--    to it. Note the migration owner role on Neon carries BYPASSRLS, which FORCE does not
--    override: RLS is only exercised by sessions running as kelabkit_app.
-- 3. The policy compares club_id with the transaction-local setting app.club_id. nullif()
--    turns the "no club set" empty string into NULL, so an unset context matches no rows
--    instead of raising a cast error.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kelabkit_app') THEN
    CREATE ROLE kelabkit_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;--> statement-breakpoint

-- Lets the migration owner SET ROLE kelabkit_app (the tests do this to exercise RLS).
DO $$
BEGIN
  EXECUTE format('GRANT kelabkit_app TO %I WITH SET TRUE, INHERIT FALSE', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not grant kelabkit_app to %: %', current_user, SQLERRM;
END
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO kelabkit_app;--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'club_members', 'club_settings', 'members', 'collections', 'collection_periods',
    'participants', 'charges', 'payments', 'payment_allocations', 'attachments', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
         USING (club_id = nullif(current_setting(''app.club_id'', true), '''')::uuid)
         WITH CHECK (club_id = nullif(current_setting(''app.club_id'', true), '''')::uuid)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO kelabkit_app', t);
  END LOOP;
END
$$;--> statement-breakpoint

-- clubs is the tenant root: its key is the club id.
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.clubs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON public.clubs;--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.clubs
  USING (id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.clubs TO kelabkit_app;
