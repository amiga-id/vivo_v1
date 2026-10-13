import { FinanceQueueScreen } from '@/components/screens';
import { requireUser } from '@/lib/session';

export default async function Page() {
  const user = await requireUser('finance');
  return <FinanceQueueScreen user={user} />;
}
