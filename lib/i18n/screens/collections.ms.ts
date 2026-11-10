// Bahasa Melayu: collections. Source of truth for the matching English file.
export const collectionsMs = {
  amount: {
    anyAmount: "Ikut kemampuan",
    perMonth: "{amount} sebulan",
    perPerson: "{amount} seorang",
  },
  schedule: {
    monthlyWithDay: "{range} · sebelum {day}hb setiap bulan",
    dueOn: "Tarikh akhir {date}",
    noDeadline: "Tiada tarikh akhir",
  },
  header: {
    description: "Semua kutipan kelab: yuran bulanan, bayaran sekali dan sumbangan sukarela. Klik kad untuk menjejak bayaran setiap ahli.",
    add: "Tambah Kutipan",
  },
  empty: {
    title: "Belum ada kutipan",
    description: "Cipta kutipan pertama, contohnya Yuran KGK bulanan atau Jamuan Akhir Tahun. Anda pilih ahli yang terlibat.",
  },
  stats: {
    active: "Kutipan aktif",
    activeHint: "{draft} draf · {completed} selesai",
    received: "Diterima",
    receivedHint: "Wang disahkan, kutipan aktif",
    balance: "Baki semasa",
    overdueHint: "{count} caj lewat",
    noOverdue: "Tiada caj lewat",
    pending: "Menunggu semakan",
    pendingHint: "Belum dikira sebagai diterima",
  },
  filter: {
    searchPlaceholder: "Cari kutipan…",
    label: "Tapis ikut status",
    all: "Semua",
  },
  noMatch: {
    title: "Tiada kutipan sepadan",
    byQuery: "Tiada kutipan bernama \"{query}\" dalam paparan ini.",
    byStatus: "Tiada kutipan berstatus {status}.",
    clear: "Kosongkan penapis",
  },
  card: {
    totalCollected: "Jumlah terkumpul",
    contributors: "daripada {contributors} penyumbang · {invited} ahli dijemput",
    progressLabel: "{name}: diterima berbanding dijangka",
    balanceNow: "Baki semasa",
    upcoming: "akan datang {amount}",
    chipPaid: "Dibayar {count}",
    chipPartial: "Sebahagian {count}",
    chipUnpaid: "Belum bayar {count}",
    chipOverdue: "Lewat {count}",
    chipExempt: "Dikecualikan {count}",
    monthlyNote: "Kiraan ikut caj (ahli × bulan) sehingga bulan ini.",
    participants: "{count} peserta",
    pendingReview: "{amount} menunggu semakan",
    restore: "Pulihkan",
  },
} as const;
