import { useSearchParams } from 'react-router-dom';
import { useSession } from '@/lib/session';
import { AuditScreen } from '@/components/screens';

export default function LeadAudit() {
  const { user, loading } = useSession();
  const [sp] = useSearchParams();
  if (loading || !user) return <div className="loading">Loading...</div>;
  return <AuditScreen user={user} doc={sp.get('doc') ?? undefined} />;
}
