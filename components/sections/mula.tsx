"use client";

import { BrandMark } from "@/components/brand";
import { useKelab, useSnapshot } from "@/components/data-provider";
import { Blossom, Floral } from "@/components/floral";
import { DemoNote, PageShell, ProgressBar, SectionCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { KelabError, messageFor } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import type { Club } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, CircleDashed, ListChecks, ReceiptText, Sheet, UsersRound, WalletCards, School } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

// First-time setup, as a prototype over the demo data: each step uses the real backend,
// adds to what is there and never wipes it. Progress comes from the stored data, not
// from which buttons were clicked.

type Step = 1 | 2 | 3 | 4 | 5;

export function OnboardingPage() {
  const { data } = useSnapshot();
  const [step, setStep] = useState<Step>(1);

  const checks = [
    { label: "Kelab dinamakan", done: data.club.name.trim().length > 0, step: 1 as Step },
    { label: "Sekurang-kurangnya seorang ahli", done: data.members.length > 0, step: 2 as Step },
    { label: "Sekurang-kurangnya satu kutipan", done: data.collections.length > 0, step: 3 as Step },
    { label: "Sekurang-kurangnya satu bayaran direkod", done: data.payments.some((p) => p.state !== "reversed"), step: 4 as Step },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const doneFor = (s: Step) => checks.find((c) => c.step === s)?.done ?? false;
  const next = (s: Step) => setStep(Math.min(5, s + 1) as Step);

  return (
    <PageShell className="max-w-[1080px]">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-7">
        <Floral asset="header-spray" className="-top-4 -right-6 hidden w-[240px] opacity-80 sm:block" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <BrandMark size="lg" />
          <div className="min-w-0 sm:max-w-[70%]">
            <h1 className="font-display text-[24px] leading-[1.2] font-bold tracking-[-.02em] md:text-[28px]">
              Selamat datang ke KelabKit <Blossom />
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Lima langkah ringkas untuk mula mengurus kutipan KGK. Anda boleh melangkau mana-mana langkah dan kembali kemudian.
            </p>
          </div>
        </div>
        <div className="relative mt-4">
          <DemoNote>
            Ini prototaip yang menggunakan data demo. Langkah di sini menambah kepada data sedia ada dan tidak memadamnya. Untuk bermula semula, gunakan{" "}
            <Link href="/tetapan/" className="font-medium text-primary-strong underline-offset-2 hover:underline">
              Set semula data demo
            </Link>{" "}
            di Tetapan.
          </DemoNote>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <ol className="grid gap-3">
          <StepCard n={1} title="Kelab" icon={School} active={step === 1} done={doneFor(1)} onOpen={() => setStep(1)}>
            <ClubStep key={`${data.club.name}|${data.club.session}`} club={data.club} onDone={() => next(1)} />
          </StepCard>
          <StepCard n={2} title="Ahli" icon={UsersRound} active={step === 2} done={doneFor(2)} onOpen={() => setStep(2)}>
            <MembersStep count={data.members.length} onDone={() => next(2)} />
          </StepCard>
          <StepCard n={3} title="Kutipan pertama" icon={WalletCards} active={step === 3} done={doneFor(3)} onOpen={() => setStep(3)}>
            <LinkStep
              text="Cipta kutipan seperti Yuran KGK bulanan atau Jamuan Akhir Tahun, dan pilih ahli yang terlibat. Ahli hanya menyertai kutipan yang anda pilih."
              href="/kutipan/baru/"
              label="Cipta kutipan"
              onNext={() => next(3)}
            />
          </StepCard>
          <StepCard n={4} title="Rekod bayaran" icon={ReceiptText} active={step === 4} done={doneFor(4)} onOpen={() => setStep(4)}>
            <LinkStep
              text="Rekod bayaran tunai atau pindahan bank yang diterima. Bayaran yang belum disemak tidak dikira sebagai diterima."
              href="/bayaran/baru/"
              label="Rekod bayaran"
              onNext={() => next(4)}
            />
          </StepCard>
          <StepCard n={5} title="Lihat status" icon={Sheet} active={step === 5} done={false} onOpen={() => setStep(5)}>
            <LinkStep text="Lihat siapa sudah bayar, sebahagian atau belum dalam satu jadual ahli × kutipan." href="/matriks/" label="Buka Matriks" />
          </StepCard>
        </ol>

        <SectionCard title="Kemajuan" icon={ListChecks} description="Dikira daripada data yang disimpan." className="lg:sticky lg:top-20">
          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[22px] font-bold tabular-nums">
                {doneCount}/{checks.length}
              </span>
              <span className="text-xs text-muted-foreground">{doneCount === checks.length ? "Sedia digunakan" : "Belum lengkap"}</span>
            </div>
            <ProgressBar value={doneCount} max={checks.length} label="Kemajuan persediaan" />
            <ul className="grid gap-1">
              {checks.map((check) => (
                <li key={check.label}>
                  <button
                    type="button"
                    onClick={() => setStep(check.step)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-primary-tint"
                  >
                    {check.done ? (
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-st-paid-bg text-st-paid">
                        <Check className="size-3.5" strokeWidth={3} aria-hidden />
                      </span>
                    ) : (
                      <CircleDashed className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className={cn("min-w-0", check.done && "text-muted-foreground")}>{check.label}</span>
                    <span className="sr-only">{check.done ? "(selesai)" : "(belum)"}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Tema boleh ditukar bila-bila masa di Tetapan; ia tidak wajib.</p>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}

function StepCard({
  n,
  title,
  icon: Icon,
  active,
  done,
  onOpen,
  children,
}: {
  n: number;
  title: string;
  icon: typeof School;
  active: boolean;
  done: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <li className={cn("min-w-0 rounded-2xl border bg-card transition-colors", active ? "border-primary/50 shadow-[0_8px_24px_-18px_var(--primary)]" : "border-border")}>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={active}
        aria-controls={id}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-5"
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
            done ? "bg-st-paid-bg text-st-paid" : active ? "brand-gradient text-white" : "bg-primary-light text-primary-strong",
          )}
        >
          {done ? <Check className="size-4" strokeWidth={3} aria-label="Selesai" /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-muted-foreground">Langkah {n}</span>
          <span className="block font-semibold">{title}</span>
        </span>
        <Icon className="size-[18px] shrink-0 text-primary" aria-hidden />
      </button>
      {active && (
        <div id={id} className="px-4 pb-4 md:px-5 md:pb-5">
          {children}
        </div>
      )}
    </li>
  );
}

function ClubStep({ club, onDone }: { club: Club; onDone: () => void }) {
  const { run } = useKelab();
  const [name, setName] = useState(club.name);
  const [session, setSession] = useState(club.session);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Nama kelab diperlukan.");
    if (name.trim().length > 120) return setError("Nama terlalu panjang (maksimum 120 aksara).");
    if (!session.trim()) return setError("Sesi diperlukan, contohnya 2026.");
    setError(null);
    if (name.trim() === club.name && session.trim() === club.session) return onDone();
    setBusy(true);
    try {
      await run((backend) => backend.updateClub({ name: name.trim(), session: session.trim() }));
      toast.success("Maklumat kelab disimpan.");
      onDone();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3" noValidate>
      <p className="text-[13px] text-muted-foreground">Nama kelab dan sesi dipaparkan pada laporan dan mesej peringatan.</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>Nama kelab</Label>
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: KGK SK Taman Melati" className="h-10 rounded-xl" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-session`}>Sesi</Label>
          <Input id={`${id}-session`} value={session} onChange={(e) => setSession(e.target.value)} placeholder="2026" className="h-10 rounded-xl" />
        </div>
      </div>
      {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
      <div>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner className="size-4" />}
          Simpan & teruskan <ArrowRight />
        </Button>
      </div>
    </form>
  );
}

/** One name per line; blank lines dropped and repeated names collapsed. */
function parseNames(text: string) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function MembersStep({ count, onDone }: { count: number; onDone: () => void }) {
  const { run } = useKelab();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const names = parseNames(text);

  const submit = async () => {
    if (!names.length) return setError("Masukkan sekurang-kurangnya satu nama.");
    if (names.length > 300) return setError("Maksimum 300 nama sekali gus.");
    setBusy(true);
    setError(null);
    try {
      await run((backend) => backend.addMembers(names.map((name) => ({ name, category: null, phone: null, notes: null }))));
      toast.success(`${formatNumber(names.length)} ahli ditambah.`);
      setText("");
      setOpen(false);
      onDone();
    } catch (cause) {
      const detail = cause instanceof KelabError && cause.detail ? ` (${cause.detail})` : "";
      setError(`${messageFor(cause)}${detail} Tiada ahli ditambah; buang atau ubah nama itu dan cuba lagi.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted-foreground">
        Kelab ini ada {formatNumber(count)} ahli sekarang. Tambah nama guru dan kakitangan; telefon dan kategori boleh diisi kemudian di halaman Ahli. Ahli
        baharu tidak dimasukkan ke mana-mana kutipan sehingga anda memilihnya.
      </p>
      {open ? (
        <div className="grid gap-2">
          <Label htmlFor={id}>Nama ahli, satu nama setiap baris</Label>
          <Textarea
            id={id}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            rows={6}
            placeholder={"Cikgu Aina Sofea\nPuan Rosnah Ahmad\nEncik Hafiz Rahman"}
            className="rounded-xl"
            aria-invalid={Boolean(error)}
          />
          <p className="text-xs text-muted-foreground">{names.length > 0 ? `${formatNumber(names.length)} nama akan ditambah.` : "Tampal senarai dari Excel atau WhatsApp."}</p>
          {error && <p className="text-xs font-medium text-st-unpaid">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void submit()} disabled={busy || names.length === 0}>
              {busy && <Spinner className="size-4" />}
              Tambah ahli
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)}>
            <UsersRound /> Tambah nama ahli
          </Button>
          <Button variant="outline" onClick={onDone}>
            Langkau
          </Button>
        </div>
      )}
    </div>
  );
}

function LinkStep({ text, href, label, onNext }: { text: string; href: string; label: string; onNext?: () => void }) {
  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted-foreground">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={href}>
            {label} <ArrowRight />
          </Link>
        </Button>
        {onNext && (
          <Button variant="outline" onClick={onNext}>
            Langkah seterusnya
          </Button>
        )}
      </div>
    </div>
  );
}
