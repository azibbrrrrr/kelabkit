# Phase 2 backend: database foundation

Status: foundation merged in `feat(db): neon schema, migrations and money functions`. Google sign-in and the `neon` implementation of `KelabBackend` are in `feat(auth): google sign-in and neon backend behind KelabBackend` (decisions 7 to 11 below). The demo backend is unchanged and stays the default for "Cuba demo".

Target: Neon project `bold-field-92333070`, branch `dev`, database `kelabkit`, Postgres 18 (Singapore). Neon Auth (managed Better Auth) owns schema `neon_auth`; nothing here modifies it.

## Decisions

### 1. Drizzle ORM + drizzle-kit, `@neondatabase/serverless` Pool
- `db/schema.ts` is the table definition; `db/migrations/*.sql` is what runs. `drizzle.config.ts` reads `DATABASE_URL_UNPOOLED` (migrations need a direct connection and DDL).
- Functions, RLS and the view are hand-written custom migrations (`drizzle-kit generate --custom`). They are not in `schema.ts`, so the generator never tries to diff them.
- The `Pool` over websockets gives interactive transactions (`ws` in Node); the HTTP driver cannot. Money writes are single SQL function calls anyway, so a transaction is only needed for multi-call flows and tests.
- Reasoning: SQL stays reviewable as SQL, types come from the schema, and no runtime code generation is involved. Reversibility: migrations are forward-only; the dev branch is the rollback (Neon branch restore).

### 2. Money rules live in Postgres functions, not only in TypeScript
- The invariant ("never allocate more than payable") is a race: two requests can both read the same remaining balance. Row locks inside one SQL function are the smallest thing that closes it. `lib/money/ledger.ts` stays the oracle for the demo backend and for the tests.
- Errors are `RAISE EXCEPTION` with SQLSTATE `P0001` and `MESSAGE` equal to a code in `lib/errors.ts`. The backend maps `error.message` to `KelabError` 1:1. A new function error means a new code in `lib/errors.ts` first.
- (Superseded by decision 8.) The 0002 bodies are `SECURITY INVOKER`; since 0003 they are internal `*_impl` functions behind asserting `SECURITY DEFINER` wrappers.
- Written for READ COMMITTED. They lock collections (`FOR SHARE`), then charges (`FOR UPDATE`, ordered by id), then re-read the ledger. Under REPEATABLE READ the snapshot predates the lock; do not call them there.
- Deviation from the brief: `kk_record_payment` and `kk_record_contribution` take a trailing `p_actor uuid DEFAULT NULL`, like the other functions, so the audit row can carry the user. Duplicate lines for one charge are merged before the payable check.

### 3. Tenancy: `club_id` everywhere, composite FKs, RLS as the second guard
- Every tenant table has `club_id NOT NULL` with an FK and an index. Children reference `(club_id, id)` of the parent, so a child cannot point at another club's parent (tested). `charges` also references `participants (club_id, collection_id, member_id)`: a charge exists only for a participant.
- RLS is enabled and FORCEd on every tenant table with `club_id = nullif(current_setting('app.club_id', true), '')::uuid`. `nullif` makes "no club set" match nothing instead of raising a cast error on the empty string. `clubs` uses `id`.
- Role `kelabkit_app`: NOLOGIN, no BYPASSRLS, owns nothing, SELECT/INSERT/UPDATE on tables, EXECUTE on `kk_*`, SELECT on `charge_ledger`. No DELETE: nothing is deleted. `CREATE ROLE` works in SQL on Neon for the owner role, so no Neon API step was needed. The owner is granted the role with `SET` so tests can `SET ROLE kelabkit_app`.
- Know this: the migration owner role on Neon has `BYPASSRLS`, and FORCE does not override that attribute. RLS only protects sessions that connect (or `SET ROLE`) as `kelabkit_app`. The runtime connection in the next PR must be that role.
- `charge_ledger` is `security_invoker`, otherwise it would run as the owner and ignore RLS.
- Closed in 0003 (decisions 8 and 9): table writes on money tables are revoked from `kelabkit_app`, and a user's clubs are found by `kk_my_clubs()`.

### 4. Identity columns
`user_id` / `*_user_id` are `uuid` (the type of `neon_auth."user".id`), without a foreign key, so these migrations do not depend on a schema another system owns.

### 5. Seed
`db/seed.ts` writes `buildSeed()` (the Phase 1 data) into the club "KGK SK Taman Melati (demo)" with fresh uuids; it deletes and re-creates only that club's rows. It refuses unless `KELABKIT_DB_ENV=dev`. Seed rows are written directly (historical data), not through `kk_*`.

### 6. Tests
`npm run db:test` (own vitest config; `npm test` stays offline) runs against the dev branch using two throwaway `kk-test-*` clubs, deleted afterwards. It never touches the demo club.

