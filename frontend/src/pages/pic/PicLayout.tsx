import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/session';
import Workspace from '@/components/Workspace';

export default function PicLayout() {
  const { user, loading } = useSession();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user)   return <Navigate to="/" replace />;
  if (user.role !== 'pic') return <Navigate to={`/${user.role}`} replace />;
  return <Workspace user={user}><Outlet /></Workspace>;
}
