import { describe, expect, it } from "vitest";
import { appVersion, buildHealth, memoizeHealth } from "@/lib/server/health";

const ok = () => Promise.resolve();
const never = (signal: AbortSignal) => new Promise<void>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));

describe("buildHealth", () => {
  it("is 200 when both probes pass", async () => {
    const { httpStatus, report } = await buildHealth({ database: ok, storage: ok }, { version: "abc1234" });
    expect(httpStatus).toBe(200);
    expect(report).toEqual({ status: "ok", version: "abc1234", checks: { database: "ok", storage: "ok" } });
  });

  it("is 503 when the database fails, and the error text never reaches the report", async () => {
    const { httpStatus, report } = await buildHealth({
      database: () => Promise.reject(new Error("connect ECONNREFUSED ep-secret-host.neon.tech")),
      storage: ok,
    });
    expect(httpStatus).toBe(503);
    expect(report.checks).toEqual({ database: "fail", storage: "ok" });
    expect(JSON.stringify(report)).not.toMatch(/ECONNREFUSED|neon\.tech/);
  });

  it("is 503 when storage is not configured (the probe throws)", async () => {
    const { httpStatus, report } = await buildHealth({ database: ok, storage: () => Promise.reject(new Error("ATTACHMENT_STORAGE_UNAVAILABLE")) });
    expect(httpStatus).toBe(503);
    expect(report.checks.storage).toBe("fail");
  });

  it("times a hanging probe out instead of hanging the response", async () => {
    const started = Date.now();
    const { httpStatus, report } = await buildHealth({ database: ok, storage: never }, { timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(httpStatus).toBe(503);
    expect(report.checks).toEqual({ database: "ok", storage: "timeout" });
  });

  it("response has exactly the documented keys (no row data, no secrets)", async () => {
    const { report } = await buildHealth({ database: ok, storage: ok });
    expect(Object.keys(report).sort()).toEqual(["checks", "status", "version"]);
    expect(Object.keys(report.checks).sort()).toEqual(["database", "storage"]);
  });
});

describe("appVersion", () => {
  it("shortens the Vercel commit sha, else dev", () => {
    expect(appVersion({ VERCEL_GIT_COMMIT_SHA: "0123456789abcdef" })).toBe("0123456");
    expect(appVersion({})).toBe("dev");
    expect(appVersion({ VERCEL_GIT_COMMIT_SHA: " " })).toBe("dev");
  });
});

describe("memoizeHealth", () => {
  it("runs the probes once for a burst and again after the ttl", async () => {
    let calls = 0;
    let clock = 0;
    const get = memoizeHealth(async () => ++calls, 5000, () => clock);
    const burst = await Promise.all(Array.from({ length: 200 }, () => get()));
    expect(new Set(burst)).toEqual(new Set([1]));
    clock = 4999;
    expect(await get()).toBe(1);
    clock = 5000;
    expect(await get()).toBe(2);
    expect(calls).toBe(2);
  });

  it("does not cache a rejected run", async () => {
    let calls = 0;
    const get = memoizeHealth(async () => {
      if (++calls === 1) throw new Error("boom");
      return "ok";
    }, 5000);
    await expect(get()).rejects.toThrow("boom");
    expect(await get()).toBe("ok");
  });
});
