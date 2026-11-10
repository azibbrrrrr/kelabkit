// Backup file format and retention rules. Pure: no database, no storage, no clock except the
// `now` the caller passes, so the rules are testable and the restore script can share them.

import { gunzipSync, gzipSync } from "node:zlib";

export const BACKUP_VERSION = 1;
export const RETENTION_DAYS = 30;
export const BACKUP_PREFIX = "backups/";

export type SchemaMigration = { count: number; lastHash: string | null; lastCreatedAt: string | null };

export type BackupManifest = {
  version: typeof BACKUP_VERSION;
  createdAt: string;
  schemaMigration: SchemaMigration;
  /** Parents before children (foreign keys), the order the restore inserts in. */
  tableOrder: string[];
  rowCounts: Record<string, number>;
};

export type BackupFile = { manifest: BackupManifest; tables: Record<string, Record<string, unknown>[]> };

const TABLE_NAME = /^[a-z_][a-z0-9_]*$/;

/** Calendar day in Asia/Kuala_Lumpur, so an operator sees the Malaysian date in the key. */
export function backupDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const backupKey = (now: Date) => `${BACKUP_PREFIX}${backupDay(now)}/kelabkit.json.gz`;
export const manifestKey = (now: Date) => `${BACKUP_PREFIX}${backupDay(now)}/manifest.json`;

export function buildManifest(
  now: Date,
  schemaMigration: SchemaMigration,
  tableOrder: string[],
  tables: Record<string, unknown[]>,
): BackupManifest {
  const rowCounts: Record<string, number> = {};
  for (const name of tableOrder) {
    if (!TABLE_NAME.test(name)) throw new Error(`Unsafe table name in backup: ${JSON.stringify(name)}`);
    rowCounts[name] = tables[name]?.length ?? 0;
  }
  return { version: BACKUP_VERSION, createdAt: now.toISOString(), schemaMigration, tableOrder, rowCounts };
}

export function encodeBackup(file: BackupFile): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(file), "utf8"), { level: 9 });
}

/** Parses and validates: the manifest must describe exactly the tables and row counts in the file. */
export function decodeBackup(bytes: Uint8Array): BackupFile {
  const file = JSON.parse(gunzipSync(bytes).toString("utf8")) as BackupFile;
  const { manifest, tables } = file ?? {};
  if (!manifest || manifest.version !== BACKUP_VERSION || !tables) throw new Error("Not a KelabKit backup (version or shape).");
  const names = Object.keys(tables).sort();
  if (JSON.stringify(names) !== JSON.stringify([...manifest.tableOrder].sort())) throw new Error("Backup tables do not match its manifest.");
  for (const name of manifest.tableOrder) {
    if (!TABLE_NAME.test(name)) throw new Error(`Unsafe table name in backup: ${JSON.stringify(name)}`);
    if (!Array.isArray(tables[name]) || tables[name].length !== manifest.rowCounts[name]) throw new Error(`Row count mismatch for ${name}.`);
  }
  return file;
}

const DAY_MS = 86_400_000;

/**
 * Object keys that retention may delete: only `backups/YYYY-MM-DD/...` whose day is more than
 * `retentionDays` before `today` (both Malaysian calendar days). Anything else under any prefix,
 * including payment proof under `clubs/`, is never returned.
 */
export function expiredBackupKeys(keys: string[], now: Date, retentionDays = RETENTION_DAYS): string[] {
  const today = Date.parse(`${backupDay(now)}T00:00:00Z`);
  return keys.filter((key) => {
    const m = /^backups\/(\d{4}-\d{2}-\d{2})\/[^/]+$/.exec(key);
    if (!m) return false;
    const day = Date.parse(`${m[1]}T00:00:00Z`);
    return Number.isFinite(day) && today - day > retentionDays * DAY_MS;
  });
}
