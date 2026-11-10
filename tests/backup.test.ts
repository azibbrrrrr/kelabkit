import { describe, expect, it } from "vitest";
import { backupDay, backupKey, buildManifest, decodeBackup, encodeBackup, expiredBackupKeys } from "@/lib/backup/format";
import { checkRestoreTarget, endpointOf } from "@/lib/backup/target";
import { isCronAuthorized } from "@/lib/server/cron-auth";

const migration = { count: 6, lastHash: "abc", lastCreatedAt: "1" };

describe("backup file", () => {
  const tables = { clubs: [{ id: "1", name: "A" }], members: [{ id: "m", club_id: "1" }, { id: "n", club_id: "1" }], payments: [] as unknown[] };
  const order = ["clubs", "members", "payments"];
  const now = new Date("2026-11-11T19:00:00Z");

  it("names the object by Malaysian calendar day", () => {
    expect(backupDay(new Date("2026-11-10T16:30:00Z"))).toBe("2026-11-11");
    expect(backupKey(now)).toBe("backups/2026-11-12/kelabkit.json.gz");
  });

  it("round-trips rows and counts through gzip", () => {
    const manifest = buildManifest(now, migration, order, tables);
    expect(manifest.rowCounts).toEqual({ clubs: 1, members: 2, payments: 0 });
    const back = decodeBackup(encodeBackup({ manifest, tables: tables as never }));
    expect(back.tables.members).toHaveLength(2);
    expect(back.manifest.schemaMigration).toEqual(migration);
  });

  it("refuses a file whose manifest disagrees with its rows, or an unsafe table name", () => {
    const manifest = buildManifest(now, migration, order, tables);
    const lying = { manifest: { ...manifest, rowCounts: { ...manifest.rowCounts, members: 9 } }, tables: tables as never };
    expect(() => decodeBackup(encodeBackup(lying))).toThrow(/Row count mismatch/);
    expect(() => buildManifest(now, migration, ['x"; drop table clubs; --'], {})).toThrow(/Unsafe table name/);
  });
});

describe("retention", () => {
  const now = new Date("2026-11-11T04:00:00Z"); // 2026-11-11 in Kuala Lumpur
  const keys = [
    "backups/2026-10-12/kelabkit.json.gz", // exactly 30 days: kept
    "backups/2026-10-11/kelabkit.json.gz", // 31 days: expired
    "backups/2026-10-11/manifest.json",
    "backups/2026-11-11/kelabkit.json.gz",
    "clubs/00000000-0000-0000-0000-000000000000/payments/x/y", // proof: never
    "backups/not-a-date/kelabkit.json.gz",
    "backups/2020-01-01", // no file part
  ];

  it("returns only backups older than 30 days, both files of the day", () => {
    expect(expiredBackupKeys(keys, now)).toEqual(["backups/2026-10-11/kelabkit.json.gz", "backups/2026-10-11/manifest.json"]);
  });

  it("never returns anything outside backups/", () => {
    expect(expiredBackupKeys(["clubs/a/b", "kk-test-1/x", "backups2/2020-01-01/a"], now)).toEqual([]);
  });
});

describe("cron authorisation", () => {
  it("accepts exactly Bearer <secret>", () => {
    expect(isCronAuthorized("Bearer s3cret-value", "s3cret-value")).toBe(true);
  });
  it("rejects wrong, missing, malformed and prefix-only headers", () => {
    for (const header of [null, "", "s3cret-value", "Bearer wrong", "Bearer s3cret-valu", "Bearer s3cret-value ", "bearer s3cret-value"]) {
      expect(isCronAuthorized(header, "s3cret-value"), String(header)).toBe(false);
    }
  });
  it("rejects everything when the secret is unset or blank", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer  ", "  ")).toBe(false);
  });
});

describe("restore target guard", () => {
  const prod = "postgresql://u:p@ep-aaa-bbb-123456-pooler.ap-southeast-1.aws.neon.tech/kelabkit";
  const prodDirect = "postgresql://u:p@ep-aaa-bbb-123456.ap-southeast-1.aws.neon.tech/kelabkit";
  const other = "postgresql://u:p@ep-zzz-yyy-654321.ap-southeast-1.aws.neon.tech/kelabkit";

  it("normalises pooled and direct hosts of one endpoint", () => {
    expect(endpointOf(prod)).toBe(endpointOf(prodDirect));
    expect(endpointOf("nonsense")).toBeNull();
  });
  it("refuses production, pooled or direct, without the flag; allows it with the flag", () => {
    expect(checkRestoreTarget(prodDirect, [prod], false)).toMatchObject({ ok: false });
    expect(checkRestoreTarget(prod, [undefined, prodDirect], false)).toMatchObject({ ok: false });
    expect(checkRestoreTarget(prodDirect, [prod], true)).toEqual({ ok: true });
  });
  it("allows a different endpoint", () => {
    expect(checkRestoreTarget(other, [prod, prodDirect], false)).toEqual({ ok: true });
  });
  it("fails closed when it cannot compare or cannot parse", () => {
    expect(checkRestoreTarget(other, [undefined, ""], false)).toMatchObject({ ok: false });
    expect(checkRestoreTarget("not a url", [prod], false)).toMatchObject({ ok: false });
  });
});
