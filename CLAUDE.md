@AGENTS.md

# KelabKit

Collection and payment tracker for a Malaysian Kelab Guru dan Kakitangan (KGK) treasurer (Bendahari). Bahasa Melayu UI, MYR, Asia/Kuala_Lumpur.

## Status

Two backends behind one `KelabBackend` interface: `lib/backend/demo.ts` (browser localStorage, "Cuba demo", no account) and `lib/backend/neon.ts` (Google sign-in via Neon Auth, data in Neon Postgres through server actions). The server picks one per request in `app/(kelab)/layout.tsx` (`kk_mode=demo` cookie, else the session). Engineering conventions follow Growlink Admin (`Growlink-Project/growlink-admin`), never its branding or business logic.

## Rules

- Money is integer sen. Parse with `parseRinggit` (`lib/money/amount.ts`), format with `lib/format.ts`. Never use floats for amounts.
- Payment status is derived in `lib/money/ledger.ts` from charges and confirmed allocations. Nothing stores or edits a status.
- Pending payments never count as received. Reversed payments stay in history with a reason; nothing is deleted.
- Three different operations, never mixed: record a payment (new row), change what a member owes (`setChargeAmount`, refused below what is paid), correct a payment (`reversePayment` with a reason).
- A new member joins no collection unless the treasurer picks it.
- Voluntary collections have no charges and never create debt.
- Monthly periods are separate charges; future months are "Akan Datang", never overdue.
- Every change goes through `run((backend) => …)` from `useKelab()`, which reloads afterwards. Add a method to `KelabBackend` and implement it in `demo.ts` with the same rules the server will enforce. Give every new error code a message in `lib/errors.ts`.
- Colours come from tokens in `app/globals.css`. Accent themes (`[data-accent]`) change only brand colours; status colours (`st-*`) are fixed.

## Structure

- `app/(kelab)/<section>/page.tsx`: thin server page with metadata → `components/sections/<section>.tsx` (client).
- `components/shell/`: sidebar, top bar, mobile bottom nav, data gate. `lib/nav.ts` lists sections.
- `components/shared.tsx`: PageShell, PageHeader, SectionCard, StatCard, StatusChip, ChargeStatusChips, DataTable, FilterPills, EmptyState…
- `components/matrix/`: the Excel-like member × collection grid and its cell editor.
- `lib/view.ts`: per-snapshot read model (ledgers, totals, matrix columns and cells).

## Commands

```sh
npm run dev        # http://localhost:3000
npm run typecheck
npm test           # vitest: lib/money
npm run build
npm run db:generate   # drizzle-kit: schema change -> new SQL migration (db/schema.ts)
npm run db:migrate    # apply migrations to DATABASE_URL_UNPOOLED
npm run db:seed       # demo club on the dev branch (needs KELABKIT_DB_ENV=dev)
npm run db:test       # money + tenancy tests against the dev database (not part of npm test)
```

Phase 2 database and auth: `db/schema.ts`, `db/migrations/`, `docs/design/phase-2-backend.md`. Copy `.env.example` to `.env.local`.

- Only `lib/db/with-club.ts` may touch Postgres (`tests/db-boundary.test.ts`). Server code uses `withClub`/`withUser`; money tables are written only by `kk_*` SQL functions, never by direct SQL.
- Every server action goes through `act()` (`lib/server/act.ts`): session and club come from the server, never from arguments. Actions return a `Result`; `lib/backend/neon.ts` turns it back into a `KelabError`.
- Signed-in mode needs `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (`lib/server/env.ts`). Auth is created lazily (`getAuth()`), so `next build` and CI need no secrets; without them `/api/auth` answers 503 and `/masuk` says sign-in is not configured while the demo still works.
- Signed-out visitors are redirected to `/masuk` by `proxy.ts`. Browser probes need the `kk_mode=demo` cookie to reach the app without an account.

Commits: Conventional Commits.
