"use client";

import { ChoiceCard, ChoiceCards, SegmentedChoice } from "@/components/choice";
import { DatePicker } from "@/components/date-picker";
import { MonthPicker } from "@/components/month-picker";
import { usePrefs } from "@/components/prefs-provider";
import { MoneyInput } from "@/components/money-input";
import { EmptyState, ErrorState, PageHeader, PageShell, SectionCard, StatusChip, TableSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cellStatusLabels, overdueLabel, pendingLabel, type CellStatus } from "@/lib/labels";
import { today } from "@/lib/format";
import { themes, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Check, Inbox, Palette, Plus, Search, Type } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// The KelabKit design system on one page, mirroring the Concept 04 reference panel. Every
// swatch reads the live CSS variable, so switching the theme here shows the real tokens.

const tokens: [string, string][] = [
  ["Primary", "--primary"],
  ["Primary Fill", "--primary-fill"],
  ["Primary Light", "--primary-light"],
  ["Primary Tint", "--primary-tint"],
  ["Primary Strong", "--primary-strong"],
  ["Surface", "--card"],
  ["Border", "--border"],
  ["Text", "--foreground"],
  ["Background", "--background"],
  ["Success", "--success"],
  ["Warning", "--warning"],
  ["Error", "--destructive"],
  ["Info", "--info"],
];

const type: [string, string, string, string][] = [
  ["H1", "Tajuk halaman", "28 / Bold", "text-[28px] font-bold"],
  ["H2", "Tajuk bahagian", "20 / Semibold", "text-[20px] font-semibold"],
  ["H3", "Tajuk kad", "15 / Semibold", "text-[15px] font-semibold"],
  ["Body", "Teks biasa", "14 / Regular", "text-sm"],
  ["Small", "Teks sokongan / kapsyen", "12 / Regular", "text-xs text-muted-foreground"],
];

