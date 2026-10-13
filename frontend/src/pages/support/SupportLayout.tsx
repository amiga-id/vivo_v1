import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Workspace from '@/components/Workspace';
import { requireUser } from '@/lib/session';
import type { User } from '@/lib/types';

export default function SupportLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const u = await requireUser('support');
        setUser(u);
      } catch (error) {
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [navigate]);

  if (loading || !user) {
    return <div>Loading...</div>;
  }

  return (
    <Workspace user={user}>
      <Outlet />
    </Workspace>
  );
}
