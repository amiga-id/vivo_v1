import { useEffect, useState } from 'react';
import { VoucherScreen } from '@/components/screens';
import { getUser } from '@/lib/session';
import type { User } from '@/lib/types';

export default function SupportVoucher() {
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

  return <VoucherScreen user={user} />;
}
