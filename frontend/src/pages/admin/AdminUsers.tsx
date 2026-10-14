import { useEffect, useState } from 'react';
import { AdminUsersList, AdminCreateUser } from '@/components/AdminPanels';
import { usersFor } from '@/lib/services';
import { useSession } from '@/lib/session';
import type { User } from '@/lib/types';

export default function AdminUsers() {
  const { user }         = useSession();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (user) setUsers(usersFor(user));
  }, [user]);

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <>
      <AdminCreateUser />
      <AdminUsersList me={user.id} users={users} />
    </>
  );
}
