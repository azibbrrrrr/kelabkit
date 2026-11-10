import { describe, expect, it } from "vitest";
import { isSignedInConfigured, missingSignedInEnv } from "@/lib/server/env";

const full = {
  DATABASE_URL: "postgresql://example",
  NEON_AUTH_BASE_URL: "https://example.invalid/auth",
  NEON_AUTH_COOKIE_SECRET: "x".repeat(32),
};

describe("signed-in environment validation", () => {
  it("is configured when every variable is present", () => {
    expect(missingSignedInEnv(full)).toEqual([]);
    expect(isSignedInConfigured(full)).toBe(true);
  });

  it("lists missing variables by name only", () => {
    expect(missingSignedInEnv({})).toEqual(["DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"]);
    expect(missingSignedInEnv({ ...full, DATABASE_URL: "  " })).toEqual(["DATABASE_URL"]);
  });

  it("rejects a cookie secret shorter than 32 characters", () => {
    expect(missingSignedInEnv({ ...full, NEON_AUTH_COOKIE_SECRET: "short" })).toEqual(["NEON_AUTH_COOKIE_SECRET"]);
  });
});
