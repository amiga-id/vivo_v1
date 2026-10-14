import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FixDocScreen } from '@/components/screens';
import { getUser } from '@/lib/session';
import { store } from '@/lib/store';
import type { User } from '@/lib/types';

export default function SupportFix() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [doc, setDoc] = useState<any>(null);

  useEffect(() => {
    const loadData = async () => {
      const u = await getUser();
      setUser(u);
      
      if (id) {
        const foundDoc = store.docs.find((d) => d.id === id);
        setDoc(foundDoc || null);
      }
    };
    loadData();
  }, [id]);

  if (!user || !doc || !id) {
    return <div>Loading...</div>;
  }

  return <FixDocScreen user={user} doc={doc} />;
}
