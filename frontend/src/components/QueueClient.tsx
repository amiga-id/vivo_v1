'use client';

import Link from 'next/link';
import { useState } from 'react';
import { STATUSES } from '@/lib/constants';
import type { DocSummary } from '@/lib/types';
import Icon from './Icon';
import { Badge, Due, Empty } from './ui';

export default function QueueClient({ rows, role }: { rows: DocSummary[]; role: 'support' }) {
  const [fk, setFk] = useState('all');
  const [fs, setFs] = useState('all');
  const klien = [...new Set(rows.map((d) => d.klien))];
  const shown = rows.filter((d) => (fk === 'all' || d.klien === fk) && (fs === 'all' || d.status === fs));
  const c = (s: string) => rows.filter((d) => d.status === s).length;
  return (
    <>
      <div className="kpis">
        <div className="kpi"><b>{rows.length}</b><span>Dokumen Anda</span></div>
        <div className="kpi warn"><b>{c('Perlu Tindakan')}</b><span>Perlu tindakan</span></div>
        <div className="kpi"><b>{c('Dalam Review')}</b><span>Sedang direview</span></div>
        <div className="kpi good"><b>{c('Disetujui')}</b><span>Disetujui</span></div>
      </div>
      <section className="card">
        <h2>Antrean dokumen klien</h2>
        <p className="sub">Dokumen yang perlu Anda perbaiki ditandai merah.</p>
        <div className="filters">
          <label className="m" htmlFor="fk">Klien</label>
          <select className="inline" id="fk" value={fk} onChange={(e) => setFk(e.target.value)}>
            <option value="all">Semua klien</option>
            {klien.map((k) => <option key={k}>{k}</option>)}
          </select>
          <span style={{ width: 6 }} />
          {['all', ...STATUSES].map((s) => (
            <button key={s} className="chip" aria-pressed={fs === s} onClick={() => setFs(s)}>{s === 'all' ? 'Semua status' : s}</button>
          ))}
        </div>
        <div className="queue">
          {shown.length === 0 && (
            <Empty title={rows.length ? 'Tidak ada dokumen yang cocok' : 'Belum ada dokumen di cakupan Anda'}>
              {rows.length ? 'Ubah penyaring untuk melihat antrean lain.' : role === 'support' ? 'Dokumen muncul setelah ada delegasi aktif.' : 'Unggah invoice pertama Anda lewat tab Unggah dokumen.'}
            </Empty>
          )}
          {shown.map((d) => (
            <div className="q" key={d.id}>
              <div><div className="t">{d.no}</div><div className="m">{d.klien}</div></div>
              <div><div>{d.jenis}</div><div className="m">Via {d.saluran}</div></div>
              <div><Badge status={d.status} /></div>
              <div><Due deadline={d.deadline} status={d.status} /></div>
              <div>
                {d.issue && d.status === 'Perlu Tindakan'
                  ? <div className="issue"><Icon name="warn" size={15} /><span>{d.issue}</span></div>
                  : <div className="none">Tidak ada kendala</div>}
              </div>
              <div>
                {d.status === 'Perlu Tindakan'
                  ? <Link className="btn sm pink" href={`/support/fix/${d.id}`}>Perbaiki</Link>
                  : d.status === 'Disetujui'
                    ? <Link className="btn sm" href="/support/voucher">Lihat voucher</Link>
                    : <Link className="btn sm" href={`/support/audit?doc=${d.id}`}>Lacak</Link>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
