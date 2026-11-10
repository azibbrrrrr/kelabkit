"use client";

// One skeleton per route, shaped like the screen it stands in for. `RouteSkeleton` picks by pathname.

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { Bar, SkCard, SkHeader, SkRegion, SkRows, SkStats, SkTable, SkToolbar } from "./kit";

export function DashboardSkeleton() {
  return (
    <SkRegion>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 xl:max-w-[520px]">
          <div className="flex h-[29px] items-center md:h-[34px]">
            <Bar className="h-6 w-72 max-w-full md:h-7" />
          </div>
          <Bar className="mt-3 h-4 w-full max-w-md" />
          <Bar className="mt-1.5 h-4 w-48 xl:hidden" />
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
          <Bar className="h-9 w-24 rounded-[10px]" />
          <Bar className="h-9 w-28 rounded-[10px]" />
          <Bar className="h-9 w-36 rounded-[10px]" />
          <Bar className="h-9 w-36 rounded-[10px]" />
        </div>
      </div>
      <SkStats count={4} className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,.8fr)]">
        <SkCard action className="min-h-[352px]">
          <SkRows rows={5} rowClassName="h-[52px]" />
        </SkCard>
        <SkCard action className="min-h-[352px]">
          <div className="grid gap-2.5">
            {[0, 1, 2].map((i) => (
              <Bar key={i} className="h-[86px] rounded-xl" />
            ))}
          </div>
        </SkCard>
        <SkCard className="min-h-[352px] lg:col-span-2 xl:col-span-1">
          <Bar className="h-10 w-full rounded-xl" />
          <Bar className="mx-auto mt-4 h-8 w-40" />
          <Bar className="mt-6 h-32 w-full" />
        </SkCard>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <SkCard action>
          <SkRows rows={5} rowClassName="h-[41px]" />
        </SkCard>
        <SkCard action>
          <SkRows rows={4} rowClassName="h-[41px]" />
        </SkCard>
      </div>
    </SkRegion>
  );
}

