"use client";

import { useSnapshot } from "@/components/data-provider";
import { MemberPicker, PaymentForm, Step, SuccessPanel, type Saved } from "@/components/record-payment/single";
import { PageHeader, PageShell } from "@/components/shared";
import { useT } from "@/lib/i18n/react";
import { TriangleAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// The full-page way to record a payment (phones, and desktop when the panel on /bayaran/ is not
// shown). The form itself lives in components/record-payment/single.tsx, shared with that panel.

export function BayaranBaru() {
  const t = useT();
  const { view } = useSnapshot();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("ahli");
  // The URL is the source of truth for the member, so a refresh or shared link keeps it.
  const member = requested ? view.membersById.get(requested) ?? null : null;
  const [saved, setSaved] = useState<Saved | null>(null);
  const [attempt, setAttempt] = useState(0);

  const choose = (id: string | null) => {
    setSaved(null);
    setAttempt((n) => n + 1);
    router.replace(id ? `${pathname}?ahli=${id}` : pathname, { scroll: false });
  };

  return (
    <PageShell className="pb-28 md:pb-7">
      <PageHeader
        title={t("paymentNew.title")}
        back={{ href: "/bayaran/", label: t("paymentNew.back") }}
        description={t("paymentNew.description")}
      />
      {requested && !member && (
        <p className="flex items-start gap-2 rounded-2xl border border-dashed border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-st-partial" aria-hidden />
          {t("paymentNew.memberNotFound")}
        </p>
      )}
      {saved && member ? (
        <SuccessPanel
          saved={saved}
          member={member}
          onAgain={() => {
            setSaved(null);
            setAttempt((n) => n + 1);
          }}
          onOther={() => choose(null)}
        />
      ) : member ? (
        <PaymentForm key={`${member.id}:${attempt}`} member={member} onChange={() => choose(null)} onSaved={setSaved} />
      ) : (
        <Step n={1} title={t("paymentNew.picker.title")} description={t("paymentNew.picker.description")}>
          <MemberPicker onSelect={choose} />
        </Step>
      )}
    </PageShell>
  );
}

