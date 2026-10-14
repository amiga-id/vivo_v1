import { addDays, stampAt, todayISO } from './format';
import { hashPassword } from './password';
import type { AccessRequest, AuditEvent, Client, Conf, Delegation, Doc, Fields, Status, User } from './types';

/**
 * Penyimpanan data CONTOH di memori server.
 * - Data hilang saat server restart, dan tiap instance serverless punya salinan sendiri.
 * - Untuk produksi, ganti dengan DynamoDB/RDS di balik fungsi-fungsi di services.ts.
 */
export interface Store {
  users: User[];
  clients: Client[];
  docs: Doc[];
  files: Map<string, { name: string; bytes: Buffer }>;
  deleg: Delegation[];
  requests: AccessRequest[];
  events: AuditEvent[];
  seq: number;
  creds: { id: string; email: string; hash: string }[];
  attempts: Map<string, { n: number; until: number }>;
}

const baseConf: Conf = { no: 0.98, tgl: 0.97, vendor: 0.95, npwp: 0.93, dpp: 0.96, ppn: 0.94, total: 0.97, rek: 0.9 };

function mk(
  id: string, no: string, nomorUrut: number, vendor: string, klien: string, namaPT: string, namaPIC: string, 
  jenis: string, jenisPajak: string, saluran: string,
  tglOffset: number, dlOffset: number, status: Status, owner: string, uploader: string, reviewer: string,
  rest: Omit<Fields, 'no' | 'tgl' | 'vendor'>, conf: Conf, src?: Partial<Fields>,
): Doc {
  const t = todayISO();
  const tgl = addDays(t, tglOffset);
  const f: Fields = { no, tgl, vendor, ...rest };
  return {
    id, no, nomorUrut, klien, namaPT, namaPIC, jenis, jenisPajak, saluran, tgl, deadline: addDays(t, dlOffset), status, owner, uploader, reviewer,
    issue: '', f, conf, src: { ...f, ...src }, hasFile: false,
  };
}

