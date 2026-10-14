import { useState } from 'react';
import { can } from '@/lib/rbac';
import { PROBES } from '@/lib/probe';
import { store } from '@/lib/store';
import { useSession } from '@/lib/session';
import { ROLE_LABEL } from '@/lib/constants';

export default function ProbePanel({ who }: { who: string }) {
  const { user } = useSession();
  const [res, setRes] = useState<{ ok: boolean; why?: string; label: string }[]>([]);

  if (!user) return null;

  const run = (i: number) => {
    const p    = PROBES[i];
    const perm = typeof p.perm === 'function' ? p.perm(user.role) : p.perm;
    const doc  = p.docId ? store.docs.find(d => d.id === p.docId) : null;
    const r    = can(user, perm, doc ?? undefined);
    setRes(prev => [{ ok: r.ok, why: r.why, label: p.label }, ...prev].slice(0, 6));
  };

  return (
    <details className="card probe">
      <summary>Uji kebijakan akses (khusus prototipe)</summary>
      <p className="sub">
        Setiap tombol mencoba satu aksi sebagai {user.name} ({ROLE_LABEL[user.role]}).
        Hasilnya keputusan kebijakan dan tidak mengubah data.
      </p>
      <div className="tests">
        {PROBES.map((p, i) => (
          <button key={p.label} className="btn sm" onClick={() => run(i)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="res">
        {res.map((r, i) => (
          <div key={i} className={r.ok ? 'y' : 'n'}>
            <b>{r.ok ? 'Diizinkan' : '403 Ditolak'}</b>
            <span>{r.label}{r.ok ? '' : `. ${r.why ?? ''}`}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
