import { extractInvoice } from './bedrock';
import { FIELDS, KLIEN_OWNER, ROLE_LABEL } from './constants';
import { addDays, dstr, rp, stamp, todayISO } from './format';
import { activeDelegations, can, Forbidden, guard, logDeny, Rule } from './rbac';
import { store } from './store';
import { PROBES } from './probe';
import { tally, validate } from './validate';
import type {
  AccessRequest, AuditEvent, Delegation, Doc, DocSummary, FieldKey, RoleKey, User, VoucherData, WorkloadRow,
} from './types';

/**
 * Lapisan layanan. SEMUA akses data lewat sini dan selalu menerima pengguna yang sedang masuk.
 * Setiap fungsi memeriksa izin (guard) sebelum menyentuh data, dan mengembalikan bentuk data
 * sesuai peran. Di produksi, fungsi-fungsi ini berjalan di server (route handler/Lambda).
 */
const label = (u: User) => `${u.name} (${ROLE_LABEL[u.role]})`;
const userName = (id: string) => store.users.find((x) => x.id === id)?.name ?? id;
const findDoc = (id: string): Doc => {
  const d = store.docs.find((x) => x.id === id);
  if (!d) throw new Rule('Dokumen tidak ditemukan.');
  return d;
};
const ev = (k: AuditEvent['k'], d: string, w: string, x: string, a: string, bot = false) =>
  store.events.push({ k, d, t: stamp(), a, w, x, bot });
const summary = (d: Doc): DocSummary => ({
  id: d.id, no: d.no, nomorUrut: d.nomorUrut, klien: d.klien, namaPT: d.namaPT, namaPIC: d.namaPIC, 
  jenis: d.jenis, jenisPajak: d.jenisPajak, saluran: d.saluran, deadline: d.deadline, status: d.status,
  issue: d.issue, uploader: d.uploader, owner: d.owner, reviewer: d.reviewer,
});
const openTasks = (uid: string) =>
  store.docs.filter((d) => d.reviewer === uid && ['Dalam Review', 'Perlu Tindakan', 'Diproses'].includes(d.status)).length;

/* ---------------- antrean kerja ---------------- */
export function queueFor(u: User): DocSummary[] {
  const perm = ({ support: 'queue:read:delegated', finance: 'queue:read:assigned' } as Partial<Record<RoleKey, string>>)[u.role];
  if (!perm) throw new Forbidden('Peran Anda tidak memiliki antrean dokumen.');
  guard(u, perm);
  return store.docs
    .filter((d) => can(u, perm, d).ok && (u.role !== 'finance' || ['Dalam Review', 'Perlu Tindakan'].includes(d.status)))
    .map(summary);
}

export function workloadFor(u: User): WorkloadRow[] {
  guard(u, 'queue:read:workload');
  return store.docs.map((d) => ({
    id: d.id, no: d.no, klien: d.klien, jenis: d.jenis, deadline: d.deadline, status: d.status,
    reviewer: d.reviewer, uploader: d.uploader, conflict: d.reviewer === d.uploader,
  }));
}

export function requestsFor(u: User): AccessRequest[] {
  guard(u, 'queue:read:access');
  return store.requests.slice();
}

export function delegationsFor(u: User): Delegation[] {
  if (u.role === 'support') return store.deleg.filter((g) => g.support === u.id);
  guard(u, 'delegation:manage');
  return store.deleg.slice();
}

export const financeUsers = (): { id: string; name: string }[] =>
  store.users.filter((x) => x.role === 'finance').map((x) => ({ id: x.id, name: x.name }));

/* ---------------- review (Finance Reviewer) ---------------- */
export function getDocForReview(u: User, id: string): Doc {
  const d = findDoc(id);
  guard(u, 'doc:read:assigned', d);
  return structuredClone(d);
}

export function correctField(u: User, id: string, k: FieldKey, raw: string): string {
  const d = findDoc(id);
  guard(u, 'doc:correct:assigned', d);
  const def = FIELDS.find((x) => x.k === k);
  if (!def) throw new Rule('Field tidak dikenal.');
  const old = d.f[k];
  let nv: string | number = raw.trim();
  if (def.type === 'num') {
    const dg = raw.replace(/\D/g, '');
    nv = dg === '' ? 0 : Number(dg);
  }
  if (String(old) === String(nv)) return 'Tidak ada perubahan.';
  (d.f as unknown as Record<FieldKey, string | number>)[k] = nv;
  d.conf[k] = 1;
  const show = (v: string | number) => (def.type === 'num' ? rp(v) : String(v));
  ev('doc', id, `Data dikoreksi: ${def.label}`, `Dari ${show(old)} menjadi ${show(nv)}.`, label(u));
  return `Koreksi ${def.label} tersimpan.`;
}

