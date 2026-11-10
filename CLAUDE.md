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

Operations: `GET /api/health` (db + storage). `GET /api/cron/backup/` (Vercel Cron daily, `CRON_SECRET` bearer) writes `backups/YYYY-MM-DD/kelabkit.json.gz` to the bucket and keeps 30 days; restore with `RESTORE_DATABASE_URL=<target> npx tsx scripts/restore-backup.ts --from-bucket <key>` (refuses production without `--i-know-this-is-production`). `db:test` fixtures are `kk-test-<runId>-*` per run. Mutating actions spend a per-user budget (600 per minute, `lib/rate-limit.ts`, `kk_rate_hit` in migration 0006) inside the same preamble round trip as the membership check; over it they answer `RATE_LIMITED`. Vercel Firewall rate limiting is not available on this plan (402), and `/api/health` bounds its own probes with a 5 s per-instance cache.

Phase 2 database and auth: `db/schema.ts`, `db/migrations/`, `docs/design/phase-2-backend.md`. Copy `.env.example` to `.env.local`.

- Only `lib/db/with-club.ts` may touch Postgres (`tests/db-boundary.test.ts`). Server code uses `withClub`/`withUser`; money tables are written only by `kk_*` SQL functions, never by direct SQL.
- Server timing: `next dev` (or `KELABKIT_TIMING=1`) logs `[kk-timing] <label> roundTrips=… total=…ms` per transaction. A change is `actMutation()`: one transaction that also returns the snapshot; the club id comes from the `kk_club` cookie and is checked inside that transaction. `?kk_delay=2500` (dev only) holds the first load to inspect skeletons.
- Every server action goes through `act()` (`lib/server/act.ts`): session and club come from the server, never from arguments. Actions return a `Result`; `lib/backend/neon.ts` turns it back into a `KelabError`.
- Signed-in mode needs `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (`lib/server/env.ts`). Auth is created lazily (`getAuth()`), so `next build` and CI need no secrets; without them `/api/auth` answers 503 and `/masuk` says sign-in is not configured while the demo still works.
- Display preferences (accent theme, locale, floral, matrix layout and column widths) are one validated shape in `lib/prefs.ts`. Demo and signed-out: localStorage. Signed in: table `user_prefs` (migration 0005), read with the shell in `loadShellContext` (same transaction as `kk_my_clubs`, no extra round trip) and saved by a debounced `savePrefs` action through `kk_save_prefs` (per-key merge, last write wins, 16 KiB cap). The app role has no direct privilege on the table.
- Payment proof in signed-in mode lives in private Neon Object Storage (`lib/server/storage.ts`, env `NEON_STORAGE_*`, optional: without it attachments answer `ATTACHMENT_STORAGE_UNAVAILABLE`). Key `clubs/<club>/payments/<payment>/<attachment>` from `attachmentKey()`; upload is a presigned PUT then a confirm action, view is a presigned GET after the membership check. Rows are written only by `kk_add_attachment` / `kk_remove_attachment`.
- Signed-out visitors are redirected to `/masuk` by `proxy.ts`. Browser probes need the `kk_mode=demo` cookie to reach the app without an account.

Commits: Conventional Commits.
