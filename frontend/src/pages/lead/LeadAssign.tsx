import { useCallback, useEffect, useState } from 'react';
import Pagination from '@/components/Pagination';
import { useToast } from '@/components/Toast';
import {
  getClientAssignments,
  getClients,
  updateClientAssignments,
} from '@/lib/document-api';
import type { ClientAssignment, ClientOption } from '@/lib/document-api';
import { getLeadSupportAccounts } from '@/lib/lead-api';
import type { LeadSupportAccount } from '@/lib/lead-api';
import { usePagination } from '@/lib/pagination';
import { useSession } from '@/lib/session';

export default function LeadAssign() {
  const { user, loading: sessionLoading } = useSession();
  const toast = useToast();
  const [supportAccounts, setSupportAccounts] = useState<LeadSupportAccount[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingSupportId, setSavingSupportId] = useState<string | null>(null);
  const pagination = usePagination(supportAccounts);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [accounts, clientRows, assignmentRows] = await Promise.all([
        getLeadSupportAccounts(),
        getClients(),
        getClientAssignments(),
      ]);
      setSupportAccounts(accounts);
      setClients(clientRows);
      setAssignments(assignmentRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const save = async (support: LeadSupportAccount, clientId: string, checked: boolean) => {
    const currentIds = assignments.find(row => row.support_id === support.id)?.client_ids ?? [];
    const nextIds = checked
      ? [...currentIds, clientId]
      : currentIds.filter(id => id !== clientId);
    setSavingSupportId(support.id);
    try {
      await updateClientAssignments(support.id, nextIds);
      await load();
      toast(`Penugasan klien untuk ${support.name} berhasil disimpan.`, false);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), true);
    } finally {
      setSavingSupportId(null);
    }
  };

  if (sessionLoading || !user) return <div className="loading">Loading...</div>;

  return (
    <section className="card">
      <h2>Penugasan klien Intake Support</h2>
      <p className="sub">
        Perubahan disimpan langsung ke database. Setiap klien hanya dapat ditugaskan kepada
        satu akun Intake Support; memilih klien pada akun lain akan memindahkan penugasannya.
      </p>
      {error && (
        <div className="auth-err" role="alert">
          Gagal memuat data penugasan: {error}{' '}
          <button className="btn sm" type="button" onClick={() => void load()}>
            Coba lagi
          </button>
        </div>
      )}
      {loading ? (
        <div className="loading">Memuat akun dan penugasan...</div>
      ) : !error && supportAccounts.length === 0 ? (
        <div className="empty">Belum ada akun Intake Support.</div>
      ) : !error && (
        <>
          <div className="queue">
            {pagination.pageItems.map(support => {
              const assignedIds = assignments.find(
                row => row.support_id === support.id,
              )?.client_ids ?? [];
              return (
                <div
                  className="q"
                  key={support.id}
                  style={{ gridTemplateColumns: '1fr 2fr auto' }}
                >
                  <div>
                    <div className="t">{support.name}</div>
                    <div className="m">{support.email}</div>
                  </div>
                  <div className="form">
                    {clients.length === 0 ? (
                      <span className="m">Belum ada klien/vendor tersedia.</span>
                    ) : clients.map(client => (
                      <label
                        key={client.id}
                        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                      >
                        <input
                          type="checkbox"
                          checked={assignedIds.includes(client.id)}
                          disabled={savingSupportId !== null}
                          onChange={event => void save(
                            support,
                            client.id,
                            event.target.checked,
                          )}
                        />
                        {client.name}
                      </label>
                    ))}
                  </div>
                  <span className="m" role="status" aria-live="polite">
                    {savingSupportId === support.id
                      ? 'Menyimpan perubahan...'
                      : 'Perubahan tersimpan otomatis'}
                  </span>
                </div>
              );
            })}
          </div>
          <Pagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            firstItem={pagination.firstItem}
            lastItem={pagination.lastItem}
            totalItems={supportAccounts.length}
            onPageChange={pagination.setPage}
          />
        </>
      )}
    </section>
  );
}
