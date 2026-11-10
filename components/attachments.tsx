"use client";

// Proof of payment: pick or drop files, list them on a payment, preview them, remove with a
// reason. Rules live in lib/attachments.ts and are enforced again by the backend; the UI
// checks first so a refusal reads next to the file that caused it.

import { useKelab, useSnapshot } from "@/components/data-provider";
import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  ACCEPT_ATTR,
  COMPRESS_ABOVE_BYTES,
  DEMO_FILE_NOTICE,
  MAX_ACTIVE_ATTACHMENTS,
  activeAttachments,
  attachmentsOf,
  checkAttachmentBatch,
  checkProofFile,
  formatBytes,
  isHeicMime,
  isImageMime,
} from "@/lib/attachments";
import { compressImage, sha256Hex } from "@/lib/attachments-client";
import type { KelabBackend } from "@/lib/backend/types";
import { messageFor } from "@/lib/errors";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import type { Attachment, Payment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ClipboardPaste, Download, FileText, Image as ImageIcon, Maximize2, Paperclip, Trash2, TriangleAlert, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent } from "react";

// ---------------------------------------------------------------- pick files

type Row = { id: string; name: string; size: number; status: "checking" | "compressing" | "saving" | "done" | "error"; message?: string };

const STATUS_TEXT: Record<Exclude<Row["status"], "error">, string> = {
  checking: "Memeriksa…",
  compressing: "Memampatkan gambar…",
  saving: "Menyimpan…",
  done: "Siap",
};

/**
 * Drop zone, file picker and paste-from-clipboard in one. Each file is checked, compressed
 * if it is a large image, hashed and handed to `onFile` one at a time; the row beside it
 * shows where it is, or why it was refused. `onFile` throws a KelabError to refuse.
 */
