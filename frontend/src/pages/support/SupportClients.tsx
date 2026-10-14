import { useSession } from '@/lib/session';
import { AdminClientsScreen } from '@/components/screens';

export default function SupportClients() {
  const { user, loading } = useSession();
  if (loading || !user) return <div className="loading">Loading...</div>;
  return <AdminClientsScreen user={user} />;
}
