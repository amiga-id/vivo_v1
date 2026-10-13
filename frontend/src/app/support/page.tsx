import { ClientQueueScreen } from '@/components/screens';
import { requireUser } from '@/lib/session';

export default async function Page() {
  const user = await requireUser('support');
  return <ClientQueueScreen user={user} />;
}
