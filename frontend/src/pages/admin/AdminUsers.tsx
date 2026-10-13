import { useEffect, useState } from 'react';
import { AdminUsers as AdminUsersComponent } from '@/components/AdminPanels';
import { delegationsFor, usersFor } from '@/lib/services';
import { getUser } from '@/lib/session';
import type { User, Delegation } from '@/lib/types';

export default function AdminUsers() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadData = async () => {
      const user = await getUser();
      if (user) {
        setCurrentUser(user);
        const userData = usersFor(user);
        setUsers(userData);
        setNames(Object.fromEntries(userData.map((u) => [u.id, u.name])));
        setDelegations(delegationsFor(user));
      }
    };
    loadData();
  }, []);

  if (!currentUser) {
    return <div>Loading...</div>;
  }

  return (
    <AdminUsersComponent 
      me={currentUser.id} 
      users={users} 
      deleg={delegations} 
      names={names} 
    />
  );
}
