import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Runtime code reaches Postgres only through lib/db/with-club.ts, which sets the restricted
// role and the user/club settings. Anything else that opens its own connection would bypass
// row level security and the kk_* membership checks.

const root = join(__dirname, "..");
const SCAN = ["app", "components", "hooks", "lib", "proxy.ts"];
const ALLOWED = (file: string) => file.startsWith("lib/db/");

function walk(path: string): string[] {
  if (statSync(path).isFile()) return /\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => walk(join(path, name)));
}

const files = SCAN.flatMap((p) => walk(join(root, p))).map((f) => ({ file: relative(root, f), text: readFileSync(f, "utf8") }));

describe("database access boundary", () => {
  it("scans the application sources", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.file === "lib/db/with-club.ts")).toBe(true);
  });

  it("nothing outside lib/db imports a database driver, the pool, or reads a connection string", () => {
    const forbidden = [/@neondatabase\/serverless/, /drizzle-orm\/(neon|pg|node-postgres)/, /["']pg["']/, /db\/client/, /DATABASE_URL/];
    const offenders = files
      .filter((f) => !ALLOWED(f.file))
      .flatMap((f) => forbidden.filter((re) => re.test(f.text)).map((re) => `${f.file} matches ${re}`));
    expect(offenders).toEqual([]);
  });

  it("withClub/withUser are imported only by the server layer", () => {
    const users = files.filter((f) => !ALLOWED(f.file) && /@\/lib\/db\/with-club/.test(f.text)).map((f) => f.file);
    expect(users.filter((file) => !file.startsWith("lib/server/"))).toEqual([]);
  });

  it("withBackupSnapshot (reads every club) is imported only by lib/server/backup.ts", () => {
    const users = files.filter((f) => !ALLOWED(f.file) && /withBackupSnapshot/.test(f.text)).map((f) => f.file);
    expect(users).toEqual(["lib/server/backup.ts"]);
  });

  it("every file in app/actions is a 'use server' module and goes through act(), actMutation() or guard()", () => {
    const actions = files.filter((f) => f.file.startsWith("app/actions/"));
    expect(actions.length).toBeGreaterThan(3);
    for (const f of actions) {
      expect(f.text.startsWith('"use server";'), f.file).toBe(true);
      const exported = f.text.match(/export async function \w+/g) ?? [];
      const wrapped = f.text.match(/return (act|actMutation|guard)\(/g) ?? [];
      expect(wrapped.length, f.file).toBe(exported.length);
    }
  });

  it("client modules never import server-only code", () => {
    const clients = files.filter((f) => /^["']use client["']/.test(f.text));
    const offenders = clients.filter((f) => /@\/lib\/(server|db)\//.test(f.text) || /@\/lib\/auth\/server/.test(f.text)).map((f) => f.file);
    expect(offenders).toEqual([]);
  });
});
