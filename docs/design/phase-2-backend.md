# Phase 2 backend: database foundation

Status: foundation merged in `feat(db): neon schema, migrations and money functions`. Auth wiring and the `neon` implementation of `KelabBackend` come next. The UI still runs on `lib/backend/demo.ts`.

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
- Functions are `SECURITY INVOKER` and call `set_config('app.club_id', p_club_id, true)` first, so RLS applies when the caller is `kelabkit_app`.
- Written for READ COMMITTED. They lock collections (`FOR SHARE`), then charges (`FOR UPDATE`, ordered by id), then re-read the ledger. Under REPEATABLE READ the snapshot predates the lock; do not call them there.
- Deviation from the brief: `kk_record_payment` and `kk_record_contribution` take a trailing `p_actor uuid DEFAULT NULL`, like the other functions, so the audit row can carry the user. Duplicate lines for one charge are merged before the payable check.

### 3. Tenancy: `club_id` everywhere, composite FKs, RLS as the second guard
- Every tenant table has `club_id NOT NULL` with an FK and an index. Children reference `(club_id, id)` of the parent, so a child cannot point at another club's parent (tested). `charges` also references `participants (club_id, collection_id, member_id)`: a charge exists only for a participant.
- RLS is enabled and FORCEd on every tenant table with `club_id = nullif(current_setting('app.club_id', true), '')::uuid`. `nullif` makes "no club set" match nothing instead of raising a cast error on the empty string. `clubs` uses `id`.
- Role `kelabkit_app`: NOLOGIN, no BYPASSRLS, owns nothing, SELECT/INSERT/UPDATE on tables, EXECUTE on `kk_*`, SELECT on `charge_ledger`. No DELETE: nothing is deleted. `CREATE ROLE` works in SQL on Neon for the owner role, so no Neon API step was needed. The owner is granted the role with `SET` so tests can `SET ROLE kelabkit_app`.
- Know this: the migration owner role on Neon has `BYPASSRLS`, and FORCE does not override that attribute. RLS only protects sessions that connect (or `SET ROLE`) as `kelabkit_app`. The runtime connection in the next PR must be that role.
- `charge_ledger` is `security_invoker`, otherwise it would run as the owner and ignore RLS.
- Known gap: `kelabkit_app` can INSERT into `payments` and `payment_allocations` directly because the functions are INVOKER. The app code path must go through `kk_*`. Revisit when login is decided (option: SECURITY DEFINER functions with a locked search_path, then revoke table writes).
- Open for the auth PR: finding a user's clubs happens before `app.club_id` is known, and `club_members` is under RLS. Needs either a login role exempt for that one lookup or a small `SECURITY DEFINER` function.

### 4. Identity columns
`user_id` / `*_user_id` are `uuid` (the type of `neon_auth."user".id`), without a foreign key, so these migrations do not depend on a schema another system owns.

### 5. Seed
`db/seed.ts` writes `buildSeed()` (the Phase 1 data) into the club "KGK SK Taman Melati (demo)" with fresh uuids; it deletes and re-creates only that club's rows. It refuses unless `KELABKIT_DB_ENV=dev`. Seed rows are written directly (historical data), not through `kk_*`.

### 6. Tests
`npm run db:test` (own vitest config; `npm test` stays offline) runs against the dev branch using two throwaway `kk-test-*` clubs, deleted afterwards. It never touches the demo club.

## Not in this PR
Auth wiring, the `neon` backend, login for `kelabkit_app`, attachments storage, club/member/collection write functions (those can start as plain SQL under RLS), removing `demo.ts`.
