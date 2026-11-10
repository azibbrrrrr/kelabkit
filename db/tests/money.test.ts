// Money invariants and tenancy, against the Neon dev branch. Two throwaway clubs
// ("kk-test-<runId>-*") hold all fixtures and are deleted afterwards; the demo club is never touched.
// Calls are made as the owner except in the RLS tests, which SET ROLE kelabkit_app.

import { runPrefix } from "./guard";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chargeLedger, indexLedger } from "@/lib/money/ledger";
import type { Allocation, Charge, Payment } from "@/lib/types";
import { createPool } from "../client";

let pool: Pool;
let clubA: string;
let clubB: string;
let testUser: string; // owner of clubs A and B: the session user for every kk_* call below
let memberA1: string;
let memberA2: string;
let memberB1: string;
let collectionA: string; // one-off, active
let archivedA: string;
let voluntaryA: string;

const TABLES_CHILD_FIRST = [
  "audit_logs",
  "attachments",
  "payment_allocations",
  "payments",
  "charges",
  "participants",
  "collection_periods",
  "collections",
  "members",
  "club_settings",
  "club_members",
];

const key = () => randomUUID();
/** Today and tomorrow in Malaysia time. */
const myt = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(d);
};

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = [], client: Pool | PoolClient = pool) {
  const result = await client.query(sql, params);
  return result.rows[0] as T;
}

async function newClub(label: string) {
  const row = await one<{ id: string }>(
    "insert into clubs (name, session) values ($1, '2026') returning id",
    [`${runPrefix()}${label}-${randomUUID()}`],
  );
  return row.id;
}
async function newMember(club: string, name: string) {
  return (await one<{ id: string }>("insert into members (club_id, name, joined_on) values ($1, $2, current_date) returning id", [club, name])).id;
}
async function newCollection(club: string, type: string, status = "active") {
  return (
    await one<{ id: string }>(
      "insert into collections (club_id, name, type, status, default_amount) values ($1, $2, $3, $4, 10000) returning id",
      [club, `c-${randomUUID()}`, type, status],
    )
  ).id;
}
/** A participant plus charge; returns the charge id. */
async function newCharge(club: string, collectionId: string | null, member: string, amount: number, exempt = false) {
  // One charge per member and collection: each call gets a fresh active collection unless one is given.
  const collection = collectionId ?? (await newCollection(club, "one_off"));
  await pool.query(
    "insert into participants (club_id, collection_id, member_id) values ($1, $2, $3) on conflict do nothing",
    [club, collection, member],
  );
  return (
    await one<{ id: string }>(
      "insert into charges (club_id, collection_id, member_id, amount, exempt) values ($1, $2, $3, $4, $5) returning id",
      [club, collection, member, amount, exempt],
    )
  ).id;
}

type PayArgs = { club?: string; key?: string; member?: string; paidOn?: string; confirmed?: boolean; allocations: { charge_id: string; amount: number }[] };
function pay(args: PayArgs, client: Pool | PoolClient = pool) {
  return one<{ kk_record_payment: string }>(
    "select kk_record_payment($1, $2, $3, 'cash', $4::date, $5, $6, $7, $8::jsonb) as kk_record_payment",
    [args.club ?? clubA, args.key ?? key(), args.member ?? memberA1, args.paidOn ?? myt(), "ref", null, args.confirmed ?? true, JSON.stringify(args.allocations)],
    client,
  ).then((row) => (row as unknown as { kk_record_payment: string }).kk_record_payment);
}

/** Resolves to the error's message (our P0001 code) or fails the test if the call succeeded. */
async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; message: string };
    expect(e.code, `SQLSTATE of "${e.message}"`).toBe("P0001");
    return e.message;
  }
  throw new Error("expected the call to be refused");
}

const ledger = (charge: string) => one<{ required: string; confirmed: string; pending: string; remaining: string; payable: string; status: string }>(
  "select required, confirmed, pending, remaining, payable, status from charge_ledger where charge_id = $1",
  [charge],
);
const count = async (sql: string, params: unknown[]) => Number((await one<{ n: string }>(sql, params)).n);

