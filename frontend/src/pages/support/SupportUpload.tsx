import { useSession } from '@/lib/session';
import UploadForm from '@/components/UploadForm';

export default function SupportUpload() {
  const { user, loading } = useSession();
  if (loading || !user) return <div className="loading">Loading...</div>;
  return <UploadForm user={user} home="/support" />;
}
