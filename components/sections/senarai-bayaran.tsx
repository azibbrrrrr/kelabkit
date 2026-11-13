"use client";

import { FilterPills, SectionCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { categoryLabels } from "@/lib/labels";
import { useT, type TFunction } from "@/lib/i18n/react";
import { jpegToPdf } from "@/lib/pdf-image";
import { buildXlsxRows } from "@/lib/payment-list-xlsx";
import type { Sheet, SheetOptions, SheetTexts } from "@/lib/payment-list";
import { cn } from "@/lib/utils";
import { ChevronDown, Download, FileImage, FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { canvasBlob, drawSheet, readSheetTheme } from "./senarai-canvas";

// The "Senarai bayaran" report: the sheet on screen, and the same sheet as image, PDF and Excel.

export function senaraiTexts(t: TFunction, collectionName: string, asOfDate: string, options: SheetOptions): SheetTexts {
  return {
    title: (monthLabel) => (monthLabel ? t("reports.senarai.monthTitle", { name: collectionName, month: monthLabel }) : collectionName),
    asOf: t("reports.senarai.asOf", { date: asOfDate }),
    nameHeader: t("reports.senarai.nameHeader"),
    totalHeader: t("reports.senarai.totalHeader"),
    balanceHeader: t("reports.senarai.balanceHeader"),
    partial: t("reports.senarai.partial"),
    exempt: t("reports.senarai.exempt"),
    tick: t("reports.senarai.tick"),
    group: (category) => (category ? categoryLabels[category] : t("reports.senarai.noCategory")).toLocaleUpperCase(),
    legend: {
      paid: options.cell === "date" ? t("reports.senarai.legend.paidDate") : t("reports.senarai.legend.paidTick"),
      blank: t("reports.senarai.legend.blank"),
      partial: t("reports.senarai.legend.partial"),
      exempt: t("reports.senarai.legend.exempt"),
    },
  };
}

export function SenaraiControls({ options, onChange }: { options: SheetOptions; onChange: (next: SheetOptions) => void }) {
  const t = useT();
  const field = (label: string, control: React.ReactNode) => (
    <div className="grid min-w-0 gap-0.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {control}
    </div>
  );
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {field(
        t("reports.senarai.controls.cell"),
        <FilterPills<SheetOptions["cell"]>
          label={t("reports.senarai.controls.cell")}
          value={options.cell}
          onChange={(cell) => onChange({ ...options, cell })}
          options={[
            { value: "date", label: t("reports.senarai.controls.cellDate") },
            { value: "tick", label: t("reports.senarai.controls.cellTick") },
          ]}
        />,
      )}
      {field(
        t("reports.senarai.controls.period"),
        <FilterPills<SheetOptions["span"]>
          label={t("reports.senarai.controls.period")}
          value={options.span}
          onChange={(span) => onChange({ ...options, span })}
          options={[
            { value: "year", label: t("reports.senarai.controls.periodYear") },
            { value: "month", label: t("reports.senarai.controls.periodMonth") },
          ]}
        />,
      )}
      {field(
        t("reports.senarai.controls.amounts"),
        <FilterPills<SheetOptions["amounts"]>
          label={t("reports.senarai.controls.amounts")}
          value={options.amounts}
          onChange={(amounts) => onChange({ ...options, amounts })}
          options={[
            { value: "both", label: t("reports.senarai.controls.amountsBoth") },
            { value: "paid", label: t("reports.senarai.controls.amountsPaid") },
            { value: "balance", label: t("reports.senarai.controls.amountsBalance") },
            { value: "none", label: t("reports.senarai.controls.amountsNone") },
          ]}
        />,
      )}
    </div>
  );
}

const tone = {
  paid: "bg-st-paid-bg font-medium text-st-paid",
  partial: "bg-st-partial-bg font-semibold text-st-partial",
  exempt: "bg-st-exempt-bg font-medium text-st-exempt",
  blank: "",
} as const;

function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The exports of one sheet: image (also shared), PDF and Excel. The PNG is drawn ahead of the tap
 * so the share call can run inside the click. Pass `null` while there is no sheet to export.
 */
export function useSenaraiExport(sheet: Sheet | null, fileStem: string) {
  const t = useT();
  const [png, setPng] = useState<Blob | null>(null);

  // The PNG is drawn ahead of the tap, whenever the sheet changes, so "Kongsi gambar" can call
  // navigator.share inside the click itself: iOS drops the user activation across a long await.
  useEffect(() => {
    let live = true;
    setPng(null);
    if (!sheet) return;
    (async () => {
      await document.fonts?.ready;
      const blob = await canvasBlob(drawSheet(sheet, readSheetTheme()), "image/png");
      if (live) setPng(blob);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [sheet]);

  const failed = () => toast.error(t("reports.senarai.exportFailed"));
  const pngFile = png ? new File([png], `${fileStem}.png`, { type: "image/png" }) : null;

  const share = () => {
    if (!sheet || !pngFile) return;
    if (navigator.canShare?.({ files: [pngFile] })) {
      navigator.share({ files: [pngFile], title: sheet.title }).catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") failed();
      });
      return;
    }
    saveBlob(pngFile.name, pngFile);
    toast.success(t("reports.senarai.imageDownloaded"));
  };

  const downloadImage = () => {
    if (!pngFile) return;
    saveBlob(pngFile.name, pngFile);
    toast.success(t("reports.senarai.imageDownloaded"));
  };

  const downloadPdf = async () => {
    if (!sheet) return;
    try {
      await document.fonts?.ready;
      const canvas = drawSheet(sheet, readSheetTheme());
      const jpeg = new Uint8Array(await (await canvasBlob(canvas, "image/jpeg", 0.92)).arrayBuffer());
      saveBlob(`${fileStem}.pdf`, new Blob([jpegToPdf(jpeg, canvas.width, canvas.height).buffer as ArrayBuffer], { type: "application/pdf" }));
      toast.success(t("reports.senarai.pdfDownloaded"));
    } catch {
      failed();
    }
  };

  const downloadExcel = async () => {
    if (!sheet) return;
    try {
      // Loaded on click only: the writer adds nothing to the Laporan page's first load.
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const { data, ...layout } = buildXlsxRows(sheet, readSheetTheme());
      const blob = await writeXlsxFile(data, {
        ...layout,
        sheet: t("reports.senarai.sheetName"),
        orientation: sheet.month ? undefined : "landscape",
      }).toBlob();
      saveBlob(`${fileStem}.xlsx`, blob);
      toast.success(t("reports.senarai.xlsxDownloaded"));
    } catch {
      failed();
    }
  };

  return {
    ready: Boolean(sheet && sheet.groups.length > 0),
    imageReady: Boolean(pngFile),
    share,
    downloadImage,
    downloadPdf,
    downloadExcel,
  };
}

export type SenaraiExport = ReturnType<typeof useSenaraiExport>;

/** The page header's actions for this report: one primary Share, one Download menu with every format. */
export function SenaraiActions({ exporter, onCsv, csvReady }: { exporter: SenaraiExport; onCsv: () => void; csvReady: boolean }) {
  const t = useT();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={!exporter.ready}>
            <Download /> {t("reports.senarai.actions.download")} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={exporter.downloadImage} disabled={!exporter.imageReady}>
            <FileImage /> {t("reports.senarai.actions.image")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exporter.downloadPdf()}>
            <FileText /> {t("reports.senarai.actions.pdf")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exporter.downloadExcel()}>
            <FileSpreadsheet /> {t("reports.senarai.actions.excel")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCsv} disabled={!csvReady}>
            <FileText /> {t("reports.senarai.actions.csv")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button onClick={exporter.share} disabled={!exporter.ready || !exporter.imageReady}>
        <Share2 /> {exporter.imageReady || !exporter.ready ? t("reports.senarai.actions.share") : t("reports.senarai.preparing")}
      </Button>
    </>
  );
}

export function SenaraiView({ sheet }: { sheet: Sheet }) {
  const t = useT();
  const empty = sheet.groups.length === 0;
  const twoAmounts = sheet.amountColumns.length > 1;
  const colWidth = sheet.month
    ? cn("w-full min-w-[576px]", twoAmounts ? "max-w-[800px]" : "max-w-[720px]")
    : cn("w-full", twoAmounts ? "min-w-[1076px]" : "min-w-[996px]");
  const cellBase = "h-[30px] border border-border px-0.5 text-center whitespace-nowrap tabular-nums";

  return (
    <SectionCard className="print:rounded-none print:border-0 print:shadow-none" contentClassName="print:px-0">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="min-w-0 font-display text-h2 break-words">{sheet.title}</h2>
          <p className="text-small whitespace-nowrap text-muted-foreground tabular-nums">{sheet.asOf}</p>
        </div>

        {empty ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t("reports.senarai.noMembers")}</p>
        ) : (
          <div data-senarai-scroll className="max-w-full overflow-x-auto overscroll-x-contain print:overflow-visible">
            <table aria-label={t("reports.senarai.sheetAria", { name: sheet.title })} className={cn("table-fixed border-collapse text-[12.5px] print:text-[10px]", colWidth)}>
              <thead>
                <tr>
                  <th scope="col" className={cn(cellBase, "w-[270px] border-primary-fill bg-primary-fill px-2.5 text-left font-semibold text-primary-foreground")}>
                    {sheet.nameHeader}
                  </th>
                  {sheet.columns.map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      className={cn(cellBase, "font-semibold", column.future ? "bg-primary-light text-primary-strong" : "border-primary-fill bg-primary-fill text-primary-foreground")}
                    >
                      {column.label}
                    </th>
                  ))}
                  {sheet.amountColumns.map((column) => (
                    <th key={column.kind} scope="col" className={cn(cellBase, "w-20 border-primary-fill bg-primary-fill font-semibold text-primary-foreground")}>
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.groups.map((group) => (
                  <GroupRows key={group.label ?? "all"} group={group} sheet={sheet} cellBase={cellBase} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground print:text-[10px]">
          {sheet.legend.map((item) => (
            <li key={item.kind} className="inline-flex items-center gap-1.5">
              <i aria-hidden className={cn("inline-block size-3.5 rounded-[3px] border border-border", tone[item.kind].split(" ")[0])} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}

function GroupRows({ group, sheet, cellBase }: { group: Sheet["groups"][number]; sheet: Sheet; cellBase: string }) {
  const span = 1 + sheet.columns.length + sheet.amountColumns.length;
  return (
    <>
      {group.label && (
        <tr>
          <td colSpan={span} className="h-[25px] border border-border bg-muted px-2.5 text-left text-[11.5px] font-semibold tracking-wide text-muted-foreground">
            {group.label}
          </td>
        </tr>
      )}
      {group.rows.map((row) => (
        <tr key={row.key}>
          <th scope="row" className={cn(cellBase, "truncate px-2.5 text-left font-medium")} title={row.name}>
            {row.name}
          </th>
          {row.cells.map((cell, i) => (
            <td key={i} className={cn(cellBase, tone[cell.kind])}>
              {cell.text}
            </td>
          ))}
          {row.amounts.map((amount, j) => (
            <td key={sheet.amountColumns[j].kind} className={cn(cellBase, "font-semibold", amount.text === null && "text-muted-foreground")}>
              {amount.text ?? "—"}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