export function DesignSystemPage() {
  const { theme, floral, setPrefs } = usePrefs();
  const statuses: CellStatus[] = ["paid", "partial", "unpaid", "exempt", "na", "future"];
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [method, setMethod] = useState<"cash" | "transfer" | "other">("cash");

  return (
    <PageShell>
      <PageHeader title="Sistem Reka Bentuk — KelabKit UI" description="Token, tipografi dan komponen yang digunakan di setiap skrin. Rujukan untuk pembangunan; bukan sebahagian daripada aliran bendahari." />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Token warna" icon={Palette} description="Semantik, boleh ditukar tema. Warna status kekal dalam semua tema.">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {tokens.map(([label, variable]) => (
              <div key={variable} className="min-w-0">
                <div className="h-12 rounded-xl border border-border" style={{ background: `var(${variable})` }} />
                <p className="mt-1.5 truncate text-xs font-medium">{label}</p>
                <p className="truncate font-mono text-[10.5px] text-muted-foreground">{variable}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Tipografi" icon={Type} description="Poppins, jelas dan profesional">
          <div className="flex gap-5">
            <div className="hidden shrink-0 border-r border-border pr-5 sm:block">
              <p className="text-[54px] leading-none font-bold">Aa</p>
              <p className="mt-2 text-lg font-semibold">Poppins</p>
              <p className="text-xs text-muted-foreground">(Utama)</p>
            </div>
            <dl className="grid flex-1 gap-2.5">
              {type.map(([tag, sample, spec, cls]) => (
                <div key={tag} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-baseline gap-2">
                  <dt className="text-xs font-semibold text-muted-foreground">{tag}</dt>
                  <dd className={cn("truncate", cls)}>{sample}</dd>
                  <dd className="text-[11px] text-muted-foreground">{spec}</dd>
                </div>
              ))}
            </dl>
          </div>
        </SectionCard>

        <SectionCard title="Butang">
          <div className="flex flex-wrap gap-2">
            <Button>Utama</Button>
            <Button variant="secondary">Sekunder</Button>
            <Button variant="brand">Garis</Button>
            <Button variant="outline">Neutral</Button>
            <Button variant="ghost">Hantu</Button>
            <Button variant="danger-outline">Batalkan…</Button>
            <Button>
              <Plus /> Ikon
            </Button>
            <Button disabled>Dinyahdaya</Button>
          </div>
        </SectionCard>

        <SectionCard title="Medan input">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Input (biasa)
              <Input placeholder="Nama ahli" className="h-11 rounded-xl bg-card px-3 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Input (fokus)
              <Input placeholder="Nama ahli" className="h-11 rounded-xl border-ring bg-card px-3 text-sm text-foreground ring-1 ring-ring" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Amaun (RM)
              <MoneyInput placeholder="25.00" />
            </label>
            <div className="grid gap-1 text-xs text-muted-foreground">
              Pilihan
              <Select>
                <SelectTrigger className="h-11 w-full rounded-xl bg-card">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guru">Guru</SelectItem>
                  <SelectItem value="kakitangan">Kakitangan</SelectItem>
                  <SelectItem value="lain">Lain-lain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="relative grid gap-1 text-xs text-muted-foreground sm:col-span-2">
              Carian
              <Search className="pointer-events-none absolute bottom-3.5 left-3 size-4" />
              <Input type="search" placeholder="Cari ahli…" className="h-11 rounded-xl bg-card pr-3 pl-9 text-sm text-foreground" />
            </label>
            <div className="grid gap-1 text-xs text-muted-foreground">
              <span>Tarikh</span>
              <DatePicker value={day} onChange={setDay} max={today()} aria-label="Contoh tarikh" />
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground">
              <span>Bulan</span>
              <MonthPicker value={month} onChange={setMonth} />
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
              <span>Pilihan bersegmen</span>
              <SegmentedChoice label="Contoh kaedah bayaran" value={method} onChange={setMethod} options={[{ value: "cash", label: "Tunai" }, { value: "transfer", label: "Pindahan" }, { value: "other", label: "Lain-lain" }]} />
            </div>
            <p className="text-xs font-medium text-st-unpaid sm:col-span-2">Contoh ralat: Amaun hanya boleh ada dua tempat perpuluhan.</p>
          </div>
        </SectionCard>

        <SectionCard title="Kotak semak & pilihan">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox defaultChecked /> Dipilih
            </label>
            <label className="flex items-center gap-2">
              <Checkbox /> Tidak dipilih
            </label>
            <RadioGroup defaultValue="a" className="flex gap-5">
              <label className="flex items-center gap-2">
                <RadioGroupItem value="a" /> Pilihan A
              </label>
              <label className="flex items-center gap-2">
                <RadioGroupItem value="b" /> Pilihan B
              </label>
            </RadioGroup>
            <label className="flex items-center gap-2">
              <Switch checked={floral} onCheckedChange={(value) => setPrefs({ floral: value })} /> Hiasan bunga
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Cip status" description="Setiap status = warna + ikon + perkataan">
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <StatusChip key={status} label={cellStatusLabels[status][0]} tone={cellStatusLabels[status][1]} />
            ))}
            <StatusChip label={overdueLabel[0]} tone={overdueLabel[1]} />
            <StatusChip label={pendingLabel[0]} tone={pendingLabel[1]} />
          </div>
        </SectionCard>

        <SectionCard title="Keadaan jadual">
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
              <Checkbox /> Baris biasa
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-primary-tint/60 px-3 py-2.5">
              <Checkbox /> Baris hover
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary-tint px-3 py-2.5">
              <Checkbox defaultChecked /> Baris dipilih
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-muted-foreground opacity-60">
              <Checkbox disabled /> Baris dinyahdaya
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Variasi tema" description="Warna aksen boleh ditukar; reka bentuk dan kebolehcapaian kekal">
          <ChoiceCards label="Variasi tema" value={theme} onChange={(id) => setPrefs({ theme: id as ThemeId })} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {themes.map((option) => (
              <ChoiceCard key={option.id} value={option.id} checked={theme === option.id} className="min-h-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-foreground">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: option.fill }}>
                  {theme === option.id && <Check className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{option.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{option.mood}</span>
                </span>
              </ChoiceCard>
            ))}
          </ChoiceCards>
        </SectionCard>

        <SectionCard title="Keadaan kosong, memuat & ralat" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <EmptyState icon={Inbox} title="Belum ada bayaran" description="Rekod bayaran pertama untuk melihatnya di sini." className="py-6" />
            <div className="rounded-2xl border border-border p-4">
              <TableSkeleton rows={4} />
            </div>
            <div className="grid min-w-0 grid-cols-1 content-start gap-3">
              <ErrorState title="Bayaran tidak disimpan" description="Sambungan terputus. Cuba lagi." action={<Button size="sm" variant="brand">Cuba lagi</Button>} />
              <Button variant="outline" onClick={() => toast.success("Contoh notifikasi berjaya (paparan sahaja).")}>
                Tunjuk contoh notifikasi
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
