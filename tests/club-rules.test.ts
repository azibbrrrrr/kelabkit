import { describe, expect, it } from "vitest";
import { checkClubChanges } from "@/lib/backend/rules";
import { KelabError } from "@/lib/errors";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as KelabError).code;
  }
  return null;
};

describe("checkClubChanges", () => {
  it("returns only the given fields, trimmed, with spaces collapsed in names", () => {
    expect(checkClubChanges({ name: "  Kelab   Guru ", session: " 2027 ", school: " SK Ujian ", treasurerName: " Puan  Aminah " })).toEqual({ name: "Kelab Guru", session: "2027", school: "SK Ujian", treasurerName: "Puan Aminah" });
    expect(checkClubChanges({ session: "2027" })).toEqual({ session: "2027" });
    expect(checkClubChanges({})).toEqual({});
  });
  it("a blank school clears it; an absent one is left alone", () => {
    expect(checkClubChanges({ school: "   " })).toEqual({ school: null });
    expect(checkClubChanges({ school: null })).toEqual({ school: null });
    expect(checkClubChanges({ name: "X" })).not.toHaveProperty("school");
  });
  it("refuses what the form refuses", () => {
    expect(code(() => checkClubChanges({ name: " " }))).toBe("NAME_REQUIRED");
    expect(code(() => checkClubChanges({ name: "a".repeat(121) }))).toBe("NAME_TOO_LONG");
    expect(code(() => checkClubChanges({ treasurerName: "" }))).toBe("NAME_REQUIRED");
    expect(code(() => checkClubChanges({ treasurerName: "a".repeat(121) }))).toBe("NAME_TOO_LONG");
    expect(code(() => checkClubChanges({ session: "  " }))).toBe("SESSION_REQUIRED");
    expect(code(() => checkClubChanges({ session: "s".repeat(41) }))).toBe("SESSION_TOO_LONG");
    expect(code(() => checkClubChanges({ school: "s".repeat(121) }))).toBe("SCHOOL_TOO_LONG");
  });
  it("accepts the limits exactly", () => {
    expect(() => checkClubChanges({ name: "a".repeat(120), treasurerName: "b".repeat(120), session: "s".repeat(40), school: "c".repeat(120) })).not.toThrow();
  });
});
