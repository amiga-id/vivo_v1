import { useSession } from '@/lib/session';
import { ClientQueueScreen } from '@/components/screens';

export default function SupportDashboard() {
  const { user, loading } = useSession();
  if (loading || !user) return <div className="loading">Loading...</div>;
  return <ClientQueueScreen user={user} />;
}
