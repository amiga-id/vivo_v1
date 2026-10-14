/**
 * LeadAssign – Service Lead assigns which clients each Intake Support handles.
 */
import { useState } from 'react';
import { useSession } from '@/lib/session';
import * as api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useBusy } from '@/components/useBusy';
import { Empty } from '@/components/ui';
import { store } from '@/lib/store';

export default function LeadAssign() {
  const { user, loading } = useSession();
  const toast             = useToast();
  const [pending, start]  = useBusy();
  const [key, setKey]     = useState(0); // force re-render

  if (loading || !user) return <div className="loading">Loading...</div>;

  const supports   = store.users.filter(u => u.role === 'support' && u.status === 'Aktif');
  const allClients = store.clients.map(c => c.namaPT);
  const assignments = api.getAssignments(user);

  const getAssigned = (supportId: string) =>
    assignments.find(a => a.supportId === supportId)?.klien ?? [];

  const toggle = (supportId: string, klien: string) => {
    const current = getAssigned(supportId);
    const next    = current.includes(klien)
      ? current.filter(k => k !== klien)
      : [...current, klien];
    start(async () => {
      const r = api.setAssignment(user, supportId, next);
      toast(r.msg, !r.ok);
      if (r.ok) setKey(k => k + 1);
    });
  };

  return (
    <section className="card" key={key}>
      <h2>Penugasan klien ke Intake Support</h2>
      <p className="sub">
        Tentukan klien mana yang ditangani oleh setiap Intake Support.
        Intake Support hanya bisa mengunggah dokumen untuk klien yang ditugaskan kepadanya.
      </p>

      {supports.length === 0 && (
        <Empty title="Belum ada Intake Support aktif">
          Minta System Admin menambahkan akun pegawai dengan peran Intake Support.
        </Empty>
      )}

      {supports.map(s => {
        const assigned = getAssigned(s.id);
        return (
          <div key={s.id} style={{
            border: '1.5px solid var(--line)', borderRadius: 'var(--r-md)',
            padding: '14px 16px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <strong>{s.name}</strong>
                <span className="m" style={{ marginLeft: 8 }}>{s.email}</span>
              </div>
              <span className="badge s-Aktif">{assigned.length} klien</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allClients.map(klien => {
                const on = assigned.includes(klien);
                return (
                  <button
                    key={klien}
                    className={`chip${on ? '' : ''}`}
                    aria-pressed={on}
                    disabled={pending}
                    onClick={() => toggle(s.id, klien)}
                    style={{
                      background: on ? 'var(--teal)' : undefined,
                      color: on ? 'var(--on-teal)' : undefined,
                      borderColor: on ? 'var(--teal)' : undefined,
                      fontWeight: on ? 600 : undefined,
                    }}>
                    {on ? '✓ ' : ''}{klien}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="m" style={{ marginTop: 10 }}>
        Klik nama klien untuk menambah atau melepas penugasan. Perubahan berlaku langsung.
      </p>
    </section>
  );
}
