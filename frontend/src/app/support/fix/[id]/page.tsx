import { notFound } from 'next/navigation';
import { FixDocScreen } from '@/components/screens';
import { requireUser } from '@/lib/session';
import { store } from '@/lib/store';
import { can } from '@/lib/rbac';

export default async function Page({ params }: { params: { id: string } }) {
  const user = await requireUser('support');
  const doc = store.docs.find((d) => d.id === params.id);
  
  if (!doc || !can(user, 'doc:read:delegated', doc).ok) {
    notFound();
  }
  
  if (doc.status !== 'Perlu Tindakan') {
    notFound();
  }
  
  return <FixDocScreen user={user} doc={doc} />;
}