export function ProofDropzone({
  onFile,
  keepDone = false,
  disabled = false,
  className,
}: {
  onFile: (file: File, sha256: string) => Promise<void>;
  /** Keep finished rows visible (a dialog that confirms what was added). */
  keepDone?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { demo } = useKelab();
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const hintId = useId();

  const patch = useCallback((id: string, change: Partial<Row>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row))), []);

  const handle = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      setPasteError(null);
      const entries = files.map((file) => ({ file, id: crypto.randomUUID() }));
      // New batch: clear earlier refusals, keep anything still in progress.
      setRows((current) => [
        ...current.filter((row) => row.status !== "error" && (keepDone || row.status !== "done")),
        ...entries.map(({ file, id }): Row => ({ id, name: file.name || "tampalan.png", size: file.size, status: "checking" })),
      ]);
      queue.current = queue.current.then(async () => {
        for (const { file, id } of entries) {
          try {
            // Raw size and type are judged before compression, so an 11 MB photo is refused, not shrunk.
            const mime = checkProofFile({ fileName: file.name, mimeType: file.type, sizeBytes: file.size });
            const typed = file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
            if (typed.size > COMPRESS_ABOVE_BYTES && isImageMime(mime) && !isHeicMime(mime)) patch(id, { status: "compressing" });
            const prepared = await compressImage(typed);
            patch(id, { status: "saving", size: prepared.size });
            await onFile(prepared, await sha256Hex(prepared));
            if (keepDone) patch(id, { status: "done" });
            else setRows((current) => current.filter((row) => row.id !== id));
          } catch (error) {
            patch(id, { status: "error", message: messageFor(error) });
          }
        }
      });
    },
    [keepDone, onFile, patch],
  );

  const onPaste = (event: ClipboardEvent) => {
    const files = [...event.clipboardData.files];
    if (!files.length) return;
    event.preventDefault();
    handle(files.map((file, i) => (file.name ? file : new File([file], `tampalan-${i + 1}.png`, { type: file.type || "image/png" }))));
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) handle([...event.dataTransfer.files]);
  };
  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) files.push(new File([await item.getType(type)], `tampalan-${files.length + 1}.${type.split("/")[1] || "png"}`, { type }));
      }
      if (files.length) handle(files);
      else setPasteError("Tiada gambar dalam papan klip.");
    } catch {
      setPasteError("Papan klip tidak dapat dibaca. Klik kotak ini dan tekan Ctrl/⌘ V.");
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <div
        role="group"
        tabIndex={0}
        aria-label="Lampirkan bukti: seret fail ke sini, pilih fail atau tampal gambar"
        aria-describedby={hintId}
        onPaste={onPaste}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "grid justify-items-center gap-2 rounded-xl border border-dashed border-border bg-card px-3 py-3.5 text-center outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
          dragging && "border-primary bg-primary-tint",
          disabled && "opacity-60",
        )}
      >
        <Upload aria-hidden className="size-5 text-muted-foreground" />
        <p id={hintId} className="text-xs text-muted-foreground">
          Seret fail ke sini atau tampal gambar (Ctrl/⌘ V). Gambar atau PDF, maksimum 10 MB setiap satu.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
            <Paperclip /> Pilih fail
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void pasteFromClipboard()}>
            <ClipboardPaste /> Tampal gambar
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={ACCEPT_ATTR}
          onChange={(event) => {
            handle([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
        {demo && <p className="text-[11px] text-muted-foreground">{DEMO_FILE_NOTICE}</p>}
      </div>
      {pasteError && (
        <p role="alert" className="text-xs font-medium text-st-unpaid">
          {pasteError}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="grid gap-1.5" aria-live="polite">
          {rows.map((row) => (
            <li
              key={row.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                row.status === "error" ? "border-destructive-border bg-st-unpaid-bg" : "border-border bg-card",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {row.status === "error" ? (
                  <TriangleAlert aria-hidden className="size-3.5 text-st-unpaid" />
                ) : row.status === "done" ? (
                  <Paperclip aria-hidden className="size-3.5 text-st-paid" />
                ) : (
                  <Spinner className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.name}</span>
                <span className={cn("block break-words", row.status === "error" ? "font-medium text-st-unpaid" : "text-muted-foreground")}>
                  {row.status === "error" ? row.message : `${formatBytes(row.size)} · ${STATUS_TEXT[row.status]}`}
                </span>
              </span>
              {row.status === "error" && (
                <button
                  type="button"
                  aria-label={`Tutup mesej untuk ${row.name}`}
                  onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------- attach while recording

export type StagedFile = { file: File; sha256: string };

/**
 * "Bukti bayaran (pilihan)" on a record form. Files wait here until the payment exists, then
 * `attachStaged` stores them against it. The same rules as the backend apply while staging.
 */
export function ProofField({ staged, onChange, className }: { staged: StagedFile[]; onChange: (next: StagedFile[]) => void; className?: string }) {
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  const add = useCallback(
    async (file: File, sha256: string) => {
      const next = [...stagedRef.current, { file, sha256 }];
      checkAttachmentBatch(
        next.map((item) => ({ fileName: item.file.name, mimeType: item.file.type, sizeBytes: item.file.size, sha256: item.sha256 })),
        { state: "pending" },
        [],
      );
      stagedRef.current = next;
      onChange(next);
    },
    [onChange],
  );
  return (
    <div className={cn("grid gap-1.5", className)}>
      <p className="text-xs font-medium text-muted-foreground">Bukti bayaran (pilihan)</p>
      <ProofDropzone onFile={add} />
      {staged.length > 0 && (
        <ul className="grid gap-1.5">
          {staged.map((item) => (
            <li key={item.sha256} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs">
              {isImageMime(item.file.type) ? <ImageIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.file.name}</span>
                <span className="text-muted-foreground">{formatBytes(item.file.size)} · akan dilampirkan semasa simpan</span>
              </span>
              <button
                type="button"
                aria-label={`Buang ${item.file.name} daripada senarai`}
                onClick={() => {
                  const next = staged.filter((row) => row !== item);
                  stagedRef.current = next;
                  onChange(next);
                }}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Stores staged files against the payments just created. A failure here never undoes the
 * payment; it returns a message for the caller to show (null when nothing went wrong).
 */
export async function attachStaged(
  run: <T>(operation: (backend: KelabBackend) => Promise<T>) => Promise<T>,
  paymentIds: string[],
  staged: StagedFile[],
): Promise<string | null> {
  if (!staged.length || !paymentIds.length) return null;
  try {
    await run(async (backend) => {
      for (const id of paymentIds) await backend.addAttachments(id, staged.map((item) => item.file));
    });
    return null;
  } catch (error) {
    return `Bayaran telah disimpan, tetapi bukti tidak dapat dilampirkan: ${messageFor(error)} Lampirkan semula dari Sejarah bayaran.`;
  }
}

// ------------------------------------------------------- on a payment

export function ProofChip({ payment, className }: { payment: Payment; className?: string }) {
  const { data } = useSnapshot();
  const count = activeAttachments(attachmentsOf(data, payment.id)).length;
  if (!count) return null;
  return (
    <span
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-primary-tint px-2 text-[11px] font-medium whitespace-nowrap text-primary-strong", className)}
      title={`${count} lampiran bukti`}
    >
      <Paperclip aria-hidden className="size-3" />
      {payment.state === "pending" ? `Ada bukti · ${count}` : `${count} lampiran`}
    </span>
  );
}

/** "Lampirkan bukti" for an existing payment: a dialog around the drop zone. */
export function AttachProofButton({ payment }: { payment: Payment }) {
  const { data } = useSnapshot();
  const { run } = useKelab();
  const [open, setOpen] = useState(false);
  const active = activeAttachments(attachmentsOf(data, payment.id)).length;
  const full = active >= MAX_ACTIVE_ATTACHMENTS;
  const add = useCallback((file: File) => run((backend) => backend.addAttachments(payment.id, [file])).then(() => undefined), [run, payment.id]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={full} title={full ? "Sudah 5 lampiran. Buang satu dahulu." : undefined}>
        <Paperclip /> Lampirkan bukti
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lampirkan bukti bayaran</DialogTitle>
            <DialogDescription>
              Bayaran {formatMoney(payment.amount)} pada {formatDay(payment.paidOn)}. {active} daripada {MAX_ACTIVE_ATTACHMENTS} lampiran digunakan.
            </DialogDescription>
          </DialogHeader>
          {open && <ProofDropzone onFile={add} keepDone />}
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useBlobUrl(attachmentId: string | null) {
  const { backend } = useKelab();
  const [state, setState] = useState<{ id: string; url: string | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!attachmentId) return;
    let cancelled = false;
    let created: string | null = null;
    backend
      .getAttachmentBlob(attachmentId)
      .then((blob) => {
        created = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(created);
        else setState({ id: attachmentId, url: created, error: null });
      })
      .catch((error) => !cancelled && setState({ id: attachmentId, url: null, error: messageFor(error) }));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [attachmentId, backend]);
  return state && state.id === attachmentId ? state : null;
}

function Thumb({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const canPreview = isImageMime(attachment.mimeType) && !isHeicMime(attachment.mimeType);
  const blob = useBlobUrl(canPreview ? attachment.id : null);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Lihat ${attachment.fileName}`}
      className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
    >
      {blob?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL, not optimisable
        <img src={blob.url} alt="" className="size-full object-cover" />
      ) : isImageMime(attachment.mimeType) ? (
        <ImageIcon aria-hidden className="size-5" />
      ) : (
        <FileText aria-hidden className="size-5" />
      )}
    </button>
  );
}

/** Thumbnails of a payment's proof, newest last, with view and (reasoned) remove. Removed files stay listed. */
export function PaymentAttachments({ payment }: { payment: Payment }) {
  const { data } = useSnapshot();
  const { run } = useKelab();
  const [viewing, setViewing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const items = attachmentsOf(data, payment.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!items.length) return null;
  const locked = payment.state === "reversed";
  const viewingItem = items.find((row) => row.id === viewing && row.removedAt === null) ?? null;

  return (
    <>
      <ul className="mt-2.5 grid gap-1.5 border-t border-border pt-2.5" aria-label="Lampiran bukti bayaran">
        {items.map((item) =>
          item.removedAt ? (
            <li key={item.id} className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="block truncate line-through">{item.fileName}</span>
              <span className="block break-words">
                Dibuang {formatDateTime(item.removedAt)}: {item.removedReason}
              </span>
            </li>
          ) : (
            <li key={item.id} className="flex items-center gap-2.5">
              <Thumb attachment={item} onOpen={() => setViewing(item.id)} />
              <span className="min-w-0 flex-1 text-xs">
                <span className="block truncate font-medium">{item.fileName}</span>
                <span className="text-muted-foreground">
                  {formatBytes(item.sizeBytes)} · {formatDateTime(item.createdAt)}
                </span>
              </span>
              <Button size="sm" variant="outline" onClick={() => setViewing(item.id)}>
                Lihat
              </Button>
              {!locked && (
                <Button size="icon-sm" variant="danger-outline" aria-label={`Buang ${item.fileName}`} title="Buang lampiran" onClick={() => setRemoving(item)}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ),
        )}
      </ul>
      <ProofViewer attachment={viewingItem} onClose={() => setViewing(null)} />
      <ReasonDialog
        open={removing !== null}
        onOpenChange={(next) => !next && setRemoving(null)}
        title="Buang lampiran"
        description={
          removing && (
            <>
              <b className="break-all">{removing.fileName}</b> akan dibuang. Fail dipadam daripada pelayar; rekod dan sebab pembuangan kekal dalam log audit.
            </>
          )
        }
        confirmLabel="Buang lampiran"
        destructive
        placeholder="Contoh: gambar salah, kabur"
        success="Lampiran dibuang."
        onConfirm={(reason) => run((backend) => backend.removeAttachment(removing!.id, reason))}
      />
    </>
  );
}

// ---------------------------------------------------------------- viewer

type Zoom = "fit" | 1 | 2;

/** Image preview with fit/zoom, PDF preview on a blob URL, download always. Blob URLs are revoked on close. */
export function ProofViewer({ attachment, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  const blob = useBlobUrl(attachment?.id ?? null);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [failed, setFailed] = useState<string | null>(null);
  const isPdf = attachment?.mimeType === "application/pdf";
  const heic = attachment ? isHeicMime(attachment.mimeType) : false;
  const unsupported = Boolean(attachment && failed === attachment.id);

  return (
    <Dialog
      open={attachment !== null}
      onOpenChange={(open) => {
        if (!open) {
          setZoom("fit");
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[94svh] gap-3 overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{attachment?.fileName ?? "Lampiran"}</DialogTitle>
          <DialogDescription>{attachment ? `${formatBytes(attachment.sizeBytes)} · dilampirkan ${formatDateTime(attachment.createdAt)}` : ""}</DialogDescription>
        </DialogHeader>
        {attachment && (
          <div className="min-h-40 overflow-auto rounded-xl border border-border bg-muted/50">
            {!blob ? (
              <div className="grid h-40 place-items-center">
                <Spinner />
              </div>
            ) : blob.error || !blob.url ? (
              <p role="alert" className="p-4 text-sm font-medium text-st-unpaid">
                {blob.error}
              </p>
            ) : isPdf ? (
              <object data={blob.url} type="application/pdf" aria-label={attachment.fileName} className="h-[68svh] w-full">
                <p className="p-4 text-sm text-muted-foreground">Pratonton PDF tidak disokong dalam pelayar ini. Gunakan Muat turun.</p>
              </object>
            ) : unsupported ? (
              <p className="p-4 text-sm text-muted-foreground">Pratonton tidak disokong dalam pelayar ini. Gunakan Muat turun untuk membukanya.</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL, not optimisable
              <img
                src={blob.url}
                alt={`Bukti bayaran: ${attachment.fileName}`}
                onError={() => setFailed(attachment.id)}
                className={cn("mx-auto block", zoom === "fit" ? "max-h-[68svh] w-auto max-w-full object-contain" : "max-w-none")}
                style={zoom === "fit" ? undefined : { width: `${zoom * 100}%` }}
              />
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {attachment && isImageMime(attachment.mimeType) && !unsupported && (
              <>
                <Button variant="outline" size="icon-sm" aria-label="Muat dalam tetingkap" title="Muat dalam tetingkap" aria-pressed={zoom === "fit"} onClick={() => setZoom("fit")}>
                  <Maximize2 />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="Zum masuk" title="Zum masuk" disabled={zoom === 2} onClick={() => setZoom(zoom === "fit" ? 1 : 2)}>
                  <ZoomIn />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="Zum keluar" title="Zum keluar" disabled={zoom === "fit"} onClick={() => setZoom(zoom === 2 ? 1 : "fit")}>
                  <ZoomOut />
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {attachment && blob?.url && (
              <Button asChild variant="outline">
                <a href={blob.url} download={attachment.fileName}>
                  <Download /> Muat turun
                </a>
              </Button>
            )}
            <Button onClick={onClose}>Tutup</Button>
          </div>
        </DialogFooter>
        {heic && !unsupported && <span className="sr-only">Format HEIC dipaparkan jika pelayar menyokongnya.</span>}
      </DialogContent>
    </Dialog>
  );
}
