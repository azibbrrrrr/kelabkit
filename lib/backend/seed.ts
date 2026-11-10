// Demo KGK for Phase 1. Names and the school are invented. Dates are relative to the
// day the demo is first opened, so the session is the current year and overdue,
// current and future months look right whenever it runs. Labelled as demo data in the UI.

import { addMonths, dueDateFor, monthOf, monthsBetween } from "@/lib/money/months";
import type {
  Allocation,
  AuditEntry,
  Charge,
  Collection,
  CollectionPeriod,
  Day,
  Member,
  MemberCategory,
  Participant,
  Payment,
  PaymentMethod,
  Snapshot,
} from "@/lib/types";

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(day: Day, count: number): Day {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

const PEOPLE: [string, MemberCategory, string | null][] = [
  ["Cikgu Aina Sofea", "guru", "012-345 6781"],
  ["Cikgu Farah Hanim", "guru", "013-221 4590"],
  ["Cikgu Siti Aisyah", "guru", "017-889 1203"],
  ["Cikgu Nadia Izzati", "guru", "019-334 7812"],
  ["Cikgu Irdina Zulaikha", "guru", "011-2345 6012"],
  ["Cikgu Nurul Hanan", "guru", "012-778 9054"],
  ["Cikgu Amir Danish", "guru", "014-660 2231"],
  ["Cikgu Faris Hakim", "guru", null],
  ["Cikgu Tan Mei Ling", "guru", "016-552 8801"],
  ["Cikgu Lim Wei Xin", "guru", "012-903 4417"],
  ["Cikgu Kavitha Raman", "guru", "017-245 6670"],
  ["Cikgu Priya Devi", "guru", "019-771 3045"],
  ["Cikgu Hafiz Rahman", "guru", "013-480 1129"],
  ["Cikgu Zulkifli Ahmad", "guru", "012-116 8873"],
  ["Cikgu Wan Nur Izzah", "guru", "011-1087 2234"],
  ["Cikgu Syafiqah Rosli", "guru", "018-224 5561"],
  ["Cikgu Muhammad Haziq", "guru", null],
  ["Cikgu Chong Kah Yan", "guru", "016-339 0128"],
  ["Puan Rosnah Ismail", "kakitangan", "012-667 3390"],
  ["Encik Kamal Arifin", "kakitangan", "013-998 1276"],
  ["Puan Salmah Yusof", "kakitangan", "019-503 2287"],
  ["Encik Ravi Shankar", "kakitangan", "017-660 9912"],
  ["Puan Norhayati Daud", "kakitangan", null],
  ["Encik Azman Hashim", "lain", "012-345 0098"],
];

export function buildSeed(todayDay: Day): Snapshot {
  const random = rng(20260311);
  const year = todayDay.slice(0, 4);
  const thisMonth = monthOf(todayDay);
  const createdAt = `${year}-01-03T01:00:00.000Z`;

  const members: Member[] = PEOPLE.map(([name, category, phone], i) => ({
    id: `m-${String(i + 1).padStart(2, "0")}`,
    name,
    category,
    phone,
    notes: i === 18 ? "Bersara hujung tahun ini." : null,
    active: i !== 23,
    joinedOn: `${year}-01-03`,
    createdAt,
    updatedAt: createdAt,
  }));
  const active = members.filter((member) => member.active);

  const collections: Collection[] = [];
  const periods: CollectionPeriod[] = [];
  const participants: Participant[] = [];
  const charges: Charge[] = [];
  const payments: Payment[] = [];
  const allocations: Allocation[] = [];
  const audit: AuditEntry[] = [];
  let paymentSeq = 0;

  const collection = (c: Omit<Collection, "createdAt" | "updatedAt" | "description" | "notes"> & Partial<Collection>) => {
    const row: Collection = { description: null, notes: null, createdAt, updatedAt: createdAt, ...c };
    collections.push(row);
    audit.push({
      id: `a-${audit.length + 1}`,
      at: createdAt,
      actor: "Cikgu Aina Sofea",
      action: "collection.create",
      summary: `Kutipan "${row.name}" dicipta`,
      entityId: row.id,
      reason: null,
    });
    return row;
  };

  const pay = (
    memberId: string,
    amount: number,
    paidOn: Day,
    targets: { chargeId: string; amount: number }[],
    options: { method?: PaymentMethod; state?: Payment["state"]; collectionId?: string; reference?: string } = {},
  ) => {
    paymentSeq += 1;
    const id = `p-${String(paymentSeq).padStart(3, "0")}`;
    const at = `${paidOn}T03:${String(paymentSeq % 60).padStart(2, "0")}:00.000Z`;
    const state = options.state ?? "confirmed";
    payments.push({
      id,
      idempotencyKey: id,
      memberId,
      collectionId: options.collectionId ?? null,
      amount,
      method: options.method ?? (random() < 0.6 ? "cash" : "transfer"),
      paidOn,
      reference: options.reference ?? null,
      note: null,
      state,
      createdAt: at,
      confirmedAt: state === "confirmed" ? at : null,
      reversedAt: null,
      reversalReason: null,
    });
    targets.forEach((target, i) => allocations.push({ id: `${id}-${i}`, paymentId: id, chargeId: target.chargeId, amount: target.amount }));
    return id;
  };

  // 1. Yuran KGK: RM10 a month, January to December, due on the 10th.
  const yuran = collection({
    id: "c-yuran",
    name: `Yuran KGK ${year}`,
    type: "monthly",
    status: "active",
    defaultAmount: 1000,
    dueDate: null,
    startMonth: `${year}-01`,
    endMonth: `${year}-12`,
    dueDay: 10,
    description: "Yuran bulanan ahli KGK.",
  });
  for (const month of monthsBetween(yuran.startMonth!, yuran.endMonth!)) {
    periods.push({ id: `c-yuran-${month}`, collectionId: yuran.id, month, dueDate: dueDateFor(month, yuran.dueDay) });
  }
  for (const member of active) {
    participants.push({ collectionId: yuran.id, memberId: member.id, amountOverride: null, exempt: false, note: null });
    for (const period of periods.filter((p) => p.collectionId === yuran.id)) {
      charges.push({
        id: `ch-${period.id}-${member.id}`,
        collectionId: yuran.id,
        periodId: period.id,
        memberId: member.id,
        amount: 1000,
        exempt: false,
        exemptReason: null,
        dueDate: period.dueDate,
        note: null,
      });
    }
  }
  // Most members are paid up to last month; a few lag, a few paid ahead.
  active.forEach((member, i) => {
    const lag = i % 7 === 3 ? 3 : i % 5 === 1 ? 1 : 0;
    const ahead = i === 0 ? 1 : 0;
    const last = addMonths(thisMonth, -lag + ahead - (todayDay.slice(8) > "10" ? 0 : 1));
    for (const period of periods.filter((p) => p.collectionId === yuran.id && p.month <= last)) {
      const day = period.month < thisMonth ? `${period.month}-${String(3 + Math.floor(random() * 8)).padStart(2, "0")}` : todayDay;
      const paidOn = day > todayDay ? todayDay : day;
      pay(member.id, 1000, paidOn, [{ chargeId: `ch-${period.id}-${member.id}`, amount: 1000 }]);
    }
    if (i === 8) {
      const period = periods.find((p) => p.collectionId === yuran.id && p.month === addMonths(last, 1));
      if (period && period.month <= thisMonth) pay(member.id, 500, todayDay, [{ chargeId: `ch-${period.id}-${member.id}`, amount: 500 }]);
    }
  });

  // 2. Jamuan Akhir Tahun: RM25, 20 members, Farah pays RM15, Nadia exempt.
  const jamuan = collection({
    id: "c-jamuan",
    name: "Jamuan Akhir Tahun",
    type: "one_off",
    status: "active",
    defaultAmount: 2500,
    dueDate: addDays(todayDay, 24),
    startMonth: null,
    endMonth: null,
    dueDay: null,
    description: "Jamuan penutup sesi bersama keluarga KGK.",
  });
  active.slice(0, 20).forEach((member) => {
    const override = member.id === "m-02" ? 1500 : null;
    const exempt = member.id === "m-04";
    participants.push({ collectionId: jamuan.id, memberId: member.id, amountOverride: override, exempt, note: exempt ? "Cuti bersalin" : null });
    charges.push({
      id: `ch-jamuan-${member.id}`,
      collectionId: jamuan.id,
      periodId: null,
      memberId: member.id,
      amount: override ?? 2500,
      exempt,
      exemptReason: exempt ? "Cuti bersalin" : null,
      dueDate: jamuan.dueDate,
      note: null,
    });
  });
  ["m-01", "m-03", "m-05", "m-06", "m-07", "m-09", "m-10", "m-12", "m-14"].forEach((id, i) =>
    pay(id, 2500, addDays(todayDay, -i - 1), [{ chargeId: `ch-jamuan-${id}`, amount: 2500 }]),
  );
  pay("m-02", 1000, addDays(todayDay, -3), [{ chargeId: "ch-jamuan-m-02", amount: 1000 }], { method: "cash" });
  pay("m-11", 1000, addDays(todayDay, -2), [{ chargeId: "ch-jamuan-m-11", amount: 1000 }], { method: "cash" });
  pay("m-15", 2500, todayDay, [{ chargeId: "ch-jamuan-m-15", amount: 2500 }], {
    method: "transfer",
    state: "pending",
    reference: "DuitNow 8812",
  });

  // 3. Baju KGK: RM35, 15 members, already past due.
  const baju = collection({
    id: "c-baju",
    name: "Baju KGK",
    type: "one_off",
    status: "active",
    defaultAmount: 3500,
    dueDate: addDays(todayDay, -11),
    startMonth: null,
    endMonth: null,
    dueDay: null,
    description: "Baju korporat KGK, tempahan kedua.",
  });
  active.slice(4, 19).forEach((member) => {
    participants.push({ collectionId: baju.id, memberId: member.id, amountOverride: null, exempt: false, note: null });
    charges.push({
      id: `ch-baju-${member.id}`,
      collectionId: baju.id,
      periodId: null,
      memberId: member.id,
      amount: 3500,
      exempt: false,
      exemptReason: null,
      dueDate: baju.dueDate,
      note: null,
    });
  });
  ["m-05", "m-06", "m-08", "m-10", "m-13", "m-16", "m-17"].forEach((id, i) =>
    pay(id, 3500, addDays(todayDay, -20 - i), [{ chargeId: `ch-baju-${id}`, amount: 3500 }]),
  );
  pay("m-07", 2000, addDays(todayDay, -18), [{ chargeId: "ch-baju-m-07", amount: 2000 }]);
  pay("m-12", 1500, addDays(todayDay, -16), [{ chargeId: "ch-baju-m-12", amount: 1500 }]);

  // 4. Hadiah Persaraan: RM20 from everyone except the retiree.
  const hadiah = collection({
    id: "c-hadiah",
    name: "Hadiah Persaraan Puan Rosnah",
    type: "one_off",
    status: "active",
    defaultAmount: 2000,
    dueDate: addDays(todayDay, 9),
    startMonth: null,
    endMonth: null,
    dueDay: null,
  });
  active
    .filter((member) => member.id !== "m-19")
    .forEach((member) => {
      participants.push({ collectionId: hadiah.id, memberId: member.id, amountOverride: null, exempt: false, note: null });
      charges.push({
        id: `ch-hadiah-${member.id}`,
        collectionId: hadiah.id,
        periodId: null,
        memberId: member.id,
        amount: 2000,
        exempt: false,
        exemptReason: null,
        dueDate: hadiah.dueDate,
        note: null,
      });
    });
  ["m-01", "m-02", "m-03", "m-09", "m-20", "m-21"].forEach((id, i) =>
    pay(id, 2000, addDays(todayDay, -i), [{ chargeId: `ch-hadiah-${id}`, amount: 2000 }]),
  );

  // 5. Sumbangan Kebajikan: voluntary, no debt.
  const kebajikan = collection({
    id: "c-kebajikan",
    name: "Sumbangan Kebajikan",
    type: "voluntary",
    status: "active",
    defaultAmount: null,
    dueDate: null,
    startMonth: null,
    endMonth: null,
    dueDay: null,
    description: "Tabung kebajikan untuk ahli yang ditimpa musibah.",
  });
  active.forEach((member) =>
    participants.push({ collectionId: kebajikan.id, memberId: member.id, amountOverride: null, exempt: false, note: null }),
  );
  (
    [
      ["m-01", 5000],
      ["m-07", 2000],
      ["m-11", 1000],
      ["m-14", 5000],
      ["m-19", 10000],
      ["m-22", 1500],
    ] as const
  ).forEach(([id, amount], i) => pay(id, amount, addDays(todayDay, -30 - i * 4), [], { collectionId: kebajikan.id }));

  // 6. Hari Guru: settled earlier in the year.
  const hariGuru = collection({
    id: "c-hariguru",
    name: `Sambutan Hari Guru ${year}`,
    type: "one_off",
    status: "completed",
    defaultAmount: 1500,
    dueDate: `${year}-05-10`,
    startMonth: null,
    endMonth: null,
    dueDay: null,
  });
  active.forEach((member) => {
    participants.push({ collectionId: hariGuru.id, memberId: member.id, amountOverride: null, exempt: false, note: null });
    charges.push({
      id: `ch-hariguru-${member.id}`,
      collectionId: hariGuru.id,
      periodId: null,
      memberId: member.id,
      amount: 1500,
      exempt: false,
      exemptReason: null,
      dueDate: hariGuru.dueDate,
      note: null,
    });
    const paidOn = `${year}-05-0${1 + (Number(member.id.slice(2)) % 8)}`;
    pay(member.id, 1500, paidOn > todayDay ? todayDay : paidOn, [{ chargeId: `ch-hariguru-${member.id}`, amount: 1500 }]);
  });

  // One corrected mistake, so history shows a reversal.
  const wrong = pay("m-13", 2500, addDays(todayDay, -5), [{ chargeId: "ch-jamuan-m-13", amount: 2500 }], { method: "cash" });
  const wrongRow = payments.find((payment) => payment.id === wrong)!;
  wrongRow.state = "reversed";
  wrongRow.reversedAt = `${addDays(todayDay, -4)}T02:00:00.000Z`;
  wrongRow.reversalReason = "Direkod pada ahli yang salah; sepatutnya Cikgu Hafiz bayar Baju KGK.";
  audit.push({
    id: `a-${audit.length + 1}`,
    at: wrongRow.reversedAt,
    actor: "Cikgu Aina Sofea",
    action: "payment.reverse",
    summary: "Bayaran RM 25.00 Cikgu Hafiz Rahman untuk Jamuan Akhir Tahun dibatalkan",
    entityId: wrong,
    reason: wrongRow.reversalReason,
  });

  return {
    club: {
      id: "club-demo",
      name: "KGK SK Taman Melati",
      session: year,
      school: "Sekolah Kebangsaan Taman Melati (demo)",
      treasurerName: "Cikgu Aina Sofea",
      createdAt,
    },
    members,
    collections,
    periods,
    participants,
    charges,
    payments,
    allocations,
    audit,
  };
}