export function decide(u: User, id: string, kind: 'approve' | 'reject' | 'reqinfo', why: string): string {
  const d = findDoc(id);
  guard(u, 'doc:decide:assigned', d);
  if (kind === 'approve') {
    if (tally(validate(d.f, d.conf)).err) throw new Rule('Masih ada field bermasalah. Selesaikan dulu sebelum menyetujui.');
    d.status = 'Disetujui';
    d.issue = '';
    ev('doc', id, 'Hasil ekstraksi disetujui', 'Voucher siap diunduh oleh Intake Support.', label(u));
    ev('workload', id, 'Tugas selesai', `Disetujui oleh ${u.name}.`, label(u));
    return 'Disetujui. Voucher siap diunduh Intake Support.';
  }
  if (!why.trim()) throw new Rule('Tulis alasan agar klien tahu apa yang perlu dilakukan.');
  if (kind === 'reject') {
    d.status = 'Perlu Tindakan';
    d.issue = why.trim();
    ev('doc', id, 'Dokumen ditolak, dikembalikan ke Intake Support', `Alasan: ${why.trim()}`, label(u));
    ev('workload', id, 'Tugas dikembalikan', `Ditolak oleh ${u.name}, dikembalikan ke Intake Support untuk perbaikan.`, label(u));
    return 'Dokumen dikembalikan ke Intake Support untuk perbaikan.';
  }
  d.status = 'Perlu Tindakan';
  d.issue = why.trim();
  ev('doc', id, 'Meminta informasi tambahan dari klien', `Permintaan: ${why.trim()}`, label(u));
  return 'Permintaan informasi dikirim ke klien.';
}

export function fileFor(u: User, id: string): { name: string; bytes: Buffer } {
  const d = findDoc(id);
  guard(u, u.role === 'finance' ? 'doc:read:assigned' : u.role === 'support' ? 'doc:read:delegated' : 'doc:read:own', d);
  const f = store.files.get(id);
  if (!f) throw new Rule('File asli tidak tersedia untuk dokumen ini.');
  return f;
}

/* ---------------- voucher ---------------- */
export function vouchersFor(u: User): DocSummary[] {
  const perm = u.role === 'support' ? 'voucher:download:own' : 'voucher:read:assigned';
  guard(u, perm);
  return store.docs
    .filter((d) => can(u, perm, d).ok && (u.role === 'support' ? d.status === 'Disetujui' : ['Disetujui', 'Dalam Review'].includes(d.status)))
    .map(summary);
}

export function getVoucher(u: User, id: string): VoucherData {
  const d = findDoc(id);
  guard(u, u.role === 'support' ? 'voucher:download:own' : 'voucher:read:assigned', d);
  return {
    id: d.id, no: d.no, nomorUrut: d.nomorUrut, klien: d.klien, namaPT: d.namaPT, namaPIC: d.namaPIC,
    status: d.status, reviewer: userName(d.reviewer),
    f: { vendor: d.f.vendor, no: d.f.no, rek: d.f.rek, dpp: d.f.dpp, ppn: d.f.ppn, total: d.f.total },
  };
}

export function recordDownload(u: User, id: string): string {
  const d = findDoc(id);
  guard(u, 'voucher:download:own', d);
  if (d.status !== 'Disetujui') throw new Rule('Voucher belum disetujui Finance.');
  ev('doc', id, 'Voucher diunduh', `VCH-2026-${id.slice(2)} diunduh sebagai PDF.`, label(u));
  return 'Voucher siap dicetak atau disimpan sebagai PDF.';
}

/* ---------------- unggah ---------------- */
export function klienOptions(u: User): string[] {
  guard(u, 'doc:create:delegated');
  const s = new Set<string>();
  activeDelegations(u.id).forEach((g) => g.klien.forEach((k) => s.add(k)));
  // Intake support juga bisa upload untuk klien yang mereka miliki langsung dari KLIEN_OWNER
  store.clients.filter((c) => KLIEN_OWNER[c.namaPT] === u.id).forEach((c) => s.add(c.namaPT));
  return [...s];
}

export interface UploadInput {
  klien: string; jenis: string; jenisPajak: string; saluran: string; tgl: string; cat: string;
  file: { name: string; bytes: Buffer };
}

