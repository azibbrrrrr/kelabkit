// Error codes raised by the backend (demo now, Neon in Phase 2) and their messages in
// Bahasa Melayu. Every new code needs a message here.

export const errorMessages = {
  AMOUNT_REQUIRED: "Masukkan amaun.",
  AMOUNT_INVALID: "Amaun tidak sah. Contoh: 10 atau 10.50.",
  AMOUNT_NEGATIVE: "Amaun tidak boleh negatif.",
  AMOUNT_DECIMALS: "Amaun hanya boleh ada dua tempat perpuluhan.",
  AMOUNT_TOO_LARGE: "Amaun melebihi had RM100,000.00.",
  AMOUNT_ZERO: "Amaun mesti lebih daripada RM0. Gunakan pengecualian jika ahli tidak perlu membayar.",
  OVERPAYMENT: "Amaun melebihi baki yang perlu dibayar.",
  AMOUNT_BELOW_PAID: "Amaun baharu lebih rendah daripada yang telah dibayar. Batalkan bayaran yang berkaitan dahulu.",
  ICON_INVALID: "Ikon tidak sah. Pilih satu emoji atau satu ikon daripada senarai.",
  NAME_REQUIRED: "Nama diperlukan.",
  NAME_TOO_LONG: "Nama terlalu panjang (maksimum 120 aksara).",
  MEMBER_DUPLICATE: "Ahli dengan nama ini sudah wujud.",
  MEMBER_NOT_FOUND: "Ahli tidak dijumpai.",
  COLLECTION_NOT_FOUND: "Kutipan tidak dijumpai.",
  COLLECTION_DUPLICATE: "Kutipan dengan nama ini sudah wujud.",
  COLLECTION_NO_MEMBERS: "Pilih sekurang-kurangnya seorang ahli sebelum mengaktifkan kutipan.",
  COLLECTION_ARCHIVED: "Kutipan ini telah diarkib.",
  COLLECTION_HAS_PAYMENTS: "Kutipan ini sudah ada bayaran. Perubahan ini memerlukan pengesahan.",
  MONTH_RANGE_INVALID: "Bulan akhir tidak boleh lebih awal daripada bulan mula.",
  MONTH_RANGE_TOO_LONG: "Tempoh bulanan maksimum 36 bulan.",
  DUE_DAY_INVALID: "Hari akhir bayaran mesti antara 1 dan 31.",
  CHARGE_NOT_FOUND: "Caj tidak dijumpai.",
  CHARGE_EXEMPT: "Ahli ini dikecualikan daripada caj ini.",
  PARTICIPANT_EXISTS: "Ahli sudah termasuk dalam kutipan ini.",
  PAYMENT_NOT_FOUND: "Bayaran tidak dijumpai.",
  PAYMENT_NOT_PENDING: "Bayaran ini bukan dalam status menunggu semakan.",
  PAYMENT_ALREADY_REVERSED: "Bayaran ini sudah dibatalkan.",
  PAYMENT_EMPTY: "Pilih sekurang-kurangnya satu caj untuk dibayar.",
  REASON_REQUIRED: "Nyatakan sebab.",
  DATE_INVALID: "Tarikh tidak sah.",
  DATE_IN_FUTURE: "Tarikh bayaran tidak boleh pada masa hadapan.",
  ATTACHMENT_TYPE:
    "Jenis fail tidak disokong. Gunakan gambar (JPG, PNG, WebP, HEIC) atau PDF. Dokumen Office seperti .xlsx atau .docx tidak diterima.",
  ATTACHMENT_EMPTY: "Fail ini kosong.",
  ATTACHMENT_TOO_LARGE: "Fail melebihi had 10 MB.",
  ATTACHMENT_LIMIT: "Satu bayaran boleh ada paling banyak 5 lampiran. Buang satu dahulu.",
  ATTACHMENT_DUPLICATE: "Fail yang sama sudah dilampirkan pada bayaran ini.",
  ATTACHMENT_PAYMENT_REVERSED: "Bayaran ini telah dibatalkan. Lampiran kekal boleh dilihat tetapi tidak boleh ditambah atau dibuang.",
  ATTACHMENT_NOT_FOUND: "Lampiran tidak dijumpai.",
  ATTACHMENT_ALREADY_REMOVED: "Lampiran ini sudah dibuang.",
  ATTACHMENT_FILE_MISSING: "Fail tidak lagi ada dalam pelayar ini (data pelayar mungkin telah dibersihkan).",
  FILE_STORAGE_UNAVAILABLE:
    "Penyimpanan fail tidak tersedia dalam pelayar ini. Cuba tetingkap biasa (bukan mod peribadi) dan benarkan data tapak.",
  NETWORK: "Sambungan terputus. Cuba lagi.",
} as const;

export type ErrorCode = keyof typeof errorMessages;

export class KelabError extends Error {
  constructor(
    public code: ErrorCode,
    public detail?: string,
  ) {
    super(errorMessages[code]);
  }
}

export function messageFor(error: unknown) {
  if (error instanceof KelabError) return error.message;
  if (error instanceof Error && error.message in errorMessages) return errorMessages[error.message as ErrorCode];
  return "Sesuatu tidak kena. Cuba lagi.";
}
