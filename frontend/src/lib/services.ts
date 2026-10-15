import { FIELDS, ROLE_LABEL, TAX_PRESETS } from './constants';
import { addDays, dstr, rp, stamp, todayISO } from './format';
import { activeUsers, assignedClients, can, Forbidden, guard, logDeny, Rule } from './rbac';
import { store } from './store';
import { tally, validate } from './validate';
import type {
  AccessRequest, Assignment, AuditEvent, ClientSummary,
  Doc, DocSummary, FieldKey, RoleKey,
  TaxDoc, TaxLine, TaxResult, User, VoucherData, VoucherRow, WorkloadRow,
} from './types';

/* ── helpers ── */
const rLabel = (u: User) => `${u.name} (${ROLE_LABEL[u.role]})`;
const uName  = (id: string) => store.users.find(x => x.id === id)?.name ?? id;

const findDoc = (id: string): Doc => {
  const d = store.docs.find(x => x.id === id);
  if (!d) throw new Rule('Dokumen tidak ditemukan.');
  return d;
};

const ev = (k: AuditEvent['k'], d: string, w: string, x: string, a: string, bot = false) =>
  store.events.push({ k, d, t: stamp(), a, w, x, bot });

const summary = (d: Doc): DocSummary => ({
  id: d.id, no: d.no, nomorUrut: d.nomorUrut,
  klien: d.klien, namaPT: d.namaPT, namaPIC: d.namaPIC,
  jenis: d.jenis,
  deadline: d.deadline, status: d.status, issue: d.issue,
  uploader: d.uploader, owner: d.owner, reviewer: d.reviewer,
  taxSet: d.tax !== null, voucherNo: d.voucherNo,
});

const openTasks = (uid: string) =>
  store.docs.filter(d => d.reviewer === uid && ['Dalam Review', 'Diproses'].includes(d.status)).length;

const safeDate = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) ? dstr(x) : (x || '—');

/* ── Tax helpers ── */
export function computeTaxes(dpp: number, taxes: TaxLine[]): TaxResult {
  const lines = taxes.map(t => ({ ...t, amount: Math.round(dpp * t.rate / 100) }));
  const add      = lines.filter(l => l.kind === 'add').reduce((s, l) => s + l.amount, 0);
  const withhold = lines.filter(l => l.kind === 'withhold').reduce((s, l) => s + l.amount, 0);
  return { dpp, lines, add, withhold, net: dpp + add - withhold };
}

export function normalizeTaxes(raw: Partial<TaxLine>[]): TaxLine[] {
  if (!Array.isArray(raw)) throw new Rule('Data pajak tidak valid.');
  if (raw.length > 8)      throw new Rule('Maksimal 8 jenis pajak per voucher.');
  const seen: Record<string, boolean> = {};
  return raw.map((o, i) => {
    const label = String(o.label ?? '').trim().slice(0, 40);
    const rate  = Number(o.rate);
    const code  = String(o.code ?? '').slice(0, 20) || `LAIN${i + 1}`;
    if (!label) throw new Rule('Nama pajak wajib diisi.');
    if (o.kind !== 'add' && o.kind !== 'withhold') throw new Rule(`Jenis pajak "${label}" tidak valid.`);
    if (!isFinite(rate) || rate <= 0 || rate > 100) throw new Rule(`Tarif "${label}" harus 0–100%.`);
    if (seen[code]) throw new Rule(`Pajak "${label}" dipilih dua kali.`);
    seen[code] = true;
    return { code, label, rate: Math.round(rate * 100) / 100, kind: o.kind };
  });
}

function issueVoucherNo(klien: string): string {
  const code = store.klienCode[klien];
  if (!code) throw new Rule('Kode klien belum diatur.');
  const n = (store.klienCounters[klien] ?? 0) + 1;
  store.klienCounters[klien] = n;
  return `VCH-${code}-${String(n).padStart(4, '0')}`;
}

