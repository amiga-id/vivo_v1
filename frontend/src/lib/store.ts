import { addDays, stampAt, todayISO } from './format';
import type {
  AccessRequest, AuditEvent, Client, Conf, Doc, DocItem, Fields,
  Status, TaxLine, User,
} from './types';

export interface Store {
  users: User[];
  clients: Client[];
  docs: Doc[];
  files: Map<string, { name: string; bytes: ArrayBuffer }>;
  klienCode: Record<string, string>;
  klienCounters: Record<string, number>;
  requests: AccessRequest[];
  events: AuditEvent[];
  seq: number;
  reqSeq: number;
  creds: { id: string; email: string; pw: string }[];
  attempts: Map<string, { n: number; until: number }>;
}

const baseConf: Conf = {
  no: 0.98, tgl: 0.97, vendor: 0.95, npwp: 0.93,
  dpp: 0.96, ppn: 0.94, total: 0.97, rek: 0.9,
};

function mkItems(dpp: number, tgl: string): DocItem[] {
  const a = Math.round(dpp * 0.7);
  return [
    { tgl, ket: 'Jasa layanan periode berjalan', jumlah: '1 paket', harga: a },
    { tgl, ket: 'Biaya tambahan', jumlah: '1 paket', harga: dpp - a },
  ];
}

function mk(
  id: string, no: string, nomorUrut: number,
  vendor: string, klien: string, namaPT: string, namaPIC: string,
  jenis: string, jenisPajak: string, saluran: string,
  tglOff: number, dlOff: number, status: Status,
  owner: string, uploader: string, reviewer: string,
  rest: Omit<Fields, 'no' | 'tgl' | 'vendor'>,
  conf: Conf,
  tax: TaxLine[] | null = null,
  approvers: 1 | 2 = 1,
  voucherNo: string | null = null,
  srcOverride?: Partial<Fields>,
): Doc {
  const t = todayISO();
  const tgl = addDays(t, tglOff);
  const f: Fields = { no, tgl, vendor, ...rest };
  return {
    id, no, nomorUrut, klien, namaPT, namaPIC, jenis, jenisPajak, saluran, tgl,
    deadline: addDays(t, dlOff), status, owner, uploader, reviewer,
    issue: '', note: '',
    f, conf, src: { ...f, ...srcOverride },
    hasFile: false,
    items: mkItems(f.dpp, tgl),
    tax, approvers, voucherNo,
  };
}

const PPN: TaxLine = { code: 'PPN', label: 'PPN', rate: 11, kind: 'add' };
const PPH23: TaxLine = { code: 'PPH23', label: 'PPh 23', rate: 2, kind: 'withhold' };

