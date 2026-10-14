import type { RoleKey } from './types';
export interface ProbeDef { label: string; docId: string | null; perm: string | ((role: RoleKey) => string); }

const readPerm = (r: RoleKey): string => ({
  support: 'doc:read:own', finance: 'doc:read:assigned',
  lead: 'doc:read:own', admin: 'doc:read:own',
}[r] ?? 'doc:read:own');

export const PROBES: ProbeDef[] = [
  { label: 'Baca dokumen D-1041',                 docId: 'D-1041', perm: readPerm },
  { label: 'Atur pajak dokumen D-1041',            docId: 'D-1041', perm: 'doc:tax:own' },
  { label: 'Setujui hasil ekstraksi D-1041',       docId: 'D-1041', perm: 'doc:decide:assigned' },
  { label: 'Unduh voucher D-1039',                 docId: 'D-1039', perm: 'voucher:download:own' },
  { label: 'Alihkan tugas D-1041',                 docId: null,     perm: 'task:reassign' },
  { label: 'Assign klien ke support',              docId: null,     perm: 'client:assign' },
  { label: 'Ubah peran pengguna',                  docId: null,     perm: 'user:manage' },
  { label: 'Tambah klien baru',                    docId: null,     perm: 'client:manage' },
];
