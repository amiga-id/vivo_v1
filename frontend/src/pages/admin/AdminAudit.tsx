import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuditScreen } from '@/components/screens';
import { getUser } from '@/lib/session';
import type { User } from '@/lib/types';

export default function AdminAudit() {
  const [searchParams] = useSearchParams();
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

  return <AuditScreen user={user} doc={searchParams.get('doc') || undefined} />;
}
