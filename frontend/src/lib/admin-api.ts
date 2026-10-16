import { apiRequest } from './http';

export interface AdminDashboardData {
  account_count: number;
  vendor_count: number;
  submission_count: number;
  open_submission_count: number;
  accounts_by_role: Record<string, number>;
  submissions_by_status: Record<string, number>;
  recent_events: {
    id: string;
    entity_type: string;
    entity_id: string | null;
    entity_label: string | null;
    actor_name: string;
    action: string;
    detail: string | null;
    created_at: string;
  }[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const response = await apiRequest<ApiEnvelope<AdminDashboardData>>('/admin/dashboard');
  return response.data;
}