beforeAll(async () => {
  testUser = randomUUID();
  pool = createPool();
  // Every connection acts as testUser; the kk_* functions refuse anyone who is not a club member.
  pool.on("connect", (client: PoolClient) => {
    void client.query("select set_config('app.user_id', $1, false)", [testUser]);
  });
  clubA = await newClub("a");
  clubB = await newClub("b");
  for (const club of [clubA, clubB]) await pool.query("insert into club_members (club_id, user_id, role) values ($1, $2, 'owner')", [club, testUser]);
  memberA1 = await newMember(clubA, "Ahli A1");
  memberA2 = await newMember(clubA, "Ahli A2");
  memberB1 = await newMember(clubB, "Ahli B1");
  collectionA = await newCollection(clubA, "one_off");
  archivedA = await newCollection(clubA, "one_off", "archived");
  voluntaryA = await newCollection(clubA, "voluntary");
});

async function dropClub(club: string) {
  for (const table of TABLES_CHILD_FIRST) await pool.query(`delete from ${table} where club_id = $1`, [club]);
  await pool.query("delete from clubs where id = $1", [club]);
}

afterAll(async () => {
  if (pool) {
    for (const club of [clubA, clubB]) if (club) await dropClub(club);
    await pool.end();
  }
});

describe("idempotency", () => {
  it("the same key twice writes one payment and returns the first id", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    const k = key();
    const first = await pay({ key: k, allocations: [{ charge_id: charge, amount: 4000 }] });
    const second = await pay({ key: k, allocations: [{ charge_id: charge, amount: 4000 }] });
    expect(second).toBe(first);
    expect(await count("select count(*) n from payments where club_id = $1 and idempotency_key = $2", [clubA, k])).toBe(1);
    expect(await count("select count(*) n from payment_allocations where payment_id = $1", [first])).toBe(1);
    expect(await count("select count(*) n from audit_logs where entity_id = $1", [first])).toBe(1);
    expect(Number((await ledger(charge)).confirmed)).toBe(4000);
  });

  it("the same key racing on two connections still writes one payment", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    const k = key();
    const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const ids = await Promise.all([
        pay({ key: k, allocations: [{ charge_id: charge, amount: 3000 }] }, c1),
        pay({ key: k, allocations: [{ charge_id: charge, amount: 3000 }] }, c2),
      ]);
      expect(ids[0]).toBe(ids[1]);
    } finally {
      c1.release();
      c2.release();
    }
    expect(await count("select count(*) n from payments where club_id = $1 and idempotency_key = $2", [clubA, k])).toBe(1);
  });
});

describe("record payment: refusals write nothing", () => {
  it("refuses overpayment, including a split that only overpays in total", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    expect(await codeOf(pay({ allocations: [{ charge_id: charge, amount: 10001 }] }))).toBe("OVERPAYMENT");
    expect(
      await codeOf(
        pay({
          allocations: [
            { charge_id: charge, amount: 6000 },
            { charge_id: charge, amount: 6000 },
          ],
        }),
      ),
    ).toBe("OVERPAYMENT");
    expect(await count("select count(*) n from payment_allocations where charge_id = $1", [charge])).toBe(0);
  });

  it("refuses zero, negative, fractional and oversized amounts and empty payments", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    expect(await codeOf(pay({ allocations: [{ charge_id: charge, amount: 0 }] }))).toBe("AMOUNT_ZERO");
    expect(await codeOf(pay({ allocations: [{ charge_id: charge, amount: -5 }] }))).toBe("AMOUNT_NEGATIVE");
    expect(await codeOf(pay({ allocations: [{ charge_id: charge, amount: 1.5 }] }))).toBe("AMOUNT_INVALID");
    expect(await codeOf(pay({ allocations: [{ charge_id: charge, amount: 10_000_001 }] }))).toBe("AMOUNT_TOO_LARGE");
    expect(await codeOf(pay({ allocations: [] }))).toBe("PAYMENT_EMPTY");
    expect(await count("select count(*) n from payment_allocations where charge_id = $1", [charge])).toBe(0);
  });

  it("refuses exempt charges, archived collections, another member's charge and unknown charges", async () => {
    const exempt = await newCharge(clubA, null, memberA2, 5000, true);
    expect(await codeOf(pay({ member: memberA2, allocations: [{ charge_id: exempt, amount: 100 }] }))).toBe("CHARGE_EXEMPT");
    const archived = await newCharge(clubA, archivedA, memberA1, 5000);
    expect(await codeOf(pay({ allocations: [{ charge_id: archived, amount: 100 }] }))).toBe("COLLECTION_ARCHIVED");
    const theirs = await newCharge(clubA, null, memberA2, 5000);
    expect(await codeOf(pay({ member: memberA1, allocations: [{ charge_id: theirs, amount: 100 }] }))).toBe("CHARGE_NOT_FOUND");
    expect(await codeOf(pay({ allocations: [{ charge_id: randomUUID(), amount: 100 }] }))).toBe("CHARGE_NOT_FOUND");
    expect(await codeOf(pay({ member: randomUUID(), allocations: [{ charge_id: theirs, amount: 100 }] }))).toBe("MEMBER_NOT_FOUND");
  });

  it("refuses a paid_on in the future (Asia/Kuala_Lumpur) and accepts today", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    expect(await codeOf(pay({ paidOn: myt(1), allocations: [{ charge_id: charge, amount: 100 }] }))).toBe("DATE_IN_FUTURE");
    await pay({ paidOn: myt(0), allocations: [{ charge_id: charge, amount: 100 }] });
    expect(Number((await ledger(charge)).confirmed)).toBe(100);
  });
});

