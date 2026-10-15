import { useCallback, useEffect, useState } from 'react';
import { AdminUsersList, AdminCreateUser } from '@/components/AdminPanels';
import { listAccounts } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { User } from '@/lib/types';

export default function AdminUsers() {
  const { user } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await listAccounts());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) void loadUsers(); }, [user, loadUsers]);

  if (!user) return <div className="loading">Loading...</div>;
  if (loading) return <div className="loading">Memuat akun...</div>;

  return (
    <>
      {error && <div className="auth-err" role="alert">{error}</div>}
      <AdminCreateUser onCreated={loadUsers} />
      <AdminUsersList me={user.id} users={users} onRoleUpdated={loadUsers} />
    </>
  );
}
