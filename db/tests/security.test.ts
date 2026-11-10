// Auth boundary (migration 0003), against the Neon dev branch. Everything runs as the
// restricted role `kelabkit_app` with app.user_id / app.club_id set the way lib/db/with-club.ts
// sets them. Fixtures are throwaway "kk-test-*" clubs, deleted afterwards.

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../client";

let pool: Pool;
const ownerA = randomUUID();
const ownerB = randomUUID();
const committeeA = randomUUID();
const outsider = randomUUID();
let clubA: string;
let clubB: string;
let memberA: string;
let chargeA: string;
let collectionA: string;
let paymentA: string;
const createdClubs: string[] = [];

const TABLES = ["audit_logs", "attachments", "payment_allocations", "payments", "charges", "participants", "collection_periods", "collections", "members", "club_settings", "club_members"];
async function dropClub(club: string) {
  for (const table of TABLES) await pool.query(`delete from ${table} where club_id = $1`, [club]);
  await pool.query("delete from clubs where id = $1", [club]);
}

/** One transaction as kelabkit_app, like withClub/withUser; always rolled back unless commit is true. */
async function asApp<T>(user: string | null, club: string | null, fn: (c: PoolClient) => Promise<T>, commit = false) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role kelabkit_app");
    await client.query("select set_config('app.user_id', $1, true), set_config('app.club_id', $2, true)", [user ?? "", club ?? ""]);
    const result = await fn(client);
    await client.query(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function refusedWith(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return { code: (error as { code?: string }).code, message: (error as Error).message };
  }
  throw new Error("expected the call to be refused");
}

beforeAll(async () => {
  pool = createPool();
  for (const { id } of (await pool.query("select id from clubs where name like 'kk-test-%'")).rows) await dropClub(id);
  const club = async (label: string) => (await pool.query("insert into clubs (name, session) values ($1, '2026') returning id", [`kk-test-${label}-${randomUUID()}`])).rows[0].id as string;
  clubA = await club("sec-a");
  clubB = await club("sec-b");
  createdClubs.push(clubA, clubB);
  const member = (u: string, c: string, role: string) => pool.query("insert into club_members (club_id, user_id, role) values ($1, $2, $3)", [c, u, role]);
  await member(ownerA, clubA, "owner");
  await member(committeeA, clubA, "committee");
  await member(ownerB, clubB, "owner");
  memberA = (await pool.query("insert into members (club_id, name, joined_on) values ($1, 'Ahli S', current_date) returning id", [clubA])).rows[0].id;
  collectionA = (await pool.query("insert into collections (club_id, name, type, status, default_amount) values ($1, 'c', 'one_off', 'active', 10000) returning id", [clubA])).rows[0].id;
  await pool.query("insert into participants (club_id, collection_id, member_id) values ($1, $2, $3)", [clubA, collectionA, memberA]);
  chargeA = (await pool.query("insert into charges (club_id, collection_id, member_id, amount) values ($1, $2, $3, 10000) returning id", [clubA, collectionA, memberA])).rows[0].id;
  paymentA = (
    await asApp(ownerA, clubA, (c) => c.query("select kk_record_payment($1, $2, $3, 'cash', current_date, null, null, false, $4::jsonb) as id", [clubA, randomUUID(), memberA, JSON.stringify([{ charge_id: chargeA, amount: 1000 }])]), true)
  ).rows[0].id;
});

afterAll(async () => {
  if (pool) {
    for (const club of createdClubs) await dropClub(club);
    await pool.end();
  }
});

describe("the app role cannot write money tables directly", () => {
  it("INSERT/UPDATE/DELETE on payments, allocations, charges, audit_logs, attachments is denied", async () => {
    const stmts = [
      "insert into payments (club_id, idempotency_key, member_id, amount, method, paid_on, state) values ($1, 'x', $2, 100, 'cash', current_date, 'confirmed')",
      "update payments set state = 'reversed' where club_id = $1",
      "delete from payments where club_id = $1",
      "insert into payment_allocations (club_id, payment_id, charge_id, amount) values ($1, $3, $4, 1)",
      "update payment_allocations set amount = 1 where club_id = $1",
      "insert into charges (club_id, collection_id, member_id, amount) values ($1, $5, $2, 1)",
      "update charges set amount = 1 where club_id = $1",
      "insert into audit_logs (club_id, action, summary) values ($1, 'x', 'forged')",
      "update audit_logs set summary = 'x' where club_id = $1",
      "delete from audit_logs where club_id = $1",
      "update attachments set removed_at = now() where club_id = $1",
    ];
    const ids = [clubA, memberA, paymentA, chargeA, collectionA]; // uuids from this file: safe to inline
    for (const template of stmts) {
      const sql = template.replace(/\$(\d)/g, (_m, n) => `'${ids[Number(n) - 1]}'`);
      const refused = await asApp(ownerA, clubA, (c) => refusedWith(c.query(sql)));
      expect(refused.code, template).toBe("42501");
    }
  });

  it("clubs and club_members can be read but not inserted or membership-edited directly", async () => {
    for (const sql of [
      "insert into clubs (name, session) values ('x', '2026')",
      "insert into club_members (club_id, user_id, role) values ($1, gen_random_uuid(), 'owner')",
      "update club_members set role = 'owner' where club_id = $1",
    ]) {
      const refused = await asApp(ownerA, clubA, (c) => refusedWith(c.query(sql, sql.includes("$1") ? [clubA] : [])));
      expect(refused.code, sql).toBe("42501");
    }
  });
});