describe("ledger", () => {
  it("partial then full: charge_ledger status follows, and matches lib/money/ledger.ts", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    await pay({ allocations: [{ charge_id: charge, amount: 4000 }] });
    expect(await ledger(charge)).toMatchObject({ required: "10000", confirmed: "4000", pending: "0", remaining: "6000", payable: "6000", status: "partial" });
    await pay({ allocations: [{ charge_id: charge, amount: 6000 }] });
    expect(await ledger(charge)).toMatchObject({ confirmed: "10000", remaining: "0", payable: "0", status: "paid" });
    expect(await codeOf(pay({ allocations: [{ charge_id: charge, amount: 1 }] }))).toBe("OVERPAYMENT");

    // Oracle: the TypeScript ledger over the same rows must agree with the SQL view.
    const c = await one<{ id: string; collection_id: string; member_id: string; amount: string; exempt: boolean }>("select * from charges where id = $1", [charge]);
    const payments = (await pool.query("select p.* from payments p join payment_allocations a on a.payment_id = p.id where a.charge_id = $1", [charge])).rows;
    const allocations = (await pool.query("select * from payment_allocations where charge_id = $1", [charge])).rows;
    const ts = chargeLedger(
      { id: c.id, collectionId: c.collection_id, periodId: null, memberId: c.member_id, amount: Number(c.amount), exempt: c.exempt, exemptReason: null, dueDate: null, note: null } satisfies Charge,
      indexLedger(
        payments.map((p) => ({ id: p.id, state: p.state, paidOn: String(p.paid_on) }) as unknown as Payment),
        allocations.map((a) => ({ id: a.id, paymentId: a.payment_id, chargeId: a.charge_id, amount: Number(a.amount) }) satisfies Allocation),
        [],
      ),
      myt(),
    );
    expect(ts).toMatchObject({ required: 10000, confirmed: 10000, pending: 0, remaining: 0, payable: 0, status: "paid" });
  });

  it("pending money is not confirmed, still reduces payable, and confirming moves it", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    const id = await pay({ confirmed: false, allocations: [{ charge_id: charge, amount: 3000 }] });
    expect(await ledger(charge)).toMatchObject({ confirmed: "0", pending: "3000", remaining: "10000", payable: "7000", status: "unpaid" });
    expect(await codeOf(pay({ allocations: [{ charge_id: charge, amount: 7001 }] }))).toBe("OVERPAYMENT");
    await one("select kk_confirm_payment($1, $2, null)", [clubA, id]);
    expect(await ledger(charge)).toMatchObject({ confirmed: "3000", pending: "0", payable: "7000", status: "partial" });
    expect(await codeOf(one("select kk_confirm_payment($1, $2, null)", [clubA, id]))).toBe("PAYMENT_NOT_PENDING");
  });

  it("an exempt charge requires nothing and shows status exempt", async () => {
    const charge = await newCharge(clubA, null, memberA2, 5000, true);
    expect(await ledger(charge)).toMatchObject({ required: "0", payable: "0", status: "exempt" });
  });
});

