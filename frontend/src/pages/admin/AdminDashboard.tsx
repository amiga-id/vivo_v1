import { useEffect, useState } from 'react';
import { AdminRequests } from '@/components/AdminPanels';
import { requestsFor } from '@/lib/services';
import { useSession } from '@/lib/session';
import type { AccessRequest } from '@/lib/types';

export default function AdminDashboard() {
  const { user }             = useSession();
  const [requests, setRequests] = useState<AccessRequest[]>([]);

  useEffect(() => {
    if (user) setRequests(requestsFor(user));
  }, [user]);

  return <AdminRequests requests={requests} />;
}
