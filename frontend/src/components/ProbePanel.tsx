'use client';

import { useState } from 'react';
import { runProbe } from '@/lib/api';
import { PROBES } from '@/lib/probe';
import { useBusy } from './useBusy';

export default function ProbePanel({ who }: { who: string }) {
  const [res, setRes] = useState<{ ok: boolean; why?: string; label: string }[]>([]);
  const [pending, start] = useBusy();
  return (
    <details className="card probe">
      <summary>Uji kebijakan akses (khusus prototipe)</summary>
      <p className="sub">
        Setiap tombol mencoba satu aksi sebagai {who}. Hasilnya keputusan kebijakan dan tidak mengubah data.
        Penolakan tercatat di riwayat audit System Admin.
      </p>
      <div className="tests">
        {PROBES.map((p, i) => (
          <button key={p.label} className="btn sm" disabled={pending}
            onClick={() => start(async () => { const r = await runProbe(i); setRes((x) => [r, ...x].slice(0, 6)); })}>
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
