/**
 * services.ts — Business logic layer.
 * All functions receive the authenticated User, enforce RBAC via guard(),
 * then read/write the in-memory store.
 * In production replace this with API calls to Lambda / FastAPI.
 */
import { FIELDS, ROLE_LABEL, TAX_PRESETS, SELF_ROLES } from './constants';
import { addDays, dstr, rp, stamp, todayISO } from './format';
import { activeUsers, can, Forbidden, guard, logDeny, Rule } from './rbac';
import { store } from './store';
import { tally, validate } from './validate';
import type {
  AccessRequest, AuditEvent, ClientSummary, Doc, DocSummary, FieldKey,
  RoleKey, TaxDoc, TaxLine, TaxResult, User, VoucherData, VoucherRow, WorkloadRow,
} from './types';

/* ── helpers ── */
const roleLabel = (u: User) => `${u.name} (${ROLE_LABEL[u.role]})`;
const userName  = (id: string) => store.users.find(x => x.id === id)?.name ?? id;

const findDoc = (id: string): Doc => {
  const d = store.docs.find(x => x.id === id);
  if (!d) throw new Rule('Dokumen tidak ditemukan.');
  return d;
};

const ev = (k: AuditEvent['k'], d: string, w: string, x: string, a: string, bot = false) =>
  store.events.push({ k, d, t: stamp(), a, w, x, bot });

const summary = (d: Doc): DocSummary => ({
  id: d.id, no: d.no, nomorUrut: d.nomorUrut, klien: d.klien,
  namaPT: d.namaPT, namaPIC: d.namaPIC,
  jenis: d.jenis, jenisPajak: d.jenisPajak, saluran: d.saluran,
  deadline: d.deadline, status: d.status, issue: d.issue,
  uploader: d.uploader, owner: d.owner, reviewer: d.reviewer,
  taxSet: d.tax !== null, voucherNo: d.voucherNo,
});

const openTasks = (uid: string) =>
  store.docs.filter(d => d.reviewer === uid &&
    ['Dalam Review', 'Diproses'].includes(d.status)).length;

