import type { ReactNode } from 'react';
import Workspace from '@/components/Workspace';
import { requireUser } from '@/lib/session';

export default async function Layout({ children }: { children: ReactNode }) {
  const user = await requireUser('admin');
  return <Workspace user={user}>{children}</Workspace>;
}
