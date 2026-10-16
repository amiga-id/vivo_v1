import * as svc from './services';
import {
  createDatabaseAccount,
  getDatabaseAccounts,
  signInWithDatabase,
  signOutFromDatabase,
  updateDatabaseAccountRole,
} from './auth-api';
import type {
  ActionResult, Assignment, ClientSummary, DocSummary,
  FieldKey, RoleKey, TaxDoc, TaxLine, User, VoucherData, WorkloadRow,
} from './types';

const ok  = (msg: string): ActionResult => ({ ok: true,  msg });
const err = (e: unknown): ActionResult  => ({ ok: false, msg: e instanceof Error ? e.message : String(e) });

/* ── Auth ── */
export async function signIn(email: string, pw: string): Promise<{ ok: boolean; msg: string; user?: User }> {
  try {
    const user = await signInWithDatabase(email, pw);
    return { ok: true, msg: 'Berhasil masuk.', user };
  } catch (error) {
    return { ok: false, msg: error instanceof Error ? error.message : String(error) };
  }
}

export async function signOut(): Promise<void> {
  await signOutFromDatabase();
}

export async function listAccounts(): Promise<User[]> {
  return getDatabaseAccounts();
}

/* ── Queue ── */
export function getQueue(user: User): DocSummary[]  { return svc.queueFor(user); }
export function getWorkload(user: User): WorkloadRow[] { return svc.workloadFor(user); }

/* ── Finance review ── */
export function getDocForReview(user: User, id: string) { return svc.getDocForReview(user, id); }

export function correctField(user: User, id: string, k: FieldKey, raw: string): ActionResult {
  try { return ok(svc.correctField(user, id, k, raw)); } catch (e) { return err(e); }
}
export function decideDoc(user: User, id: string, kind: 'approve' | 'reject' | 'return', why: string): ActionResult {
  try { return ok(svc.decide(user, id, kind, why)); } catch (e) { return err(e); }
}

/* ── Tax ── */
export function getTaxDoc(user: User, id: string): TaxDoc { return svc.getTaxDoc(user, id); }
export function setTax(user: User, id: string, raw: Partial<TaxLine>[], approvers: 1 | 2): ActionResult {
  try { return ok(svc.setTax(user, id, raw, approvers)); } catch (e) { return err(e); }
}

/* ── Fix / resubmit ── */
export function getFixDoc(user: User, id: string) { return svc.getFixDoc(user, id); }
export function correctFixField(user: User, id: string, k: FieldKey, raw: string): ActionResult {
  try { return ok(svc.correctFixField(user, id, k, raw)); } catch (e) { return err(e); }
}
export function resubmit(user: User, id: string, note: string): ActionResult {
  try { return ok(svc.resubmit(user, id, note)); } catch (e) { return err(e); }
}

/* ── Voucher ── */
export function getVouchers(user: User): DocSummary[]       { return svc.vouchersFor(user); }
export function getVoucher(user: User, id: string): VoucherData { return svc.getVoucher(user, id); }
export function downloadVoucher(user: User, id: string): ActionResult {
  try { return ok(svc.recordDownload(user, id)); } catch (e) { return err(e); }
}

/* ── Upload ── */
export function getKlienOptions(user: User): string[]       { return svc.klienOptions(user); }
export function uploadDocument(user: User, p: svc.UploadInput): ActionResult & { docId?: string } {
  try {
    const doc = svc.createDoc(user, p);
    return { ok: true, msg: 'Dokumen terkirim. Robot Admin sedang memproses...', docId: doc.id };
  } catch (e) { return { ...err(e) }; }
}

/* ── Workload / Lead ── */
export function reassignTask(user: User, id: string, to: string): ActionResult {
  try { return ok(svc.reassign(user, id, to)); } catch (e) { return err(e); }
}
export function getAssignments(user: User): Assignment[]    { return svc.getAssignments(user); }
export function setAssignment(user: User, supportId: string, klien: string[]): ActionResult {
  try { return ok(svc.setAssignment(user, supportId, klien)); } catch (e) { return err(e); }
}

/* ── Clients ── */
export function getClients(user: User): ClientSummary[]     { return svc.clientsFor(user); }
export function addClient(user: User, name: string): ActionResult {
  try { return ok(svc.addClient(user, name)); } catch (e) { return err(e); }
}

/* ── Users ── */
export function getUsers(user: User): User[]                { return svc.usersFor(user); }
export async function setRole(_user: User, uid: string, role: RoleKey): Promise<ActionResult> {
  try {
    await updateDatabaseAccountRole(uid, role);
    return ok('Peran akun berhasil diperbarui.');
  } catch (e) {
    return err(e);
  }
}
export async function createUser(
  _user: User,
  f: { name: string; email: string; role: RoleKey; pw: string },
): Promise<ActionResult> {
  try {
    await createDatabaseAccount({
      name: f.name,
      email: f.email,
      role: f.role,
      password: f.pw,
    });
    return ok('Akun pegawai berhasil dibuat.');
  } catch (e) {
    return err(e);
  }
}
export function decideAccess(user: User, id: string, approved: boolean): ActionResult {
  try { return ok(svc.decideAccess(user, id, approved)); } catch (e) { return err(e); }
}

/* ── Audit ── */
export function getAudit(user: User) { return svc.auditFor(user); }