const safeDate = (x: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(x) ? dstr(x) : (x || '—');

/* ── Tax helpers ── */
export function computeTaxes(dpp: number, taxes: TaxLine[]): TaxResult {
  const lines = taxes.map(t => ({ ...t, amount: Math.round(dpp * t.rate / 100) }));
  const add      = lines.filter(l => l.kind === 'add').reduce((s, l) => s + l.amount, 0);
  const withhold = lines.filter(l => l.kind === 'withhold').reduce((s, l) => s + l.amount, 0);
  return { dpp, lines, add, withhold, net: dpp + add - withhold };
}

export function normalizeTaxes(raw: Partial<TaxLine>[]): TaxLine[] {
  if (!Array.isArray(raw)) throw new Rule('Data pajak tidak valid.');
  if (raw.length > 8)     throw new Rule('Maksimal 8 jenis pajak per voucher.');
  const seen: Record<string, boolean> = {};
  return raw.map((o, i) => {
    const label = String(o.label ?? '').trim().slice(0, 40);
    const rate  = Number(o.rate);
    const code  = String(o.code ?? '').slice(0, 20) || `LAIN${i + 1}`;
    if (!label) throw new Rule('Nama pajak wajib diisi.');
    if (o.kind !== 'add' && o.kind !== 'withhold')
      throw new Rule(`Jenis pajak "${label}" tidak valid.`);
    if (!isFinite(rate) || rate <= 0 || rate > 100)
      throw new Rule(`Tarif "${label}" harus lebih dari 0 dan paling besar 100%.`);
    if (seen[code]) throw new Rule(`Pajak "${label}" dipilih dua kali.`);
    seen[code] = true;
    return { code, label, rate: Math.round(rate * 100) / 100, kind: o.kind };
  });
}

/* ── Voucher number sequence ── */
function issueVoucherNo(klien: string): string {
  const code = store.klienCode[klien];
  if (!code) throw new Rule('Kode klien belum diatur.');
  const n = (store.klienCounters[klien] ?? 0) + 1;
  store.klienCounters[klien] = n;
  return `VCH-${code}-${String(n).padStart(4, '0')}`;
}

/* ── Queue ── */
export function queueFor(u: User): DocSummary[] {
  const perm = ({ pic: 'queue:read:own', support: 'queue:read:delegated', finance: 'queue:read:assigned' } as Partial<Record<RoleKey, string>>)[u.role];
  if (!perm) throw new Forbidden('Peran Anda tidak memiliki antrean dokumen.');
  guard(u, perm);
  return store.docs
    .filter(d => can(u, perm, d).ok &&
      (u.role !== 'finance' || d.status === 'Dalam Review'))
    .map(summary);
}

export function workloadFor(u: User): WorkloadRow[] {
  guard(u, 'queue:read:workload');
  return store.docs.map(d => ({
    id: d.id, no: d.no, klien: d.klien, jenis: d.jenis,
    deadline: d.deadline, status: d.status,
    reviewer: d.reviewer, uploader: d.uploader,
    conflict: d.reviewer === d.uploader,
  }));
}

export function requestsFor(u: User): AccessRequest[] {
  guard(u, 'queue:read:access');
  return store.requests.slice();
}

/* ── Finance review ── */
export function getDocForReview(u: User, id: string): Doc {
  const d = findDoc(id);
  guard(u, 'doc:read:assigned', d);
  return structuredClone(d);
}

export function correctField(u: User, id: string, k: FieldKey, raw: string): string {
  const d = findDoc(id);
  guard(u, 'doc:correct:assigned', d);
  const def = FIELDS.find(x => x.k === k);
  if (!def) throw new Rule('Field tidak dikenal.');
  const old = d.f[k];
  let nv: string | number = raw.trim();
  if (def.type === 'num') { const dg = raw.replace(/\D/g, ''); nv = dg ? Number(dg) : 0; }
  if (String(old) === String(nv)) return 'Tidak ada perubahan.';
  (d.f as Record<FieldKey, string | number>)[k] = nv;
  d.conf[k] = 1;
  const show = (v: string | number) => def.type === 'num' ? rp(v) : String(v);
  ev('doc', id, `Data dikoreksi: ${def.label}`, `Dari ${show(old)} menjadi ${show(nv)}.`, roleLabel(u));
  return `Koreksi ${def.label} tersimpan.`;
}

export function decide(u: User, id: string, kind: 'approve' | 'reject' | 'return', why: string): string {
  const d = findDoc(id);
  guard(u, 'doc:decide:assigned', d);
  if (d.status !== 'Dalam Review') throw new Rule('Hanya dokumen berstatus Dalam Review yang bisa diputuskan.');

  if (kind === 'approve') {
    if (tally(validate(d.f, d.conf)).err) throw new Rule('Masih ada field bermasalah. Selesaikan dulu sebelum menyetujui.');
    if (!d.tax) throw new Rule('Pajak voucher belum diatur. Minta PIC Klien atau Intake Support menyelesaikannya dulu.');
    d.voucherNo = issueVoucherNo(d.klien);
    d.status = 'Disetujui'; d.issue = '';
    ev('doc',      id, 'Hasil ekstraksi disetujui', `Voucher ${d.voucherNo} diterbitkan.`,  roleLabel(u));
    ev('workload', id, 'Tugas selesai',              `Disetujui oleh ${u.name}.`,            roleLabel(u));
    return `Disetujui. Voucher ${d.voucherNo} diterbitkan.`;
  }

  if (!why.trim()) throw new Rule('Tulis alasan agar penerima tahu apa yang perlu dilakukan.');

  if (kind === 'reject') {
    d.status = 'Ditolak'; d.issue = why.trim();
    ev('doc',      id, 'Dokumen ditolak',           `Alasan: ${why.trim()}`, roleLabel(u));
    ev('workload', id, 'Tugas selesai',              `Ditolak oleh ${u.name}.`, roleLabel(u));
    return 'Dokumen ditolak.';
  }

  // return → Dikembalikan
  d.status = 'Dikembalikan'; d.issue = why.trim(); d.note = '';
  ev('doc',      id, 'Dokumen dikembalikan ke Intake Support', `Alasan: ${why.trim()}`,         roleLabel(u));
  ev('workload', id, 'Tugas dikembalikan ke Intake Support',   `Oleh ${u.name}. Menunggu perbaikan.`, roleLabel(u));
  return 'Dokumen dikembalikan ke Intake Support untuk diperbaiki.';
}

/* ── Tax setup (PIC / Support) ── */
export function getTaxDoc(u: User, id: string): TaxDoc {
  const d = findDoc(id);
  const perm = u.role === 'support' ? 'doc:tax:delegated' : 'doc:tax:own';
  guard(u, perm, d);
  return {
    id: d.id, no: d.no, klien: d.klien, vendor: d.f.vendor,
    status: d.status, dpp: d.f.dpp, ppnInvoice: d.f.ppn,
    tax: d.tax ? structuredClone(d.tax) : null,
    approvers: d.approvers,
  };
}

export function setTax(u: User, id: string, raw: Partial<TaxLine>[], approvers: 1 | 2): string {
  const d = findDoc(id);
  const perm = u.role === 'support' ? 'doc:tax:delegated' : 'doc:tax:own';
  guard(u, perm, d);
  if (d.status === 'Disetujui' || d.status === 'Ditolak')
    throw new Rule('Dokumen sudah selesai diproses. Pajak tidak bisa diubah lagi.');
  if (approvers !== 1 && approvers !== 2)
    throw new Rule('Jumlah penyetuju harus 1 atau 2 pihak.');
  const taxes = normalizeTaxes(raw);
  d.tax = taxes; d.approvers = approvers;
  const bd = computeTaxes(d.f.dpp, taxes);
  const taxDesc = taxes.map(t => `${t.label} ${t.rate}%`).join(', ') || 'Tanpa pajak';
  ev('doc', id, 'Pajak voucher diatur',
    `${taxDesc}. Nominal voucher ${rp(bd.net)}. Penyetuju: ${approvers} pihak.`,
    roleLabel(u));
  return `Pajak tersimpan. Nominal voucher ${rp(bd.net)}.`;
}

/* ── Fix / resubmit returned doc (PIC / Support) ── */
export function getFixDoc(u: User, id: string): Doc {
  const d = findDoc(id);
  const perm = u.role === 'support' ? 'doc:fix:delegated' : 'doc:fix:own';
  guard(u, perm, d);
  return structuredClone(d);
}

export function correctFixField(u: User, id: string, k: FieldKey, raw: string): string {
  const d = findDoc(id);
  const perm = u.role === 'support' ? 'doc:fix:delegated' : 'doc:fix:own';
  guard(u, perm, d);
  if (d.status !== 'Dikembalikan') throw new Rule('Dokumen hanya bisa diperbaiki saat berstatus Dikembalikan.');
  return correctField(u, id, k, raw);   // reuse Finance correction logic
}

export function resubmit(u: User, id: string, note: string): string {
  const d = findDoc(id);
  const perm = u.role === 'support' ? 'doc:fix:delegated' : 'doc:fix:own';
  guard(u, perm, d);
  if (d.status !== 'Dikembalikan') throw new Rule('Hanya dokumen berstatus Dikembalikan yang bisa dikirim ulang.');
  if (tally(validate(d.f, d.conf)).err) throw new Rule('Masih ada field bermasalah. Perbaiki dulu sebelum mengirim ulang.');
  if (!d.tax) throw new Rule('Pajak voucher belum diatur. Atur pajak dulu sebelum mengirim ulang.');
  d.status = 'Dalam Review'; d.issue = ''; d.note = String(note ?? '').slice(0, 300);
  ev('doc',      id, 'Dokumen diperbaiki dan dikirim ulang',
    `Dikirim ulang ke ${userName(d.reviewer)}${d.note ? `. Catatan: ${d.note}` : '.'}`,
    roleLabel(u));
  ev('workload', id, 'Tugas kembali ke Finance Reviewer',
    `Menunggu review ulang oleh ${userName(d.reviewer)}.`,
    'Sistem', true);
  return `Dokumen dikirim ulang ke ${userName(d.reviewer)} untuk review ulang.`;
}

/* ── Voucher ── */
export function vouchersFor(u: User): DocSummary[] {
  const perm = u.role === 'pic' ? 'voucher:download:own'
    : u.role === 'support' ? 'voucher:read:delegated'
    : 'voucher:read:assigned';
  guard(u, perm);
  return store.docs
    .filter(d => can(u, perm, d).ok && d.status === 'Disetujui')
    .map(summary);
}

export function getVoucher(u: User, id: string): VoucherData {
  const d = findDoc(id);
  const perm = u.role === 'pic' ? 'voucher:download:own'
    : u.role === 'support' ? 'voucher:read:delegated'
    : 'voucher:read:assigned';
  guard(u, perm, d);
  if (d.status !== 'Disetujui') throw new Rule('Voucher baru terbit setelah disetujui Finance Reviewer.');

  // Build line-item rows
  const rows: VoucherRow[] = d.items.map((it, i) => ({
    no: i + 1, tgl: it.tgl ? safeDate(it.tgl) : '',
    ket: it.ket, jumlah: it.jumlah, harga: it.harga,
  }));
  if (!rows.length && d.f.dpp > 0)
    rows.push({ no: 1, tgl: safeDate(d.f.tgl), ket: 'Sesuai invoice', jumlah: '', harga: d.f.dpp });

  const diff = d.f.dpp - rows.reduce((s, r) => s + r.harga, 0);
  if (diff !== 0) rows.push({ no: rows.length + 1, tgl: '', ket: 'Penyesuaian terhadap DPP', jumlah: '', harga: diff });

  const bd = computeTaxes(d.f.dpp, d.tax ?? []);
  rows.push({ no: '', tgl: '', ket: 'Subtotal (DPP)', jumlah: '', harga: d.f.dpp, sub: true });
  bd.lines.forEach(l => rows.push({
    no: '', tgl: '',
    ket: `${l.label} (${l.kind === 'add' ? 'ditambahkan' : 'dipotong'})`,
    jumlah: `${l.rate}%`,
    harga: l.kind === 'add' ? l.amount : -l.amount,
    tax: true,
  }));

  const taxText = bd.lines.length
    ? bd.lines.map(l => `${l.label} ${l.rate}%: ${l.kind === 'add' ? '+ ' : '- '}${rp(l.amount)}`).join('; ')
    : 'Tanpa pajak';

  const dates = d.items.map(it => it.tgl).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  const from  = dates[0] ?? d.f.tgl;
  const to    = dates[dates.length - 1] ?? from;
  const periode = from === to ? safeDate(from) : `${safeDate(from)} – ${safeDate(to)}`;

  return {
    id: d.id, no: d.no, number: d.voucherNo, nomorUrut: d.nomorUrut,
    klien: d.klien, namaPT: d.namaPT, namaPIC: d.namaPIC,
    status: d.status,
    reviewer: userName(d.reviewer), submitter: userName(d.owner),
    nama: d.f.vendor, perusahaan: d.klien, periode,
    nominal: bd.net, dpp: d.f.dpp, add: bd.add, withhold: bd.withhold,
    taxText, rows, total: bd.net,
    approvers: d.approvers,
    f: { vendor: d.f.vendor, no: d.f.no, rek: d.f.rek, dpp: d.f.dpp, ppn: d.f.ppn, total: d.f.total },
  };
}

export function recordDownload(u: User, id: string): string {
  const d = findDoc(id);
  guard(u, 'voucher:download:own', d);
  if (d.status !== 'Disetujui') throw new Rule('Voucher belum disetujui Finance.');
  ev('doc', id, 'Voucher diunduh', `${d.voucherNo} diunduh sebagai PDF.`, roleLabel(u));
  return 'Voucher siap dicetak atau disimpan sebagai PDF.';
}

/* ── Upload ── */
export function klienOptions(u: User): string[] {
  guard(u, u.role === 'pic' ? 'doc:create' : 'doc:create:delegated');
  return store.clients.map(c => c.namaPT);
}

export function picOptions(): { id: string; name: string }[] {
  return activeUsers('pic').map(p => ({ id: p.id, name: p.name }));
}

export interface UploadInput {
  klien: string; jenis: string; saluran: string; tgl: string; cat: string;
  picId?: string;  // required when uploader is support
  fileName: string;
}

export function createDoc(u: User, p: UploadInput): Doc {
  const client = store.clients.find(c => c.namaPT === p.klien);
  if (!client) throw new Rule('Klien tidak dikenal.');

  let owner: string;
  if (u.role === 'pic') {
    guard(u, 'doc:create');
    owner = u.id;
  } else {
    guard(u, 'doc:create:delegated');
    const po = store.users.find(x => x.id === p.picId);
    if (!po || po.role !== 'pic' || po.status !== 'Aktif')
      throw new Rule('Pilih PIC Klien yang menerima order ini.');
    owner = po.id;
  }

  const cand = activeUsers('finance')
    .filter(x => x.id !== u.id)
    .sort((a, b) => openTasks(a.id) - openTasks(b.id));
  if (!cand.length) throw new Rule('Belum ada Finance Reviewer aktif yang bisa menerima tugas.');

  const id      = `D-${store.seq++}`;
  const nomorUrut = client.nextSequence++;
  const tgl     = p.tgl;
  const today   = todayISO();
  const fakeDpp = 8_000_000;
  const a       = Math.round(fakeDpp * 0.7);

  const doc: Doc = {
    id, no: `INV-${store.seq}`, nomorUrut,
    klien: p.klien, namaPT: client.namaPT, namaPIC: client.namaPIC,
    jenis: p.jenis, jenisPajak: 'Tidak ada', saluran: p.saluran, tgl,
    deadline: addDays(today, 7), status: 'Diproses',
    owner, uploader: u.id, reviewer: cand[0].id,
    issue: '', note: String(p.cat ?? '').slice(0, 300),
    f: { no: `INV-${store.seq}`, tgl, vendor: p.klien + ' (vendor)',
         npwp: '06.789.012.3-456.000', dpp: fakeDpp, ppn: 880_000, total: 8_880_000, rek: 'BCA 1122334455' },
    conf: { no: 0.98, tgl: 0.97, vendor: 0.95, npwp: 0.93, dpp: 0.96, ppn: 0.94, total: 0.97, rek: 0.9 },
    src: { no: `INV-${store.seq}`, tgl, vendor: p.klien + ' (vendor)',
           npwp: '06.789.012.3-456.000', dpp: fakeDpp, ppn: 880_000, total: 8_880_000, rek: 'BCA 1122334455' },
    hasFile: false,
    items: [
      { tgl, ket: 'Jasa layanan periode berjalan', jumlah: '1 paket', harga: a },
      { tgl, ket: 'Biaya tambahan', jumlah: '1 paket', harga: fakeDpp - a },
    ],
    tax: null, approvers: 1, voucherNo: null,
  };
  store.docs.push(doc);

  const who = u.role === 'support' ? `Dokumen diunggah atas order PIC ${userName(owner)}` : 'Dokumen diunggah';
  ev('doc', id, who, `File ${p.fileName}. Klien ${p.klien}, ${p.jenis}${p.cat ? `. Catatan: ${p.cat}` : '.'}`, roleLabel(u));

  // Simulate robot extraction after 2.6 s
  setTimeout(() => {
    doc.status = 'Dalam Review';
    store.events.push({
      k: 'doc', d: id, t: stamp(), a: 'Robot Admin',
      w: 'Ekstraksi dan pemeriksaan aturan selesai',
      x: 'Semua aturan bisnis lolos. Dokumen masuk antrean Finance Reviewer.', bot: true,
    });
    store.events.push({
      k: 'workload', d: id, t: stamp(), a: 'Sistem',
      w: `Tugas ditugaskan ke ${userName(doc.reviewer)}`,
      x: `Tenggat ${dstr(doc.deadline)}.`, bot: true,
    });
  }, 2600);

  return doc;
}

/* ── Workload ── */
export function reassign(u: User, id: string, to: string): string {
  const d = findDoc(id);
  guard(u, 'task:reassign');
  const t = store.users.find(x => x.id === to);
  if (!t || t.role !== 'finance') throw new Rule('Penerima harus seorang Finance Reviewer.');
  if (t.id === d.uploader) throw new Rule('Pemisahan tugas: reviewer tidak boleh sama dengan pengunggah.');
  const old = d.reviewer;
  d.reviewer = to;
  ev('workload', id, 'Tugas dialihkan', `Dari ${userName(old)} ke ${t.name}.`, roleLabel(u));
  return `Tugas ${d.no} dialihkan ke ${t.name}.`;
}

/* ── Clients ── */
export function clientsFor(u: User): ClientSummary[] {
  guard(u, 'client:manage');
  return store.clients.map(c => {
    const ds = store.docs.filter(d => d.klien === c.namaPT);
    return {
      name: c.namaPT,
      code: store.klienCode[c.namaPT] ?? '??',
      docs: ds.length,
      pics: [...new Set(ds.map(d => userName(d.owner)))],
    };
  });
}

function makeClientCode(name: string): string {
  const words = name.replace(/[^A-Za-z ]/g, '').split(/\s+/)
    .filter(w => w && !['PT', 'CV', 'UD', 'KOPERASI'].includes(w.toUpperCase()));
  let code = (words.map(w => w[0]).join('') || name.replace(/[^A-Za-z]/g, '')).toUpperCase().slice(0, 3);
  if (code.length < 2) code = (code + 'XX').slice(0, 2);
  const base = code; let i = 2;
  while (Object.values(store.klienCode).includes(code)) code = base + (i++);
  return code;
}

export function addClient(u: User, name: string): string {
  guard(u, 'client:manage');
  const n = name.trim();
  if (!n) throw new Rule('Nama perusahaan wajib diisi.');
  if (store.clients.some(c => c.namaPT.toLowerCase() === n.toLowerCase()))
    throw new Rule(`Klien ${n} sudah terdaftar.`);
  const id   = `CL-${store.clients.length + 1}`;
  const code = makeClientCode(n);
  store.clients.push({ id, namaPT: n, namaPIC: '', email: '', phone: '', address: '', nextSequence: 1 });
  store.klienCode[n]     = code;
  store.klienCounters[n] = 0;
  ev('admin', '', 'Klien ditambahkan', `${n} (kode voucher ${code}).`, roleLabel(u));
  return `Klien ${n} ditambahkan dengan kode ${code}.`;
}

/* ── Users / Auth ── */
export function usersFor(u: User): User[] {
  guard(u, 'user:manage');
  return store.users.map(x => ({ ...x }));
}

export function setRole(u: User, uid: string, role: RoleKey): string {
  guard(u, 'user:manage');
  if (uid === u.id) throw new Rule('Anda tidak bisa mengubah peran akun sendiri.');
  if (!(role in ROLE_LABEL)) throw new Rule('Peran tidak dikenal.');
  const t = store.users.find(x => x.id === uid);
  if (!t) throw new Rule('Pengguna tidak ditemukan.');
  const old = t.role;
  t.role = role;
  ev('admin', '', 'Peran diubah', `Akun ${t.name}: ${ROLE_LABEL[old]} menjadi ${ROLE_LABEL[role]}.`, roleLabel(u));
  return `Peran ${t.name} diperbarui.`;
}

export function register(f: { name: string; email: string; role: RoleKey; pw: string; pw2: string }): string {
  const name  = f.name.trim().slice(0, 60);
  const email = f.email.trim().toLowerCase();
  const pw    = f.pw ?? '';
  if (name.length < 3) throw new Rule('Isi nama lengkap (minimal 3 huruf).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Rule('Format email tidak valid.');
  if (store.users.some(x => x.email === email)) throw new Rule('Email ini sudah terdaftar.');
  if (pw.length < 8) throw new Rule('Kata sandi minimal 8 karakter.');
  if (pw !== f.pw2) throw new Rule('Konfirmasi kata sandi tidak sama.');
  if (!SELF_ROLES.includes(f.role)) throw new Rule('Pilih peran yang diajukan.');
  const id = `u${Date.now()}`;
  store.users.push({ id, name, role: f.role, about: 'Pendaftar baru, menunggu persetujuan.', email, status: 'Menunggu' });
  store.creds.push({ id, email, pw });
  const reqId = `R-${++store.reqSeq}`;
  store.requests.push({
    id: reqId, type: 'register', uid: id, by: id,
    text: `${name} mendaftar sebagai pegawai (peran yang diminta: ${ROLE_LABEL[f.role]}).`,
    date: todayISO(),
  });
  store.events.push({
    k: 'admin', d: '', t: stamp(), a: `${name} (pendaftar)`,
    w: 'Pendaftaran pegawai baru',
    x: `${email}, peran yang diminta ${ROLE_LABEL[f.role]}. Menunggu persetujuan System Admin.`,
  });
  return email;
}

export function createUser(u: User, f: { name: string; email: string; role: RoleKey; pw: string }): string {
  guard(u, 'user:manage');
  const name  = f.name.trim().slice(0, 60);
  const email = f.email.trim().toLowerCase();
  const pw    = f.pw ?? '';
  if (name.length < 3) throw new Rule('Isi nama lengkap (minimal 3 huruf).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Rule('Format email tidak valid.');
  if (store.users.some(x => x.email === email)) throw new Rule('Email ini sudah terdaftar.');
  if (!ROLE_LABEL[f.role]) throw new Rule('Pilih peran.');
  if (pw.length < 8) throw new Rule('Kata sandi awal minimal 8 karakter.');
  const id = `u${Date.now()}`;
  store.users.push({ id, name, role: f.role, about: 'Dibuat oleh System Admin.', email, status: 'Aktif' });
  store.creds.push({ id, email, pw });
  ev('admin', '', 'Akun pegawai dibuat', `${name} (${email}) dengan peran ${ROLE_LABEL[f.role]}.`, roleLabel(u));
  return `Akun ${name} dibuat.`;
}

export function decideAccess(u: User, id: string, ok: boolean, role?: RoleKey): string {
  guard(u, 'access:decide');
  const i = store.requests.findIndex(r => r.id === id);
  if (i < 0) throw new Rule('Permintaan tidak ditemukan.');
  const req = store.requests[i];

  if (req.type === 'register') {
    const t = store.users.find(x => x.id === req.uid);
    if (t) {
      if (ok) {
        const rl = role ?? t.role;
        if (!ROLE_LABEL[rl]) throw new Rule('Peran tidak valid.');
        t.role = rl; t.status = 'Aktif';
      } else {
        t.status = 'Ditolak';
      }
      store.requests.splice(i, 1);
      ev('admin', '', ok ? 'Pendaftaran pegawai disetujui' : 'Pendaftaran pegawai ditolak',
        t.name + (ok ? ` aktif sebagai ${ROLE_LABEL[t.role]}.` : '.'), roleLabel(u));
    }
    return ok ? 'Pendaftaran disetujui.' : 'Pendaftaran ditolak.';
  }

  store.requests.splice(i, 1);
  ev('admin', '', ok ? 'Permintaan akses disetujui' : 'Permintaan akses ditolak', req.text, roleLabel(u));
  return ok ? 'Permintaan disetujui.' : 'Permintaan ditolak.';
}

/* ── Audit ── */
export function auditFor(u: User): AuditEvent[] {
  const perm = ({
    pic:     'audit:read:own',
    support: 'audit:read:delegated',
    finance: 'audit:read:assigned',
    lead:    'audit:read:workload',
    admin:   'audit:read:admin',
  } as Record<RoleKey, string>)[u.role];
  guard(u, perm);
  return store.events
    .filter(e => {
      if (u.role === 'lead')  return e.k === 'workload';
      if (u.role === 'admin') return e.k === 'admin' || e.k === 'security';
      if (e.k !== 'doc')      return false;
      const d = store.docs.find(x => x.id === e.d);
      return !!d && can(u, perm, d).ok;
    })
    .slice()
    .reverse();
}

export const docLabel = (id: string): string => {
  const d = store.docs.find(x => x.id === id);
  return d ? `${d.no} – ${d.klien}` : id;
};

/* ── Login ── */
export function authenticate(email: string, pw: string): { ok: true; user: User } | { ok: false; msg: string } {
  const e = email.trim().toLowerCase();
  if (!e || !pw) return { ok: false, msg: 'Isi email dan kata sandi.' };
  if (e.length > 200 || pw.length > 200) return { ok: false, msg: 'Email atau kata sandi salah.' };

  const now  = Date.now();
  const att  = store.attempts.get(e);
  if (att && att.until > now)
    return { ok: false, msg: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((att.until - now) / 1000)} detik.` };

  const cred = store.creds.find(c => c.email === e);
  const ok   = cred?.pw === pw;
  if (!cred || !ok) {
    const n = (att?.n ?? 0) + 1;
    if (n >= 5) {
      store.attempts.set(e, { n: 0, until: now + 60_000 });
    } else {
      store.attempts.set(e, { n, until: 0 });
    }
    return { ok: false, msg: 'Email atau kata sandi salah.' };
  }

  store.attempts.delete(e);
  const user = store.users.find(u => u.id === cred.id);
  if (!user) return { ok: false, msg: 'Akun tidak ditemukan.' };
  if (user.status === 'Menunggu') return { ok: false, msg: 'Akun Anda masih menunggu persetujuan System Admin.' };
  if (user.status === 'Ditolak')  return { ok: false, msg: 'Pendaftaran akun ini ditolak. Hubungi System Admin.' };
  return { ok: true, user };
}
