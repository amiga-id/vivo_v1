import { useSession } from '@/lib/session';
import { FinanceQueueScreen } from '@/components/screens';

export default function FinanceDashboard() {
  const { user, loading } = useSession();
  if (loading || !user) return <div className="loading">Loading...</div>;
  return <FinanceQueueScreen user={user} />;
}
