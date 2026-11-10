import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/backend/seed";
import { findAmounts, findMethod, findPaidOn, parsePaste, reassess, type ParseContext } from "@/lib/isi-pantas/parse";
import { isConfident, validateSuggestions, type Suggestion } from "@/lib/isi-pantas/suggestion";
import type { Member, Payment } from "@/lib/types";

// The demo seed as it looks on a fixed day, so balances and "semalam" never drift.
const TODAY = "2026-11-11";
const seed = buildSeed(TODAY);
const ctx: ParseContext = { today: TODAY, ...seed };
const one = (text: string, context: ParseContext = ctx) => {
  const list = parsePaste(text, context);
  expect(list).toHaveLength(1);
  return list[0];
};
const highlighted = (s: Suggestion) => s.quote.slice(s.amountSpan[0], s.amountSpan[1]);

describe("parsePaste: the mockup's WhatsApp lines on the demo seed", () => {
  const lines = ["Farah dah bank in 5 utk jamuan ye kak", "Siti bayar yuran nov 10 cash", "Amir baju 15 transfer semalam", "Tan Mei Ling 25 jamuan"].join("\n");
  const [farah, siti, amir, tan] = parsePaste(lines, ctx);

  it("reads one suggestion per line, quoting the line", () => {
    expect(parsePaste(lines, ctx)).toHaveLength(4);
    expect(farah.quote).toBe("Farah dah bank in 5 utk jamuan ye kak");
    expect(highlighted(farah)).toBe("5");
  });

  it("Farah: transfer to Jamuan, within balance, confident", () => {
    expect(farah).toMatchObject({ memberId: "m-02", collectionId: "c-jamuan", periodId: null, amountSen: 500, method: "transfer", paidOn: TODAY, issues: [] });
    expect(isConfident(farah)).toBe(true);
  });

  it("Amir: baju, transfer, 'semalam' is yesterday, confident", () => {
    expect(amir).toMatchObject({ memberId: "m-07", collectionId: "c-baju", amountSen: 1500, method: "transfer", paidOn: "2026-11-10", issues: [] });
    expect(isConfident(amir)).toBe(true);
  });

  it("Siti: Yuran November is already paid today in the seed, so over balance and a possible duplicate", () => {
    expect(siti).toMatchObject({ memberId: "m-03", collectionId: "c-yuran", periodId: "c-yuran-2026-11", amountSen: 1000, method: "cash" });
    expect(siti.issues).toEqual(expect.arrayContaining(["OVER_BALANCE", "POSSIBLE_DUPLICATE"]));
    expect(isConfident(siti)).toBe(false);
    expect(siti.confidence).toBeLessThanOrEqual(0.6);
  });

  it("Tan Mei Ling: full name; 'Mei' is a name, not May; Jamuan already paid, so over balance", () => {
    expect(tan).toMatchObject({ memberId: "m-09", collectionId: "c-jamuan", amountSen: 2500 });
    expect(tan.issues).toContain("OVER_BALANCE");
  });
});

describe("parsePaste: other shapes", () => {
  it("bank statement line: date, DuitNow, name in capitals, decimal amount", () => {
    const s = one("10/11 DUITNOW FR SITI AISYAH 10.00");
    expect(s).toMatchObject({ memberId: "m-03", amountSen: 1000, method: "transfer", paidOn: "2026-11-10" });
    expect(highlighted(s)).toBe("10.00");
    // No collection word: inferred from the one charge with exactly that balance, never "yakin".
    expect(s.collectionId).toBe("c-yuran");
    expect(isConfident(s)).toBe(false);
  });

  it("splits a line that holds several payments, each with its own method", () => {
    const [amir, tan] = parsePaste("Amir 15 baju, Ravi 10 yuran nov tunai", ctx);
    expect(amir).toMatchObject({ memberId: "m-07", collectionId: "c-baju", amountSen: 1500 });
    expect(tan).toMatchObject({ memberId: "m-22", collectionId: "c-yuran", periodId: "c-yuran-2026-11", amountSen: 1000, method: "cash", issues: [] });
  });

  it("unknown name: no member, NAME_UNMATCHED, never confident", () => {
    const s = one("Zubaidah 20 hadiah");
    expect(s.memberId).toBeNull();
    expect(s.candidates).toEqual([]);
    expect(s.issues).toContain("NAME_UNMATCHED");
    expect(s.collectionId).toBe("c-hadiah");
  });

  it("ambiguous name: two members close in score are both candidates", () => {
    const s = one("Nur 20 hadiah");
    expect(s.issues).toContain("NAME_AMBIGUOUS");
    expect(s.candidates).toEqual(expect.arrayContaining(["m-06", "m-15"]));
    expect(isConfident(s)).toBe(false);
  });

  it("fuzzy name within two edits still matches, below the confident line", () => {
    const s = one("Kavita 10 hadiah tunai"); // Kavitha
    expect(s.memberId).toBe("m-11");
    expect(s.confidence).toBeLessThan(0.85);
  });

  it("voluntary keywords map to the voluntary collection with no period", () => {
    const s = one("Ravi derma kebajikan rm 10 tunai");
    expect(s).toMatchObject({ memberId: "m-22", collectionId: "c-kebajikan", periodId: null, amountSen: 1000, issues: [] });
    expect(highlighted(s)).toBe("rm 10");
  });

  it("over balance: more than what is still payable", () => {
    const s = one("Farah 20 jamuan tunai"); // RM15 charge, RM10 paid
    expect(s.issues).toContain("OVER_BALANCE");
  });

  it("possible duplicate: same member, charge and amount within 7 days", () => {
    // Farah paid RM10 to Jamuan three days ago; she now owes RM5, so test against a raised charge.
    const raised = { ...ctx, charges: ctx.charges.map((c) => (c.id === "ch-jamuan-m-02" ? { ...c, amount: 3000 } : c)) };
    const s = one("Farah 10 jamuan tunai", raised);
    expect(s.issues).toEqual(["POSSIBLE_DUPLICATE"]);
    // A reversed payment is not a duplicate.
    const reversed = {
      ...raised,
      payments: raised.payments.map((p): Payment => (p.memberId === "m-02" && p.amount === 1000 && p.paidOn === "2026-11-08" ? { ...p, state: "reversed" } : p)),
    };
    expect(one("Farah 10 jamuan tunai", reversed).issues).toEqual([]);
  });

  it("no collection word and no exact balance: COLLECTION_UNKNOWN", () => {
    const s = one("Amir 7 tunai");
    expect(s.collectionId).toBeNull();
    expect(s.issues).toContain("COLLECTION_UNKNOWN");
  });

  it("skips lines without an amount and ignores inactive members", () => {
    const inactive: Member = seed.members.find((m) => !m.active)!;
    expect(parsePaste("Assalamualaikum semua\n\nterima kasih", ctx)).toEqual([]);
    expect(one(`${inactive.name} 20 hadiah`).memberId).not.toBe(inactive.id);
  });
});

