// All roles — 'pic' is removed; merged into 'support'
export type RoleKey = 'support' | 'finance' | 'lead' | 'admin';
export type Status =
  | 'Diproses'
  | 'Dalam Review'
  | 'Dikembalikan'
  | 'Disetujui'
  | 'Ditolak';
export type FieldKey = 'no' | 'tgl' | 'vendor' | 'npwp' | 'dpp' | 'ppn' | 'total' | 'rek';
export type UserStatus = 'Aktif' | 'Menunggu' | 'Ditolak';

/* ---------- Tax ---------- */
export type TaxKind = 'add' | 'withhold';
export interface TaxLine { code: string; label: string; rate: number; kind: TaxKind; }
export interface TaxComputed extends TaxLine { amount: number; }
export interface TaxResult { dpp: number; lines: TaxComputed[]; add: number; withhold: number; net: number; }

/* ---------- Voucher / Doc items ---------- */
export interface VoucherRow {
  no: number | string; tgl: string; ket: string; jumlah: string; harga: number;
  sub?: boolean; tax?: boolean;
}
export interface DocItem { tgl: string; ket: string; jumlah: string; harga: number; }

/* ---------- Core entities ---------- */
export interface Client {
  id: string; namaPT: string; namaPIC: string;
  email: string; phone: string; address: string; nextSequence: number;
}

export interface User {
  id: string; name: string; role: RoleKey; about: string;
  email: string; status: UserStatus;
}

/** Lead-assigned mapping: which support handles which clients */
export interface Assignment {
  id: string;
  supportId: string;
  klien: string[];   // list of client namaPT
}

export interface Fields {
  no: string; tgl: string; vendor: string; npwp: string;
  dpp: number; ppn: number; total: number; rek: string;
}
export type Conf = Record<FieldKey, number>;

export interface Doc {
  id: string;
  no: string;
  nomorUrut: number;
  klien: string;
  namaPT: string;
  namaPIC: string;
  jenis: string;
  // saluran removed
  tgl: string;
  deadline: string;
  status: Status;
  owner: string;    // support who owns this
  uploader: string;
  reviewer: string;
  issue: string;
  note?: string;
  f: Fields;
  conf: Conf;
  src: Fields;
  hasFile: boolean;
  items: DocItem[];
  tax: TaxLine[] | null;
  approvers: 1 | 2;
  voucherNo: string | null;
}

/** Redacted summary for non-Finance roles */
export interface DocSummary {
  id: string; no: string; nomorUrut: number; klien: string;
  namaPT: string; namaPIC: string; jenis: string;
  deadline: string; status: Status; issue: string;
  uploader: string; owner: string; reviewer: string;
  taxSet: boolean; voucherNo: string | null;
}

export interface WorkloadRow {
  id: string; no: string; klien: string; jenis: string;
  deadline: string; status: Status; reviewer: string; uploader: string; conflict: boolean;
}

export interface AccessRequest {
  id: string; type: 'reset';
  by: string; text: string; date: string;
}

export interface AuditEvent {
  k: 'doc' | 'workload' | 'admin' | 'security';
  d: string; t: string; a: string; w: string; x: string; bot?: boolean;
}

export interface Issue { s: 'ok' | 'warn' | 'err'; m: string; }
export type Validation = Record<FieldKey, Issue>;
export interface ActionResult { ok: boolean; msg: string; }

export interface VoucherData {
  id: string; no: string; number: string | null; nomorUrut: number;
  klien: string; namaPT: string; namaPIC: string;
  status: Status; reviewer: string; submitter: string;
  nama: string; perusahaan: string; periode: string;
  nominal: number; dpp: number; add: number; withhold: number;
  taxText: string; rows: VoucherRow[]; total: number; approvers: 1 | 2;
  f: { vendor: string; no: string; rek: string; dpp: number; ppn: number; total: number };
}

export interface ClientSummary { name: string; code: string; docs: number; assignees: string[]; }

export interface Vendor {
  id: string;
  name: string;
  pic: string;
  email: string;
  phone_number?: string | null;
  address?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface TaxDoc {
  id: string; no: string; klien: string; vendor: string;
  status: Status; dpp: number; ppnInvoice: number;
  tax: TaxLine[] | null; approvers: 1 | 2;
}

/** Chatbot message */
export interface ChatMessage { role: 'user' | 'assistant'; content: string; ts: number; }
