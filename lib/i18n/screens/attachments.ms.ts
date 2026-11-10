// Bahasa Melayu: attachments. Source of truth for the matching English file.
export const attachmentsMs = {
  status: {
    checking: "Memeriksa…",
    compressing: "Memampatkan gambar…",
    saving: "Menyimpan…",
    done: "Siap",
  },
  drop: {
    label: "Lampirkan bukti: seret fail ke sini, pilih fail atau tampal gambar",
    hint: "Seret fail ke sini atau tampal gambar (Ctrl/⌘ V). Gambar atau PDF, maksimum 10 MB setiap satu.",
    pick: "Pilih fail",
    paste: "Tampal gambar",
    noImage: "Tiada gambar dalam papan klip.",
    clipboardFailed: "Papan klip tidak dapat dibaca. Klik kotak ini dan tekan Ctrl/⌘ V.",
    dismiss: "Tutup mesej untuk {name}",
  },
  field: {
    title: "Bukti bayaran (pilihan)",
    willAttach: "akan dilampirkan semasa simpan",
    removeFromList: "Buang {name} daripada senarai",
  },
  stagedFailed: "Bayaran telah disimpan, tetapi bukti tidak dapat dilampirkan: {error} Lampirkan semula dari Sejarah bayaran.",
  chip: {
    titleOne: "{count} lampiran bukti",
    titleMany: "{count} lampiran bukti",
    pending: "Ada bukti · {count}",
    countOne: "{count} lampiran",
    countMany: "{count} lampiran",
  },
  attach: {
    button: "Lampirkan bukti",
    full: "Sudah {max} lampiran. Buang satu dahulu.",
  },
  list: {
    label: "Lampiran bukti bayaran",
    view: "Lihat {name}",
    viewButton: "Lihat",
    removed: "Dibuang {when}: {reason}",
    remove: "Buang {name}",
    removeTitle: "Buang lampiran",
  },
} as const;
