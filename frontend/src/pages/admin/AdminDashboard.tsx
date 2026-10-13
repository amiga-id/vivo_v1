import { useEffect, useState } from 'react';
import { AdminRequests } from '@/components/AdminPanels';
import { requestsFor } from '@/lib/services';
import { getUser } from '@/lib/session';
import type { AccessRequest } from '@/lib/types';

export default function AdminDashboard() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const user = await getUser();
      if (user) {
        const data = requestsFor(user);
        setRequests(data);
      }
    };
    loadData();
  }, []);

  return <AdminRequests requests={requests} />;
}
