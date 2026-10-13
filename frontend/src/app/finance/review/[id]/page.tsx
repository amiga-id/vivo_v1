import ReviewClient from '@/components/ReviewClient';
import { Empty } from '@/components/ui';
import { Forbidden, Rule } from '@/lib/rbac';
import { getDocForReview } from '@/lib/services';
import { requireUser } from '@/lib/session';
import { validate } from '@/lib/validate';

export default async function Page({ params }: { params: { id: string } }) {
  const user = await requireUser('finance');
  try {
    const doc = getDocForReview(user, params.id);
    return <ReviewClient doc={doc} validation={validate(doc.f, doc.conf)} />;
  } catch (e) {
    const denied = e instanceof Forbidden;
    if (!denied && !(e instanceof Rule)) throw e;
    return (
      <section className="card">
        <Empty title={denied ? '403 Akses ditolak' : 'Dokumen tidak ditemukan'}>{(e as Error).message}</Empty>
      </section>
    );
  }
}
