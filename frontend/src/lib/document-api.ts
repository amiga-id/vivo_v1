import { API_BASE_URL, ApiError, getAccessToken } from './http';

export interface ClientOption {
  id: string;
  name: string;
}

export interface ClientAssignment {
  support_id: string;
  client_ids: string[];
}

export interface ExtractedInvoice {
  no: string;
  tgl: string;
  vendor: string;
  npwp: string;
  dpp: number;
  ppn: number;
  total: number;
  rek: string;
  confidence: Record<string, number>;
}

export interface UploadedFileData {
  upload_id: string;
  is_invoice: boolean;
  invoice_count: number;
  page_count: number;
  grand_total: number;
  invoices: ExtractedInvoice[];
  file_name: string;
  file_size: number;
  s3_key: string;
  document_url: string;
  document_url_expires_in: number;
  extraction_status: 'done' | 'failed';
  extraction_error: string | null;
}

export interface SubmissionFile {
  file_name: string;
  file_size: number;
  page_count: number;
  s3_key: string;
  document_url: string;
  extraction_status: 'done' | 'failed';
  extraction_error: string | null;
}

export interface Submission {
  id: string;
  request_number: string;
  client_id: string;
  client_name: string;
  kind: string;
  channel: string | null;
  receive_date: string;
  note: string | null;
  approvers: number;
  uploader_id: string;
  reviewer_id: string;
  due_date: string;
  status: string;
  decision_reason: string | null;
  files: SubmissionFile[];
  invoices: ExtractedInvoice[];
  invoice_count: number;
  page_count: number;
  grand_total: number;
  tax: Array<Record<string, string | number>>;
  created_at: string;
}

export interface RevisionHistoryEntry {
  id: string;
  request_number: string;
  team: 'Financial' | 'Intake';
  actor_name: string;
  action: string;
  detail: string | null;
  created_at: string;
}

export type VoucherRole = 'finance';

export interface VoucherSigner {
  id: string;
  role: VoucherRole;
  name: string;
  account_id: string | null;
}

export interface VoucherSigners {
  finance: VoucherSigner[];
}

export interface VoucherListItem {
  submission_id: string;
  request_number: string;
  voucher_number: string;
  client_name: string;
  kind: string;
  status: string;
  receive_date: string;
  grand_total: number;
  voucher_url: string | null;
  signature_ids: { finance: string | null };
  created_at: string;
}

export interface VoucherGenerateResult {
  submission_id: string;
  voucher_number: string;
  voucher_url: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string | { message?: string };
  detail?: string | { message?: string };
}

function parseError(payload: ApiEnvelope<unknown> | null, status: number): string {
  const detail = payload?.error ?? payload?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) ??
    `Permintaan gagal (${status}).`;
}

function parsePayload<T>(text: string): ApiEnvelope<T> | null {
  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

function invalidResponseError(status: number): ApiError {
  return new ApiError(
    `Server mengembalikan respons tidak valid (HTTP ${status}). Periksa log backend untuk detail.`,
    status,
  );
}

function sendUpload(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadedFileData> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_BASE_URL}/documents/upload`);
    request.timeout = 180_000;
    const token = getAccessToken();
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = event => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onerror = () => reject(new ApiError(
      'Tidak dapat terhubung ke server. Periksa koneksi dan server backend.',
      0,
    ));
    request.ontimeout = () => reject(new ApiError('Upload melebihi batas waktu 180 detik.', 0));
    request.onload = () => {
      const payload = parsePayload<UploadedFileData>(request.responseText);
      if (!payload) {
        reject(invalidResponseError(request.status));
        return;
      }
      if (request.status === 401) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('amiga:unauthorized'));
        }
        reject(new ApiError(parseError(payload, request.status), request.status));
        return;
      }
      if (request.status < 200 || request.status >= 300 || payload.success === false) {
        if (request.status === 503 && payload.data) {
          resolve(payload.data);
          return;
        }
        reject(new ApiError(parseError(payload, request.status), request.status));
        return;
      }
      resolve(payload.data);
    };
    const body = new FormData();
    body.append('file', file);
    request.send(body);
  });
}

export function uploadDocument(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadedFileData> {
  return sendUpload(file, onProgress);
}

export async function retryExtraction(uploadId: string): Promise<UploadedFileData> {
  const token = getAccessToken();
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/documents/upload/${encodeURIComponent(uploadId)}/retry`,
      { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi dan server backend.', 0);
  }
  const payload = parsePayload<UploadedFileData>(await response.text());
  if (!payload) throw invalidResponseError(response.status);
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('amiga:unauthorized'));
  }
  if (!response.ok || payload.success === false) {
    throw new ApiError(parseError(payload, response.status), response.status);
  }
  return payload.data;
}

