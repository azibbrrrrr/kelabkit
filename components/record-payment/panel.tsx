"use client";

import { SegmentedChoice } from "@/components/choice";
import { useSnapshot } from "@/components/data-provider";
import { BulkForm } from "@/components/record-payment/bulk";
import { MemberPicker, PaymentForm, Step, SuccessPanel, type Saved } from "@/components/record-payment/single";
import { useT } from "@/lib/i18n/react";
import { useState } from "react";

// The inline "Rekod bayaran" panel on /bayaran/ (wide screens). Satu is the same form as
// /bayaran/baru/ (components/record-payment/single.tsx); Ramai records one charge for many members.
// Both end in the same backend calls through run(), and the payments list behind it reloads.

type Mode = "single" | "bulk";

export function RecordPanel() {
  const t = useT();
  const { view } = useSnapshot();
  const [mode, setMode] = useState<Mode>("single");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [attempt, setAttempt] = useState(0);
  const member = memberId ? (view.membersById.get(memberId) ?? null) : null;

  const choose = (id: string | null) => {
    setSaved(null);
    setAttempt((n) => n + 1);
    setMemberId(id);
  };

  return (
    <aside aria-label={t("paymentsPage.panel.title")} className="grid content-start gap-3">
      <h2 className="text-h2 tracking-[-.01em]">{t("paymentsPage.panel.title")}</h2>
      <SegmentedChoice
        joined
        label={t("paymentsPage.panel.modeLabel")}
        value={mode}
        options={[
          { value: "single", label: t("paymentsPage.panel.single") },
          { value: "bulk", label: t("paymentsPage.panel.bulk") },
        ]}
        onChange={setMode}
      />
      {mode === "bulk" ? (
        <BulkForm />
      ) : saved && member ? (
        <SuccessPanel compact saved={saved} member={member} onAgain={() => choose(member.id)} onOther={() => choose(null)} />
      ) : member ? (
        <PaymentForm compact key={`${member.id}:${attempt}`} member={member} onChange={() => choose(null)} onSaved={setSaved} />
      ) : (
        <Step n={1} title={t("paymentNew.picker.title")} description={t("paymentNew.picker.description")}>
          {/* No autofocus: the panel is on the page when it loads. */}
          <MemberPicker onSelect={choose} autoFocus={false} />
        </Step>
      )}
    </aside>
  );
}
