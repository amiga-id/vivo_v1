export type RoleKey = 'support' | 'finance' | 'lead' | 'admin';
export type Status = 'Diproses' | 'Dalam Review' | 'Perlu Tindakan' | 'Disetujui' | 'Ditolak';
export type FieldKey = 'no' | 'tgl' | 'vendor' | 'npwp' | 'dpp' | 'ppn' | 'total' | 'rek';

export interface Client {
  id: string;
  namaPT: string;
  namaPIC: string;
  email: string;
  phone: string;
  address: string;
  nextSequence: number; // nomor urut berikutnya untuk klien ini
}

export interface User {
  id: string;
  name: string;
  role: RoleKey;
  about: string;
}

export interface Fields {
  no: string;
  tgl: string;
  vendor: string;
  npwp: string;
  dpp: number;
  ppn: number;
  total: number;
  rek: string;
}

export type Conf = Record<FieldKey, number>;

export interface Doc {
  id: string;
  no: string;
  nomorUrut: number; // nomor urut spesifik per PT/klien
  klien: string;
  namaPT: string;
  namaPIC: string;
  jenis: string;
  jenisPajak: string;
  saluran: string;
  tgl: string;
  deadline: string;
  status: Status;
  owner: string;
  uploader: string;
  reviewer: string;
  issue: string;
  f: Fields;
  conf: Conf;
  src: Fields;
  hasFile: boolean;
}

/** Bentuk data yang boleh dilihat peran non-reviewer: tanpa isi dokumen. */
export interface DocSummary {
  id: string;
  no: string;
  nomorUrut: number;
  klien: string;
  namaPT: string;
  namaPIC: string;
  jenis: string;
  jenisPajak: string;
  saluran: string;
  deadline: string;
  status: Status;
  issue: string;
  uploader: string;
  owner: string;
  reviewer: string;
}

/** Bentuk khusus Service Lead: hanya status dan penugasan. */
export interface WorkloadRow {
  id: string;
  no: string;
  klien: string;
  jenis: string;
  deadline: string;
  status: Status;
  reviewer: string;
  uploader: string;
  conflict: boolean;
}

export interface Delegation {
  id: string;
  support: string;
  pic: string;
  klien: string[];
  expires: string;
  active: boolean;
}

export interface AccessRequest {
  id: string;
  type: 'deleg' | 'extend' | 'reset';
  by: string;
  text: string;
  date: string;
}

export interface AuditEvent {
  k: 'doc' | 'workload' | 'admin' | 'security';
  d: string;
  t: string;
  a: string;
  w: string;
  x: string;
  bot?: boolean;
}

export interface Issue {
  s: 'ok' | 'warn' | 'err';
  m: string;
}
export type Validation = Record<FieldKey, Issue>;

export interface ActionResult {
  ok: boolean;
  msg: string;
}

export interface VoucherData {
  id: string;
  no: string;
  nomorUrut: number;
  klien: string;
  namaPT: string;
  namaPIC: string;
  status: Status;
  reviewer: string;
  f: { vendor: string; no: string; rek: string; dpp: number; ppn: number; total: number };
}