describe("reverse payment", () => {
  it("requires a reason, keeps the row, and gives the money back to the charge", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    const id = await pay({ allocations: [{ charge_id: charge, amount: 10000 }] });
    expect(await codeOf(one("select kk_reverse_payment($1, $2, '   ', null)", [clubA, id]))).toBe("REASON_REQUIRED");
    expect(await codeOf(one("select kk_reverse_payment($1, $2, null, null)", [clubA, id]))).toBe("REASON_REQUIRED");
    expect((await one<{ state: string }>("select state from payments where id = $1", [id])).state).toBe("confirmed");

    await one("select kk_reverse_payment($1, $2, 'Salah ahli', null)", [clubA, id]);
    const row = await one<{ state: string; reversal_reason: string; reversed_at: string }>("select state, reversal_reason, reversed_at from payments where id = $1", [id]);
    expect(row).toMatchObject({ state: "reversed", reversal_reason: "Salah ahli" });
    expect(row.reversed_at).toBeTruthy();
    expect(await count("select count(*) n from payment_allocations where payment_id = $1", [id])).toBe(1);
    expect(await ledger(charge)).toMatchObject({ confirmed: "0", payable: "10000", status: "unpaid" });
    expect(await codeOf(one("select kk_reverse_payment($1, $2, 'lagi', null)", [clubA, id]))).toBe("PAYMENT_ALREADY_REVERSED");
    expect(await count("select count(*) n from audit_logs where entity_id = $1 and action = 'payment.reverse'", [id])).toBe(1);
  });

  it("the table refuses a reversed payment without a reason, and a delete is not granted to the app role", async () => {
    const charge = await newCharge(clubA, null, memberA1, 1000);
    const id = await pay({ allocations: [{ charge_id: charge, amount: 1000 }] });
    await expect(pool.query("update payments set state = 'reversed' where id = $1", [id])).rejects.toMatchObject({ code: "23514" });
    const priv = await one<{ d: boolean }>("select has_table_privilege('kelabkit_app', 'public.payments', 'DELETE') d");
    expect(priv.d).toBe(false);
  });
});

describe("set charge amount", () => {
  it("refuses below confirmed + pending, needs a reason once money exists", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    // No money yet: no reason needed.
    await one("select kk_set_charge_amount($1, $2, 12000, null, null)", [clubA, charge]);
    await pay({ allocations: [{ charge_id: charge, amount: 5000 }] });
    await pay({ confirmed: false, allocations: [{ charge_id: charge, amount: 2000 }] });
    expect(await codeOf(one("select kk_set_charge_amount($1, $2, 6999, 'turun', null)", [clubA, charge]))).toBe("AMOUNT_BELOW_PAID");
    expect(await codeOf(one("select kk_set_charge_amount($1, $2, 8000, '  ', null)", [clubA, charge]))).toBe("REASON_REQUIRED");
    await one("select kk_set_charge_amount($1, $2, 7000, 'Diskaun', null)", [clubA, charge]);
    expect(await ledger(charge)).toMatchObject({ required: "7000", confirmed: "5000", pending: "2000", payable: "0" });
    const audit = await one<{ before: { amount: number }; after: { amount: number }; reason: string }>(
      "select before, after, reason from audit_logs where entity_id = $1 and action = 'charge.amount' order by at desc limit 1",
      [charge],
    );
    expect(audit).toMatchObject({ before: { amount: 12000 }, after: { amount: 7000 }, reason: "Diskaun" });
    expect(await codeOf(one("select kk_set_charge_amount($1, $2, 0, 'x', null)", [clubA, charge]))).toBe("AMOUNT_ZERO");
  });
});

describe("voluntary contributions", () => {
  it("records once per key, refuses wrong type, archived and future dates", async () => {
    const k = key();
    const call = (over: { collection?: string; key?: string; paidOn?: string; amount?: number } = {}) =>
      one<{ id: string }>(
        "select kk_record_contribution($1, $2, $3, $4, 'transfer', $5::date, null, null, true, $6, null) as id",
        [clubA, over.key ?? k, memberA1, over.collection ?? voluntaryA, over.paidOn ?? myt(), over.amount ?? 2500],
      );
    const first = await call();
    expect((await call()).id).toBe(first.id);
    expect(await count("select count(*) n from payments where collection_id = $1", [voluntaryA])).toBe(1);
    expect(await count("select count(*) n from payment_allocations where payment_id = $1", [first.id])).toBe(0);
    expect(await codeOf(call({ key: key(), collection: collectionA }))).toBe("CHARGE_NOT_FOUND");
    expect(await codeOf(call({ key: key(), paidOn: myt(1) }))).toBe("DATE_IN_FUTURE");
    expect(await codeOf(call({ key: key(), amount: 0 }))).toBe("AMOUNT_ZERO");
    expect(await codeOf(call({ key: key(), collection: randomUUID() }))).toBe("COLLECTION_NOT_FOUND");
  });
});

