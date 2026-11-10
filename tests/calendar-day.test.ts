import { describe, expect, it } from "vitest";
import { dateToDay, dayToDate } from "@/lib/format";

// Run under several TZ values (e.g. TZ=Pacific/Kiritimati npx vitest run) to prove no drift.
describe("dayToDate / dateToDay", () => {
  it("round-trips calendar days, including month and year edges", () => {
    for (const day of ["2026-01-01", "2026-02-28", "2028-02-29", "2026-11-11", "2026-12-31"]) {
      expect(dateToDay(dayToDate(day))).toBe(day);
    }
  });

  it("builds local midnight on the same calendar day", () => {
    const date = dayToDate("2026-03-15");
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 2, 15, 0]);
  });

  it("reads a Date by its local components, not UTC", () => {
    // 00:30 local on 1 Jan is still 31 Dec in UTC for any timezone east of Greenwich.
    expect(dateToDay(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
    expect(dateToDay(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});
