import { VoucherScreen } from '@/components/screens';
import { requireUser } from '@/lib/session';

export default async function Page({ searchParams }: { searchParams: { id?: string } }) {
  const user = await requireUser('finance');
  return <VoucherScreen user={user} id={searchParams.id} />;
}