function seed(): Store {
  const clients: Client[] = [
    { id: 'PT-001', namaPT: 'PT Maju Jaya',       namaPIC: 'Budi Santoso',  email: 'budi@majujaya.com',    phone: '021-1234567', address: 'Jakarta Selatan', nextSequence: 8  },
    { id: 'CV-001', namaPT: 'CV Sinar Abadi',      namaPIC: 'Siti Aminah',   email: 'siti@sinarabadi.com',  phone: '021-2345678', address: 'Tangerang',       nextSequence: 4  },
    { id: 'KOP-001',namaPT: 'Koperasi Sejahtera',  namaPIC: 'Ahmad Yani',    email: 'ahmad@sejahtera.com',  phone: '021-3456789', address: 'Bekasi',          nextSequence: 13 },
    { id: 'UD-001', namaPT: 'UD Berkah Tani',      namaPIC: 'Dewi Kusuma',   email: 'dewi@berkahtani.com',  phone: '021-4567890', address: 'Bogor',           nextSequence: 1  },
    { id: 'PT-002', namaPT: 'PT Karya Nusa',       namaPIC: 'Rudi Hartono',  email: 'rudi@karyanusa.com',   phone: '021-5678901', address: 'Jakarta Pusat',   nextSequence: 5  },
  ];

  // D-1042: Dikembalikan (returned to support for fixing)
  const d1042 = mk(
    'D-1042', 'INV-0098', 1,
    'CV Sinar Abadi', 'CV Sinar Abadi', 'CV Sinar Abadi', 'Siti Aminah',
    'Reimburse', 'Tidak ada', 'WhatsApp',
    -2, 0, 'Dikembalikan',
    'dewi', 'andi', 'rina',
    { npwp: '02.345.678.9-012.000', dpp: 4200000, ppn: 462000, total: 4862000, rek: 'Mandiri 1370012345' },
    { ...baseConf, total: 0.71 },
    null, 1, null,
    { total: 4662000 },
  );
  d1042.issue = 'Total tidak sama dengan DPP + PPN';

  // D-1039: Disetujui with voucher
  const d1039 = mk(
    'D-1039', 'INV-5520', 12,
    'Koperasi Sejahtera', 'Koperasi Sejahtera', 'Koperasi Sejahtera', 'Ahmad Yani',
    'Pembayaran vendor', 'PPN', 'Email',
    -5, -2, 'Disetujui',
    'dewi', 'dewi', 'rina',
    { npwp: '04.567.890.1-234.000', dpp: 6000000, ppn: 660000, total: 6660000, rek: 'BRI 0345678901' },
    baseConf,
    [PPN], 2, 'VCH-KS-0012',
  );

  const docs: Doc[] = [
    mk(
      'D-1041', 'INV-2026-0141', 7,
      'PT Maju Jaya Logistik', 'PT Maju Jaya', 'PT Maju Jaya', 'Budi Santoso',
      'Pembayaran vendor', 'PPN', 'Email',
      -1, 2, 'Dalam Review',
      'dewi', 'dewi', 'rina',
      { npwp: '01.234.567.8-091.000', dpp: 12500000, ppn: 1375000, total: 13875000, rek: 'BCA 0123456789' },
      { ...baseConf, rek: 0.82 },
      [PPN, PPH23], 1,
    ),
    d1042,
    mk(
      'D-1043', 'INV-77/XI', 4,
      'PT Karya Nusa Prima', 'PT Karya Nusa', 'PT Karya Nusa', 'Rudi Hartono',
      'Pembayaran vendor', 'PPh 23', 'Portal',
      -1, 3, 'Dalam Review',
      'eko', 'rina', 'rina',
      { npwp: '03.456.789.0-123.000', dpp: 9000000, ppn: 990000, total: 9990000, rek: 'BNI 0456789012' },
      baseConf,
      [PPN, PPH23], 2,
    ),
    d1039,
    mk(
      'D-1044', 'INV-0311', 0,
      'UD Berkah Tani', 'UD Berkah Tani', 'UD Berkah Tani', 'Dewi Kusuma',
      'Pembayaran vendor', 'PPh 4 ayat 2', 'Kurir',
      0, 4, 'Diproses',
      'eko', 'andi', 'hana',
      { npwp: '05.678.901.2-345.000', dpp: 3000000, ppn: 330000, total: 3330000, rek: 'BCA 0987654321' },
      baseConf,
    ),
    mk(
      'D-1045', 'INV-2210', 4,
      'PT Maju Jaya Logistik', 'PT Maju Jaya', 'PT Maju Jaya', 'Budi Santoso',
      'Pajak', 'PPh 21', 'Email',
      -1, 1, 'Dalam Review',
      'eko', 'eko', 'hana',
      { npwp: '03.456.789.0-123.000', dpp: 2000000, ppn: 220000, total: 2220000, rek: 'BNI 0456789012' },
      baseConf,
    ),
  ];

  const events: AuditEvent[] = [
    { k: 'doc',      d: 'D-1041', t: stampAt(1, '09:12'), a: 'Dewi Lestari (PIC Klien)',        w: 'Dokumen diunggah',                         x: 'Metadata diisi: Pembayaran vendor.' },
    { k: 'doc',      d: 'D-1041', t: stampAt(1, '09:13'), a: 'Robot Admin',                     w: 'Ekstraksi selesai',                         x: '8 field terbaca. Satu field berkeyakinan rendah (rekening tujuan).', bot: true },
    { k: 'doc',      d: 'D-1042', t: stampAt(2, '15:40'), a: 'Andi Saputra (Intake Support)',   w: 'Dokumen diunggah atas order PIC Dewi',      x: 'Dikirim lewat WhatsApp.' },
    { k: 'doc',      d: 'D-1042', t: stampAt(2, '15:41'), a: 'Robot Admin',                     w: 'Aturan bisnis ditandai',                    x: 'Total tidak sama dengan DPP + PPN.', bot: true },
    { k: 'doc',      d: 'D-1042', t: stampAt(2, '15:42'), a: 'Robot Admin',                     w: 'Dokumen dikembalikan ke Intake Support',   x: 'Menunggu perbaikan sebelum masuk review Finance.', bot: true },
    { k: 'doc',      d: 'D-1043', t: stampAt(1, '11:05'), a: 'Rina Wijaya (Finance Reviewer)',  w: 'Dokumen diunggah',                         x: 'Diunggah untuk PT Karya Nusa.' },
    { k: 'doc',      d: 'D-1039', t: stampAt(5, '10:20'), a: 'Rina Wijaya (Finance Reviewer)',  w: 'Hasil ekstraksi disetujui',                x: 'Voucher VCH-KS-0012 diterbitkan.' },
    { k: 'doc',      d: 'D-1039', t: stampAt(5, '13:02'), a: 'Dewi Lestari (PIC Klien)',        w: 'Voucher diunduh',                          x: 'Voucher dikirim ke Client Approver di luar AMIGA.' },
    { k: 'workload', d: 'D-1041', t: stampAt(1, '09:14'), a: 'Sistem',                          w: 'Tugas ditugaskan ke Rina Wijaya',          x: 'Tenggat 2 hari lagi.', bot: true },
    { k: 'workload', d: 'D-1043', t: stampAt(1, '11:06'), a: 'Sistem',                          w: 'Konflik penugasan terdeteksi',             x: 'Pengunggah dan reviewer adalah orang yang sama.', bot: true },
    { k: 'admin',    d: '',        t: stampAt(12, '10:00'),a: 'Sari Anggraini (System Admin)',   w: 'Klien didaftarkan',                        x: 'PT Karya Nusa ditambahkan.' },
  ];

  const DEMO_PW = 'amiga2026';
  const users: User[] = [
    { id: 'dewi',  name: 'Dewi Lestari',    role: 'pic',     about: 'PIC untuk PT Maju Jaya, CV Sinar Abadi, Koperasi Sejahtera, dan UD Berkah Tani.', email: 'dewi@amiga.demo',  status: 'Aktif' },
    { id: 'eko',   name: 'Eko Prasetyo',    role: 'pic',     about: 'PIC untuk PT Karya Nusa.',                                                         email: 'eko@amiga.demo',   status: 'Aktif' },
    { id: 'andi',  name: 'Andi Saputra',    role: 'support', about: 'Mengunggah dan menindaklanjuti dokumen.',                                           email: 'andi@amiga.demo',  status: 'Aktif' },
    { id: 'rina',  name: 'Rina Wijaya',     role: 'finance', about: 'Memeriksa dan menyetujui dokumen yang ditugaskan kepadanya.',                       email: 'rina@amiga.demo',  status: 'Aktif' },
    { id: 'hana',  name: 'Hana Putri',      role: 'finance', about: 'Memeriksa dan menyetujui dokumen yang ditugaskan kepadanya.',                       email: 'hana@amiga.demo',  status: 'Aktif' },
    { id: 'bayu',  name: 'Bayu Kurniawan',  role: 'lead',    about: 'Memantau beban kerja tim dan mengalihkan tugas.',                                   email: 'bayu@amiga.demo',  status: 'Aktif' },
    { id: 'sari',  name: 'Sari Anggraini',  role: 'admin',   about: 'Mengelola akun, hak akses, dan delegasi.',                                          email: 'sari@amiga.demo',  status: 'Aktif' },
    { id: 'maya',  name: 'Maya Sartika',    role: 'support', about: 'Pendaftar baru, menunggu persetujuan.',                                             email: 'maya@amiga.demo',  status: 'Menunggu' },
  ];

  const creds = users.map(u => ({ id: u.id, email: u.email, pw: DEMO_PW }));

  return {
    users,
    clients,
    docs,
    files: new Map(),
    klienCode: {
      'PT Maju Jaya':       'MJ',
      'CV Sinar Abadi':     'SA',
      'Koperasi Sejahtera': 'KS',
      'UD Berkah Tani':     'UB',
      'PT Karya Nusa':      'KN',
    },
    klienCounters: {
      'PT Maju Jaya':       7,
      'CV Sinar Abadi':     3,
      'Koperasi Sejahtera': 12,
      'UD Berkah Tani':     0,
      'PT Karya Nusa':      4,
    },
    requests: [
      { id: 'R-3', type: 'reset',    by: 'hana', text: 'Hana meminta atur ulang akses masuk akun.',                                                    date: todayISO() },
      { id: 'R-4', type: 'register', uid: 'maya', by: 'maya', text: 'Maya Sartika mendaftar sebagai pegawai (peran yang diminta: Intake Support).', date: todayISO() },
    ],
    events,
    seq:    1046,
    reqSeq: 4,
    creds,
    attempts: new Map(),
  };
}

// Singleton – survives HMR in dev
const g = globalThis as unknown as { __amigaStore?: Store };
if (!g.__amigaStore) g.__amigaStore = seed();
export const store: Store = g.__amigaStore;
