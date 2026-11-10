import { describe, expect, it } from "vitest";
import { assertDbTestEnv, residueMessage, runId, runPrefix } from "@/db/tests/guard";

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

describe("per-run fixture prefix", () => {
  it("refuses to name fixtures without a run id", () => {
    expect(() => runPrefix({})).toThrow(/KELABKIT_TEST_RUN/);
    expect(() => runId({ KELABKIT_TEST_RUN: "../x" })).toThrow(/KELABKIT_TEST_RUN/);
  });

  it("builds kk-test-<runId>- and two runs never share a prefix or match each other", () => {
    const a = runPrefix({ KELABKIT_TEST_RUN: "0123abcd" });
    const b = runPrefix({ KELABKIT_TEST_RUN: "4567ef01" });
    expect(a).toBe("kk-test-0123abcd-");
    expect(`${b}club`.startsWith(a)).toBe(false);
  });

  it("the residue message names the run prefix", () => {
    expect(residueMessage({ clubs: 1, tables: {}, objects: [] }, "kk-test-0123abcd-")).toMatch(/kk-test-0123abcd-\* club/);
  });
});
