import { useSession } from '@/lib/session';
import { LeadWorkloadScreen } from '@/components/screens';

export default function LeadDashboard() {
  const { user, loading } = useSession();
  if (loading || !user) return <div className="loading">Loading...</div>;
  return <LeadWorkloadScreen user={user} />;
}
