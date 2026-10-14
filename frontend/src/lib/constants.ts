import type { FieldKey, RoleKey, TaxLine } from './types';

export const ROLE_LABEL: Record<RoleKey, string> = {
  pic:     'PIC Klien',
  support: 'Intake Support',
  finance: 'Finance Reviewer',
  lead:    'Service Lead',
  admin:   'System Admin',
};

export const FIELDS: { k: FieldKey; label: string; type: 'text' | 'date' | 'num' }[] = [
  { k: 'no',     label: 'Nomor invoice',   type: 'text' },
  { k: 'tgl',    label: 'Tanggal invoice', type: 'date' },
  { k: 'vendor', label: 'Nama vendor',     type: 'text' },
  { k: 'npwp',   label: 'NPWP vendor',     type: 'text' },
  { k: 'dpp',    label: 'DPP',             type: 'num'  },
  { k: 'ppn',    label: 'PPN 11%',         type: 'num'  },
  { k: 'total',  label: 'Total tagihan',   type: 'num'  },
  { k: 'rek',    label: 'Rekening tujuan', type: 'text' },
];

export const JENIS       = ['Pembayaran vendor', 'Reimburse', 'Pajak', 'Payroll'];
export const SALURAN     = ['Email', 'WhatsApp', 'Portal', 'Kurir'];
export const JENIS_PAJAK = ['PPh 21', 'PPh 23', 'PPh 4 ayat 2', 'PPN', 'PPh Final', 'Tidak ada'];
export const STATUSES    = ['Diproses', 'Dalam Review', 'Dikembalikan', 'Disetujui', 'Ditolak'];
export const SELF_ROLES: RoleKey[] = ['pic', 'support', 'finance', 'lead'];

/** Tax presets shown in the tax-setup screen */
export const TAX_PRESETS: (TaxLine & { hint: string })[] = [
  { code: 'PPN',    label: 'PPN',                  rate: 11,   kind: 'add',      hint: 'Ditambahkan ke DPP' },
  { code: 'PPH21',  label: 'PPh 21',               rate: 2.5,  kind: 'withhold', hint: 'Honor atau jasa orang pribadi (tarif contoh, sesuaikan)' },
  { code: 'PPH22',  label: 'PPh 22',               rate: 1.5,  kind: 'withhold', hint: 'Pembelian barang oleh pihak tertentu' },
  { code: 'PPH23',  label: 'PPh 23',               rate: 2,    kind: 'withhold', hint: 'Jasa teknik, manajemen, konsultan, dan sejenisnya' },
  { code: 'PPH4_2', label: 'PPh 4 ayat 2 (final)', rate: 10,   kind: 'withhold', hint: 'Misalnya sewa tanah atau bangunan' },
  { code: 'PPH26',  label: 'PPh 26',               rate: 20,   kind: 'withhold', hint: 'Penghasilan wajib pajak luar negeri' },
];

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

export const ROLE_UI: Record<RoleKey, RoleUi> = {
  pic: {
    h: 'Dokumen Anda, dari unggah sampai voucher',
    p: 'Unggah invoice dari klien mana pun, atur pajak, perbaiki dokumen yang dikembalikan, dan unduh voucher yang sudah disetujui.',
    scope: 'Anda tidak terikat pada satu klien. Anda melihat dokumen dari order yang masuk lewat Anda, klien apa pun itu.',
    tabs: [
      { href: '/pic',          label: 'Antrean',         icon: 'queue'   },
      { href: '/pic/upload',   label: 'Unggah dan pajak',icon: 'upload'  },
      { href: '/pic/voucher',  label: 'Voucher',         icon: 'voucher' },
      { href: '/pic/audit',    label: 'Riwayat audit',   icon: 'audit'   },
    ],
  },
  support: {
    h: 'Unggah untuk klien mana pun',
    p: 'Unggah dokumen dari klien mana pun atas order PIC Klien, atur pajak, dan perbaiki dokumen yang dikembalikan Finance.',
    scope: 'Anda melihat dokumen yang Anda unggah dan dokumen yang dikembalikan untuk diperbaiki.',
    tabs: [
      { href: '/support',          label: 'Antrean',          icon: 'queue'   },
      { href: '/support/upload',   label: 'Unggah dan pajak', icon: 'upload'  },
      { href: '/support/voucher',  label: 'Voucher',          icon: 'voucher' },
      { href: '/support/clients',  label: 'Klien',            icon: 'users'   },
      { href: '/support/audit',    label: 'Riwayat audit',    icon: 'audit'   },
    ],
  },
  finance: {
    h: 'Tugas review Anda',
    p: 'Periksa, koreksi, dan setujui hasil ekstraksi. Dokumen bermasalah bisa dikembalikan ke Intake Support untuk diperbaiki.',
    scope: 'Anda hanya melihat tugas yang ditugaskan kepada Anda. Dokumen yang Anda unggah sendiri tidak bisa Anda tinjau.',
    tabs: [
      { href: '/finance',         label: 'Tugas review',   icon: 'queue',   match: ['/finance/review'] },
      { href: '/finance/voucher', label: 'Voucher terbit', icon: 'voucher' },
      { href: '/finance/audit',   label: 'Riwayat audit',  icon: 'audit'   },
    ],
  },
  lead: {
    h: 'Beban kerja tim review',
    p: 'Pantau antrean dan alihkan tugas ke reviewer lain.',
    scope: 'Layar ini tidak menampilkan isi dokumen atau nilai transaksi.',
    tabs: [
      { href: '/lead',       label: 'Beban kerja',         icon: 'queue' },
      { href: '/lead/audit', label: 'Riwayat beban kerja', icon: 'audit' },
    ],
  },
  admin: {
    h: 'Akun pegawai, peran, dan klien',
    p: 'Setujui pendaftaran pegawai, buat akun, atur peran, dan kelola daftar klien.',
    scope: 'Layar ini tidak memuat dokumen atau transaksi.',
    tabs: [
      { href: '/admin',         label: 'Pendaftaran & akses', icon: 'queue'   },
      { href: '/admin/users',   label: 'Akun pegawai',        icon: 'users'   },
      { href: '/admin/clients', label: 'Klien',               icon: 'users'   },
      { href: '/admin/audit',   label: 'Riwayat audit',       icon: 'audit'   },
    ],
  },
};