export function MatrixSkeleton() {
  return (
    <SkRegion className="max-w-none lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 gap-y-3">
        <div className="flex h-[29px] items-center md:h-[34px]">
          <Bar className="h-6 w-56 md:h-7" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Bar className="h-9 w-32 rounded-[10px]" />
          <Bar className="h-9 w-36 rounded-[10px]" />
        </div>
      </div>
      <SkToolbar pills={5} actions={3} />
      {/* Grid on tablets and up: frozen member column, six month columns, frozen balance column. */}
      <Card className="hidden min-w-0 gap-0 overflow-hidden rounded-2xl border-border py-0 md:flex">
        <div className="flex">
          <div className="w-[224px] shrink-0 border-r border-border">
            <div className="flex h-[90px] items-end border-b border-border bg-primary-tint/60 px-4 pb-3">
              <Bar className="h-3 w-20" />
            </div>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex h-[58px] items-center gap-3 border-b border-border/60 px-4">
                <Bar className="size-8 shrink-0 rounded-full" />
                <Bar className="h-4 w-28" />
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex h-[90px] flex-col justify-between border-b border-border bg-primary-tint/60 px-4 py-3">
              <Bar className="h-4 w-48" />
              <div className="flex gap-12">
                {Array.from({ length: 6 }, (_, i) => (
                  <Bar key={i} className="h-3 w-[88px] shrink-0" />
                ))}
              </div>
            </div>
            {Array.from({ length: 8 }, (_, r) => (
              <div key={r} className="flex h-[58px] items-center gap-5 border-b border-border/60 px-3">
                {Array.from({ length: 6 }, (_, c) => (
                  <div key={c} className="grid w-[116px] shrink-0 gap-1.5">
                    <Bar className="h-3.5 w-20" />
                    <Bar className="h-4 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="hidden w-[120px] shrink-0 border-l border-border lg:block">
            <div className="flex h-[90px] items-end justify-center border-b border-border bg-primary-tint/60 pb-3">
              <Bar className="h-3 w-16" />
            </div>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex h-[58px] items-center justify-center border-b border-border/60">
                <Bar className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-[38px] items-center border-t border-border bg-primary-tint/60 px-4">
          <Bar className="h-3 w-56" />
        </div>
      </Card>
      {/* Cards on phones, like MemberCards. */}
      <div className="grid gap-3 md:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="gap-3 rounded-2xl border-border p-4">
            <div className="flex items-center gap-3">
              <Bar className="size-9 rounded-full" />
              <Bar className="h-4 w-40" />
              <Bar className="ml-auto h-4 w-16" />
            </div>
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: 6 }, (_, c) => (
                <Bar key={c} className="h-9 rounded-lg" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </SkRegion>
  );
}

export function KutipanListSkeleton() {
  return (
    <SkRegion>
      <SkHeader lines={2} actions={1} />
      <SkStats count={4} className="grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4" />
      <SkToolbar pills={5} />
      <div className="grid gap-3">
        <Bar className="h-5 w-24" />
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <SkCard title={false} className="h-[252px]">
                <div className="flex items-center gap-3">
                  <Bar className="size-11 shrink-0 rounded-xl" />
                  <div className="grid flex-1 gap-1.5">
                    <Bar className="h-4 w-40" />
                    <Bar className="h-3 w-52" />
                  </div>
                  <Bar className="h-5 w-12 rounded-full" />
                </div>
                <Bar className="mt-5 h-4 w-48" />
                <Bar className="mt-2.5 h-2 w-full rounded-full" />
                <Bar className="mt-3 h-3.5 w-56" />
                <div className="mt-4 flex gap-2">
                  <Bar className="h-6 w-24 rounded-full" />
                  <Bar className="h-6 w-24 rounded-full" />
                  <Bar className="h-6 w-20 rounded-full" />
                </div>
                <Bar className="mt-5 h-3.5 w-full" />
              </SkCard>
            </li>
          ))}
        </ul>
      </div>
    </SkRegion>
  );
}

export function KutipanDetailSkeleton() {
  return (
    <SkRegion>
      <SkHeader back actions={2} />
      <SkStats count={4} className="grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4" />
      <SkToolbar pills={4} actions={1} />
      <SkTable rows={8} columns={5} />
    </SkRegion>
  );
}

export function AhliSkeleton() {
  return (
    <SkRegion>
      <SkHeader actions={2} />
      <SkStats count={3} className="grid-cols-1 sm:grid-cols-3" />
      <SkToolbar pills={4} />
      <SkTable rows={8} columns={6} />
    </SkRegion>
  );
}

export function AhliDetailSkeleton() {
  return (
    <SkRegion>
      <SkHeader back actions={2} />
      <SkStats count={4} className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
        <SkCard>
          <div className="grid gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="grid gap-1.5">
                <Bar className="h-3 w-16" />
                <Bar className="h-4 w-40" />
              </div>
            ))}
          </div>
        </SkCard>
        <div className="grid min-w-0 gap-5">
          <SkCard>
            <div className="grid gap-2.5">
              {Array.from({ length: 3 }, (_, i) => (
                <Bar key={i} className="h-[112px] rounded-xl" />
              ))}
            </div>
          </SkCard>
          <SkCard>
            <SkRows rows={4} rowClassName="h-[52px]" />
          </SkCard>
        </div>
      </div>
    </SkRegion>
  );
}

export function BayaranSkeleton() {
  return (
    <SkRegion>
      <SkHeader lines={2} actions={1} />
      <SkStats count={3} className="grid-cols-1 sm:grid-cols-3" />
      <Bar className="h-10 w-full rounded-xl sm:w-[380px]" />
      <div className="grid gap-2.5">
        <Bar className="h-10 w-full rounded-[10px] sm:max-w-sm" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {Array.from({ length: 4 }, (_, i) => (
            <Bar key={i} className="h-10 rounded-[10px] sm:w-40" />
          ))}
        </div>
      </div>
      <SkTable rows={8} columns={6} />
    </SkRegion>
  );
}

function FormField({ wide }: { wide?: boolean }) {
  return (
    <div className={cn("grid gap-1.5", wide && "sm:col-span-2")}>
      <Bar className="h-3.5 w-24" />
      <Bar className="h-10 w-full rounded-[10px]" />
    </div>
  );
}

export function BayaranBaruSkeleton() {
  return (
    <SkRegion className="pb-28 md:pb-7">
      <SkHeader back wide />
      <SkCard>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Bar className="h-4 w-28" />
            <Bar className="h-3 w-60 max-w-full" />
          </div>
          <Bar className="h-10 w-full rounded-[10px]" />
          <div className="grid gap-1.5 rounded-[10px] border border-border p-1">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-[52px] items-center gap-3 px-3">
                <Bar className="size-8 rounded-full" />
                <div className="grid gap-1.5">
                  <Bar className="h-3.5 w-36" />
                  <Bar className="h-3 w-12" />
                </div>
                <Bar className="ml-auto h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      </SkCard>
    </SkRegion>
  );
}