describe("cross-club access", () => {
  it("functions refuse a charge, payment or member from another club", async () => {
    const chargeA = await newCharge(clubA, null, memberA1, 10000);
    const paymentA = await pay({ confirmed: false, allocations: [{ charge_id: chargeA, amount: 1000 }] });
    // Club A's charge, paid on behalf of club B's member in club B.
    expect(await codeOf(pay({ club: clubB, member: memberB1, allocations: [{ charge_id: chargeA, amount: 100 }] }))).toBe("CHARGE_NOT_FOUND");
    // Club A's member in club B.
    expect(await codeOf(pay({ club: clubB, member: memberA1, allocations: [{ charge_id: chargeA, amount: 100 }] }))).toBe("MEMBER_NOT_FOUND");
    expect(await codeOf(one("select kk_set_charge_amount($1, $2, 20000, 'x', null)", [clubB, chargeA]))).toBe("CHARGE_NOT_FOUND");
    expect(await codeOf(one("select kk_confirm_payment($1, $2, null)", [clubB, paymentA]))).toBe("PAYMENT_NOT_FOUND");
    expect(await codeOf(one("select kk_reverse_payment($1, $2, 'x', null)", [clubB, paymentA]))).toBe("PAYMENT_NOT_FOUND");
    // Nothing changed for club A.
    expect(await ledger(chargeA)).toMatchObject({ required: "10000", pending: "1000" });
  });

  it("composite foreign keys stop a row pointing at another club's parent", async () => {
    const chargeA = await newCharge(clubA, null, memberA1, 10000);
    const paymentB = await one<{ id: string }>(
      "insert into payments (club_id, idempotency_key, member_id, amount, method, paid_on, state) values ($1, $2, $3, 100, 'cash', current_date, 'pending') returning id",
      [clubB, key(), memberB1],
    );
    await expect(
      pool.query("insert into payment_allocations (club_id, payment_id, charge_id, amount) values ($1, $2, $3, 100)", [clubB, paymentB.id, chargeA]),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query("insert into payments (club_id, idempotency_key, member_id, amount, method, paid_on, state) values ($1, $2, $3, 100, 'cash', current_date, 'pending')", [clubB, key(), memberA1]),
    ).rejects.toMatchObject({ code: "23503" });
  });
});

describe("row level security", () => {
  /** Runs fn inside a transaction as kelabkit_app with app.club_id set (or unset). */
  async function asApp<T>(club: string | null, fn: (client: PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role kelabkit_app");
      if (club) await client.query("select set_config('app.club_id', $1, true)", [club]);
      return await fn(client);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }

  it("the app role has no BYPASSRLS and owns nothing", async () => {
    const role = await one<{ rolbypassrls: boolean; rolsuper: boolean; rolcanlogin: boolean }>("select rolbypassrls, rolsuper, rolcanlogin from pg_roles where rolname = 'kelabkit_app'");
    expect(role).toMatchObject({ rolbypassrls: false, rolsuper: false });
    const owned = await count("select count(*) n from pg_class c join pg_roles r on r.oid = c.relowner where r.rolname = 'kelabkit_app'", []);
    expect(owned).toBe(0);
  });

  it("with app.club_id = A, club B's rows are invisible; unset sees nothing", async () => {
    await asApp(clubA, async (client) => {
      const rows = (await client.query("select club_id from members")).rows as { club_id: string }[];
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.every((r) => r.club_id === clubA)).toBe(true);
      expect((await client.query("select count(*) n from members where club_id = $1", [clubB])).rows[0].n).toBe("0");
      expect((await client.query("select count(*) n from clubs")).rows[0].n).toBe("1");
      expect((await client.query("select count(*) n from charge_ledger where club_id = $1", [clubB])).rows[0].n).toBe("0");
    });
    await asApp(null, async (client) => {
      expect((await client.query("select count(*) n from members")).rows[0].n).toBe("0");
    });
  });

  it("with app.club_id = A, writing a club B row is refused, and updates do not touch B", async () => {
    await asApp(clubA, async (client) => {
      await expect(client.query("insert into members (club_id, name, joined_on) values ($1, 'x', current_date)", [clubB])).rejects.toMatchObject({ code: "42501" });
    });
    await asApp(clubA, async (client) => {
      const result = await client.query("update members set name = 'diubah' where club_id = $1", [clubB]);
      expect(result.rowCount).toBe(0);
    });
    expect((await one<{ name: string }>("select name from members where id = $1", [memberB1])).name).toBe("Ahli B1");
  });

  it("the money functions work as the app role for its own club and still refuse another club's ids", async () => {
    const charge = await newCharge(clubA, null, memberA1, 3000);
    await asApp(clubA, async (client) => {
      const id = await pay({ allocations: [{ charge_id: charge, amount: 3000 }] }, client);
      expect(id).toBeTruthy();
      expect((await client.query("select status from charge_ledger where charge_id = $1", [charge])).rows[0].status).toBe("paid");
    });
    await asApp(clubB, async (client) => {
      expect(await codeOf(pay({ club: clubB, member: memberB1, allocations: [{ charge_id: charge, amount: 100 }] }, client))).toBe("CHARGE_NOT_FOUND");
    });
  });

  it("every public table with a club_id is RLS-enabled, forced, and has a club_id index", async () => {
    const tables = (
      await pool.query(`
        select c.relname, c.relrowsecurity, c.relforcerowsecurity,
               exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                       where i.indrelid = c.oid and a.attname = coalesce(nullif(case c.relname when 'clubs' then 'id' end, ''), 'club_id')) as indexed
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname in ('club_id') and not a.attisdropped
                      union all select 1 where c.relname = 'clubs')
        order by 1`)
    ).rows as { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; indexed: boolean }[];
    expect(tables.map((t) => t.relname)).toEqual(expect.arrayContaining(["clubs", "members", "payments", "charges", "audit_logs", "attachments"]));
    for (const t of tables) expect(t, t.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, indexed: true });
  });
});

