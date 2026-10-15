import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubmissions } from '@/lib/document-api';
import type { Submission } from '@/lib/document-api';
import { useSession } from '@/lib/session';
import { STATUSES } from '@/lib/constants';
import { Badge, Empty } from '@/components/ui';

export default function FinanceDashboard() {
  const { user, loading: sessionLoading } = useSession();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSubmissions(await getSubmissions());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (sessionLoading || !user) return <div className="loading">Loading...</div>;
  const open = submissions.filter(item => item.status === 'Dalam Review');
  const filteredSubmissions = statusFilter === 'all'
    ? submissions
    : submissions.filter(item => item.status === statusFilter);

  return (
    <>
      <div className="kpis">
        <div className="kpi"><b>{open.length}</b><span>Tugas review terbuka</span></div>
        <div className="kpi"><b>{submissions.length}</b><span>Total pengajuan ditugaskan</span></div>
      </div>
      <section className="card">
        <h2>Tugas review saya</h2>
        <p className="sub">Hanya pengajuan yang ditugaskan kepada Anda oleh sistem.</p>
        {error && (
          <div className="auth-err" role="alert">
            Gagal memuat antrean Finance: {error}{' '}
            <button className="btn sm" onClick={() => void load()}>Coba lagi</button>
          </div>
        )}
        {loading ? (
          <div className="loading">Memuat antrean Finance...</div>
        ) : !error && submissions.length === 0 ? (
          <Empty title="Tidak ada tugas review">
            Pengajuan yang dikirim Intake Support dan ditugaskan kepada Anda akan muncul di sini.
          </Empty>
        ) : !error && (
          <>
            <div className="filters">
              <span className="m">Status</span>
              {['all', ...STATUSES].map(status => (
                <button
                  className="chip"
                  key={status}
                  type="button"
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  {status === 'all' ? 'Semua status' : status}
                </button>
              ))}
              <span className="m">{filteredSubmissions.length} pengajuan</span>
            </div>
            {filteredSubmissions.length === 0 ? (
              <Empty title="Tidak ada pengajuan dengan status ini">
                Pilih status lain untuk melihat tugas.
              </Empty>
            ) : (
              <div className="queue">
                {filteredSubmissions.map(item => (
                  <div
                    className="q"
                    key={item.id}
                    style={{ gridTemplateColumns: '1.4fr 1fr 1fr auto' }}
                  >
                    <div>
                      <div className="t">{item.request_number}</div>
                      <div className="m">{item.client_name}</div>
                    </div>
                    <div>
                      <div>{item.kind}</div>
                      <div className="m">
                        {item.channel ? `${item.channel} · ` : ''}
                        {item.invoice_count} invoice · {item.files.length} PDF
                      </div>
                    </div>
                    <div><Badge status={item.status} /></div>
                    <div>
                      {item.status === 'Dalam Review'
                        ? <Link className="btn sm primary" to={`/finance/review/${item.id}`}>Tinjau</Link>
                        : <Link className="btn sm" to={`/finance/review/${item.id}`}>Lihat</Link>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
