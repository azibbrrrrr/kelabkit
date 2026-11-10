// The member register's sort order and its CSV export. Pure; the page owns the UI.

import { toCsv } from "@/lib/csv";
import type { Member, Sen } from "@/lib/types";

export type MemberRow = { member: Member; collections: number; dueNow: Sen; overdue: number };

export const MEMBER_SORTS = ["baki", "nama", "kemas-kini"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];
export const DEFAULT_MEMBER_SORT: MemberSort = "baki";

/** The `?isih=` value if it is a known sort, otherwise the default. */
export function parseMemberSort(raw: string | null): MemberSort {
  return (MEMBER_SORTS as readonly string[]).includes(raw ?? "") ? (raw as MemberSort) : DEFAULT_MEMBER_SORT;
}

const byName = (a: MemberRow, b: MemberRow) => a.member.name.localeCompare(b.member.name, "ms");

/**
 * baki: money due now, largest first (same figure as the "Baki semasa" column; future months
 * are not counted), ties by name. nama: A to Z. kemas-kini: most recently edited first, ties by name.
 */
export function sortMembers(rows: MemberRow[], sort: MemberSort): MemberRow[] {
  const compare: Record<MemberSort, (a: MemberRow, b: MemberRow) => number> = {
    baki: (a, b) => b.dueNow - a.dueNow || byName(a, b),
    nama: byName,
    "kemas-kini": (a, b) => b.member.updatedAt.localeCompare(a.member.updatedAt) || byName(a, b),
  };
  return [...rows].sort(compare[sort]);
}

export const MEMBER_EXPORT_FILENAME = (today: string) => `ahli-kelabkit-${today}.csv`;
// Same first three columns as the import template, so an export can be edited and imported back.
export const MEMBER_EXPORT_HEADER = ["nama", "kategori", "telefon", "status", "kutipan", "baki_semasa_rm"] as const;

/** Whole-ringgit-and-sen string from integer sen, e.g. 3550 -> "35.50". No floats. */
export function senToDecimal(sen: Sen) {
  const abs = Math.abs(sen);
  return `${sen < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** CSV of exactly the rows given, in the order given. Balance is "due now" in RM with two decimals. */
export function buildMemberExport(rows: MemberRow[]): string {
  return toCsv([
    [...MEMBER_EXPORT_HEADER],
    ...rows.map(({ member, collections, dueNow }) => [
      member.name,
      member.category ?? "",
      member.phone ?? "",
      member.active ? "aktif" : "tidak aktif",
      collections,
      senToDecimal(dueNow),
    ]),
  ]);
}
