import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/lib/session';
import * as api from '@/lib/api';
import { TaxForm } from '../support/SupportTax';
import { Empty } from '@/components/ui';

export default function PicTax() {
  const { id }            = useParams<{ id: string }>();
  const { user, loading } = useSession();
  const navigate          = useNavigate();

  if (loading || !user || !id) return <div className="loading">Loading...</div>;

  let taxDoc: ReturnType<typeof api.getTaxDoc>;
  try { taxDoc = api.getTaxDoc(user, id); }
  catch (e) {
    return <section className="card"><Empty title="Tidak bisa diakses">{(e as Error).message}</Empty></section>;
  }

  return <TaxForm user={user} taxDoc={taxDoc} home="/pic" onSave={() => navigate('/pic')} />;
}