export function PeringatanSkeleton() {
  return (
    <SkRegion>
      <SkHeader lines={2} />
      <SkCard action>
        <div className="flex gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Bar key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <Bar className="mt-4 h-[226px] w-full rounded-[10px]" />
      </SkCard>
      <div className="flex gap-3">
        <Bar className="h-10 w-72 max-w-[50%] rounded-[10px]" />
        <Bar className="h-10 w-56 max-w-[40%] rounded-[10px]" />
      </div>
      <SkToolbar pills={4} />
      <SkCard action>
        <SkRows rows={3} rowClassName="h-[52px]" />
      </SkCard>
    </SkRegion>
  );
}

export function LaporanSkeleton() {
  return (
    <SkRegion>
      <SkHeader actions={2} />
      <div className="grid gap-3">
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Bar key={i} className="h-10 w-32 rounded-[10px]" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Bar key={i} className="h-10 rounded-[10px]" />
          ))}
        </div>
      </div>
      <SkStats count={4} className="grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4" />
      <SkTable rows={8} columns={5} />
    </SkRegion>
  );
}

export function TetapanSkeleton() {
  return (
    <SkRegion>
      <SkHeader phoneLine={false} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <SkCard>
          <div className="grid gap-4">
            <FormField />
            <FormField />
            <FormField />
            <Bar className="h-10 w-32 rounded-[10px]" />
          </div>
        </SkCard>
        <div className="grid gap-5">
          <SkCard>
            <SkRows rows={3} rowClassName="h-[56px]" />
          </SkCard>
          <SkCard>
            <SkRows rows={3} rowClassName="h-[56px]" />
          </SkCard>
        </div>
      </div>
    </SkRegion>
  );
}

export function FormSkeleton({ narrow = false }: { narrow?: boolean }) {
  return (
    <SkRegion className={narrow ? "max-w-[1080px]" : undefined}>
      <SkHeader back />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <SkCard>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField wide />
            <FormField />
            <FormField />
            <FormField wide />
            <FormField />
            <FormField />
          </div>
        </SkCard>
        <SkCard className="hidden lg:block">
          <SkRows rows={4} rowClassName="h-[44px]" trailing={false} />
        </SkCard>
      </div>
    </SkRegion>
  );
}

export function MulaSkeleton() {
  return (
    <SkRegion className="max-w-[1080px]">
      <SkCard title={false} className="min-h-[206px]">
        <div className="flex items-start gap-4">
          <Bar className="size-12 shrink-0 rounded-2xl" />
          <div className="grid flex-1 gap-2">
            <Bar className="h-8 w-80 max-w-full" />
            <Bar className="h-3.5 w-full max-w-xl" />
            <Bar className="h-3.5 w-64 max-w-full" />
          </div>
        </div>
        <Bar className="mt-5 h-[50px] w-full rounded-xl" />
      </SkCard>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="grid gap-3">
          <SkCard title={false} className="min-h-[232px]">
            <Bar className="h-10 w-40" />
            <Bar className="mt-6 h-10 w-full rounded-[10px]" />
          </SkCard>
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
        <SkCard title={false} className="hidden min-h-[408px] lg:block">
          <SkRows rows={5} rowClassName="h-[58px]" trailing={false} />
        </SkCard>
      </div>
    </SkRegion>
  );
}

/** The skeleton for a pathname, used while the snapshot loads. Unknown paths get the dashboard shape. */
export function RouteSkeleton() {
  const pathname = usePathname();
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (path === "/") return <DashboardSkeleton />;
  if (path === "/matriks/") return <MatrixSkeleton />;
  if (path === "/kutipan/") return <KutipanListSkeleton />;
  if (path === "/kutipan/baru/") return <FormSkeleton />;
  if (path.startsWith("/kutipan/")) return <KutipanDetailSkeleton />;
  if (path === "/ahli/") return <AhliSkeleton />;
  if (path.startsWith("/ahli/")) return <AhliDetailSkeleton />;
  if (path === "/bayaran/") return <BayaranSkeleton />;
  if (path.startsWith("/bayaran/baru/")) return <BayaranBaruSkeleton />;
  if (path === "/peringatan/") return <PeringatanSkeleton />;
  if (path === "/laporan/") return <LaporanSkeleton />;
  if (path === "/tetapan/") return <TetapanSkeleton />;
  if (path === "/mula/") return <MulaSkeleton />;
  return <DashboardSkeleton />;
}
