import { apiRequest } from './http';

export interface AuditEvent {
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

export async function getAuditEvents(): Promise<AuditEvent[]> {
  const response = await apiRequest<ApiEnvelope<AuditEvent[]>>('/audit/events');
  return response.data;
}
