import { useEffect, useState } from 'react';
import { ClientQueueScreen } from '@/components/screens';
import { getUser } from '@/lib/session';
import type { User } from '@/lib/types';

export default function SupportDashboard() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const u = await getUser();
      setUser(u);
    };
    loadUser();
  }, []);

  if (!user) {
    return <div>Loading...</div>;
  }

  return <ClientQueueScreen user={user} />;
}