describe("amount, date and method readers", () => {
  it("amounts: 25, RM25, 25.50, rm 10; not dates, years or phone numbers", () => {
    expect(findAmounts("25").map((a) => a.sen)).toEqual([2500]);
    expect(findAmounts("RM25").map((a) => a.sen)).toEqual([2500]);
    expect(findAmounts("bayar 25.50").map((a) => a.sen)).toEqual([2550]);
    expect(findAmounts("rm 10 je").map((a) => a.sen)).toEqual([1000]);
    expect(findAmounts("RM 1,250.00").map((a) => a.sen)).toEqual([125000]);
    expect(findAmounts("10 Nov 2026 012-345 6781 10/11")).toEqual([]);
  });

  it("dates relative to a fixed today", () => {
    expect(findPaidOn("semalam", TODAY).day).toBe("2026-11-10");
    expect(findPaidOn("hari ini", TODAY).day).toBe(TODAY);
    expect(findPaidOn("kelmarin", TODAY).day).toBe("2026-11-09");
    expect(findPaidOn("10/11", TODAY).day).toBe("2026-11-10");
    expect(findPaidOn("bayar 10 Nov", TODAY).day).toBe("2026-11-10");
    // A day later in the year than today means last year, never the future.
    expect(findPaidOn("20/12", TODAY).day).toBe("2025-12-20");
    expect(findPaidOn("31/02", TODAY)).toMatchObject({ day: TODAY, explicit: false });
    expect(findPaidOn("tiada tarikh", TODAY)).toMatchObject({ day: TODAY, explicit: false });
  });

  it("methods: cash words, transfer words, cash by default", () => {
    expect(findMethod("tunai").method).toBe("cash");
    for (const word of ["transfer", "bank in", "duitnow", "fpx", "tf"]) expect(findMethod(`dah ${word} 5`).method).toBe("transfer");
    expect(findMethod("Tan 25 jamuan")).toEqual({ method: "cash", explicit: false });
  });
});

describe("reassess (Ubah)", () => {
  it("a picked member clears name issues and re-checks the balance", () => {
    const s = one("Nur 5 jamuan tunai");
    const picked = reassess(s, ctx, { memberId: "m-17", collectionId: "c-jamuan", periodId: null });
    expect(picked).toMatchObject({ memberId: "m-17", candidates: ["m-17"], issues: [], confidence: 1 });
    const over = reassess(s, ctx, { memberId: "m-01", collectionId: "c-jamuan", periodId: null });
    expect(over.issues).toContain("OVER_BALANCE");
  });
});

describe("validateSuggestions", () => {
  const good = parsePaste("Farah dah bank in 5 utk jamuan", ctx);
  const known = {
    members: new Set(seed.members.map((m) => m.id)),
    collections: new Set(seed.collections.map((c) => c.id)),
    periods: new Set(seed.periods.map((p) => p.id)),
  };

  it("accepts the parser's own output, bare or wrapped", () => {
    expect(validateSuggestions(good, known)).toEqual({ ok: true, suggestions: good });
    expect(validateSuggestions(JSON.parse(JSON.stringify({ suggestions: good })), known)).toMatchObject({ ok: true });
  });

  it("refuses an amount that is not in the quote", () => {
    const forged = [{ ...good[0], amountSen: 5000 }];
    const result = validateSuggestions(forged);
    expect(result.ok).toBe(false);
  });

  it("refuses wrong types, unknown codes, unknown ids and duplicate ids", () => {
    expect(validateSuggestions({ nope: 1 }).ok).toBe(false);
    expect(validateSuggestions([{ ...good[0], method: "cheque" }]).ok).toBe(false);
    expect(validateSuggestions([{ ...good[0], issues: ["MAYBE"] }]).ok).toBe(false);
    expect(validateSuggestions([{ ...good[0], confidence: 1.2 }]).ok).toBe(false);
    expect(validateSuggestions([{ ...good[0], paidOn: "11/11/2026" }]).ok).toBe(false);
    expect(validateSuggestions([{ ...good[0], amountSen: 5.5 }]).ok).toBe(false);
    expect(validateSuggestions([{ ...good[0], memberId: "m-99" }], known).ok).toBe(false);
    expect(validateSuggestions([good[0], good[0]]).ok).toBe(false);
  });
});
