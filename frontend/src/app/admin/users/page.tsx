import { AdminUsers } from '@/components/AdminPanels';
import { delegationsFor, usersFor } from '@/lib/services';
import { requireUser } from '@/lib/session';

export default async function Page() {
  const user = await requireUser('admin');
  const users = usersFor(user);
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return <AdminUsers me={user.id} users={users} deleg={delegationsFor(user)} names={names} />;
}
