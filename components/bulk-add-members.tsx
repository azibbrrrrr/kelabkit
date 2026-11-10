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
import { parseCsv } from "@/lib/csv";
import { normaliseName } from "@/lib/names";
import type { MemberCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, Info, TriangleAlert, X } from "lucide-react";
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
};

type CategoryValue = MemberCategory | typeof NO_CATEGORY;

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;


/** Excel in some locales saves CSV with semicolons; pick whichever the first line uses more. */
function guessDelimiter(text: string) {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  return (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
}

function toCategory(value: string | undefined, fallback: MemberCategory | null): MemberCategory | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  if (v.startsWith("guru") || v === "teacher") return "guru";
  if (v.startsWith("kakitangan") || v.startsWith("staf") || v === "staff") return "kakitangan";
  if (v.startsWith("lain") || v === "other") return "lain";
  return fallback;
}

const cleanName = (name: string) => name.replace(/\s+/g, " ").trim();

/** Rows from a CSV: first column is the name unless a header row names the columns. */
function rowsFromCsv(text: string, fallback: MemberCategory | null): Row[] {
  const table = parseCsv(text, guessDelimiter(text));
  if (!table.length) return [];
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const nameAt = header.findIndex((cell) => cell === "nama" || cell === "name" || cell === "nama penuh");
  const hasHeader = nameAt >= 0;
  const col = (names: string[], fallbackIndex: number) => {
    const index = header.findIndex((cell) => names.includes(cell));
    return hasHeader ? index : fallbackIndex;
  };
  const nameIndex = hasHeader ? nameAt : 0;
  const categoryIndex = col(["kategori", "category"], 1);
  const phoneIndex = col(["telefon", "no. telefon", "no telefon", "phone", "tel"], 2);
  return table
    .slice(hasHeader ? 1 : 0)
    .map((cells) => ({
      key: newKey(),
      name: cleanName(cells[nameIndex] ?? ""),
      category: categoryIndex >= 0 ? toCategory(cells[categoryIndex], fallback) : fallback,
      phone: phoneIndex >= 0 ? (cells[phoneIndex] ?? "").trim() : "",
      distinct: false,
    }))
    .filter((row) => row.name !== "");
}

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
    setSource("paste");
    setError(null);
    setStep("preview");
  };

  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = rowsFromCsv(content, fallbackCategory);
      if (!parsed.length) {
        setError("Fail CSV tiada nama. Lajur pertama mesti nama ahli.");
        return;
      }
      setRows(parsed);
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
      const duplicate = problems.some((p) => p.kind === "existing" || p.kind === "repeat");
      const blocking = problems.some((p) => p.kind === "empty" || p.kind === "long") || (duplicate && !row.distinct);
      return { problems, duplicate, blocking };
    });
  }, [rows, data.members]);

  const blockingCount = flags.filter((flag) => flag.blocking).length;
  const duplicateCount = flags.filter((flag) => flag.duplicate).length;

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
                    <p className="text-xs text-muted-foreground">Lajur pertama nama. Lajur pilihan: kategori, telefon.</p>
                  </div>
                </div>
                <Button type="button" variant="brand" size="sm" onClick={() => fileInput.current?.click()}>
                  Pilih fail
                </Button>
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
              {duplicateCount > 0 && (
                <span className="inline-flex items-center gap-1 text-st-partial tabular-nums">
                  <TriangleAlert className="size-3.5" aria-hidden /> {duplicateCount} mungkin pendua
                </span>
              )}
            </div>

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
                          className="h-10 min-w-0 flex-1 rounded-xl bg-card"
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
                          onChange={(value) => update(row.key, { category: value === NO_CATEGORY ? null : value })}
                          ariaLabel={`Kategori baris ${index + 1}`}
                        />
                        <Input
                          value={row.phone}
                          inputMode="tel"
                          onChange={(event) => update(row.key, { phone: event.target.value })}
                          placeholder="No. telefon (pilihan)"
                          aria-label={`No. telefon baris ${index + 1}`}
                          className="h-9 rounded-xl bg-card"
                        />
                      </div>
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
      <SelectTrigger aria-label={ariaLabel} className="h-9 w-full rounded-xl bg-card">
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