describe("concurrency", () => {
  it("a second full-amount payment waits for the first and is then refused", async () => {
    const charge = await newCharge(clubA, null, memberA1, 5000);
    const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      await c1.query("begin");
      await pay({ allocations: [{ charge_id: charge, amount: 5000 }] }, c1); // holds the charge lock, uncommitted
      let settled = false;
      const second = codeOf(pay({ allocations: [{ charge_id: charge, amount: 5000 }] }, c2)).finally(() => (settled = true));
      await new Promise((r) => setTimeout(r, 1500));
      expect(settled, "second caller must block on the charge row lock").toBe(false);
      await c1.query("commit");
      expect(await second).toBe("OVERPAYMENT");
    } finally {
      c1.release();
      c2.release();
    }
    expect(await count("select count(*) n from payment_allocations where charge_id = $1", [charge])).toBe(1);
    expect(await ledger(charge)).toMatchObject({ confirmed: "5000", payable: "0", status: "paid" });
  });

  it("two parallel full-remaining payments on one charge: exactly one succeeds (x6)", async () => {
    for (let round = 0; round < 6; round += 1) {
      const charge = await newCharge(clubA, null, memberA1, 5000);
      const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
      try {
        const results = await Promise.allSettled([
          pay({ allocations: [{ charge_id: charge, amount: 5000 }] }, c1),
          pay({ allocations: [{ charge_id: charge, amount: 5000 }] }, c2),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        expect(failed.reason).toMatchObject({ code: "P0001", message: "OVERPAYMENT" });
      } finally {
        c1.release();
        c2.release();
      }
      expect(await ledger(charge)).toMatchObject({ confirmed: "5000", payable: "0" });
    }
  });

  it("a payment and a lower charge amount racing cannot leave the charge under-covered", async () => {
    const charge = await newCharge(clubA, null, memberA1, 10000);
    const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const results = await Promise.allSettled([
        pay({ allocations: [{ charge_id: charge, amount: 8000 }] }, c1),
        one("select kk_set_charge_amount($1, $2, 5000, 'turun', null)", [clubA, charge], c2),
      ]);
      expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    } finally {
      c1.release();
      c2.release();
    }
    const l = await ledger(charge);
    expect(Number(l.required)).toBeGreaterThanOrEqual(Number(l.confirmed) + Number(l.pending));
  });
});

describe("seeded demo club", () => {
  it("charge payments equal the sum of their allocations and nothing is overpaid", async () => {
    const demo = await pool.query("select id from clubs where name = 'KGK SK Taman Melati (demo)'");
    if (!demo.rows.length) return; // db:seed has not been run on this branch
    const club = demo.rows[0].id;
    const mismatched = await count(
      `select count(*) n from payments p
       where p.club_id = $1 and p.collection_id is null
         and p.amount <> (select coalesce(sum(a.amount), 0) from payment_allocations a where a.payment_id = p.id)`,
      [club],
    );
    expect(mismatched).toBe(0);
    expect(await count("select count(*) n from charge_ledger where club_id = $1 and confirmed + pending > required", [club])).toBe(0);
  });
});
