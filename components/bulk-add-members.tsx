"use client";

import { useKelab, useSnapshot } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ModalBody, ModalError, ModalField, ModalFooter, ModalHeader, ModalSection, ModalText } from "@/components/modal";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/react";
import { messageFor } from "@/lib/errors";
import { categoryLabels } from "@/lib/labels";
import { ACCEPTED_CATEGORIES, buildMemberTemplate, invalidPhoneMessage, invalidCategoryMessage, MIN_PHONE_DIGITS, parseMemberCsv, phoneDigits, TEMPLATE_FILENAME, type ImportIssue } from "@/lib/member-import";
import { normaliseName } from "@/lib/names";
import type { MemberCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown, Download, FileSpreadsheet, Info, TriangleAlert, UsersRound, X } from "lucide-react";
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
  const t = useT();
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
    if (!pastedNames.length) return setError(t("bulkAdd.errPasteOne"));
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
        const why = issues.filter((issue) => issue.level === "skipped").map((issue) => t("bulkAdd.errRowPrefix", { line: issue.line ?? 0, message: issue.message }));
        setError(`${t("bulkAdd.errNoMembers")}${why.length ? ` ${why.join(" ")}` : ""}`);
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
      setError(t("bulkAdd.errUnreadable"));
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
      if (!key) problems.push({ kind: "empty", text: t("bulkAdd.problemEmpty") });
      else if (row.name.trim().length > MAX_NAME) problems.push({ kind: "long", text: t("bulkAdd.problemLong", { max: MAX_NAME }) });
      if (key && existing.has(key)) problems.push({ kind: "existing", text: t("bulkAdd.problemExisting", { name: existing.get(key) ?? "" }) });
      if (key && firstRow.has(key)) problems.push({ kind: "repeat", text: t("bulkAdd.problemRepeat", { line: firstRow.get(key)! + 1 }) });
      if (key && !firstRow.has(key)) firstRow.set(key, index);
      const warnings: string[] = [];
      if (row.invalidCategory && row.category === null) warnings.push(invalidCategoryMessage(row.invalidCategory));
      const phone = row.phone.trim();
      if (phone && phoneDigits(phone) < MIN_PHONE_DIGITS) warnings.push(invalidPhoneMessage(phone));
      const duplicate = problems.some((p) => p.kind === "existing" || p.kind === "repeat");
      const blocking = problems.some((p) => p.kind === "empty" || p.kind === "long") || (duplicate && !row.distinct);
      return { problems, warnings, duplicate, blocking };
    });
  }, [rows, data.members, t]);

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
    if (!rows.length) return setError(t("bulkAdd.errNothingToSave"));
    if (blockingCount > 0)
      return setError(t("bulkAdd.errBlocking", { count: blockingCount }));
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
      toast.success(t("bulkAdd.saved", { count: ids.length }));
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
      <DialogContent size="lg">
        <ModalHeader icon={UsersRound} title={t("bulkAdd.title")} />
        <ModalBody>
        <ModalText>
          {step === "input" ? t("bulkAdd.introInput") : t("bulkAdd.introPreview", { count: rows.length })}
        </ModalText>
        <p className="flex items-start gap-2 rounded-[10px] bg-primary-tint px-3 py-2.5 text-xs text-foreground/80">
          <Info className="mt-px size-4 shrink-0 text-primary-strong" aria-hidden />
          <span>
            {t("bulkAdd.noCollectionBefore")}<b>{t("bulkAdd.noCollectionBold")}</b>{t("bulkAdd.noCollectionAfter")}
          </span>
        </p>

        {step === "input" ? (
          <>
            <ModalSection label={t("bulkAdd.listSection")}>
            <ModalField
              label={t("bulkAdd.namesLabel")}
              htmlFor="bulk-names"
              helper={
                <span className="tabular-nums">
                  {t("bulkAdd.nameCount", { count: pastedNames.length })}
                  {pastedLines.length - pastedNames.length > 0 && text.trim() && t("bulkAdd.blankIgnoredInline", { count: pastedLines.length - pastedNames.length })}
                </span>
              }
            >
              <Textarea
                id="bulk-names"
                autoFocus
                rows={8}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setError(null);
                }}
                placeholder={t("bulkAdd.namesPlaceholder")}
                className="min-h-40 font-normal"
              />
            </ModalField>
            <ModalField label={t("bulkAdd.defaultCategory")} className="sm:max-w-xs" helper={t("bulkAdd.defaultCategoryHelper")}>
              <CategorySelect value={fallback} onChange={setFallback} ariaLabel={t("bulkAdd.defaultCategory")} />
            </ModalField>
            </ModalSection>
            <ModalSection divided>
            <div className="rounded-[10px] border border-dashed border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary-light text-primary-strong">
                    <FileSpreadsheet className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t("bulkAdd.csvTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("bulkAdd.csvHint")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                    <Download aria-hidden /> {t("bulkAdd.downloadTemplate")}
                  </Button>
                  <Button type="button" variant="brand" size="sm" onClick={() => fileInput.current?.click()}>
                    {t("bulkAdd.pickFile")}
                  </Button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label={t("bulkAdd.pickFileAria")}
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
                <ChevronDown className={cn("size-3.5 transition-transform", guideOpen && "rotate-180")} aria-hidden /> {t("bulkAdd.guideToggle")}
              </button>
              {guideOpen && (
                <ul id="csv-guide" className="mt-1.5 grid list-disc gap-1 pl-5 text-xs text-muted-foreground">
                  <li>
                    {t("bulkAdd.guideHeaderBefore")}<b className="text-foreground">{t("bulkAdd.guideHeaderBold")}</b>{t("bulkAdd.guideHeaderAfter")}
                  </li>
                  <li>
                    <b className="text-foreground">{t("bulkAdd.guideNameBold")}</b>{t("bulkAdd.guideNameAfter")}
                  </li>
                  <li>
                    <b className="text-foreground">{t("bulkAdd.guideCategoryBold")}</b>{t("bulkAdd.guideCategoryAfter", { values: ACCEPTED_CATEGORIES })}
                  </li>
                  <li>
                    <b className="text-foreground">{t("bulkAdd.guidePhoneBold")}</b>{t("bulkAdd.guidePhoneAfter")}
                  </li>
                  <li>{t("bulkAdd.guideDelimiter")}</li>
                </ul>
              )}
            </div>
            </ModalSection>
            {error && <ModalError>{error}</ModalError>}
          </>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{t("bulkAdd.willAdd", { count: rows.length })}</span>
              {source === "csv" && <span>{t("bulkAdd.fromCsv")}</span>}
              {skipped > 0 && <span className="tabular-nums">{t("bulkAdd.blankIgnored", { count: skipped })}</span>}
              {warningCount > 0 && (
                <span className="inline-flex items-center gap-1 text-st-partial tabular-nums">
                  <TriangleAlert className="size-3.5" aria-hidden /> {t("bulkAdd.warningRows", { count: warningCount })}
                </span>
              )}
              {duplicateCount > 0 && (
                <span className="inline-flex items-center gap-1 text-st-partial tabular-nums">
                  <TriangleAlert className="size-3.5" aria-hidden /> {t("bulkAdd.duplicateRows", { count: duplicateCount })}
                </span>
              )}
            </div>

            {notes.length > 0 && (
              <div role="status" data-testid="import-notes" className="rounded-[10px] border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{t("bulkAdd.notesTitle")}</p>
                <ul className="mt-1 grid gap-0.5">
                  {notes.map((note, i) => (
                    <li key={i}>{note.line ? t("bulkAdd.noteLine", { line: note.line, message: note.message }) : note.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {rows.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                {t("bulkAdd.allRemoved")}
              </p>
            ) : (
              <ol className="grid gap-2">
                {rows.map((row, index) => {
                  const flag = flags[index];
                  return (
                    <li
                      key={row.key}
                      className={cn(
                        "grid gap-2 rounded-[10px] border border-border bg-card p-2.5",
                        flag.blocking && "border-st-partial/60 bg-st-partial-bg/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                        <Input
                          value={row.name}
                          onChange={(event) => update(row.key, { name: event.target.value, distinct: false })}
                          aria-label={t("bulkAdd.rowName", { n: index + 1 })}
                          aria-invalid={flag.blocking || undefined}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant="danger-outline"
                          size="icon"
                          onClick={() => remove(row.key)}
                          aria-label={t("bulkAdd.rowRemove", { n: index + 1 })}
                          className="size-10 shrink-0 rounded-[10px]"
                        >
                          <X />
                        </Button>
                      </div>
                      <div className="grid gap-2 pl-8 sm:grid-cols-2">
                        <CategorySelect
                          value={row.category ?? NO_CATEGORY}
                          onChange={(value) => update(row.key, { category: value === NO_CATEGORY ? null : value, invalidCategory: null })}
                          ariaLabel={t("bulkAdd.rowCategory", { n: index + 1 })}
                        />
                        <Input
                          value={row.phone}
                          inputMode="tel"
                          onChange={(event) => update(row.key, { phone: event.target.value })}
                          placeholder={t("bulkAdd.phonePlaceholder")}
                          aria-label={t("bulkAdd.rowPhone", { n: index + 1 })}
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
                              {t("bulkAdd.distinct")}
                            </label>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            {error && <ModalError>{error}</ModalError>}
          </div>
        )}
        </ModalBody>
        {step === "input" ? (
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              {t("bulkAdd.cancel")}
            </Button>
            <Button type="button" onClick={fromPaste} disabled={!pastedNames.length}>
              {pastedNames.length > 0 ? t("bulkAdd.review", { count: pastedNames.length }) : t("bulkAdd.reviewEmpty")}
            </Button>
          </ModalFooter>
        ) : (
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setStep("input")} disabled={busy}>
              {t("bulkAdd.back")}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={busy || rows.length === 0}>
              {busy && <Spinner className="size-4" />}
              {busy ? t("bulkAdd.saving") : t("bulkAdd.save", { count: rows.length })}
            </Button>
          </ModalFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategorySelect({ value, onChange, ariaLabel }: { value: CategoryValue; onChange: (value: CategoryValue) => void; ariaLabel: string }) {
  const t = useT();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as CategoryValue)}>
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CATEGORY}>{t("bulkAdd.noCategory")}</SelectItem>
        {(Object.keys(categoryLabels) as MemberCategory[]).map((key) => (
          <SelectItem key={key} value={key}>
            {categoryLabels[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