describe("kk_* functions assert club membership", () => {
  const calls: [string, string, (club: string) => unknown[]][] = [
    ["kk_record_payment", "select kk_record_payment($1, $2, $3, 'cash', current_date, null, null, true, $4::jsonb)", (c) => [c, randomUUID(), memberA, JSON.stringify([{ charge_id: chargeA, amount: 100 }])]],
    ["kk_record_contribution", "select kk_record_contribution($1, $2, $3, $4, 'cash', current_date, null, null, true, 100)", (c) => [c, randomUUID(), memberA, collectionA]],
    ["kk_confirm_payment", "select kk_confirm_payment($1, $2)", (c) => [c, paymentA]],
    ["kk_reverse_payment", "select kk_reverse_payment($1, $2, 'sebab')", (c) => [c, paymentA]],
    ["kk_set_charge_amount", "select kk_set_charge_amount($1, $2, 20000, 'x')", (c) => [c, chargeA]],
    ["kk_set_charge_exempt", "select kk_set_charge_exempt($1, $2, true, 'x')", (c) => [c, chargeA]],
    ["kk_create_collection", "select kk_create_collection($1, '{\"name\":\"n\",\"type\":\"voluntary\",\"activate\":false}'::jsonb, '[]'::jsonb, '[]'::jsonb)", (c) => [c]],
    ["kk_add_participants", "select kk_add_participants($1, $2, '[]'::jsonb)", (c) => [c, collectionA]],
    ["kk_set_collection_due_date", "select kk_set_collection_due_date($1, $2, current_date)", (c) => [c, collectionA]],
    ["kk_audit", "select kk_audit($1, null, 'x', null, 'forged')", (c) => [c]],
    ["kk_actor_names", "select * from kk_actor_names($1)", (c) => [c]],
  ];

  it.each(calls)("%s: a non-member, a member of another club and no user at all get FORBIDDEN", async (_name, sql, args) => {
    for (const user of [outsider, ownerB, null]) {
      const refused = await asApp(user, user === ownerB ? clubB : null, (c) => refusedWith(c.query(sql, args(clubA))));
      expect(refused, `${_name} as ${user ? "outsider/other club" : "nobody"}`).toMatchObject({ code: "P0001", message: "FORBIDDEN" });
    }
  });

  it("a forged app.club_id does not help: the function checks membership of p_club_id", async () => {
    const refused = await asApp(ownerB, clubA, (c) => refusedWith(c.query("select kk_confirm_payment($1, $2)", [clubA, paymentA])));
    expect(refused).toMatchObject({ code: "P0001", message: "FORBIDDEN" });
  });

  it("corrections are owner-only: committee may record and confirm but not reverse or change amounts", async () => {
    await asApp(committeeA, clubA, async (c) => {
      await c.query("select kk_confirm_payment($1, $2)", [clubA, paymentA]);
    });
    for (const [sql, args] of [
      ["select kk_reverse_payment($1, $2, 'sebab')", [clubA, paymentA]],
      ["select kk_set_charge_amount($1, $2, 20000, 'x')", [clubA, chargeA]],
      ["select kk_set_charge_exempt($1, $2, true, 'x')", [clubA, chargeA]],
    ] as const) {
      expect(await asApp(committeeA, clubA, (c) => refusedWith(c.query(sql, [...args])))).toMatchObject({ message: "FORBIDDEN" });
    }
    // and owners can
    await asApp(ownerA, clubA, (c) => c.query("select kk_set_charge_amount($1, $2, 12000, 'naik')", [clubA, chargeA]));
  });

  it("the audit actor is the session user whatever p_actor says", async () => {
    const spoof = randomUUID();
    const id = await asApp(
      ownerA,
      clubA,
      async (c) => {
        const r = await c.query("select kk_record_payment($1, $2, $3, 'cash', current_date, null, null, true, $4::jsonb, $5) as id", [clubA, randomUUID(), memberA, JSON.stringify([{ charge_id: chargeA, amount: 100 }]), spoof]);
        return r.rows[0].id as string;
      },
      true,
    );
    const rows = (await pool.query("select actor_user_id from audit_logs where entity_id = $1", [id])).rows;
    expect(rows).toEqual([{ actor_user_id: ownerA }]);
    expect((await pool.query("select created_by_user_id from payments where id = $1", [id])).rows[0].created_by_user_id).toBe(ownerA);
  });
});

