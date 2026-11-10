// Bahasa Melayu: members. Source of truth for the matching English file.
export const membersMs = {
  title: "Ahli",
  description: "Senarai guru dan kakitangan kelab. Klik nama untuk melihat penyertaan kutipan dan sejarah bayaran.",
  addBulk: "Tambah pukal",
  addOne: "Tambah ahli",
  addFirst: "Tambah ahli pertama",
  empty: {
    title: "Belum ada ahli",
    description: "Tambah guru dan kakitangan satu per satu, atau tampal senarai nama sekali gus.",
  },
  stats: {
    total: "Jumlah ahli",
    inactiveHint: "{count} tidak aktif",
    active: "Ahli aktif",
    activeHint: "Dipaparkan dalam Matriks",
    owing: "Ada baki semasa",
    owingHint: "Jumlah {amount}",
  },
  searchPlaceholder: "Cari nama atau telefon…",
  filter: {
    label: "Tapis ahli",
    all: "Semua",
    active: "Aktif",
    inactive: "Tidak aktif",
    owing: "Ada baki",
  },
  columns: {
    name: "Nama",
    category: "Kategori",
    phone: "Telefon",
    status: "Status",
    collections: "Kutipan",
    due: "Baki semasa",
  },
  overdueCharges: "{count} caj lewat",
  collectionsCount: "{count} kutipan",
  noMatch: {
    title: "Tiada ahli sepadan",
    owing: "Tiada ahli dengan baki semasa. Semua caj yang sudah tiba tempoh telah dijelaskan.",
    other: "Cuba carian atau penapis lain.",
    clear: "Kosongkan carian",
  },
  status: {
    active: "Aktif",
    inactive: "Tidak aktif",
  },
} as const;
