import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachmentKey, isUuid } from "@/lib/attachments";
import { KelabError } from "@/lib/errors";
import { missingStorageEnv, STORAGE_ENV } from "@/lib/server/env";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  head: vi.fn(),
  del: vi.fn(),
  presignUpload: vi.fn(async (key: string) => `https://store.invalid/${key}?sig=x`),
}));
vi.mock("@/lib/db/with-club", () => ({
  withClub: async (_user: string, _club: string, fn: (tx: unknown) => unknown) => fn({ query: mocks.query }),
  withUser: async (_user: string, fn: (tx: unknown) => unknown) => fn({ query: mocks.query }),
}));
vi.mock("@/lib/server/storage", () => ({
  presignUpload: mocks.presignUpload,
  presignDownload: vi.fn(),
  headObject: mocks.head,
  deleteObject: mocks.del,
}));
const service = await import("@/lib/server/service");

const club = randomUUID();
const ctx = { userId: randomUUID(), clubId: club, userName: "Bendahari" };
const payment = randomUUID();
const png = { fileName: "bukti.png", mimeType: "image/png", sizeBytes: 1000 };
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(KelabError);
    return (error as KelabError).code;
  }
  throw new Error("expected refusal");
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [] });
});

describe("object key", () => {
  it("is clubs/<club>/payments/<payment>/<attachment>", () => {
    const attachment = randomUUID();
    expect(attachmentKey(club, payment, attachment)).toBe(`clubs/${club}/payments/${payment}/${attachment}`);
  });
  it("refuses anything that is not a uuid, so a path cannot be smuggled in", () => {
    for (const bad of ["../x", "a/b", "", "not-a-uuid", `${payment}/../${club}`]) {
      expect(() => attachmentKey(club, bad, randomUUID())).toThrow(KelabError);
      expect(() => attachmentKey(club, payment, bad)).toThrow(KelabError);
      expect(isUuid(bad)).toBe(false);
    }
  });
});

describe("storage environment", () => {
  it("lists missing names only", () => {
    expect(missingStorageEnv({})).toEqual([...STORAGE_ENV]);
    expect(missingStorageEnv(Object.fromEntries(STORAGE_ENV.map((n) => [n, "x"])))).toEqual([]);
    expect(missingStorageEnv({ NEON_STORAGE_BUCKET: " " })).toContain("NEON_STORAGE_BUCKET");
  });
});

describe("prepareAttachmentUploads", () => {
  it("refuses a payment the club does not own as FORBIDDEN, before presigning anything", async () => {
    expect(await codeOf(service.prepareAttachmentUploads(ctx, payment, [png]))).toBe("FORBIDDEN");
    expect(mocks.presignUpload).not.toHaveBeenCalled();
  });
  it("refuses a malformed payment id as FORBIDDEN without querying", async () => {
    expect(await codeOf(service.prepareAttachmentUploads(ctx, "1; drop table payments", [png]))).toBe("FORBIDDEN");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("refuses a disallowed type, an empty file and an oversize file before touching the database", async () => {
    expect(await codeOf(service.prepareAttachmentUploads(ctx, payment, [{ ...png, fileName: "a.xlsx", mimeType: "application/vnd.ms-excel" }]))).toBe("ATTACHMENT_TYPE");
    expect(await codeOf(service.prepareAttachmentUploads(ctx, payment, [{ ...png, sizeBytes: 0 }]))).toBe("ATTACHMENT_EMPTY");
    expect(await codeOf(service.prepareAttachmentUploads(ctx, payment, [{ ...png, sizeBytes: 10 * 1024 * 1024 + 1 }]))).toBe("ATTACHMENT_TOO_LARGE");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("refuses a reversed payment and a sixth active file", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ state: "reversed" }] });
    expect(await codeOf(service.prepareAttachmentUploads(ctx, payment, [png]))).toBe("ATTACHMENT_PAYMENT_REVERSED");
    mocks.query.mockResolvedValueOnce({ rows: [{ state: "confirmed" }] }).mockResolvedValueOnce({ rows: [{ n: 5 }] });
    expect(await codeOf(service.prepareAttachmentUploads(ctx, payment, [png]))).toBe("ATTACHMENT_LIMIT");
  });
  it("presigns one key per file under the session club, with the canonical type", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ state: "confirmed" }] }).mockResolvedValueOnce({ rows: [{ n: 0 }] });
    const out = await service.prepareAttachmentUploads(ctx, payment, [png, { fileName: "r.pdf", mimeType: "", sizeBytes: 5 }]);
    expect(out.map((o) => o.mimeType)).toEqual(["image/png", "application/pdf"]);
    for (const call of mocks.presignUpload.mock.calls) expect(call[0]).toMatch(new RegExp(`^clubs/${club}/payments/${payment}/[0-9a-f-]{36}$`));
  });
});

describe("confirmAttachmentUploads", () => {
  const item = () => ({ attachmentId: randomUUID(), ...png, sha256: "a".repeat(64) });
  it("rejects an object that is missing, the wrong size or the wrong type, and records nothing", async () => {
    for (const head of [null, { sizeBytes: 999, contentType: "image/png" }, { sizeBytes: 1000, contentType: "text/html" }]) {
      mocks.head.mockResolvedValueOnce(head);
      expect(await codeOf(service.confirmAttachmentUploads(ctx, payment, [item()]))).toBe("ATTACHMENT_UPLOAD_FAILED");
    }
    expect(mocks.query.mock.calls.some((c) => String(c[0]).includes("kk_add_attachment"))).toBe(false);
  });
  it("refuses a malformed attachment id and a repeated id within one confirm", async () => {
    expect(await codeOf(service.confirmAttachmentUploads(ctx, payment, [{ ...item(), attachmentId: "../x" }]))).toBe("FORBIDDEN");
    const same = item();
    expect(await codeOf(service.confirmAttachmentUploads(ctx, payment, [same, same]))).toBe("ATTACHMENT_DUPLICATE");
  });
  it("records through kk_add_attachment with the key derived from the session club", async () => {
    mocks.head.mockResolvedValue({ sizeBytes: 1000, contentType: "image/png" });
    const one = item();
    await service.confirmAttachmentUploads(ctx, payment, [one]);
    const call = mocks.query.mock.calls.find((c) => String(c[0]).includes("kk_add_attachment"))!;
    expect(call[1][0]).toBe(club);
    expect(call[1][7]).toBe(`clubs/${club}/payments/${payment}/${one.attachmentId}`);
  });
  it("on a database refusal deletes only objects no row owns", async () => {
    mocks.head.mockResolvedValue({ sizeBytes: 1000, contentType: "image/png" });
    const kept = item();
    const fresh = item();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("kk_add_attachment")) throw new KelabError("ATTACHMENT_DUPLICATE");
      if (sql.includes("from attachments where id = any")) return { rows: [{ id: kept.attachmentId }] };
      return { rows: [] };
    });
    expect(await codeOf(service.confirmAttachmentUploads(ctx, payment, [kept, fresh]))).toBe("ATTACHMENT_DUPLICATE");
    expect(mocks.del.mock.calls.map((c) => c[0])).toEqual([`clubs/${club}/payments/${payment}/${fresh.attachmentId}`]);
  });
});
