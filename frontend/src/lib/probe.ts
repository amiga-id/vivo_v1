import type { RoleKey } from './types';

export interface ProbeDef {
  label: string;
  docId: string | null;
  perm: string | ((role: RoleKey) => string);
}

const readPerm = (r: RoleKey): string =>
  ({ support: 'doc:read:delegated', finance: 'doc:read:assigned', lead: 'doc:read:own', admin: 'doc:read:own' })[r];

/** Uji kebijakan: hanya keputusan, tidak mengubah data. */
export const PROBES: ProbeDef[] = [
  { label: 'Baca dokumen D-1041 (PT Maju Jaya)', docId: 'D-1041', perm: readPerm },
  { label: 'Baca dokumen D-1043 (PT Karya Nusa)', docId: 'D-1043', perm: readPerm },
  { label: 'Setujui hasil ekstraksi D-1041', docId: 'D-1041', perm: 'doc:decide:assigned' },
  { label: 'Unduh voucher D-1039', docId: 'D-1039', perm: 'voucher:download:own' },
  { label: 'Alihkan tugas D-1041', docId: null, perm: 'task:reassign' },
  { label: 'Ubah peran pengguna', docId: null, perm: 'user:manage' },
  { label: 'Baca seluruh riwayat audit sistem', docId: null, perm: 'audit:read:all' },
];