describe("kk_my_clubs and kk_create_club", () => {
  it("kk_my_clubs returns only the caller's clubs", async () => {
    const mine = async (user: string | null) => (await asApp(user, null, (c) => c.query("select id, role from kk_my_clubs()"))).rows;
    expect(await mine(ownerA)).toEqual([{ id: clubA, role: "owner" }]);
    expect(await mine(committeeA)).toEqual([{ id: clubA, role: "committee" }]);
    expect(await mine(ownerB)).toEqual([{ id: clubB, role: "owner" }]);
    expect(await mine(outsider)).toEqual([]);
    expect(await mine(null)).toEqual([]);
  });

  it("club_members RLS: with only a user set, a user sees their own memberships and nobody else's", async () => {
    const rows = (await asApp(ownerA, null, (c) => c.query("select club_id, user_id from club_members"))).rows;
    expect(rows).toEqual([{ club_id: clubA, user_id: ownerA }]);
    // With the club set, the whole team of that club is visible, other clubs still are not.
    const team = (await asApp(ownerA, clubA, (c) => c.query("select user_id from club_members"))).rows.map((r) => r.user_id).sort();
    expect(team).toEqual([ownerA, committeeA].sort());
  });

  it("kk_create_club makes the club and the owner membership together, and seeds nothing", async () => {
    const user = randomUUID();
    const id = (await asApp(user, null, (c) => c.query("select kk_create_club('  kk-test-new   club ', '2026', null, 'Bendahari Baru') as id"), true)).rows[0].id as string;
    createdClubs.push(id);
    const club = (await pool.query("select name, treasurer_name, created_by_user_id from clubs where id = $1", [id])).rows[0];
    expect(club).toMatchObject({ name: "kk-test-new club", treasurer_name: "Bendahari Baru", created_by_user_id: user });
    expect((await pool.query("select user_id, role from club_members where club_id = $1", [id])).rows).toEqual([{ user_id: user, role: "owner" }]);
    for (const table of ["members", "collections", "payments", "charges", "participants"]) {
      expect(Number((await pool.query(`select count(*) n from ${table} where club_id = $1`, [id])).rows[0].n), table).toBe(0);
    }
    expect((await asApp(user, null, (c) => c.query("select id from kk_my_clubs()"))).rows).toEqual([{ id }]);
  });

  it("kk_create_club refuses no user, blank name, blank session and a sixth club", async () => {
    expect(await asApp(null, null, (c) => refusedWith(c.query("select kk_create_club('x', '2026', null, null)")))).toMatchObject({ message: "FORBIDDEN" });
    const user = randomUUID();
    expect(await asApp(user, null, (c) => refusedWith(c.query("select kk_create_club('   ', '2026', null, null)")))).toMatchObject({ message: "NAME_REQUIRED" });
    expect(await asApp(user, null, (c) => refusedWith(c.query("select kk_create_club('kk-test-x', ' ', null, null)")))).toMatchObject({ message: "SESSION_REQUIRED" });
    for (let i = 0; i < 5; i += 1) {
      const id = (await asApp(user, null, (c) => c.query("select kk_create_club($1, '2026', null, null) as id", [`kk-test-lim-${i}-${randomUUID()}`]), true)).rows[0].id;
      createdClubs.push(id);
    }
    expect(await asApp(user, null, (c) => refusedWith(c.query("select kk_create_club('kk-test-sixth', '2026', null, null)")))).toMatchObject({ message: "CLUB_LIMIT" });
  });
});

