/**
 * Shared layout guard for role-scoped workspaces.
 * Redirects to / if not logged in or wrong role.
 */
import { Navigate, Outlet } from 'react-router-dom';
import Workspace from './Workspace';
import { useSession } from '@/lib/session';
import type { RoleKey } from '@/lib/types';

export default function RoleLayout({ role }: { role: RoleKey }) {
  const { user, loading, error } = useSession();

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="auth-err" role="alert">{error}</div>;
  if (!user)   return <Navigate to="/" replace />;
  // Wrong role → send to their own home
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;

  return (
    <Workspace user={user}>
      <Outlet />
    </Workspace>
  );
}
