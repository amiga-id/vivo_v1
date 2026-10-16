import { useCallback, useEffect, useState } from 'react';
import LeadTable from '@/components/LeadTable';
import { useToast } from '@/components/Toast';
import {
  getLeadWorkload,
  reassignLeadSubmission,
} from '@/lib/lead-api';
import type { LeadWorkload } from '@/lib/lead-api';
import { useSession } from '@/lib/session';

export default function LeadDashboard() {
  const { user, loading } = useSession();
  const toast = useToast();
  const [workload, setWorkload] = useState<LeadWorkload>({
    submissions: [],
    reviewers: [],
  });
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadWorkload = useCallback(async () => {
    setDataLoading(true);
    setError('');
    try {
      setWorkload(await getLeadWorkload());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadWorkload();
  }, [user, loadWorkload]);

  const reassign = async (submissionId: string, reviewerId: string) => {
    setPendingId(submissionId);
    try {
      const result = await reassignLeadSubmission(submissionId, reviewerId);
      toast(result.message, false);
      await loadWorkload();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), true);
    } finally {
      setPendingId(null);
    }
  };

  const openCount = workload.submissions.filter(row =>
    ['Dalam Review', 'Dikembalikan', 'Diproses'].includes(row.status),
  ).length;

  if (loading || !user) return <div className="loading">Loading...</div>;

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <b>{openCount}</b>
          <span>Tugas terbuka</span>
        </div>
        <div className="kpi warn">
          <b>
            {workload.submissions.filter(row => row.status === 'Dikembalikan').length}
          </b>
          <span>Tugas dikembalikan</span>
        </div>
        <div className="kpi">
          <b>{workload.submissions.length}</b>
          <span>Total pengajuan</span>
        </div>
      </div>

      <section className="card">
        <h2>Beban kerja tim</h2>
        <p className="sub">
          Data status dan penugasan dimuat dari database. Isi invoice dan nilai transaksi
          tidak ditampilkan kepada Service Lead.
        </p>
        {error && (
          <div className="auth-err" role="alert">
            Gagal memuat beban kerja: {error}{' '}
            <button className="btn sm" type="button" onClick={() => void loadWorkload()}>
              Coba lagi
            </button>
          </div>
        )}
        {dataLoading ? (
          <div className="loading">Memuat beban kerja...</div>
        ) : !error && (
          <LeadTable
            rows={workload.submissions}
            reviewers={workload.reviewers}
            pendingId={pendingId}
            onReassign={(submissionId, reviewerId) => {
              void reassign(submissionId, reviewerId);
            }}
          />
        )}
      </section>
    </>
  );
}
