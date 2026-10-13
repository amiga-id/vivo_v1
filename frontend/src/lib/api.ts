/**
 * API client untuk menggantikan Next.js Server Actions
 * Semua komunikasi dengan backend melalui fetch API
 */

import type { ActionResult, FieldKey, RoleKey } from './types';

const API_BASE = '/api';

async function fetchAPI<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include', // Include cookies for session
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ msg: 'Network error' }));
    throw new Error(error.msg || `HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchWithFormData(endpoint: string, formData: FormData): Promise<ActionResult> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ msg: 'Network error' }));
    throw new Error(error.msg || `HTTP ${response.status}`);
  }

  return response.json();
}

/* ---- Sesi ---- */
export async function signIn(email: string, password: string): Promise<{ ok: boolean; msg: string; to?: string }> {
  return fetchAPI('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  await fetchAPI('/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

/* ---- Finance Reviewer ---- */
export async function correctField(id: string, k: FieldKey, raw: string): Promise<ActionResult> {
  return fetchAPI('/finance/correct-field', {
    method: 'POST',
    body: JSON.stringify({ id, k, raw }),
  });
}

export async function decideDoc(id: string, kind: 'approve' | 'reject' | 'reqinfo', why: string): Promise<ActionResult> {
  return fetchAPI('/finance/decide', {
    method: 'POST',
    body: JSON.stringify({ id, kind, why }),
  });
}

/* ---- Intake Support ---- */
export async function downloadVoucher(id: string): Promise<ActionResult> {
  return fetchAPI('/support/download-voucher', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export async function fixDocument(docId: string, formData: FormData): Promise<ActionResult> {
  return fetchWithFormData('/support/fix-document', formData);
}

export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  return fetchWithFormData('/support/upload-document', formData);
}

/* ---- Service Lead ---- */
export async function reassignTask(id: string, to: string): Promise<ActionResult> {
  return fetchAPI('/lead/reassign', {
    method: 'POST',
    body: JSON.stringify({ id, to }),
  });
}

/* ---- System Admin ---- */
export async function changeRole(uid: string, role: RoleKey): Promise<ActionResult> {
  return fetchAPI('/admin/change-role', {
    method: 'POST',
    body: JSON.stringify({ uid, role }),
  });
}

export async function toggleDelegation(id: string): Promise<ActionResult> {
  return fetchAPI('/admin/toggle-delegation', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export async function decideAccessRequest(id: string, ok: boolean): Promise<ActionResult> {
  return fetchAPI('/admin/decide-access', {
    method: 'POST',
    body: JSON.stringify({ id, ok }),
  });
}

export async function addNewClient(formData: FormData): Promise<ActionResult> {
  return fetchWithFormData('/admin/add-client', formData);
}

/* ---- Uji kebijakan ---- */
export async function runProbe(index: number): Promise<{ ok: boolean; why?: string; label: string }> {
  return fetchAPI('/probe/run', {
    method: 'POST',
    body: JSON.stringify({ index }),
  });
}
