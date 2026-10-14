export type RoleKey = 'pic' | 'support' | 'finance' | 'lead' | 'admin';
export type Status =
  | 'Diproses'
  | 'Dalam Review'
  | 'Perlu Tindakan'
  | 'Dikembalikan'
  | 'Disetujui'
  | 'Ditolak';
export type FieldKey = 'no' | 'tgl' | 'vendor' | 'npwp' | 'dpp' | 'ppn' | 'total' | 'rek';
export type UserStatus = 'Aktif' | 'Menunggu' | 'Ditolak';

/* ---------- Tax types ---------- */
export type TaxKind = 'add' | 'withhold';

export interface TaxLine {
  code: string;
  label: string;
  rate: number;
  kind: TaxKind;
}

export interface TaxComputed extends TaxLine {
  amount: number;
}

export interface TaxResult {
  dpp: number;
  lines: TaxComputed[];
  add: number;
  withhold: number;
  net: number;
}

/* ---------- Voucher row ---------- */
export interface VoucherRow {
  no: number | string;
  tgl: string;
  ket: string;
  jumlah: string;
  harga: number;
  sub?: boolean;
  tax?: boolean;
}

/* ---------- Doc item ---------- */
export interface DocItem {
  tgl: string;
  ket: string;
  jumlah: string;
  harga: number;
}

/* ---------- Core types ---------- */
export interface Client {
  id: string;
  namaPT: string;
  namaPIC: string;
  email: string;
  phone: string;
  address: string;
  nextSequence: number;
}

export interface User {
  id: string;
  name: string;
  role: RoleKey;
  about: string;
  email: string;
  status: UserStatus;
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
  nomorUrut: number;
  klien: string;
  namaPT: string;
  namaPIC: string;
  jenis: string;
  jenisPajak: string;
  saluran: string;
  tgl: string;
  deadline: string;
  status: Status;
  owner: string;     // PIC who owns this order
  uploader: string;  // who uploaded (may be support)
  reviewer: string;
  issue: string;
  note?: string;     // note from uploader/support
  f: Fields;
  conf: Conf;
  src: Fields;
  hasFile: boolean;
  items: DocItem[];           // line items on the invoice
  tax: TaxLine[] | null;      // null = not yet configured
  approvers: 1 | 2;           // number of BOD signature boxes
  voucherNo: string | null;   // e.g. "VCH-MJ-0008", set on approval
}

/** Minimal summary safe to show to non-Finance roles */
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
  taxSet: boolean;
  voucherNo: string | null;
}

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
  type: 'deleg' | 'extend' | 'reset' | 'register';
  uid?: string;      // user id for register requests
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

/** Full voucher data returned to frontend */
export interface VoucherData {
  id: string;
  no: string;
  number: string | null;   // VCH-XX-NNNN
  nomorUrut: number;
  klien: string;
  namaPT: string;
  namaPIC: string;
  status: Status;
  reviewer: string;
  submitter: string;
  nama: string;            // vendor name
  perusahaan: string;      // client company
  periode: string;
  nominal: number;         // net after tax
  dpp: number;
  add: number;
  withhold: number;
  taxText: string;
  rows: VoucherRow[];
  total: number;
  approvers: 1 | 2;
  f: { vendor: string; no: string; rek: string; dpp: number; ppn: number; total: number };
}

/** Client summary for admin/support management screen */
export interface ClientSummary {
  name: string;
  code: string;
  docs: number;
  pics: string[];
}

/** Tax document (minimal, for tax-setup screen) */
export interface TaxDoc {
  id: string;
  no: string;
  klien: string;
  vendor: string;
  status: Status;
  dpp: number;
  ppnInvoice: number;
  tax: TaxLine[] | null;
  approvers: 1 | 2;
}
