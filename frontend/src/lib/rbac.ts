import { ROLE_LABEL } from './constants';
import { stamp } from './format';
import { store } from './store';
import type { RoleKey, User } from './types';

/** Ditolak oleh kebijakan akses (HTTP 403). */
export class Forbidden extends Error {
  constructor(m: string) {
    super(m);
    this.name = 'Forbidden';
  }
}
/** Pelanggaran aturan bisnis biasa (bukan masalah akses). */
export class Rule extends Error {
  constructor(m: string) {
    super(m);
    this.name = 'Rule';
  }
}

export const PERMS: Record<RoleKey, string[]> = {
  support: ['queue:read:delegated', 'doc:create:delegated', 'doc:read:delegated', 'voucher:download:own', 'audit:read:delegated'],
  finance: [
    'queue:read:assigned', 'doc:read:assigned', 'doc:correct:assigned', 'doc:decide:assigned',
    'voucher:read:assigned', 'audit:read:assigned',
  ],
  lead: ['queue:read:workload', 'task:reassign', 'audit:read:workload'],
  admin: ['queue:read:access', 'access:decide', 'user:manage', 'delegation:manage', 'client:manage', 'audit:read:admin'],
};

export const SCOPE_TEXT: Record<string, string> = {
  own: 'dokumen klien yang Anda tangani',
  delegated: 'klien yang didelegasikan kepada Anda',
  assigned: 'tugas review yang ditugaskan kepada Anda',
};

/** Sasaran pemeriksaan cakupan. Doc asli memenuhi bentuk ini. */
export interface ScopeTarget {
  no: string;
  klien: string;
  owner: string;
  uploader: string;
  reviewer?: string;
}

export function activeDelegations(uid: string) {
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  return store.deleg.filter((g) => g.support === uid && g.active && g.expires >= today);
}

export function inScope(u: User, doc: ScopeTarget, scope: string): boolean {
  if (scope === 'own') return doc.owner === u.id;
  if (scope === 'delegated') {
    return activeDelegations(u.id).some((g) => g.support === doc.owner && g.klien.includes(doc.klien)) || doc.owner === u.id;
  }
  if (scope === 'assigned') return doc.reviewer === u.id;
  return false;
}

export function can(u: User, perm: string, doc?: ScopeTarget | null): { ok: boolean; why?: string } {
  if (!PERMS[u.role].includes(perm)) {
    return { ok: false, why: `Peran ${ROLE_LABEL[u.role]} tidak memiliki izin "${perm}".` };
  }
  const scope = perm.split(':')[2];
  if (doc && SCOPE_TEXT[scope]) {
    if (u.role === 'finance' && doc.uploader === u.id) {
      return { ok: false, why: `Pemisahan tugas: Anda pengunggah dokumen ${doc.no}.` };
    }
    if (!inScope(u, doc, scope)) {
      return { ok: false, why: `Dokumen ${doc.no} di luar cakupan akses Anda (${SCOPE_TEXT[scope]}).` };
    }
  }
  return { ok: true };
}

export function logDeny(u: User, perm: string, why: string): void {
  store.events.push({
    k: 'security', d: '', t: stamp(), a: `${u.name} (${ROLE_LABEL[u.role]})`, w: `Akses ditolak: ${perm}`, x: why,
  });
}

/** Periksa izin. Jika ditolak: catat ke audit dan lempar Forbidden. */
export function guard(u: User, perm: string, doc?: ScopeTarget | null): void {
  const r = can(u, perm, doc);
  if (!r.ok) {
    const why = r.why ?? 'Akses ditolak.';
    logDeny(u, perm, why);
    throw new Forbidden(why);
  }
}
