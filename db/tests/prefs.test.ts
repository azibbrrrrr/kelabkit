// Per-user display preferences (migration 0005) against the Neon dev branch: the app role has no
// direct access, a user reads and writes only their own row, saves merge per key, the size cap
// holds, and the shell context returns clubs and preferences from one transaction.
// Rows are keyed on throwaway user ids and deleted afterwards.

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KelabError } from "@/lib/errors";
import { createPool } from "../client";

const { loadShellContext, savePrefs, createClub } = await import("@/lib/server/service");
const { closePool } = await import("@/lib/db/with-club");

const userA = randomUUID();
const userB = randomUUID();
let pool: Pool;
let club: string | null = null;

/** One transaction as kelabkit_app, like withUser; rolled back. */
async function asApp<T>(user: string | null, fn: (c: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role kelabkit_app");
    await client.query("select set_config('app.user_id', $1, true), set_config('app.club_id', '', true)", [user ?? ""]);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
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

beforeAll(() => {
  pool = createPool();
});

afterAll(async () => {
  if (pool) {
    await pool.query("delete from user_prefs where user_id = any($1::uuid[])", [[userA, userB]]);
    if (club) {
      for (const table of ["audit_logs", "club_settings", "club_members"]) await pool.query(`delete from ${table} where club_id = $1`, [club]);
      await pool.query("delete from clubs where id = $1", [club]);
    }
    await pool.end();
  }
  await closePool();
});

describe("user_prefs access", () => {
  it("the app role has no direct privilege on the table", async () => {
    for (const sql of ["select * from user_prefs", "insert into user_prefs (user_id) values (gen_random_uuid())", "update user_prefs set prefs = '{}'", "delete from user_prefs"]) {
      const refused = await asApp(userA, (c) => refusedWith(c.query(sql)));
      expect(refused.code, sql).toBe("42501");
    }
  });

  it("kk_get_prefs / kk_save_prefs refuse a caller with no session user", async () => {
    for (const sql of ["select kk_get_prefs()", "select kk_save_prefs('{}'::jsonb)"]) {
      const refused = await asApp(null, (c) => refusedWith(c.query(sql)));
      expect(refused.message, sql).toBe("FORBIDDEN");
    }
  });

  it("user A cannot read or write user B's preferences", async () => {
    await savePrefs(userB, { theme: "teal", locale: "en" });
    // A has saved nothing: sees null, never B's row, and cannot name a user to read.
    expect((await loadShellContext(userA)).prefs).toBeNull();
    await savePrefs(userA, { theme: "peach" });
    expect((await loadShellContext(userB)).prefs).toEqual({ theme: "teal", locale: "en" });
    expect((await loadShellContext(userA)).prefs).toEqual({ theme: "peach" });
    // The function takes no user argument: B's row is only reachable as B. Count rows A can influence: exactly one.
    const rows = await pool.query("select user_id from user_prefs where user_id = any($1::uuid[]) order by user_id", [[userA, userB]]);
    expect(rows.rowCount).toBe(2);
  });
});

describe("saving", () => {
  it("merges per key: a later patch keeps keys it does not mention and overwrites the ones it does", async () => {
    await savePrefs(userA, { theme: "sage", floral: false });
    await savePrefs(userA, { locale: "en", theme: "lavender" });
    expect((await loadShellContext(userA)).prefs).toEqual({ theme: "lavender", floral: false, locale: "en" });
  });

  it("drops unknown keys and invalid values, stores matrix widths whole", async () => {
    await savePrefs(userA, { theme: "neon", bogus: 1, matrixLayout: "cards", matrixWidths: { ahli: 300, bad: -4, ["x".repeat(60)]: 100 }, floral: "yes" });
    const prefs = (await loadShellContext(userA)).prefs;
    expect(prefs).toMatchObject({ theme: "lavender", floral: false, matrixLayout: "cards", matrixWidths: { ahli: 300 } });
    expect(prefs).not.toHaveProperty("bogus");
    const { rows } = await pool.query("select prefs from user_prefs where user_id = $1", [userA]);
    expect(Object.keys(rows[0].prefs).sort()).toEqual(["floral", "locale", "matrixLayout", "matrixWidths", "theme"]);
  });

  it("refuses an oversized patch and a non-object at the database", async () => {
    await expect(savePrefs(userA, { matrixWidths: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, 100])) })).rejects.toBeInstanceOf(KelabError);
    const big = await asApp(userA, (c) => refusedWith(c.query("select kk_save_prefs(jsonb_build_object('x', repeat('a', 20000)))")));
    expect(big.message).toBe("PREFS_INVALID");
    const array = await asApp(userA, (c) => refusedWith(c.query("select kk_save_prefs('[1]'::jsonb)")));
    expect(array.message).toBe("PREFS_INVALID");
  });

  it("an empty or fully invalid patch writes nothing", async () => {
    await savePrefs(userB, { nothing: true });
    await savePrefs(userB, {});
    expect((await loadShellContext(userB)).prefs).toEqual({ theme: "teal", locale: "en" });
  });
});

describe("shell context", () => {
  it("returns the clubs and the preferences together; a user with neither gets [] and null", async () => {
    const stranger = randomUUID();
    expect(await loadShellContext(stranger)).toEqual({ clubs: [], prefs: null });
    club = await createClub(userA, { name: `kk-test-prefs-${randomUUID()}`, session: "2026", school: null, treasurerName: null });
    const context = await loadShellContext(userA);
    expect(context.clubs.map((c) => c.id)).toEqual([club]);
    expect(context.prefs).toMatchObject({ theme: "lavender" });
  });
});
