// Bahasa Melayu: reminders. Source of truth for the matching English file.
// The message template itself (and the group message) stays Bahasa Melayu in every UI language:
// it is text the treasurer sends to members, not interface copy.
export const remindersMs = {
  title: "Peringatan",
  description:
    "Sediakan mesej susulan yang sopan untuk ahli yang masih ada baki. Mesej disalin atau dibuka dalam WhatsApp; tiada apa yang dihantar secara automatik.",
  empty: {
    title: "Tiada kutipan wajib yang aktif",
    description: "Peringatan hanya untuk kutipan sekali bayar atau bulanan yang aktif.",
    action: "Cipta kutipan",
  },
  template: {
    title: "Templat mesej",
    description: "Klik pemegang tempat untuk memasukkannya di kedudukan kursor. Baris yang mengandungi {tarikh} dibuang jika tiada tarikh akhir.",
    reset: "Set semula templat",
    placeholdersLabel: "Pemegang tempat",
    label: "Templat mesej",
    savedNote: "Templat disimpan dalam pelayar ini. Mesej yang telah anda ubah bagi ahli tertentu tidak berubah apabila templat ditukar.",
  },
  placeholderHints: {
    nama: "Nama ahli",
    kutipan: "Nama kutipan (dan bulan)",
    baki: "Baki belum dijelaskan",
    tarikh: "Tarikh akhir bayaran",
    bendahari: "Nama bendahari",
    kelab: "Nama kelab",
  },
  filters: {
    collection: "Kutipan",
    collectionPlaceholder: "Pilih kutipan",
    month: "Bulan",
    allMonths: "Semua bulan setakat ini",
    label: "Tapis ahli",
    unpaid: "Belum bayar",
    partial: "Sebahagian",
    overdue: "Lewat",
    all: "Semua yang ada baki",
  },
  scopeNote: "Hanya ahli aktif yang masih ada baki disenaraikan. Ahli yang telah membayar penuh, dikecualikan, tidak menyertai kutipan, atau bulan yang akan datang tidak termasuk.",
  voluntaryNote: "{names} tidak disenaraikan kerana sumbangan sukarela tidak mewujudkan hutang.",
  allPaid: {
    title: "Semua sudah menjelaskan bayaran",
    description: "Tiada ahli yang masih ada baki untuk {collection}.",
  },
  group: {
    title: "Mesej kumpulan",
    description: "Peringatan umum untuk kumpulan WhatsApp. Tiada nama atau amaun individu, supaya tiada ahli berasa malu.",
    copyAll: "Salin semua",
    show: "Lihat mesej",
    hide: "Sembunyikan mesej",
    copied: "Mesej kumpulan disalin.",
  },
  summary: {
    membersBalance: "{count} ahli · baki",
    reviewHint: "Semak setiap mesej sebelum menghantar.",
  },
  noneInFilter: {
    title: "Tiada ahli dalam tapisan ini",
    description: "Pilih tapisan lain untuk melihat ahli yang masih ada baki.",
  },
  row: {
    dueDate: "Tarikh akhir {date}",
    noDueDate: "Tiada tarikh akhir",
    balance: "Baki",
    pending: "Menunggu semakan {amount}",
    copyMessage: "Salin mesej",
    copiedFor: "Mesej untuk {name} disalin.",
    openWhatsapp: "Buka WhatsApp",
    phoneInvalid: "Nombor telefon tidak sah",
    phoneMissing: "Tiada nombor telefon",
    closeMessage: "Tutup mesej",
    viewEdit: "Lihat & ubah mesej",
    messageFor: "Mesej untuk {name}",
    messageForEdited: "Mesej untuk {name} (diubah)",
    useTemplateAgain: "Guna templat semula",
  },
  copyFailed: "Mesej tidak dapat disalin. Buka mesej, pilih teks dan salin secara manual.",
} as const;
