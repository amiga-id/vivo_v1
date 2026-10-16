import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_LABEL } from '@/lib/constants';
import { getAdminDashboard } from '@/lib/admin-api';
import type { AdminDashboardData } from '@/lib/admin-api';
import { useSession } from '@/lib/session';
import { Empty } from '@/components/ui';

const ROLE_ORDER = ['support', 'finance', 'lead', 'admin'] as const;

export default function AdminDashboard() {
  const { user, loading: sessionLoading } = useSession();
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDashboard(await getAdminDashboard());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadDashboard();
  }, [user, loadDashboard]);

  if (sessionLoading || !user) return <div className="loading">Loading...</div>;
  if (loading) return <div className="loading">Memuat dashboard admin...</div>;

  return (
    <>
      {error && (
        <div className="auth-err" role="alert">
          Gagal memuat dashboard: {error}{' '}
          <button className="btn sm" type="button" onClick={() => void loadDashboard()}>
            Coba lagi
          </button>
        </div>
      )}
      {!error && dashboard && (
        <>
          <div className="kpis">
            <div className="kpi"><b>{dashboard.account_count}</b><span>Total akun</span></div>
            <div className="kpi"><b>{dashboard.vendor_count}</b><span>Total vendor</span></div>
            <div className="kpi"><b>{dashboard.submission_count}</b><span>Total pengajuan</span></div>
            <div className="kpi warn"><b>{dashboard.open_submission_count}</b><span>Pengajuan berjalan</span></div>
          </div>

          <div className="admin-dashboard-grid">
            <section className="card">
              <h2>Akun berdasarkan peran</h2>
              <div className="tblw">
                <table className="tbl">
                  <thead><tr><th>Peran</th><th>Jumlah akun</th></tr></thead>
                  <tbody>
                    {ROLE_ORDER.map(role => (
                      <tr key={role}>
                        <td>{ROLE_LABEL[role]}</td>
                        <td>{dashboard.accounts_by_role[role] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link className="btn sm" to="/admin/users">Kelola akun</Link>
            </section>

            <section className="card">
              <h2>Pengajuan berdasarkan status</h2>
              <div className="tblw">
                <table className="tbl">
                  <thead><tr><th>Status</th><th>Jumlah</th></tr></thead>
                  <tbody>
                    {Object.entries(dashboard.submissions_by_status).length === 0
                      ? <tr><td colSpan={2}>Belum ada pengajuan</td></tr>
                      : Object.entries(dashboard.submissions_by_status).map(([status, count]) => (
                        <tr key={status}><td>{status}</td><td>{count}</td></tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <Link className="btn sm" to="/admin/clients">Kelola klien dan vendor</Link>
            </section>
          </div>

          <section className="card">
            <h2>Aktivitas terbaru</h2>
            {dashboard.recent_events.length === 0
              ? <Empty title="Belum ada aktivitas">Aktivitas yang tersimpan akan muncul di sini.</Empty>
              : (
                <ul className="tl">
                  {dashboard.recent_events.map(event => (
                    <li key={event.id}>
                      <div className="when">
                        {new Intl.DateTimeFormat('id-ID', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(event.created_at))}
                        {' '}oleh {event.actor_name}
                        {event.entity_label ? ` · ${event.entity_label}` : ''}
                      </div>
                      <div className="what">{event.action}</div>
                      {event.detail && <div className="det">{event.detail}</div>}
                    </li>
                  ))}
                </ul>
              )}
            <Link className="btn sm" to="/admin/audit">Lihat semua riwayat audit</Link>
          </section>
        </>
      )}
    </>
  );
}
