import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/lib/session';
import { getSubmissions } from '@/lib/document-api';
import type { Submission } from '@/lib/document-api';
import { STATUSES } from '@/lib/constants';
import { Badge, Empty } from '@/components/ui';

export default function SupportDashboard() {
  const { user, loading } = useSession();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionLoading, setSubmissionLoading] = useState(true);
  const [submissionError, setSubmissionError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const loadSubmissions = useCallback(async () => {
    setSubmissionLoading(true);
    setSubmissionError('');
    try {
      setSubmissions(await getSubmissions());
    } catch (reason) {
      setSubmissionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmissionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadSubmissions();
  }, [user, loadSubmissions]);

  if (loading || !user) return <div className="loading">Loading...</div>;
  const countByStatus = (status: string) =>
    submissions.filter(submission => submission.status === status).length;
  const filteredSubmissions = statusFilter === 'all'
    ? submissions
    : submissions.filter(submission => submission.status === statusFilter);

  return (
    <>
      <section className="card">
        <h2>Pengajuan PDF</h2>
        <p className="sub">Status pengajuan yang dikirim melalui unggah PDF.</p>
        {submissionError && (
          <div className="auth-err" role="alert">
            Gagal memuat status pengajuan: {submissionError}{' '}
            <button className="btn sm" onClick={() => void loadSubmissions()}>Coba lagi</button>
          </div>
        )}
        {submissionLoading ? (
          <div className="loading">Memuat pengajuan...</div>
        ) : !submissionError && submissions.length === 0 ? (
          <Empty title="Belum ada pengajuan PDF">
            Pengajuan yang Anda kirim akan tampil di sini.
          </Empty>
        ) : !submissionError && (
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
                Pilih status lain untuk melihat pengajuan.
              </Empty>
            ) : (
              <div className="tblw support-submissions-table-wrap">
                <table className="tbl support-submissions-table">
                  <thead>
                    <tr>
                      <th scope="col">No. pengajuan / Klien</th>
                      <th scope="col">Jenis pengajuan</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="support-submission-action-heading">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map(submission => (
                      <tr key={submission.id}>
                        <td>
                          <div className="t">{submission.request_number}</div>
                          <div className="m">{submission.client_name}</div>
                        </td>
                        <td>{submission.kind}</td>
                        <td><Badge status={submission.status} /></td>
                        <td className="support-submission-action-cell">
                          {submission.status === 'Disetujui' ? (
                            <Link className="btn sm support-submission-action" to="/support/voucher">
                              Unduh Voucher
                            </Link>
                          ) : submission.status === 'Dikembalikan' ? (
                            <Link
                              className="btn sm support-submission-action"
                              to={`/support/upload?revision=${encodeURIComponent(submission.id)}`}
                            >
                              Unggah lagi
                            </Link>
                          ) : submission.status !== 'Ditolak' &&
                            submission.status !== 'Dalam Review' ? (
                            <Link className="btn sm support-submission-action" to="/support/upload">
                              Unggah lagi
                            </Link>
                          ) : <span className="m">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      {!submissionLoading && !submissionError && (
        <div className="kpis">
          <div className="kpi">
            <b>{submissions.length}</b>
            <span>Total pengajuan Anda</span>
          </div>
          <div className="kpi">
            <b>{countByStatus('Dalam Review')}</b>
            <span>Menunggu Finance Reviewer</span>
          </div>
          <div className="kpi warn">
            <b>{countByStatus('Dikembalikan')}</b>
            <span>Perlu perbaikan</span>
          </div>
          <div className="kpi good">
            <b>{countByStatus('Disetujui')}</b>
            <span>Disetujui</span>
          </div>
        </div>
      )}
    </>
  );
}
