import type { FieldKey, RoleKey } from './types';

export const ROLE_LABEL: Record<RoleKey, string> = {
  support: 'Intake Support',
  finance: 'Finance Reviewer',
  lead: 'Service Lead',
  admin: 'System Admin',
};

export const FIELDS: { k: FieldKey; label: string; type: 'text' | 'date' | 'num' }[] = [
  { k: 'no', label: 'Nomor invoice', type: 'text' },
  { k: 'tgl', label: 'Tanggal invoice', type: 'date' },
  { k: 'vendor', label: 'Nama vendor', type: 'text' },
  { k: 'npwp', label: 'NPWP vendor', type: 'text' },
  { k: 'dpp', label: 'DPP', type: 'num' },
  { k: 'ppn', label: 'PPN 11%', type: 'num' },
  { k: 'total', label: 'Total tagihan', type: 'num' },
  { k: 'rek', label: 'Rekening tujuan', type: 'text' },
];

export const KLIEN_OWNER: Record<string, string> = {
  'PT Maju Jaya': 'dewi',
  'CV Sinar Abadi': 'dewi',
  'Koperasi Sejahtera': 'dewi',
  'UD Berkah Tani': 'dewi',
  'PT Karya Nusa': 'eko',
};

export const JENIS = ['Pembayaran vendor', 'Reimburse', 'Pajak', 'Payroll'];
export const SALURAN = ['Email', 'WhatsApp', 'Portal', 'Kurir'];
export const JENIS_PAJAK = ['PPh 21', 'PPh 23', 'PPh 4 ayat 2', 'PPN', 'PPh Final', 'Tidak ada'];
export const STATUSES = ['Diproses', 'Dalam Review', 'Perlu Tindakan', 'Disetujui', 'Ditolak'];

export interface TabDef {
  href: string;
  label: string;
  icon: string;
  match?: string[];
}
export interface RoleUi {
  h: string;
  p: string;
  scope: string;
  tabs: TabDef[];
}

/** Satu modul antarmuka per peran: judul, batasan, dan menu miliknya sendiri. */
export const ROLE_UI: Record<RoleKey, RoleUi> = {
  support: {
    h: 'Kelola dokumen klien',
    p: 'Unggah invoice, perbaiki kendala, dan kelola dokumen untuk semua klien yang Anda tangani.',
    scope:
      'Anda hanya melihat dokumen klien yang didelegasikan kepada Anda. Akses terbatas sesuai delegasi aktif.',
    tabs: [
      { href: '/support', label: 'Antrean saya', icon: 'queue' },
      { href: '/support/upload', label: 'Unggah dokumen', icon: 'upload' },
      { href: '/support/clients', label: 'Data Klien', icon: 'users' },
      { href: '/support/voucher', label: 'Voucher', icon: 'voucher' },
      { href: '/support/audit', label: 'Riwayat audit', icon: 'audit' },
    ],
  },
  finance: {
    h: 'Tugas review Anda',
    p: 'Periksa, koreksi, dan setujui hasil ekstraksi untuk dokumen yang ditugaskan kepada Anda.',
    scope:
      'Anda hanya melihat tugas yang ditugaskan kepada Anda. Dokumen yang Anda unggah sendiri tidak bisa Anda tinjau.',
    tabs: [
      { href: '/finance', label: 'Tugas review', icon: 'queue', match: ['/finance/review'] },
      { href: '/finance/voucher', label: 'Pratinjau voucher', icon: 'voucher' },
      { href: '/finance/audit', label: 'Riwayat audit', icon: 'audit' },
    ],
  },
  lead: {
    h: 'Beban kerja tim review',
    p: 'Pantau antrean dan alihkan tugas ke reviewer lain.',
    scope:
      'Layar ini tidak menampilkan isi dokumen atau nilai transaksi. Anda tidak bisa mengotorisasi pembayaran klien.',
    tabs: [
      { href: '/lead', label: 'Beban kerja', icon: 'queue' },
      { href: '/lead/audit', label: 'Riwayat beban kerja', icon: 'audit' },
    ],
  },
  admin: {
    h: 'Akun, peran, dan delegasi',
    p: 'Kelola akses pengguna dan pengaturan data klien.',
    scope: 'Layar ini tidak memuat dokumen atau transaksi. Anda tidak bisa menyetujui transaksi.',
    tabs: [
      { href: '/admin', label: 'Permintaan akses', icon: 'queue' },
      { href: '/admin/users', label: 'Akun dan delegasi', icon: 'users' },
      { href: '/admin/clients', label: 'Data Klien', icon: 'users' },
      { href: '/admin/audit', label: 'Riwayat audit', icon: 'audit' },
    ],
  },
};
