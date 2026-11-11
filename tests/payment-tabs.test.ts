import { describe, expect, it } from "vitest";
import { resolvePaymentTab } from "@/lib/payment-tabs";

describe("resolvePaymentTab", () => {
  it("defaults to the review queue when something is pending, else Semua", () => {
    expect(resolvePaymentTab(null, 3)).toEqual({ tab: "semakan", legacyReversed: false });
    expect(resolvePaymentTab(null, 0)).toEqual({ tab: "semua", legacyReversed: false });
  });
  it("an explicit tab wins, including Semua while payments are pending", () => {
    expect(resolvePaymentTab("semua", 3).tab).toBe("semua");
    expect(resolvePaymentTab("disahkan", 0).tab).toBe("disahkan");
    expect(resolvePaymentTab("semakan", 0).tab).toBe("semakan");
  });
  it("an unknown value falls back to the default; the old dibatalkan link maps to Semua with the reversed filter", () => {
    expect(resolvePaymentTab("x", 1).tab).toBe("semakan");
    expect(resolvePaymentTab("dibatalkan", 1)).toEqual({ tab: "semua", legacyReversed: true });
  });
});
