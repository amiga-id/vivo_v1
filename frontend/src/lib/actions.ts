'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authenticate } from './auth';
import { PROBES } from './probe';
import { Forbidden, Rule } from './rbac';
import * as svc from './services';
import { createSession, destroySession, getUser, homeOf } from './session';
import { store } from './store';
import type { ActionResult, FieldKey, RoleKey, User } from './types';

/** Jalankan aksi sebagai pengguna yang sedang masuk. Kebijakan akses diperiksa di services. */
async function run(fn: (u: User) => string | Promise<string>): Promise<ActionResult> {
  const u = await getUser();
  if (!u) return { ok: false, msg: '401 Belum masuk. Silakan masuk kembali.' };
  try {
    const msg = await fn(u);
    revalidatePath('/', 'layout');
    return { ok: true, msg };
  } catch (e) {
    revalidatePath('/', 'layout');
    if (e instanceof Forbidden) return { ok: false, msg: `403 Ditolak. ${e.message}` };
    if (e instanceof Rule) return { ok: false, msg: e.message };
    console.error(e);
    return { ok: false, msg: 'Terjadi kendala di server. Coba lagi.' };
  }
}

/* ---- sesi ---- */
export async function signIn(email: string, password: string): Promise<{ ok: boolean; msg: string; to?: string }> {
  const r = authenticate(email, password);
  if (!r.ok) return { ok: false, msg: r.msg };
  await createSession(r.user.id);
  return { ok: true, msg: 'Berhasil masuk.', to: homeOf(r.user.role) };
}

export async function logout(): Promise<void> {
  destroySession();
  redirect('/');
}

/* ---- Finance Reviewer ---- */
export async function correctField(id: string, k: FieldKey, raw: string): Promise<ActionResult> {
  return run((u) => svc.correctField(u, id, k, raw));
}
export async function decideDoc(id: string, kind: 'approve' | 'reject' | 'reqinfo', why: string): Promise<ActionResult> {
  return run((u) => svc.decide(u, id, kind, why));
}

/* ---- Intake Support ---- */
export async function downloadVoucher(id: string): Promise<ActionResult> {
  return run((u) => svc.recordDownload(u, id));
}

export async function fixDocument(docId: string, formData: FormData): Promise<ActionResult> {
  return run(async (u) => {
    const file = formData.get('file');
    const hasFile = file instanceof File && file.size > 0;
    
    const { doc, mode } = await svc.fixRejectedDoc(u, {
      docId,
      file: hasFile ? { name: (file as File).name, bytes: Buffer.from(await (file as File).arrayBuffer()) } : undefined,
      cat: String(formData.get('cat') ?? '').trim(),
    });
    
    if (hasFile) {
      const how = mode === 'bedrock' ? 'Amazon Bedrock' : 'ekstraksi simulasi';
      return doc.status === 'Dalam Review'
        ? `Dokumen berhasil diperbaiki. Robot Admin selesai membaca file (${how}) dan meneruskannya ke Finance.`
        : 'Dokumen diunggah ulang, tetapi ada kendala pada pemeriksaan. Periksa kembali data yang ditandai.';
    } else {
      return 'Dokumen berhasil diperbaiki dan dikembalikan ke Finance untuk review ulang.';
    }
  });
}


/* ---- Intake Support ---- */
export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  return run(async (u) => {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Rule('Pilih file PDF invoice terlebih dulu.');
    const need = (k: string) => {
      const v = String(formData.get(k) ?? '').trim();
      if (!v) throw new Rule(`Lengkapi data: ${k}.`);
      return v;
    };
    const { doc, mode } = await svc.createDocFromUpload(u, {
      klien: need('klien'), jenis: need('jenis'), jenisPajak: need('jenisPajak'), saluran: need('saluran'), tgl: need('tgl'),
      cat: String(formData.get('cat') ?? '').trim(),
      file: { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) },
    });
    const how = mode === 'bedrock' ? 'Amazon Bedrock' : 'ekstraksi simulasi';
    return doc.status === 'Dalam Review'
      ? `Dokumen terkirim. Robot Admin selesai membaca file (${how}) dan meneruskannya ke Finance.`
      : 'Dokumen terkirim, tetapi ada kendala pada pemeriksaan. Lihat antrean Anda.';
  });
}

/* ---- Service Lead ---- */
export async function reassignTask(id: string, to: string): Promise<ActionResult> {
  return run((u) => svc.reassign(u, id, to));
}

/* ---- System Admin ---- */
export async function changeRole(uid: string, role: RoleKey): Promise<ActionResult> {
  return run((u) => svc.setRole(u, uid, role));
}
export async function toggleDelegation(id: string): Promise<ActionResult> {
  return run((u) => svc.toggleDelegation(u, id));
}
export async function decideAccessRequest(id: string, ok: boolean): Promise<ActionResult> {
  return run((u) => svc.decideAccess(u, id, ok));
}

/* ---- System Admin - Manajemen Klien ---- */
export async function addNewClient(formData: FormData): Promise<ActionResult> {
  return run((u) => {
    const need = (k: string) => {
      const v = String(formData.get(k) ?? '').trim();
      if (!v) throw new Rule(`Lengkapi data: ${k}.`);
      return v;
    };
    return svc.addClient(u, {
      namaPT: need('namaPT'),
      namaPIC: need('namaPIC'),
      email: need('email'),
      phone: String(formData.get('phone') ?? '').trim(),
      address: String(formData.get('address') ?? '').trim(),
    });
  });
}

/* ---- uji kebijakan ---- */
export async function runProbe(index: number): Promise<{ ok: boolean; why?: string; label: string }> {
  const u = await getUser();
  if (!u) return { ok: false, why: 'Belum masuk.', label: '' };
  const r = svc.probe(u, index);
  return { ok: r.ok, why: r.why, label: PROBES[index].label };
}
