"use client";

import { useKelab, useSnapshot } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/errors";
import { categoryLabels } from "@/lib/labels";
import { ACCEPTED_CATEGORIES, buildMemberTemplate, invalidPhoneMessage, invalidCategoryMessage, MIN_PHONE_DIGITS, parseMemberCsv, phoneDigits, TEMPLATE_FILENAME, type ImportIssue } from "@/lib/member-import";
import { normaliseName } from "@/lib/names";
import type { MemberCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown, Download, FileSpreadsheet, Info, TriangleAlert, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// Bulk add: paste names one per line, or import a CSV, then check a preview before
// saving. Probable duplicates (against existing members and within the paste) are
// flagged with normaliseName and must be removed or marked "orang berbeza". New members
// join no collection; the treasurer adds them to collections separately.

const MAX_NAME = 120;
const NO_CATEGORY = "none";

type Row = {
  key: string;
  name: string;
  category: MemberCategory | null;
  phone: string;
  /** Treasurer confirmed this is a different person despite a similar name. */
  distinct: boolean;
  /** kategori cell from the CSV that was not recognised; cleared once the treasurer picks one. */
  invalidCategory?: string | null;
};

type CategoryValue = MemberCategory | typeof NO_CATEGORY;

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;


const cleanName = (name: string) => name.replace(/\s+/g, " ").trim();

export function BulkAddMembersDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (memberIds: string[]) => void;
}) {
  const { data } = useSnapshot();
  const { run } = useKelab();
  const [step, setStep] = useState<"input" | "preview">("input");
  const [text, setText] = useState("");
  const [fallback, setFallback] = useState<CategoryValue>("guru");
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);
  // Rows the CSV import left out or changed, and file-level notes. Never silent.
  const [notes, setNotes] = useState<ImportIssue[]>([]);
  const [guideOpen, setGuideOpen] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches);
  const [source, setSource] = useState<"paste" | "csv">("paste");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const fallbackCategory = fallback === NO_CATEGORY ? null : fallback;
  // Trailing line breaks are not "blank lines" worth reporting.
  const pastedLines = text.replace(/\s+$/, "").split(/\r?\n/);
  const pastedNames = pastedLines.map(cleanName).filter(Boolean);

  const reset = () => {
    setStep("input");
    setText("");
    setRows([]);
    setSkipped(0);
    setNotes([]);
    setError(null);
    setSource("paste");
    if (fileInput.current) fileInput.current.value = "";
  };

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const fromPaste = () => {
    if (!pastedNames.length) return setError("Tampal sekurang-kurangnya satu nama.");
    setRows(pastedNames.map((name) => ({ key: newKey(), name, category: fallbackCategory, phone: "", distinct: false })));
    setSkipped(pastedLines.length - pastedNames.length);
    setNotes([]);
    setSource("paste");
    setError(null);
    setStep("preview");
  };

  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const content = await file.text();
      const { rows: parsed, issues } = parseMemberCsv(content, { defaultCategory: fallbackCategory });
      const header = issues.find((issue) => issue.level === "error");
      if (header) {
        setError(header.message);
        return;
      }
      const kept = parsed.filter((row) => !row.isExample);
      if (!kept.length) {
        const why = issues.filter((issue) => issue.level === "skipped").map((issue) => `baris ${issue.line}: ${issue.message}`);
        setError(`Fail CSV tiada ahli untuk diimport.${why.length ? ` ${why.join(" ")}` : ""}`);
        return;
      }
      setRows(
        kept.map((row) => ({ key: newKey(), name: row.name, category: row.category, phone: row.phone, distinct: false, invalidCategory: row.invalidCategory })),
      );
      setNotes(issues.filter((issue) => issue.level === "skipped" || issue.kind === "unknown-column"));
      setSkipped(0);
      setSource("csv");
      setError(null);
      setStep("preview");
    } catch {
      setError("Fail tidak dapat dibaca. Simpan sebagai CSV (UTF-8) dan cuba lagi.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // Flags: an existing member with the same normalised name, or an earlier row in this list.
  const flags = useMemo(() => {
    const existing = new Map(data.members.map((member) => [normaliseName(member.name), member.name]));
    const firstRow = new Map<string, number>();
    return rows.map((row, index) => {
      const key = normaliseName(row.name);
      const problems: { kind: "empty" | "long" | "existing" | "repeat"; text: string }[] = [];
      if (!key) problems.push({ kind: "empty", text: "Nama diperlukan." });
      else if (row.name.trim().length > MAX_NAME) problems.push({ kind: "long", text: `Nama terlalu panjang (maksimum ${MAX_NAME} aksara).` });
      if (key && existing.has(key)) problems.push({ kind: "existing", text: `Mungkin sama dengan ahli sedia ada "${existing.get(key)}".` });
      if (key && firstRow.has(key)) problems.push({ kind: "repeat", text: `Berulang dengan baris ${firstRow.get(key)! + 1} dalam senarai ini.` });
      if (key && !firstRow.has(key)) firstRow.set(key, index);
      const warnings: string[] = [];
      if (row.invalidCategory && row.category === null) warnings.push(invalidCategoryMessage(row.invalidCategory));
      const phone = row.phone.trim();
      if (phone && phoneDigits(phone) < MIN_PHONE_DIGITS) warnings.push(invalidPhoneMessage(phone));
      const duplicate = problems.some((p) => p.kind === "existing" || p.kind === "repeat");
      const blocking = problems.some((p) => p.kind === "empty" || p.kind === "long") || (duplicate && !row.distinct);
      return { problems, warnings, duplicate, blocking };
    });
  }, [rows, data.members]);

  const blockingCount = flags.filter((flag) => flag.blocking).length;
  const duplicateCount = flags.filter((flag) => flag.duplicate).length;
  const warningCount = flags.filter((flag) => flag.warnings.length > 0).length;

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([buildMemberTemplate()], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = TEMPLATE_FILENAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const update = (key: string, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setError(null);
  };
  const remove = (key: string) => setRows((current) => current.filter((row) => row.key !== key));

  const save = async () => {
    if (!rows.length) return setError("Tiada nama untuk disimpan.");
    if (blockingCount > 0)
      return setError(
        `${blockingCount} baris perlu disemak: buang baris itu, betulkan nama, atau tandakan "Orang berbeza" jika memang bukan orang yang sama.`,
      );
    setBusy(true);
    setError(null);
    try {
      const ids = await run((backend) =>
        backend.addMembers(
          rows.map((row, index) => ({
            name: row.name,
            category: row.category,
            phone: row.phone.trim() || null,
            notes: null,
            allowDuplicate: flags[index].duplicate && row.distinct,
          })),
        ),
      );
      toast.success(`${ids.length} ahli ditambah. Mereka belum dimasukkan ke mana-mana kutipan.`);
      reset();
      onOpenChange(false);
      onAdded?.(ids);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah ahli secara pukal</DialogTitle>
          <DialogDescription>
            {step === "input"
              ? "Tampal senarai nama, satu nama sebaris, atau import fail CSV. Anda boleh semak dan betulkan sebelum simpan."
              : `Semak ${rows.length} nama sebelum disimpan.`}
          </DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-xl bg-primary-tint px-3 py-2.5 text-xs text-foreground/80">
          <Info className="mt-px size-4 shrink-0 text-primary-strong" aria-hidden />
          <span>
            Ahli baharu <b>tidak dimasukkan ke mana-mana kutipan</b> dan tidak dicaj apa-apa. Sertakan mereka kemudian dari halaman
            kutipan atau Matriks.
          </span>
        </p>

        {step === "input" ? (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-names">Senarai nama</Label>
              <Textarea
                id="bulk-names"
                autoFocus
                rows={8}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setError(null);
                }}
                placeholder={"Cikgu Nurul Ain binti Ahmad\nEncik Faizal bin Hamid\nPuan Siti Aishah"}
                className="min-h-40 rounded-xl font-normal"
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {pastedNames.length} nama
                {pastedLines.length - pastedNames.length > 0 && text.trim() && ` · ${pastedLines.length - pastedNames.length} baris kosong diabaikan`}
              </p>
            </div>
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label>Kategori lalai</Label>
              <CategorySelect value={fallback} onChange={setFallback} ariaLabel="Kategori lalai" />
              <p className="text-xs text-muted-foreground">Boleh ditukar bagi setiap nama dalam semakan.</p>
            </div>
            <div className="rounded-xl border border-dashed border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-light text-primary-strong">
                    <FileSpreadsheet className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Import CSV (pilihan)</p>
                    <p className="text-xs text-muted-foreground">Guna templat supaya format tepat.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                    <Download aria-hidden /> Muat turun templat CSV
                  </Button>
                  <Button type="button" variant="brand" size="sm" onClick={() => fileInput.current?.click()}>
                    Pilih fail
                  </Button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Pilih fail CSV"
                  onChange={(event) => void fromFile(event.target.files?.[0])}
                />
              </div>
              <button
                type="button"
                aria-expanded={guideOpen}
                aria-controls="csv-guide"
                onClick={() => setGuideOpen((value) => !value)}
                className="mt-2.5 flex items-center gap-1 text-xs font-medium text-primary-strong"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", guideOpen && "rotate-180")} aria-hidden /> Panduan format CSV
              </button>
              {guideOpen && (
                <ul id="csv-guide" className="mt-1.5 grid list-disc gap-1 pl-5 text-xs text-muted-foreground">
                  <li>
                    Pengepala: <b className="text-foreground">nama, kategori, telefon</b>. Satu ahli setiap baris.
                  </li>
                  <li>
                    <b className="text-foreground">nama</b> wajib.
                  </li>
                  <li>
                    <b className="text-foreground">kategori</b> pilihan: {ACCEPTED_CATEGORIES} (huruf besar atau kecil; &quot;staf&quot; dan &quot;lain-lain&quot; pun diterima).
                  </li>
                  <li>
                    <b className="text-foreground">telefon</b> pilihan, format Malaysia, cth 012-345 6789.
                  </li>
                  <li>Fail berpembatas koma-bertitik (Excel bahasa Melayu) turut diterima. Baris contoh dalam templat diabaikan.</li>
                </ul>
              )}
            </div>
            {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Batal
              </Button>
              <Button type="button" onClick={fromPaste} disabled={!pastedNames.length}>
                Semak {pastedNames.length > 0 ? `${pastedNames.length} nama` : "senarai"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{rows.length} ahli akan ditambah</span>
              {source === "csv" && <span>Dari fail CSV</span>}
              {skipped > 0 && <span className="tabular-nums">{skipped} baris kosong diabaikan</span>}
              {warningCount > 0 && (
                <span className="inline-flex items-center gap-1 text-st-partial tabular-nums">
                  <TriangleAlert className="size-3.5" aria-hidden /> {warningCount} baris ada amaran
                </span>
              )}
              {duplicateCount > 0 && (
                <span className="inline-flex items-center gap-1 text-st-partial tabular-nums">
                  <TriangleAlert className="size-3.5" aria-hidden /> {duplicateCount} mungkin pendua
                </span>
              )}
            </div>

            {notes.length > 0 && (
              <div role="status" data-testid="import-notes" className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Tidak dimasukkan / diabaikan</p>
                <ul className="mt-1 grid gap-0.5">
                  {notes.map((note, i) => (
                    <li key={i}>{note.line ? `Baris ${note.line}: ` : ""}{note.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Semua baris telah dibuang.
              </p>
            ) : (
              <ol className="grid gap-2">
                {rows.map((row, index) => {
                  const flag = flags[index];
                  return (
                    <li
                      key={row.key}
                      className={cn(
                        "grid gap-2 rounded-xl border border-border bg-card p-2.5",
                        flag.blocking && "border-st-partial/60 bg-st-partial-bg/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                        <Input
                          value={row.name}
                          onChange={(event) => update(row.key, { name: event.target.value, distinct: false })}
                          aria-label={`Nama baris ${index + 1}`}
                          aria-invalid={flag.blocking || undefined}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant="danger-outline"
                          size="icon"
                          onClick={() => remove(row.key)}
                          aria-label={`Buang baris ${index + 1}`}
                          className="size-10 shrink-0 rounded-xl"
                        >
                          <X />
                        </Button>
                      </div>
                      <div className="grid gap-2 pl-8 sm:grid-cols-2">
                        <CategorySelect
                          value={row.category ?? NO_CATEGORY}
                          onChange={(value) => update(row.key, { category: value === NO_CATEGORY ? null : value, invalidCategory: null })}
                          ariaLabel={`Kategori baris ${index + 1}`}
                        />
                        <Input
                          value={row.phone}
                          inputMode="tel"
                          onChange={(event) => update(row.key, { phone: event.target.value })}
                          placeholder="No. telefon (pilihan)"
                          aria-label={`No. telefon baris ${index + 1}`}
                          className="h-9 pointer-coarse:h-11"
                        />
                      </div>
                      {flag.warnings.length > 0 && (
                        <div className="grid gap-1.5 pl-8" data-testid="row-warnings">
                          {flag.warnings.map((text) => (
                            <p key={text} className="flex items-start gap-1.5 text-xs text-st-partial">
                              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {text}
                            </p>
                          ))}
                        </div>
                      )}
                      {flag.problems.length > 0 && (
                        <div className="grid gap-1.5 pl-8">
                          {flag.problems.map((problem) => (
                            <p key={problem.kind} className="flex items-start gap-1.5 text-xs text-st-partial">
                              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {problem.text}
                            </p>
                          ))}
                          {flag.duplicate && (
                            <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-medium">
                              <Checkbox checked={row.distinct} onCheckedChange={(value) => update(row.key, { distinct: value === true })} />
                              Orang berbeza; simpan juga
                            </label>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("input")} disabled={busy}>
                Kembali
              </Button>
              <Button type="button" onClick={() => void save()} disabled={busy || rows.length === 0}>
                {busy && <Spinner className="size-4" />}
                {busy ? "Menyimpan…" : `Simpan ${rows.length} ahli`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategorySelect({ value, onChange, ariaLabel }: { value: CategoryValue; onChange: (value: CategoryValue) => void; ariaLabel: string }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as CategoryValue)}>
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CATEGORY}>Tiada kategori</SelectItem>
        {(Object.keys(categoryLabels) as MemberCategory[]).map((key) => (
          <SelectItem key={key} value={key}>
            {categoryLabels[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
