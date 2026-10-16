import { useSearchParams } from 'react-router-dom';
import { AuditScreen } from '@/components/screens';
import { useSession } from '@/lib/session';

export default function LeadAudit() {
  const { user, loading } = useSession();
  const [searchParams] = useSearchParams();

  if (loading || !user) return <div className="loading">Loading...</div>;
  return <AuditScreen user={user} doc={searchParams.get('doc') ?? undefined} />;
}