/* ── Queue ── */
export function queueFor(u: User): DocSummary[] {
  const queuePermission = u.role === 'finance'
    ? 'queue:read:assigned'
    : 'queue:read:own';
  const documentPermission = u.role === 'finance'
    ? 'doc:read:assigned'
    : 'doc:read:own';
  guard(u, queuePermission);
  return store.docs
    .filter(d => can(u, documentPermission, d).ok)
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

/* ── Client assignment (Lead) ── */
export function getAssignments(_u: User): Assignment[] {
  // Lead can view all; admin too
  return store.assignments.slice();
}

export function setAssignment(u: User, supportId: string, klien: string[]): string {
  guard(u, 'client:assign');
  const target = store.users.find(x => x.id === supportId);
  if (!target || target.role !== 'support') throw new Rule('Target harus seorang Intake Support.');
  const existing = store.assignments.find(a => a.supportId === supportId);
  if (existing) {
    existing.klien = klien;
  } else {
    store.assignments.push({ id: `A-${store.assignments.length + 1}`, supportId, klien });
  }
  ev('admin', '', 'Penugasan klien diperbarui',
    `${target.name}: ${klien.length ? klien.join(', ') : 'tidak ada klien'}`, rLabel(u));
  return `Penugasan ${target.name} diperbarui.`;
}

/* ── Finance review ── */
export function getDocForReview(u: User, id: string): Doc {
  const d = findDoc(id);
  guard(u, 'doc:read:assigned', d);
  return structuredClone(d);
}

export function correctField(u: User, id: string, k: FieldKey, raw: string): string {
  const d   = findDoc(id);
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
  ev('doc', id, `Data dikoreksi: ${def.label}`, `Dari ${show(old)} menjadi ${show(nv)}.`, rLabel(u));
  return `Koreksi ${def.label} tersimpan.`;
}

export function decide(u: User, id: string, kind: 'approve' | 'reject' | 'return', why: string): string {
  const d = findDoc(id);
  guard(u, 'doc:decide:assigned', d);
  if (d.status !== 'Dalam Review') throw new Rule('Hanya dokumen Dalam Review yang bisa diputuskan.');

  if (kind === 'approve') {
    if (tally(validate(d.f, d.conf)).err) throw new Rule('Masih ada field bermasalah.');
    if (!d.tax) throw new Rule('Pajak belum diatur. Minta Intake Support menyelesaikannya.');
    d.voucherNo = issueVoucherNo(d.klien);
    d.status = 'Disetujui'; d.issue = '';
    ev('doc',      id, 'Hasil ekstraksi disetujui',              `Voucher ${d.voucherNo} diterbitkan.`,    rLabel(u));
    ev('workload', id, 'Tugas selesai',                           `Disetujui oleh ${u.name}.`,             rLabel(u));
    return `Disetujui. Voucher ${d.voucherNo} diterbitkan.`;
  }

  if (!why.trim()) throw new Rule('Tulis alasan agar Intake Support tahu apa yang perlu dilakukan.');

  if (kind === 'reject') {
    d.status = 'Ditolak'; d.issue = why.trim();
    ev('doc',      id, 'Dokumen ditolak',   `Alasan: ${why.trim()}`,       rLabel(u));
    ev('workload', id, 'Tugas selesai',      `Ditolak oleh ${u.name}.`,    rLabel(u));
    return 'Dokumen ditolak.';
  }

  // return
  d.status = 'Dikembalikan'; d.issue = why.trim(); d.note = '';
  ev('doc',      id, 'Dokumen dikembalikan ke Intake Support', `Alasan: ${why.trim()}`,         rLabel(u));
  ev('workload', id, 'Tugas dikembalikan',                      `Oleh ${u.name}.`,              rLabel(u));
  return 'Dokumen dikembalikan ke Intake Support untuk diperbaiki.';
}

/* ── Tax (Support) ── */
export function getTaxDoc(u: User, id: string): TaxDoc {
  const d = findDoc(id);
  guard(u, 'doc:tax:own', d);
  return { id: d.id, no: d.no, klien: d.klien, vendor: d.f.vendor,
    status: d.status, dpp: d.f.dpp, ppnInvoice: d.f.ppn,
    tax: d.tax ? structuredClone(d.tax) : null, approvers: d.approvers };
}

export function setTax(u: User, id: string, raw: Partial<TaxLine>[], approvers: 1 | 2): string {
  const d = findDoc(id);
  guard(u, 'doc:tax:own', d);
  if (d.status === 'Disetujui' || d.status === 'Ditolak')
    throw new Rule('Dokumen sudah selesai. Pajak tidak bisa diubah.');
  if (approvers !== 1 && approvers !== 2) throw new Rule('Penyetuju harus 1 atau 2 pihak.');
  const taxes = normalizeTaxes(raw);
  d.tax = taxes; d.approvers = approvers;
  const bd  = computeTaxes(d.f.dpp, taxes);
  const txt = taxes.map(t => `${t.label} ${t.rate}%`).join(', ') || 'Tanpa pajak';
  ev('doc', id, 'Pajak voucher diatur', `${txt}. Nominal voucher ${rp(bd.net)}.`, rLabel(u));
  return `Pajak tersimpan. Nominal voucher ${rp(bd.net)}.`;
}

/* ── Fix / resubmit ── */
export function getFixDoc(u: User, id: string): Doc {
  const d = findDoc(id);
  guard(u, 'doc:fix:own', d);
  return structuredClone(d);
}

export function correctFixField(u: User, id: string, k: FieldKey, raw: string): string {
  const d = findDoc(id);
  guard(u, 'doc:fix:own', d);
  if (d.status !== 'Dikembalikan') throw new Rule('Dokumen hanya bisa diperbaiki saat Dikembalikan.');
  return correctField(u, id, k, raw);
}

export function resubmit(u: User, id: string, note: string): string {
  const d = findDoc(id);
  guard(u, 'doc:fix:own', d);
  if (d.status !== 'Dikembalikan') throw new Rule('Hanya dokumen Dikembalikan yang bisa dikirim ulang.');
  if (tally(validate(d.f, d.conf)).err) throw new Rule('Masih ada field bermasalah.');
  if (!d.tax) throw new Rule('Pajak belum diatur.');
  d.status = 'Dalam Review'; d.issue = ''; d.note = String(note ?? '').slice(0, 300);
  ev('doc',      id, 'Dokumen diperbaiki dan dikirim ulang',
    `Ke ${uName(d.reviewer)}${d.note ? `. Catatan: ${d.note}` : '.'}`, rLabel(u));
  ev('workload', id, 'Tugas kembali ke Finance Reviewer',
    `Menunggu review ulang oleh ${uName(d.reviewer)}.`, 'Sistem', true);
  return `Dokumen dikirim ulang ke ${uName(d.reviewer)}.`;
}

/* ── Voucher ── */
export function vouchersFor(u: User): DocSummary[] {
  const perm = u.role === 'support' ? 'voucher:download:own' : 'voucher:read:assigned';
  guard(u, perm);
  return store.docs
    .filter(d => can(u, perm, d).ok && d.status === 'Disetujui')
    .map(summary);
}

export function getVoucher(u: User, id: string): VoucherData {
  const d    = findDoc(id);
  const perm = u.role === 'support' ? 'voucher:download:own' : 'voucher:read:assigned';
  guard(u, perm, d);
  if (d.status !== 'Disetujui') throw new Rule('Voucher baru terbit setelah disetujui Finance Reviewer.');

  const rows: VoucherRow[] = d.items.map((it, i) => ({
    no: i + 1, tgl: it.tgl ? safeDate(it.tgl) : '',
    ket: it.ket, jumlah: it.jumlah, harga: it.harga,
  }));
  if (!rows.length && d.f.dpp > 0)
    rows.push({ no: 1, tgl: safeDate(d.f.tgl), ket: 'Sesuai invoice', jumlah: '', harga: d.f.dpp });

  const diff = d.f.dpp - rows.reduce((s, r) => s + r.harga, 0);
  if (diff !== 0) rows.push({ no: rows.length + 1, tgl: '', ket: 'Penyesuaian DPP', jumlah: '', harga: diff });

  const bd = computeTaxes(d.f.dpp, d.tax ?? []);
  rows.push({ no: '', tgl: '', ket: 'Subtotal (DPP)', jumlah: '', harga: d.f.dpp, sub: true });
  bd.lines.forEach(l => rows.push({
    no: '', tgl: '', ket: `${l.label} (${l.kind === 'add' ? 'ditambahkan' : 'dipotong'})`,
    jumlah: `${l.rate}%`, harga: l.kind === 'add' ? l.amount : -l.amount, tax: true,
  }));

  const taxText = bd.lines.length
    ? bd.lines.map(l => `${l.label} ${l.rate}%: ${l.kind === 'add' ? '+ ' : '− '}${rp(l.amount)}`).join('; ')
    : 'Tanpa pajak';

  const dates = d.items.map(it => it.tgl).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  const from  = dates[0] ?? d.f.tgl;
  const to    = dates[dates.length - 1] ?? from;

  return {
    id: d.id, no: d.no, number: d.voucherNo, nomorUrut: d.nomorUrut,
    klien: d.klien, namaPT: d.namaPT, namaPIC: d.namaPIC,
    status: d.status, reviewer: uName(d.reviewer), submitter: uName(d.owner),
    nama: d.f.vendor, perusahaan: d.klien,
    periode: from === to ? safeDate(from) : `${safeDate(from)} – ${safeDate(to)}`,
    nominal: bd.net, dpp: d.f.dpp, add: bd.add, withhold: bd.withhold,
    taxText, rows, total: bd.net, approvers: d.approvers,
    f: { vendor: d.f.vendor, no: d.f.no, rek: d.f.rek, dpp: d.f.dpp, ppn: d.f.ppn, total: d.f.total },
  };
}

export function recordDownload(u: User, id: string): string {
  const d = findDoc(id);
  guard(u, 'voucher:download:own', d);
  if (d.status !== 'Disetujui') throw new Rule('Voucher belum disetujui Finance.');
  ev('doc', id, 'Voucher diunduh', `${d.voucherNo} diunduh sebagai PDF.`, rLabel(u));
  return 'Voucher siap dicetak atau disimpan sebagai PDF.';
}

/* ── Upload ── */
/** Returns clients assigned to this support user by Lead */
export function klienOptions(u: User): string[] {
  guard(u, 'doc:create');
  return assignedClients(u.id);
}

export interface UploadInput {
  klien: string;
  jenis: string;
  tgl: string;
  cat: string;
  tax: Partial<TaxLine>[];
  approvers: 1 | 2;
  fileName: string;
}

/** Create the document record immediately — robot extraction runs async */
export function createDoc(u: User, p: UploadInput): Doc {
  const client = store.clients.find(c => c.namaPT === p.klien);
  if (!client) throw new Rule('Klien tidak dikenal.');
  guard(u, 'doc:create');

  // Validate klien is assigned to this support
  const assigned = assignedClients(u.id);
  if (!assigned.includes(p.klien))
    throw new Rule(`Klien ${p.klien} belum ditugaskan kepada Anda.`);

  const taxes = normalizeTaxes(p.tax);
  if (p.approvers !== 1 && p.approvers !== 2) throw new Rule('Penyetuju harus 1 atau 2.');

  const cand = activeUsers('finance').filter(x => x.id !== u.id)
    .sort((a, b) => openTasks(a.id) - openTasks(b.id));
  if (!cand.length) throw new Rule('Belum ada Finance Reviewer aktif.');

  const id        = `D-${store.seq++}`;
  const nomorUrut = client.nextSequence++;
  const tgl       = p.tgl;
  const today     = todayISO();
  const fakeDpp   = 8_000_000;
  const a         = Math.round(fakeDpp * 0.7);
  const bd        = computeTaxes(fakeDpp, taxes);

  const doc: Doc = {
    id, no: `INV-${store.seq}`, nomorUrut,
    klien: p.klien, namaPT: client.namaPT, namaPIC: client.namaPIC,
    jenis: p.jenis, tgl,
    deadline: addDays(today, 7), status: 'Diproses',
    owner: u.id, uploader: u.id, reviewer: cand[0].id,
    issue: '', note: String(p.cat ?? '').slice(0, 300),
    f: { no: `INV-${store.seq}`, tgl, vendor: `${p.klien} (vendor)`,
         npwp: '06.789.012.3-456.000', dpp: fakeDpp, ppn: 880_000, total: 8_880_000,
         rek: 'BCA 1122334455' },
    conf: { no: 0.98, tgl: 0.97, vendor: 0.95, npwp: 0.93, dpp: 0.96, ppn: 0.94, total: 0.97, rek: 0.9 },
    src: { no: `INV-${store.seq}`, tgl, vendor: `${p.klien} (vendor)`,
           npwp: '06.789.012.3-456.000', dpp: fakeDpp, ppn: 880_000, total: 8_880_000,
           rek: 'BCA 1122334455' },
    hasFile: false,
    items: [
      { tgl, ket: 'Jasa layanan periode berjalan', jumlah: '1 paket', harga: a },
      { tgl, ket: 'Biaya tambahan',                jumlah: '1 paket', harga: fakeDpp - a },
    ],
    tax: taxes.length ? taxes : null,
    approvers: p.approvers,
    voucherNo: null,
  };
  store.docs.push(doc);

  ev('doc', id,
    'Dokumen diunggah',
    `File ${p.fileName}. Klien ${p.klien}, ${p.jenis}. Pajak: ${taxes.map(t => t.label).join(', ') || 'tanpa pajak'}. Nominal voucher: ${rp(bd.net)}.${p.cat ? ` Catatan: ${p.cat}` : ''}`,
    rLabel(u));

  // Simulate robot extraction after 2.6s
  setTimeout(() => {
    doc.status = 'Dalam Review';
    store.events.push({
      k: 'doc', d: id, t: stamp(), a: 'Robot Admin',
      w: 'Ekstraksi dan pemeriksaan aturan selesai',
      x: 'Semua aturan bisnis lolos. Dokumen masuk antrean Finance Reviewer.', bot: true,
    });
    store.events.push({
      k: 'workload', d: id, t: stamp(), a: 'Sistem',
      w: `Tugas ditugaskan ke ${uName(doc.reviewer)}`,
      x: `Tenggat ${dstr(doc.deadline)}.`, bot: true,
    });
  }, 2600);

  return doc;
}

/* ── Workload reassign ── */
export function reassign(u: User, id: string, to: string): string {
  const d = findDoc(id);
  guard(u, 'task:reassign');
  const t = store.users.find(x => x.id === to);
  if (!t || t.role !== 'finance') throw new Rule('Penerima harus seorang Finance Reviewer.');
  if (t.id === d.uploader) throw new Rule('Pemisahan tugas: reviewer tidak boleh sama dengan pengunggah.');
  const old = d.reviewer;
  d.reviewer = to;
  ev('workload', id, 'Tugas dialihkan', `Dari ${uName(old)} ke ${t.name}.`, rLabel(u));
  return `Tugas ${d.no} dialihkan ke ${t.name}.`;
}

/* ── Clients ── */
export function clientsFor(u: User): ClientSummary[] {
  guard(u, 'client:manage');
  return store.clients.map(c => {
    const ds = store.docs.filter(d => d.klien === c.namaPT);
    const assignees = store.assignments
      .filter(a => a.klien.includes(c.namaPT))
      .map(a => uName(a.supportId));
    return { name: c.namaPT, code: store.klienCode[c.namaPT] ?? '??', docs: ds.length, assignees };
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
  ev('admin', '', 'Klien ditambahkan', `${n} (kode voucher ${code}).`, rLabel(u));
  return `Klien ${n} ditambahkan.`;
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
  ev('admin', '', 'Peran diubah', `${t.name}: ${ROLE_LABEL[old]} → ${ROLE_LABEL[role]}.`, rLabel(u));
  return `Peran ${t.name} diperbarui.`;
}

export function createUser(u: User, f: { name: string; email: string; role: RoleKey; pw: string }): string {
  guard(u, 'user:manage');
  const name  = f.name.trim().slice(0, 60);
  const email = f.email.trim().toLowerCase();
  const pw    = f.pw ?? '';
  if (name.length < 3) throw new Rule('Isi nama lengkap (minimal 3 huruf).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Rule('Format email tidak valid.');
  if (store.users.some(x => x.email === email)) throw new Rule('Email sudah terdaftar.');
  if (!ROLE_LABEL[f.role]) throw new Rule('Pilih peran.');
  if (pw.length < 8) throw new Rule('Kata sandi awal minimal 8 karakter.');
  const id = `u${Date.now()}`;
  store.users.push({ id, name, role: f.role, about: 'Dibuat oleh System Admin.', email, status: 'Aktif' });
  store.creds.push({ id, email, pw });
  ev('admin', '', 'Akun pegawai dibuat', `${name} (${email}) — ${ROLE_LABEL[f.role]}.`, rLabel(u));
  return `Akun ${name} dibuat.`;
}

export function decideAccess(u: User, id: string, ok: boolean): string {
  guard(u, 'access:decide');
  const i = store.requests.findIndex(r => r.id === id);
  if (i < 0) throw new Rule('Permintaan tidak ditemukan.');
  const req = store.requests[i];
  store.requests.splice(i, 1);
  ev('admin', '', ok ? 'Permintaan disetujui' : 'Permintaan ditolak', req.text, rLabel(u));
  return ok ? 'Permintaan disetujui.' : 'Permintaan ditolak.';
}

/* ── Audit ── */
export function auditFor(u: User): AuditEvent[] {
  const perm = ({
    support: 'audit:read:own',
    finance: 'audit:read:assigned',
    lead:    'audit:read:workload',
    admin:   'audit:read:admin',
  } as Record<RoleKey, string>)[u.role];
  guard(u, perm);
  return store.events
    .filter(e => {
      if (u.role === 'lead')  return e.k === 'workload' || (e.k === 'admin' && e.w.includes('Penugasan'));
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
  const e   = email.trim().toLowerCase();
  if (!e || !pw) return { ok: false, msg: 'Isi email dan kata sandi.' };
  if (e.length > 200 || pw.length > 200) return { ok: false, msg: 'Email atau kata sandi salah.' };
  const now = Date.now();
  const att = store.attempts.get(e);
  if (att && att.until > now)
    return { ok: false, msg: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((att.until - now) / 1000)} detik.` };
  const cred = store.creds.find(c => c.email === e);
  const ok   = cred?.pw === pw;
  if (!cred || !ok) {
    const n = (att?.n ?? 0) + 1;
    store.attempts.set(e, n >= 5 ? { n: 0, until: now + 60_000 } : { n, until: 0 });
    return { ok: false, msg: 'Email atau kata sandi salah.' };
  }
  store.attempts.delete(e);
  const user = store.users.find(u => u.id === cred.id);
  if (!user)                    return { ok: false, msg: 'Akun tidak ditemukan.' };
  if (user.status === 'Menunggu') return { ok: false, msg: 'Akun masih menunggu persetujuan System Admin.' };
  if (user.status === 'Ditolak')  return { ok: false, msg: 'Akses akun ditolak. Hubungi System Admin.' };
  return { ok: true, user };
}
