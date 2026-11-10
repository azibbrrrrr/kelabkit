import { describe, expect, it } from "vitest";
import { assertDbTestEnv, residueMessage } from "@/db/tests/guard";

describe("db:test environment guard", () => {
  it("refuses unless KELABKIT_DB_ENV is exactly dev", () => {
    for (const value of [undefined, "", "prod", "production", "DEV", " dev"]) {
      expect(() => assertDbTestEnv({ KELABKIT_DB_ENV: value, DATABASE_URL_UNPOOLED: "x" }), String(value)).toThrow(/KELABKIT_DB_ENV=dev/);
    }
  });

  it("refuses without a direct connection string", () => {
    expect(() => assertDbTestEnv({ KELABKIT_DB_ENV: "dev" })).toThrow(/DATABASE_URL_UNPOOLED/);
  });

  it("accepts the dev environment", () => {
    expect(() => assertDbTestEnv({ KELABKIT_DB_ENV: "dev", DATABASE_URL_UNPOOLED: "x" })).not.toThrow();
  });
});

describe("db:test residue check", () => {
  it("passes when nothing is left", () => {
    expect(residueMessage({ clubs: 0, tables: { payments: 0 }, objects: [] })).toBeNull();
  });

  it("fails on a leftover club, row or object and says where", () => {
    expect(residueMessage({ clubs: 1, tables: { payments: 0 }, objects: [] })).toMatch(/1 kk-test-\* club/);
    expect(residueMessage({ clubs: 0, tables: { payments: 3 }, objects: [] })).toMatch(/3 row\(s\) in payments/);
    expect(residueMessage({ clubs: 0, tables: {}, objects: ["kk-test-a/b"] })).toMatch(/1 kk-test-\* object/);
  });
});
