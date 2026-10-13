import LeadTable from '@/components/LeadTable';
import { financeUsers, workloadFor } from '@/lib/services';
import { requireUser } from '@/lib/session';

export default async function Page() {
  const user = await requireUser('lead');
  return <LeadTable rows={workloadFor(user)} finance={financeUsers()} />;
}
