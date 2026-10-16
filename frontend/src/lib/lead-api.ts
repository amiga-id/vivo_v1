import { apiRequest } from './http';
import type { Status } from './types';

export interface LeadReviewer {
  id: string;
  name: string;
}

export interface LeadSupportAccount {
  id: string;
  name: string;
  email: string;
}

export interface LeadWorkloadRow {
  id: string;
  request_number: string;
  client_name: string;
  kind: string;
  due_date: string;
  status: Status;
  reviewer_id: string;
  reviewer_name: string;
  uploader_id: string;
  uploader_name: string;
  conflict: boolean;
}

export interface LeadWorkload {
  submissions: LeadWorkloadRow[];
  reviewers: LeadReviewer[];
}

export interface LeadAuditEvent {
  id: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  actor_name: string;
  action: string;
  detail: string | null;
  created_at: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

async function leadData<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiRequest<ApiEnvelope<T>>(path, init);
  return response.data;
}

export function getLeadWorkload(): Promise<LeadWorkload> {
  return leadData<LeadWorkload>('/lead/workload');
}

export function reassignLeadSubmission(
  submissionId: string,
  reviewerId: string,
): Promise<{ message: string }> {
  return leadData<{ message: string }>(
    `/lead/workload/${encodeURIComponent(submissionId)}/reviewer`,
    {
      method: 'PATCH',
      body: JSON.stringify({ reviewer_id: reviewerId }),
    },
  );
}

export function getLeadSupportAccounts(): Promise<LeadSupportAccount[]> {
  return leadData<LeadSupportAccount[]>('/lead/support-accounts');
}

export function getLeadAudit(): Promise<LeadAuditEvent[]> {
  return leadData<LeadAuditEvent[]>('/lead/audit');
}