function seed(): Store {
  // Data klien dengan nomor urut sequence
  const clients: Client[] = [
    { id: 'PT-001', namaPT: 'PT Maju Jaya', namaPIC: 'Budi Santoso', email: 'budi@majujaya.com', phone: '021-1234567', address: 'Jakarta Selatan', nextSequence: 3 },
    { id: 'CV-001', namaPT: 'CV Sinar Abadi', namaPIC: 'Siti Aminah', email: 'siti@sinarabadi.com', phone: '021-2345678', address: 'Tangerang', nextSequence: 2 },
    { id: 'KOP-001', namaPT: 'Koperasi Sejahtera', namaPIC: 'Ahmad Yani', email: 'ahmad@sejahtera.com', phone: '021-3456789', address: 'Bekasi', nextSequence: 2 },
    { id: 'UD-001', namaPT: 'UD Berkah Tani', namaPIC: 'Dewi Kusuma', email: 'dewi@berkahtani.com', phone: '021-4567890', address: 'Bogor', nextSequence: 2 },
    { id: 'PT-002', namaPT: 'PT Karya Nusa', namaPIC: 'Rudi Hartono', email: 'rudi@karyanusa.com', phone: '021-5678901', address: 'Jakarta Pusat', nextSequence: 3 },
  ];

  const d2 = mk('D-1042', 'INV-0098', 1, 'CV Sinar Abadi', 'CV Sinar Abadi', 'CV Sinar Abadi', 'Siti Aminah', 'Reimburse', 'Tidak ada', 'WhatsApp', -2, 0,
    'Perlu Tindakan', 'dewi', 'andi', 'rina',
    { npwp: '02.345.678.9-012.000', dpp: 4200000, ppn: 462000, total: 4862000, rek: 'Mandiri 1370012345' },
    { ...baseConf, total: 0.71 }, { total: 4662000 });
  d2.issue = 'Total tidak sama dengan DPP + PPN';

  const docs: Doc[] = [
    mk('D-1041', 'INV-2026-0141', 2, 'PT Maju Jaya Logistik', 'PT Maju Jaya', 'PT Maju Jaya', 'Budi Santoso', 'Pembayaran vendor', 'PPN', 'Email', -1, 2,
      'Dalam Review', 'dewi', 'dewi', 'rina',
      { npwp: '01.234.567.8-091.000', dpp: 12500000, ppn: 1375000, total: 13875000, rek: 'BCA 0123456789' },
      { ...baseConf, rek: 0.82 }),
    d2,
    mk('D-1043', 'INV-77/XI', 2, 'PT Karya Nusa Prima', 'PT Karya Nusa', 'PT Karya Nusa', 'Rudi Hartono', 'Pembayaran vendor', 'PPh 23', 'Portal', -1, 3,
      'Dalam Review', 'eko', 'rina', 'rina',
      { npwp: '03.456.789.0-123.000', dpp: 9000000, ppn: 990000, total: 9990000, rek: 'BNI 0456789012' }, baseConf),
    mk('D-1039', 'INV-5520', 1, 'Koperasi Sejahtera', 'Koperasi Sejahtera', 'Koperasi Sejahtera', 'Ahmad Yani', 'Pembayaran vendor', 'PPN', 'Email', -5, -2,
      'Disetujui', 'dewi', 'dewi', 'rina',
      { npwp: '04.567.890.1-234.000', dpp: 6000000, ppn: 660000, total: 6660000, rek: 'BRI 0345678901' }, baseConf),
    mk('D-1044', 'INV-0311', 1, 'UD Berkah Tani', 'UD Berkah Tani', 'UD Berkah Tani', 'Dewi Kusuma', 'Pembayaran vendor', 'PPh 4 ayat 2', 'Kurir', 0, 4,
      'Diproses', 'dewi', 'dewi', 'hana',
      { npwp: '05.678.901.2-345.000', dpp: 3000000, ppn: 330000, total: 3330000, rek: 'BCA 0987654321' }, baseConf),
    mk('D-1045', 'INV-2210', 1, 'PT Karya Nusa Prima', 'PT Karya Nusa', 'PT Karya Nusa', 'Rudi Hartono', 'Pajak', 'PPh 21', 'Email', -1, 1,
      'Dalam Review', 'eko', 'eko', 'hana',
      { npwp: '03.456.789.0-123.000', dpp: 2000000, ppn: 220000, total: 2220000, rek: 'BNI 0456789012' }, baseConf),
  ];

  const events: AuditEvent[] = [
    { k: 'doc', d: 'D-1041', t: stampAt(1, '09:12'), a: 'Dewi Lestari (Intake Support)', w: 'Dokumen diunggah', x: 'Metadata diisi: Pembayaran vendor, saluran Email.' },
    { k: 'doc', d: 'D-1041', t: stampAt(1, '09:13'), a: 'Robot Admin', w: 'Ekstraksi selesai', x: '8 field terbaca. Satu field berkeyakinan rendah (rekening tujuan).', bot: true },
    { k: 'doc', d: 'D-1042', t: stampAt(2, '15:40'), a: 'Andi Saputra (Intake Support)', w: 'Dokumen diunggah untuk klien', x: 'Dikirim lewat WhatsApp.' },
    { k: 'doc', d: 'D-1042', t: stampAt(2, '15:41'), a: 'Robot Admin', w: 'Aturan bisnis ditandai', x: 'Total tidak sama dengan DPP + PPN.', bot: true },
    { k: 'doc', d: 'D-1043', t: stampAt(1, '11:05'), a: 'Rina Wijaya (Finance Reviewer)', w: 'Dokumen diunggah', x: 'Diunggah dari portal.' },
    { k: 'doc', d: 'D-1039', t: stampAt(4, '10:20'), a: 'Rina Wijaya (Finance Reviewer)', w: 'Hasil ekstraksi disetujui', x: 'Voucher siap diunduh.' },
    { k: 'doc', d: 'D-1039', t: stampAt(4, '13:02'), a: 'Dewi Lestari (Intake Support)', w: 'Voucher diunduh', x: 'Voucher dikirim ke Client Approver di luar AMIGA.' },
    { k: 'workload', d: 'D-1041', t: stampAt(1, '09:14'), a: 'Sistem', w: 'Tugas ditugaskan ke Rina Wijaya', x: 'Tenggat 2 hari lagi.', bot: true },
    { k: 'workload', d: 'D-1042', t: stampAt(0, '08:00'), a: 'Sistem', w: 'Tenggat hari ini', x: 'D-1042 jatuh tempo hari ini.', bot: true },
    { k: 'workload', d: 'D-1043', t: stampAt(1, '11:06'), a: 'Sistem', w: 'Konflik penugasan terdeteksi', x: 'Pengunggah dan reviewer adalah orang yang sama. Tugas perlu dialihkan.', bot: true },
    { k: 'admin', d: '', t: stampAt(12, '10:00'), a: 'Sari Anggraini (System Admin)', w: 'Delegasi dibuat', x: 'Andi menerima delegasi dari Dewi untuk PT Maju Jaya dan CV Sinar Abadi.' },
  ];

  const st: Store = {
    users: [
      { id: 'dewi', name: 'Dewi Lestari', role: 'support', about: 'Intake Support untuk PT Maju Jaya, CV Sinar Abadi, Koperasi Sejahtera, dan UD Berkah Tani.' },
      { id: 'eko', name: 'Eko Prasetyo', role: 'support', about: 'Intake Support untuk PT Karya Nusa.' },
      { id: 'andi', name: 'Andi Saputra', role: 'support', about: 'Mengunggah dan menindaklanjuti dokumen untuk klien yang didelegasikan.' },
      { id: 'rina', name: 'Rina Wijaya', role: 'finance', about: 'Memeriksa dan menyetujui dokumen yang ditugaskan kepadanya.' },
      { id: 'hana', name: 'Hana Putri', role: 'finance', about: 'Memeriksa dan menyetujui dokumen yang ditugaskan kepadanya.' },
      { id: 'bayu', name: 'Bayu Kurniawan', role: 'lead', about: 'Memantau beban kerja tim dan mengalihkan tugas.' },
      { id: 'sari', name: 'Sari Anggraini', role: 'admin', about: 'Mengelola akun, hak akses, dan delegasi.' },
    ],
    clients,
    docs,
    files: new Map(),
    deleg: [{ id: 'DL-1', support: 'andi', pic: 'dewi', klien: ['PT Maju Jaya', 'CV Sinar Abadi'], expires: addDays(todayISO(), 80), active: true }],
    requests: [
      { id: 'R-1', type: 'deleg', by: 'andi', text: 'Andi meminta delegasi untuk PT Karya Nusa dari Eko Prasetyo.', date: 'kemarin' },
      { id: 'R-2', type: 'extend', by: 'andi', text: 'Andi meminta perpanjangan delegasi dari Dewi selama 30 hari.', date: 'kemarin' },
      { id: 'R-3', type: 'reset', by: 'hana', text: 'Hana meminta atur ulang akses masuk akun.', date: 'hari ini' },
    ],
    events,
    seq: 1046,
    creds: [],
    attempts: new Map(),
  };
  const pw = import.meta.env.VITE_DEMO_PASSWORD || 'amiga2026';
  // For demo, use pre-computed hashes (in production, use async hashPassword)
  st.creds = st.users.map((u) => ({ id: u.id, email: `${u.id}@amiga.demo`, hash: getStaticHash(pw) }));
  return st;
}

/** Get static hash for demo - in production use async hashPassword with crypto */
function getStaticHash(pw: string): string {
  // Simple deterministic hash for demo purposes
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    hash = ((hash << 5) - hash) + pw.charCodeAt(i);
    hash |= 0;
  }
  // Format: salt:hash
  const salt = 'demo-salt-2026';
  return `${salt}:${Math.abs(hash).toString(16)}`;
}

const g = globalThis as unknown as { __amigaStore?: Store };
if (!g.__amigaStore) g.__amigaStore = seed();
export const store: Store = g.__amigaStore;