async function apiData<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const token = getAccessToken();
    const headers = new Headers(init?.headers);
    if (
      init?.body &&
      !(typeof FormData !== 'undefined' && init.body instanceof FormData) &&
      !headers.has('Content-Type')
    ) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) headers.set('Authorization', `Bearer ${token}`);
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi dan server backend.', 0);
  }
  const payload = parsePayload<T>(await response.text());
  if (!payload) throw invalidResponseError(response.status);
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('amiga:unauthorized'));
  }
  if (!response.ok || payload.success === false) {
    throw new ApiError(parseError(payload, response.status), response.status);
  }
  return payload.data;
}

export function getClients(): Promise<ClientOption[]> {
  return apiData<ClientOption[]>('/clients');
}

export function getClientAssignments(): Promise<ClientAssignment[]> {
  return apiData<ClientAssignment[]>('/clients/assignments');
}

export function updateClientAssignments(
  supportId: string,
  clientIds: string[],
): Promise<ClientAssignment> {
  return apiData<ClientAssignment>(`/clients/assignments/${encodeURIComponent(supportId)}`, {
    method: 'PUT',
    body: JSON.stringify({ client_ids: clientIds }),
  });
}

export function createSubmission(input: {
  upload_ids: string[];
  client_id: string;
  revision_of_submission_id?: string;
  kind: string;
  receive_date: string;
  note: string;
  approvers: 1 | 2;
  tax: Array<Record<string, string | number>>;
}): Promise<Submission> {
  return apiData<Submission>('/documents/submissions', { method: 'POST', body: JSON.stringify(input) });
}

export function getSubmissions(): Promise<Submission[]> {
  return apiData<Submission[]>('/documents/submissions');
}

export function getSubmission(id: string): Promise<Submission> {
  return apiData<Submission>(`/documents/submissions/${encodeURIComponent(id)}`);
}

export function getRevisionHistory(id: string): Promise<RevisionHistoryEntry[]> {
  return apiData<RevisionHistoryEntry[]>(
    `/documents/submissions/${encodeURIComponent(id)}/revision-history`,
  );
}

export function updateSubmissionInvoices(
  id: string,
  invoices: ExtractedInvoice[],
): Promise<Submission> {
  return apiData<Submission>(`/documents/submissions/${encodeURIComponent(id)}/invoices`, {
    method: 'PUT',
    body: JSON.stringify({ invoices }),
  });
}

export function decideSubmission(
  id: string,
  decision: 'approve' | 'return' | 'reject',
  reason: string,
): Promise<Submission> {
  return apiData<Submission>(`/documents/submissions/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, reason }),
  });
}

export function getVouchers(): Promise<VoucherListItem[]> {
  return apiData<VoucherListItem[]>('/documents/vouchers');
}

export function getVoucherSigners(): Promise<VoucherSigners> {
  return apiData<VoucherSigners>('/documents/vouchers/signers');
}

export function uploadVoucherSignature(file: File): Promise<VoucherSigner> {
  const body = new FormData();
  body.append('file', file);
  return apiData<VoucherSigner>('/documents/signatures/finance', {
    method: 'POST',
    body,
  });
}

export function generateVoucher(submissionId: string): Promise<VoucherGenerateResult> {
  return apiData<VoucherGenerateResult>(
    `/documents/submissions/${encodeURIComponent(submissionId)}/voucher`,
    {
      method: 'POST',
    },
  );
}