### 7. Identity and the trust boundary
- Neon Auth (managed Better Auth, package `@neondatabase/auth`, currently a `0.x` beta) owns users and sessions. Google is the only sign-in method (Neon's shared dev credentials on the dev branch); email/password is disabled; the organization plugin is on but unused (club membership is ours: `club_members`).
- `/api/auth/[...path]` proxies the auth API (`lib/auth/server.ts`, cookies `sameSite: lax` because the Google return is a cross-site navigation). `lib/auth/client.ts` calls `signIn.social({ provider: "google" })` from `/masuk`.
- The database cannot authenticate. The server connects over the pooled owner connection and, per transaction, runs `SET LOCAL ROLE kelabkit_app` and sets `app.user_id` / `app.club_id` from the verified session (`lib/db/with-club.ts`). Anything that can run arbitrary SQL inside that transaction can forge both settings; the defence is that only parameterised server code runs there, and `tests/db-boundary.test.ts` keeps every other module away from the pool.
- `withClub` calls `kk_assert_member(club)` before the callback, so a club id taken from a cookie is validated by the database in the same transaction (FORBIDDEN otherwise). The cookie `kk_club` only chooses among the user's own clubs; with none valid, the oldest club is used. No club switcher yet.

### 8. Migration 0003: what the app role can and cannot do
- `kelabkit_app` has SELECT only on `payments`, `payment_allocations`, `charges`, `audit_logs`, `attachments`, `club_members`; no INSERT or DELETE on `clubs`. These change only through `kk_*` functions.
- Every public `kk_*` function is `SECURITY DEFINER`, owned by the owner, `search_path = public, pg_temp`, and first runs `kk_assert_member(p_club_id)`. The audit actor is always `app.user_id`; the `p_actor` argument is kept for signature compatibility and ignored (a test spoofs it).
- Roles: recording, confirming and adding collections or participants are open to `owner` and `committee`. Corrections (`kk_reverse_payment`, `kk_set_charge_amount`, `kk_set_charge_exempt`) are owner-only. No code creates committee members yet.
- The 0002 bodies were kept as `kk_*_impl` (invoker, pinned search_path, revoked from the app role) so the money logic has one definition. New writers: `kk_create_collection` (collection, periods, participants and charges atomically), `kk_add_participants`, `kk_set_charge_exempt`, `kk_set_collection_due_date`.
- Direct writes that remain, confined to one club by RLS: `members`, `collections`, `club_settings`, `clubs` (UPDATE). Their audit rows are written through `kk_audit` (membership-checked, actor forced). Trade-off: a caller who can run arbitrary SQL could write a misleading audit summary for those entities; money audit rows are written inside the functions and cannot be forged.
- `club_members` policy: `user_id = app.user_id OR club_id = app.club_id`, so "my clubs" works before a club is chosen. `kk_my_clubs()` is the supported lookup. `kk_create_club()` makes the club and the owner membership in one transaction, seeds nothing, and allows at most five owned clubs per user (sign-up is open to any Google account).

### 9. The neon backend
- `lib/backend/neon.ts` (browser) calls server actions in `app/actions/*`; each action is `act((ctx) => service.x(ctx, ...))` (`lib/server/act.ts`): session read on the server, club resolved on the server, one `withClub` transaction, errors returned as a `Result` (production Next hides thrown messages). `lib/server/service.ts` holds the operations, `lib/server/snapshot.ts` builds the unchanged `Snapshot` from SQL in one `REPEATABLE READ READ ONLY` transaction (audit capped at the latest 1000 rows; actor names come from `kk_actor_names`).
- Input rules shared with the demo (`cleanName`, `checkAmount`, `checkReason`) moved to `lib/backend/rules.ts`. Postgres `P0001` messages map 1:1 to `KelabError` codes. New codes: `FORBIDDEN`, `UNAUTHENTICATED`, `NO_CLUB`, `SESSION_REQUIRED`, `CLUB_LIMIT`, `NOT_AVAILABLE`, `INTERNAL`.
- Attachment bytes are not supported on neon: the three attachment methods throw `NOT_AVAILABLE` ("Muat naik fail belum tersedia untuk akaun sebenar."). Metadata is read by `load()`. `resetDemo` throws the same code and the Tetapan card is demo-only.
- Cost: every action makes two short transactions (`kk_my_clubs`, then the operation). If latency matters, trust the cookie and let `kk_assert_member` be the only check.

### 10. Auth UX
- `proxy.ts` sends signed-out visitors to `/masuk` (it is navigation, not the security boundary: actions re-check). `kk_mode=demo` is a preference cookie that selects the localStorage demo; it grants nothing. `app/(kelab)/layout.tsx` decides the mode per request: demo cookie, else session, else `/masuk`.
- A signed-in user with no club sees only `/mula`, which renders the club form (`kk_create_club`); everything else redirects there. Top bar: Google name, avatar and "Log keluar"; "Data demo" badge and "Keluar dari demo" only in demo mode.

### 11. Tests
`npm test` adds `tests/db-boundary.test.ts` (nothing outside `lib/db` imports a driver, the pool or a connection string; actions are all `act`/`guard` wrapped; client modules never import server code). `npm run db:test` adds `db/tests/security.test.ts` (direct writes denied; every `kk_*` FORBIDDEN for outsiders, other clubs' members and no user; owner-only corrections; actor forcing; `kk_my_clubs`; `kk_create_club`) and `db/tests/neon-actions.test.ts` (the production path from `neonBackend` through actions and `withClub` to Postgres, with a seeded user id instead of Google: load, record, idempotent retry, reverse, cross-club refusal).

## Not yet
Attachment storage, a club switcher and invitations (committee members), removing `demo.ts`, a real Google click-through in automation (needs a test account; Google consent cannot be scripted headlessly).
