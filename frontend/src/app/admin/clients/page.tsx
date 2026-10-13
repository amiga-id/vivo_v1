import { ClientManagementScreen } from '@/components/screens';
import { requireUser } from '@/lib/session';

export default async function Page() {
  const user = await requireUser('admin');
  return <ClientManagementScreen user={user} />;
}
