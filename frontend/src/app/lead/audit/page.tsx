import { AuditScreen } from '@/components/screens';
import { requireUser } from '@/lib/session';

export default async function Page({ searchParams }: { searchParams: { doc?: string } }) {
  const user = await requireUser('lead');
  return <AuditScreen user={user} doc={searchParams.doc} />;
}
