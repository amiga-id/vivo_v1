import { ROLE_LABEL } from './constants';
import { stamp } from './format';
import { store } from './store';
import type { RoleKey, User } from './types';

export class Forbidden extends Error {
  constructor(m: string) { super(m); this.name = 'Forbidden'; }
}
export class Rule extends Error {
  constructor(m: string) { super(m); this.name = 'Rule'; }
}

export const PERMS: Record<RoleKey, string[]> = {
  support: [
    'queue:read:own',
    'doc:create',
    'doc:read:own',
    'doc:tax:own',
    'doc:fix:own',
    'voucher:download:own',
    'audit:read:own',
  ],
  finance: [
    'queue:read:assigned',
    'doc:read:assigned',
    'doc:correct:assigned',
    'doc:decide:assigned',
    'voucher:read:assigned',
    'audit:read:assigned',
  ],
  lead:  ['queue:read:workload', 'task:reassign', 'client:assign', 'audit:read:workload'],
  admin: ['queue:read:access', 'access:decide', 'user:manage', 'client:manage', 'audit:read:admin'],
};

export const SCOPE_TEXT: Record<string, string> = {
  own:      'dokumen dari klien yang ditugaskan kepada Anda',
  assigned: 'tugas review yang ditugaskan kepada Anda',
};

export interface ScopeTarget {
  no: string; klien: string; owner: string; uploader: string;
  reviewer?: string; status?: string;
}

export function activeUsers(role: RoleKey) {
  return store.users.filter(u => u.role === role && u.status === 'Aktif');
}

/** Returns client names assigned to a support user by Lead */
export function assignedClients(supportId: string): string[] {
  const a = store.assignments.find(x => x.supportId === supportId);
  return a?.klien ?? [];
}

export function inScope(u: User, doc: ScopeTarget, scope: string): boolean {
  if (scope === 'own') {
    // Support sees: docs they uploaded OR returned docs where they are uploader
    if (doc.uploader === u.id) return true;
    if (doc.status === 'Dikembalikan' && doc.owner === u.id) return true;
    return false;
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
      return { ok: false, why: `Dokumen ${doc.no} di luar cakupan akses Anda.` };
    }
  }
  return { ok: true };
}

export function logDeny(u: User, perm: string, why: string): void {
  store.events.push({
    k: 'security', d: '', t: stamp(),
    a: `${u.name} (${ROLE_LABEL[u.role]})`,
    w: `Akses ditolak: ${perm}`, x: why,
  });
}

export function guard(u: User, perm: string, doc?: ScopeTarget | null): void {
  const r = can(u, perm, doc);
  if (!r.ok) {
    const why = r.why ?? 'Akses ditolak.';
    logDeny(u, perm, why);
    throw new Forbidden(why);
  }
}
