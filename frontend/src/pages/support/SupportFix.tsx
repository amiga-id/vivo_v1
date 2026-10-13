import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FixDocScreen } from '@/components/screens';
import { getUser } from '@/lib/session';
import type { User } from '@/lib/types';

export default function SupportFix() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const u = await getUser();
      setUser(u);
    };
    loadUser();
  }, []);

  if (!user || !id) {
    return <div>Loading...</div>;
  }

  return <FixDocScreen user={user} docId={id} />;
}
