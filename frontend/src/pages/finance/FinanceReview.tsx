import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReviewClient from '@/components/ReviewClient';
import { Empty } from '@/components/ui';
import { Forbidden, Rule } from '@/lib/rbac';
import { getDocForReview } from '@/lib/services';
import { getUser } from '@/lib/session';
import { validate } from '@/lib/validate';
import type { Doc, ValidationResult } from '@/lib/types';

export default function FinanceReview() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    const loadDoc = async () => {
      if (!id) return;
      
      try {
        const user = await getUser();
        if (!user) {
          setError({ title: '401 Belum masuk', message: 'Silakan masuk kembali.' });
          return;
        }

        const docData = getDocForReview(user, id);
        setDoc(docData);
        setValidation(validate(docData.f, docData.conf));
      } catch (e) {
        const denied = e instanceof Forbidden;
        if (!denied && !(e instanceof Rule)) throw e;
        setError({
          title: denied ? '403 Akses ditolak' : 'Dokumen tidak ditemukan',
          message: (e as Error).message
        });
      }
    };
    loadDoc();
  }, [id]);

  if (error) {
    return (
      <section className="card">
        <Empty title={error.title}>{error.message}</Empty>
      </section>
    );
  }

  if (!doc || !validation) {
    return <div>Loading...</div>;
  }

  return <ReviewClient doc={doc} validation={validation} />;
}