describe("collection writers", () => {
  it("kk_create_collection (monthly) writes periods, participants and one charge per period; exempt and override are honoured", async () => {
    const m2 = (await pool.query("insert into members (club_id, name, joined_on) values ($1, 'Ahli S2', current_date) returning id", [clubA])).rows[0].id;
    const collection = { name: "Yuran", type: "monthly", activate: true, default_amount: 1000, start_month: "2026-01-01", end_month: "2026-03-01", due_day: 31 };
    const periods = [
      { month: "2026-01-01", due_date: "2026-01-31" },
      { month: "2026-02-01", due_date: "2026-02-28" },
      { month: "2026-03-01", due_date: "2026-03-31" },
    ];
    const participants = [
      { member_id: memberA, amount_override: 1500, exempt: false, note: null },
      { member_id: m2, amount_override: null, exempt: true, note: "Cuti belajar" },
    ];
    const id = (await asApp(ownerA, clubA, (c) => c.query("select kk_create_collection($1, $2::jsonb, $3::jsonb, $4::jsonb) as id", [clubA, JSON.stringify(collection), JSON.stringify(periods), JSON.stringify(participants)]), true)).rows[0].id as string;
    const charges = (await pool.query("select member_id, amount, exempt, exempt_reason, due_date::text d from charges where collection_id = $1 order by member_id, due_date", [id])).rows;
    expect(charges).toHaveLength(6);
    expect(charges.filter((r) => r.member_id === memberA).map((r) => [Number(r.amount), r.exempt, r.d])).toEqual([
      [1500, false, "2026-01-31"],
      [1500, false, "2026-02-28"],
      [1500, false, "2026-03-31"],
    ]);
    expect(charges.filter((r) => r.member_id === m2).every((r) => r.exempt && r.exempt_reason === "Cuti belajar" && Number(r.amount) === 1000)).toBe(true);
    expect((await pool.query("select count(*) n from audit_logs where entity_id = $1 and action = 'collection.create'", [id])).rows[0].n).toBe("1");

    // add_participants: duplicates refused, archived refused.
    expect(await asApp(ownerA, clubA, (c) => refusedWith(c.query("select kk_add_participants($1, $2, $3::jsonb)", [clubA, id, JSON.stringify([{ member_id: m2, exempt: false }])])))).toMatchObject({ message: "PARTICIPANT_EXISTS" });
    expect(await asApp(ownerA, clubA, (c) => refusedWith(c.query("select kk_add_participants($1, $2, $3::jsonb)", [clubA, id, JSON.stringify([{ member_id: randomUUID() }])])))).toMatchObject({ message: "MEMBER_NOT_FOUND" });
    // a member of the other club cannot be added to this club's collection
    const mb = (await pool.query("insert into members (club_id, name, joined_on) values ($1, 'Ahli B', current_date) returning id", [clubB])).rows[0].id;
    expect(await asApp(ownerA, clubA, (c) => refusedWith(c.query("select kk_add_participants($1, $2, $3::jsonb)", [clubA, id, JSON.stringify([{ member_id: mb }])])))).toMatchObject({ message: "MEMBER_NOT_FOUND" });
  });

  it("kk_create_collection is atomic: a bad participant leaves no collection behind", async () => {
    const before = Number((await pool.query("select count(*) n from collections where club_id = $1", [clubA])).rows[0].n);
    const refused = await asApp(
      ownerA,
      clubA,
      (c) => refusedWith(c.query("select kk_create_collection($1, $2::jsonb, '[]'::jsonb, $3::jsonb)", [clubA, JSON.stringify({ name: "Atomik", type: "one_off", activate: true, default_amount: 500 }), JSON.stringify([{ member_id: randomUUID() }])])),
      true,
    );
    expect(refused.message).toBe("MEMBER_NOT_FOUND");
    expect(Number((await pool.query("select count(*) n from collections where club_id = $1", [clubA])).rows[0].n)).toBe(before);
  });

  it("kk_set_collection_due_date moves the collection and every charge; kk_set_charge_exempt refuses once money exists", async () => {
    await asApp(ownerA, clubA, (c) => c.query("select kk_set_collection_due_date($1, $2, '2026-12-31')", [clubA, collectionA]), true);
    expect((await pool.query("select due_date::text d from charges where collection_id = $1", [collectionA])).rows.map((r) => r.d)).toEqual(["2026-12-31"]);
    expect(await asApp(ownerA, clubA, (c) => refusedWith(c.query("select kk_set_charge_exempt($1, $2, true, 'x')", [clubA, chargeA])))).toMatchObject({ message: "AMOUNT_BELOW_PAID" });
    expect(await asApp(ownerA, clubA, (c) => refusedWith(c.query("select kk_set_charge_exempt($1, $2, true, '  ')", [clubA, chargeA])))).toMatchObject({ message: "REASON_REQUIRED" });
  });
});
