import { AdminRequests } from '@/components/AdminPanels';
import { requestsFor } from '@/lib/services';
import { requireUser } from '@/lib/session';

export default async function Page() {
  const user = await requireUser('admin');
  return <AdminRequests requests={requestsFor(user)} />;
}