export async function createDocFromUpload(u: User, p: UploadInput): Promise<{ doc: Doc; mode: string }> {
  // Cari owner dari KLIEN_OWNER untuk backward compatibility
  const owner = KLIEN_OWNER[p.klien] || 'dewi'; // default owner jika tidak ditemukan
  
  // Cari data client
  const client = store.clients.find((c) => c.namaPT === p.klien);
  if (!client) throw new Rule('Data klien tidak ditemukan.');
  
  guard(u, 'doc:create:delegated', { no: p.klien, klien: p.klien, owner, uploader: u.id });
  
  if (!/\.pdf$/i.test(p.file.name) || p.file.bytes.subarray(0, 4).toString() !== '%PDF') throw new Rule('File harus berformat PDF.');
  if (p.file.bytes.length > 10 * 1024 * 1024) throw new Rule('Ukuran file maksimal 10 MB.');

  const cand = store.users.filter((x) => x.role === 'finance' && x.id !== u.id).sort((a, b) => openTasks(a.id) - openTasks(b.id));
  if (!cand.length) throw new Rule('Belum ada Finance Reviewer yang tersedia.');
  const id = `D-${store.seq++}`;
  
  // Generate nomor urut untuk klien ini
  const nomorUrut = client.nextSequence;
  client.nextSequence += 1;

  let doc: Doc;
  let mode = 'simulasi';
  const botName = 'Robot Admin';
  try {
    const ex = await extractInvoice(p.file.bytes, p.klien);
    mode = ex.mode;
    const bad = tally(validate(ex.f, ex.conf)).err > 0;
    doc = {
      id, no: ex.f.no || id, nomorUrut, klien: p.klien, namaPT: client.namaPT, namaPIC: client.namaPIC, 
      jenis: p.jenis, jenisPajak: p.jenisPajak, saluran: p.saluran, tgl: p.tgl,
      deadline: addDays(todayISO(), 7), status: bad ? 'Perlu Tindakan' : 'Dalam Review', owner, uploader: u.id,
      reviewer: cand[0].id, issue: bad ? 'Ada field yang gagal aturan bisnis. Periksa dan unggah ulang bila perlu.' : '',
      f: ex.f, conf: ex.conf, src: { ...ex.f }, hasFile: true,
    };
    store.docs.push(doc);
    store.files.set(id, p.file);
    ev('doc', id, 'Dokumen diunggah untuk klien',
      `File ${p.file.name}. Klien: ${client.namaPT} (PIC: ${client.namaPIC}). Nomor urut: ${nomorUrut}. Metadata: ${p.jenis}, pajak ${p.jenisPajak}, saluran ${p.saluran}${p.cat ? `. Catatan: ${p.cat}` : '.'}`, label(u));
    ev('doc', id, bad ? 'Aturan bisnis ditandai' : 'Ekstraksi dan pemeriksaan aturan selesai',
      bad ? 'Satu atau lebih aturan gagal.' : `Semua aturan bisnis lolos (mesin: ${mode === 'bedrock' ? 'Amazon Bedrock' : 'simulasi'}).`, botName, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'kesalahan tidak diketahui';
    const empty = { no: id, tgl: p.tgl, vendor: '', npwp: '', dpp: 0, ppn: 0, total: 0, rek: '' };
    const zero = { no: 0, tgl: 0, vendor: 0, npwp: 0, dpp: 0, ppn: 0, total: 0, rek: 0 };
    doc = {
      id, no: id, nomorUrut, klien: p.klien, namaPT: client.namaPT, namaPIC: client.namaPIC, 
      jenis: p.jenis, jenisPajak: p.jenisPajak, saluran: p.saluran, tgl: p.tgl, deadline: addDays(todayISO(), 7),
      status: 'Perlu Tindakan', owner, uploader: u.id, reviewer: cand[0].id,
      issue: 'Ekstraksi otomatis gagal. Unggah ulang atau minta reviewer mengisi manual.',
      f: empty, conf: zero, src: { ...empty }, hasFile: true,
    };
    store.docs.push(doc);
    store.files.set(id, p.file);
    ev('doc', id, 'Dokumen diunggah', `File ${p.file.name}.`, label(u));
    ev('doc', id, 'Ekstraksi gagal', msg, botName, true);
  }
  ev('workload', id, `Tugas ditugaskan ke ${userName(doc.reviewer)}`, `Tenggat ${dstr(doc.deadline)}.`, botName, true);
  return { doc, mode };
}

/* ---------------- Service Lead ---------------- */
export function reassign(u: User, id: string, to: string): string {
  const d = findDoc(id);
  guard(u, 'task:reassign');
  const t = store.users.find((x) => x.id === to);
  if (!t || t.role !== 'finance') throw new Rule('Penerima harus seorang Finance Reviewer.');
  if (t.id === d.uploader) throw new Rule('Pemisahan tugas: reviewer tidak boleh sama dengan pengunggah.');
  const old = d.reviewer;
  d.reviewer = to;
  ev('workload', id, 'Tugas dialihkan', `Dari ${userName(old)} ke ${t.name}.`, label(u));
  return `Tugas ${d.no} dialihkan ke ${t.name}.`;
}

/* ---------------- System Admin ---------------- */
export function usersFor(u: User): { id: string; name: string; role: RoleKey }[] {
  guard(u, 'user:manage');
  return store.users.map((x) => ({ id: x.id, name: x.name, role: x.role }));
}

export function setRole(u: User, uid: string, role: RoleKey): string {
  guard(u, 'user:manage');
  if (uid === u.id) throw new Rule('Anda tidak bisa mengubah peran akun sendiri.');
  if (!(role in ROLE_LABEL)) throw new Rule('Peran tidak dikenal.');
  const t = store.users.find((x) => x.id === uid);
  if (!t) throw new Rule('Pengguna tidak ditemukan.');
  const old = t.role;
  t.role = role;
  ev('admin', '', 'Peran diubah', `Akun ${t.name}: ${ROLE_LABEL[old]} menjadi ${ROLE_LABEL[role]}.`, label(u));
  return `Peran ${t.name} diperbarui.`;
}

export function toggleDelegation(u: User, id: string): string {
  guard(u, 'delegation:manage');
  const g = store.deleg.find((x) => x.id === id);
  if (!g) throw new Rule('Delegasi tidak ditemukan.');
  g.active = !g.active;
  ev('admin', '', g.active ? 'Delegasi diaktifkan' : 'Delegasi dicabut',
    `Delegasi ${userName(g.support)} dari ${userName(g.pic)} (${g.klien.join(', ')}).`, label(u));
  return g.active ? 'Delegasi diaktifkan.' : 'Delegasi dicabut. Akses langsung ditutup.';
}

export function decideAccess(u: User, id: string, ok: boolean): string {
  guard(u, 'access:decide');
  const i = store.requests.findIndex((r) => r.id === id);
  if (i < 0) throw new Rule('Permintaan tidak ditemukan.');
  const r = store.requests[i];
  if (ok && r.type === 'deleg') {
    store.deleg.push({ id: `DL-${store.deleg.length + 1}`, support: 'andi', pic: 'eko', klien: ['PT Karya Nusa'], expires: addDays(todayISO(), 90), active: true });
  }
  if (ok && r.type === 'extend' && store.deleg[0]) store.deleg[0].expires = addDays(store.deleg[0].expires, 30);
  store.requests.splice(i, 1);
  ev('admin', '', ok ? 'Permintaan akses disetujui' : 'Permintaan akses ditolak', r.text, label(u));
  return ok ? 'Permintaan disetujui.' : 'Permintaan ditolak.';
}

/* ---------------- riwayat audit ---------------- */
export function auditFor(u: User): AuditEvent[] {
  const perm = ({
    support: 'audit:read:delegated', finance: 'audit:read:assigned',
    lead: 'audit:read:workload', admin: 'audit:read:admin',
  } as Record<RoleKey, string>)[u.role];
  guard(u, perm);
  return store.events
    .filter((e) => {
      if (u.role === 'lead') return e.k === 'workload';
      if (u.role === 'admin') return e.k === 'admin' || e.k === 'security';
      if (e.k !== 'doc') return false;
      const d = store.docs.find((x) => x.id === e.d);
      return !!d && can(u, perm, d).ok;
    })
    .slice()
    .reverse();
}

export const docLabel = (id: string): string => {
  const d = store.docs.find((x) => x.id === id);
  return d ? `${d.no} - ${d.klien}` : id;
};

/* ---------------- uji kebijakan ---------------- */
export function probe(u: User, index: number): { ok: boolean; why?: string } {
  const p = PROBES[index];
  if (!p) throw new Rule('Uji tidak dikenal.');
  const perm = typeof p.perm === 'function' ? p.perm(u.role) : p.perm;
  const d = p.docId ? store.docs.find((x) => x.id === p.docId) : null;
  const r = can(u, perm, d);
  if (!r.ok) logDeny(u, perm, r.why ?? '');
  return r;
}

/* ---------------- manajemen klien ---------------- */
export function clientsFor(u: User) {
  // Hanya System Admin dan Intake Support yang bisa melihat daftar klien
  if (u.role !== 'admin' && u.role !== 'support') throw new Forbidden('Anda tidak memiliki akses ke manajemen klien.');
  return store.clients.slice();
}

export interface ClientInput {
  namaPT: string;
  namaPIC: string;
  email: string;
  phone: string;
  address: string;
}

export function addClient(u: User, input: ClientInput): string {
  guard(u, 'client:manage');
  
  // Validasi input
  if (!input.namaPT.trim()) throw new Rule('Nama PT wajib diisi.');
  if (!input.namaPIC.trim()) throw new Rule('Nama PIC wajib diisi.');
  if (!input.email.trim()) throw new Rule('Email wajib diisi.');
  
  // Cek duplikasi nama PT
  if (store.clients.some((c) => c.namaPT === input.namaPT)) {
    throw new Rule('Nama PT sudah terdaftar.');
  }
  
  const id = `CL-${store.clients.length + 1}`;
  const newClient = {
    id,
    namaPT: input.namaPT.trim(),
    namaPIC: input.namaPIC.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    nextSequence: 1,
  };
  
  store.clients.push(newClient);
  
  // Update KLIEN_OWNER untuk backward compatibility
  // Assign ke user yang menambahkan (biasanya admin atau support yang menginput)
  KLIEN_OWNER[newClient.namaPT] = u.id;
  
  ev('admin', '', 'Klien baru ditambahkan', `${newClient.namaPT} (PIC: ${newClient.namaPIC})`, label(u));
  
  return `Klien ${newClient.namaPT} berhasil ditambahkan.`;
}


/* ---------------- perbaikan dokumen yang ditolak ---------------- */
export interface FixDocInput {
  docId: string;
  file?: { name: string; bytes: Buffer };
  cat: string;
}

export async function fixRejectedDoc(u: User, input: FixDocInput): Promise<{ doc: Doc; mode: string }> {
  const d = findDoc(input.docId);
  
  // Hanya Intake Support yang bisa memperbaiki dokumen yang ditolak
  guard(u, 'doc:read:delegated', d);
  
  if (d.status !== 'Perlu Tindakan') {
    throw new Rule('Dokumen ini tidak memerlukan perbaikan.');
  }
  
  // Jika ada file baru, proses ulang
  if (input.file) {
    if (!/\.pdf$/i.test(input.file.name) || input.file.bytes.subarray(0, 4).toString() !== '%PDF') {
      throw new Rule('File harus berformat PDF.');
    }
    if (input.file.bytes.length > 10 * 1024 * 1024) {
      throw new Rule('Ukuran file maksimal 10 MB.');
    }
    
    let mode = 'simulasi';
    const botName = 'Robot Admin';
    
    try {
      const ex = await extractInvoice(input.file.bytes, d.klien);
      mode = ex.mode;
      const bad = tally(validate(ex.f, ex.conf)).err > 0;
      
      // Update dokumen dengan hasil ekstraksi baru
      d.f = ex.f;
      d.conf = ex.conf;
      d.src = { ...ex.f };
      d.status = bad ? 'Perlu Tindakan' : 'Dalam Review';
      d.issue = bad ? 'Ada field yang gagal aturan bisnis setelah re-upload.' : '';
      d.hasFile = true;
      
      store.files.set(d.id, input.file);
      
      ev('doc', d.id, 'Dokumen diperbaiki dan diunggah ulang',
        `File baru: ${input.file.name}${input.cat ? `. Catatan: ${input.cat}` : '.'}`, label(u));
      ev('doc', d.id, bad ? 'Aturan bisnis ditandai' : 'Ekstraksi dan pemeriksaan aturan selesai',
        bad ? 'Satu atau lebih aturan gagal.' : `Semua aturan bisnis lolos (mesin: ${mode === 'bedrock' ? 'Amazon Bedrock' : 'simulasi'}).`, botName, true);
      
      if (!bad) {
        ev('workload', d.id, 'Dokumen siap direview ulang', `Dokumen diperbaiki oleh ${u.name}, diteruskan ke ${userName(d.reviewer)}.`, label(u));
      }
      
      return { doc: d, mode };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'kesalahan tidak diketahui';
      throw new Rule(`Ekstraksi gagal: ${msg}`);
    }
  } else {
    // Jika tidak ada file baru, hanya update catatan dan kembalikan ke reviewer
    d.status = 'Dalam Review';
    d.issue = '';
    
    ev('doc', d.id, 'Dokumen diperbaiki tanpa file baru',
      `Intake Support melakukan perbaikan metadata${input.cat ? `. Catatan: ${input.cat}` : '.'}`, label(u));
    ev('workload', d.id, 'Dokumen siap direview ulang', `Dokumen diperbaiki oleh ${u.name}, diteruskan ke ${userName(d.reviewer)}.`, label(u));
    
    return { doc: d, mode: 'manual' };
  }
}
