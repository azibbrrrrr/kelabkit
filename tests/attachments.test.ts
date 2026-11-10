import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES, checkAttachmentBatch, checkProofFile, formatBytes, resolveProofMime } from "@/lib/attachments";
import { upgradeSnapshot } from "@/lib/backend/upgrade";
import { KelabError, type ErrorCode } from "@/lib/errors";
import type { Attachment, Snapshot } from "@/lib/types";

const file = (fileName: string, mimeType: string, sizeBytes = 1000, sha256 = fileName) => ({ fileName, mimeType, sizeBytes, sha256 });
const code = (run: () => unknown): ErrorCode | null => {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof KelabError ? error.code : (String(error) as ErrorCode);
  }
};
const row = (id: string, sha256: string, removedAt: string | null = null): Attachment => ({
  id,
  paymentId: "p-1",
  fileName: `${id}.png`,
  mimeType: "image/png",
  sizeBytes: 10,
  sha256,
  createdAt: "2026-01-01T00:00:00.000Z",
  removedAt,
  removedReason: removedAt ? "salah" : null,
});

describe("resolveProofMime", () => {
  it("accepts the six proof types by MIME and extension", () => {
    expect(resolveProofMime("a.jpg", "image/jpeg")).toBe("image/jpeg");
    expect(resolveProofMime("a.JPEG", "image/jpeg")).toBe("image/jpeg");
    expect(resolveProofMime("a.png", "image/png")).toBe("image/png");
    expect(resolveProofMime("a.webp", "image/webp")).toBe("image/webp");
    expect(resolveProofMime("a.heic", "image/heic")).toBe("image/heic");
    expect(resolveProofMime("a.heif", "image/heif")).toBe("image/heic");
    expect(resolveProofMime("a.pdf", "application/pdf")).toBe("application/pdf");
  });
  it("falls back to the extension when the browser reports no MIME (common for HEIC)", () => {
    expect(resolveProofMime("IMG_0001.HEIC", "")).toBe("image/heic");
  });
  it("refuses Office documents, other types and files with no extension", () => {
    expect(resolveProofMime("kira.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBeNull();
    expect(resolveProofMime("kira.xlsx", "")).toBeNull();
    expect(resolveProofMime("surat.docx", "application/msword")).toBeNull();
    expect(resolveProofMime("a.gif", "image/gif")).toBeNull();
    expect(resolveProofMime("png", "image/png")).toBeNull();
  });
  it("refuses a file whose extension and MIME disagree", () => {
    expect(resolveProofMime("a.png", "application/pdf")).toBeNull();
    expect(resolveProofMime("a.xlsx", "image/png")).toBeNull();
    expect(resolveProofMime("a.pdf", "image/png")).toBeNull();
  });
});

describe("checkProofFile", () => {
  it("accepts a file exactly at the 10 MB limit and refuses one byte over", () => {
    expect(checkProofFile(file("a.pdf", "application/pdf", MAX_ATTACHMENT_BYTES))).toBe("application/pdf");
    expect(code(() => checkProofFile(file("a.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1)))).toBe("ATTACHMENT_TOO_LARGE");
  });
  it("refuses an 11 MB file and an empty file", () => {
    expect(code(() => checkProofFile(file("a.png", "image/png", 11 * 1024 * 1024)))).toBe("ATTACHMENT_TOO_LARGE");
    expect(code(() => checkProofFile(file("a.png", "image/png", 0)))).toBe("ATTACHMENT_EMPTY");
  });
  it("refuses an .xlsx with the type message", () => {
    expect(code(() => checkProofFile(file("kira.xlsx", "application/vnd.ms-excel")))).toBe("ATTACHMENT_TYPE");
  });
});

describe("checkAttachmentBatch", () => {
  const pending = { state: "pending" as const };
  it("accepts a valid batch and returns canonical MIME types", () => {
    expect(checkAttachmentBatch([file("a.png", "image/png"), file("b.pdf", "application/pdf")], pending, [])).toEqual(["image/png", "application/pdf"]);
  });
  it("allows five active attachments and refuses the sixth", () => {
    const four = [1, 2, 3, 4].map((n) => row(`a${n}`, `h${n}`));
    expect(checkAttachmentBatch([file("x.png", "image/png", 1, "hx")], pending, four)).toHaveLength(1);
    const five = [...four, row("a5", "h5")];
    expect(code(() => checkAttachmentBatch([file("x.png", "image/png", 1, "hx")], pending, five))).toBe("ATTACHMENT_LIMIT");
  });
  it("refuses a batch that would pass the limit, as a whole", () => {
    const four = [1, 2, 3, 4].map((n) => row(`a${n}`, `h${n}`));
    expect(code(() => checkAttachmentBatch([file("x.png", "image/png", 1, "hx"), file("y.png", "image/png", 1, "hy")], pending, four))).toBe("ATTACHMENT_LIMIT");
  });
  it("removed attachments do not count toward the limit", () => {
    const rows = [1, 2, 3, 4, 5].map((n) => row(`a${n}`, `h${n}`, n <= 2 ? "2026-01-02T00:00:00.000Z" : null));
    expect(checkAttachmentBatch([file("x.png", "image/png", 1, "hx")], pending, rows)).toHaveLength(1);
  });
  it("refuses the same hash on the same payment, within the batch or against an active file", () => {
    expect(code(() => checkAttachmentBatch([file("x.png", "image/png", 1, "h1")], pending, [row("a1", "h1")]))).toBe("ATTACHMENT_DUPLICATE");
    expect(code(() => checkAttachmentBatch([file("x.png", "image/png", 1, "hz"), file("y.png", "image/png", 1, "hz")], pending, []))).toBe("ATTACHMENT_DUPLICATE");
  });
  it("lets a removed file's hash be attached again", () => {
    expect(checkAttachmentBatch([file("x.png", "image/png", 1, "h1")], pending, [row("a1", "h1", "2026-01-02T00:00:00.000Z")])).toHaveLength(1);
  });
  it("refuses new files on a reversed payment, whatever the file", () => {
    expect(code(() => checkAttachmentBatch([file("x.png", "image/png")], { state: "reversed" }, []))).toBe("ATTACHMENT_PAYMENT_REVERSED");
  });
  it("accepts confirmed payments too", () => {
    expect(checkAttachmentBatch([file("x.png", "image/png")], { state: "confirmed" }, [])).toHaveLength(1);
  });
});

describe("upgradeSnapshot", () => {
  const base = { collections: [{ id: "c" }] } as unknown as Snapshot;
  it("adds an empty attachments list to a snapshot saved before attachments existed", () => {
    const old = structuredClone(base) as Partial<Snapshot>;
    expect("attachments" in old).toBe(false);
    expect(upgradeSnapshot(old as Snapshot).attachments).toEqual([]);
  });
  it("keeps attachments that exist", () => {
    const state = { ...structuredClone(base), attachments: [row("a1", "h1")] } as Snapshot;
    expect(upgradeSnapshot(state).attachments).toHaveLength(1);
  });
});

describe("formatBytes", () => {
  it("formats KB and MB", () => {
    expect(formatBytes(820 * 1024)).toBe("820 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2 MB");
  });
});
