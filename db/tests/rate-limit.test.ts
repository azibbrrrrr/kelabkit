// Per-user rate limiting (migration 0006) through the real transaction wrapper, against the Neon dev
// branch. Fixtures: one "kk-test-<runId>-*" club and random users; their buckets are deleted afterwards.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KelabError } from "@/lib/errors";
import { MUTATION_LIMIT } from "@/lib/rate-limit";
import { closePool, withClub } from "@/lib/db/with-club";
import { createPool } from "../client";
import { dropClubCascade, runPrefix } from "./guard";

const SCOPE = "dbtest";
const limit = (n: number, windowSeconds = 60) => ({ scope: SCOPE, limit: n, windowSeconds });

let admin: ReturnType<typeof createPool>;
let club: string;
const users: string[] = [];
const newUser = async () => {
  const id = randomUUID();
  users.push(id);
  await admin.query("insert into club_members (club_id, user_id, role) values ($1, $2, 'owner')", [club, id]);
  return id;
};
const hits = async (user: string) => (await admin.query("select hits from rate_limits where bucket = $1", [`${SCOPE}:${user}`])).rows[0]?.hits as number | undefined;
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return error instanceof KelabError ? error.code : (error as Error).message;
  }
  return "ok";
};

beforeAll(async () => {
  admin = createPool();
  club = (await admin.query("insert into clubs (name, session) values ($1, '2026') returning id", [`${runPrefix()}rate-${randomUUID()}`])).rows[0].id as string;
});
afterAll(async () => {
  for (const user of users) await admin.query("delete from rate_limits where bucket = $1", [`${SCOPE}:${user}`]);
  if (club) await dropClubCascade(admin, club);
  await admin?.end();
  await closePool();
});

describe("kk_rate_hit through withClub", () => {
  it("allows up to the limit, then refuses with RATE_LIMITED, and does not run the work when refused", async () => {
    const user = await newUser();
    let ran = 0;
    const call = () => withClub(user, club, async () => void ran++, { rateLimit: limit(3) });
    expect([await code(call()), await code(call()), await code(call())]).toEqual(["ok", "ok", "ok"]);
    expect(await code(call())).toBe("RATE_LIMITED");
    expect(ran).toBe(3);
  });

  it("budgets are per user", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const call = (u: string) => withClub(u, club, async () => undefined, { rateLimit: limit(1) });
    expect(await code(call(a))).toBe("ok");
    expect(await code(call(a))).toBe("RATE_LIMITED");
    expect(await code(call(b))).toBe("ok");
  });

  it("a new window starts after windowSeconds", async () => {
    const user = await newUser();
    const call = () => withClub(user, club, async () => undefined, { rateLimit: limit(1, 1) });
    expect(await code(call())).toBe("ok");
    expect(await code(call())).toBe("RATE_LIMITED");
    await new Promise((r) => setTimeout(r, 1300));
    expect(await code(call())).toBe("ok");
  });

  it("requests that fail and roll back still use up the budget", async () => {
    const user = await newUser();
    const failing = () =>
      withClub(
        user,
        club,
        async () => {
          throw new KelabError("OVERPAYMENT");
        },
        { rateLimit: limit(2) },
      );
    expect([await code(failing()), await code(failing())]).toEqual(["OVERPAYMENT", "OVERPAYMENT"]);
    expect(await hits(user)).toBe(2);
    expect(await code(failing())).toBe("RATE_LIMITED");
    expect(await hits(user)).toBe(2); // the refused attempt rolls back; the counter stays at the limit until the window ends
  });

  it("a non-member gets FORBIDDEN and leaves no counter row", async () => {
    const stranger = randomUUID();
    expect(await code(withClub(stranger, club, async () => undefined, { rateLimit: limit(5) }))).toBe("FORBIDDEN");
    expect(await hits(stranger)).toBeUndefined();
  });

  it("costs no extra round trip: the check rides in the preamble batch", async () => {
    const user = await newUser();
    process.env.KELABKIT_TIMING = "1";
    const g = globalThis as unknown as { __kelabTimings?: { label: string; roundTrips: number }[] };
    g.__kelabTimings = [];
    await withClub(user, club, async (tx) => void (await tx.query("select 1")), { label: "plain" });
    await withClub(user, club, async (tx) => void (await tx.query("select 1")), { label: "limited", rateLimit: limit(10) });
    const [plain, limited] = ["plain", "limited"].map((l) => g.__kelabTimings!.find((t) => t.label === l)!.roundTrips);
    delete process.env.KELABKIT_TIMING;
    expect(limited).toBe(plain);
  });

  it("the production limit is generous and well-formed", () => {
    expect(MUTATION_LIMIT.limit / MUTATION_LIMIT.windowSeconds).toBeGreaterThanOrEqual(10);
  });
});

describe("the table and function are closed to the app role", () => {
  it("kelabkit_app cannot read or write rate_limits directly", async () => {
    const c = await admin.connect();
    try {
      for (const sql of ["select * from rate_limits", "insert into rate_limits (bucket) values ('x')", "delete from rate_limits"]) {
        await c.query("begin");
        await c.query("set local role kelabkit_app");
        await expect(c.query(sql), sql).rejects.toMatchObject({ code: "42501" });
        await c.query("rollback");
      }
    } finally {
      c.release();
    }
  });

  it("rejects a malformed scope or an absurd limit, and has no session user to spend", async () => {
    const user = await newUser();
    const c = await admin.connect();
    try {
      const asApp = async (sql: string, who: string | null) => {
        await c.query("begin");
        await c.query("set local role kelabkit_app");
        await c.query("select set_config('app.user_id', $1, true)", [who ?? ""]);
        try {
          await c.query(sql);
          return "ok";
        } catch (error) {
          return (error as Error).message;
        } finally {
          await c.query("rollback");
        }
      };
      expect(await asApp("select kk_rate_hit('Bad Scope', 5, 60)", user)).toBe("FORBIDDEN");
      expect(await asApp("select kk_rate_hit('ok', 0, 60)", user)).toBe("FORBIDDEN");
      expect(await asApp("select kk_rate_hit('ok', 5, 99999)", user)).toBe("FORBIDDEN");
      expect(await asApp("select kk_rate_hit('ok', 5, 60)", null)).toBe("FORBIDDEN");
    } finally {
      c.release();
    }
  });
});
