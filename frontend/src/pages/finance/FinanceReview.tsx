import { useParams } from 'react-router-dom';
import { useSession } from '@/lib/session';
import * as api from '@/lib/api';
import ReviewClient from '@/components/ReviewClient';
import { Empty } from '@/components/ui';
import { validate } from '@/lib/validate';

export default function FinanceReview() {
  const { id }            = useParams<{ id: string }>();
  const { user, loading } = useSession();

  if (loading || !user || !id) return <div className="loading">Loading...</div>;

  try {
    const doc = api.getDocForReview(user, id);
    const v   = validate(doc.f, doc.conf);
    return <ReviewClient doc={doc} validation={v} />;
  } catch (e) {
    return (
      <section className="card">
        <Empty title="Tidak bisa diakses">{(e as Error).message}</Empty>
      </section>
    );
  }
}
