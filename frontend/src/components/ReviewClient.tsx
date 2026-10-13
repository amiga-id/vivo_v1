'use client';

import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { correctField, decideDoc } from '@/lib/api';
import { FIELDS } from '@/lib/constants';
import { dstr, rp } from '@/lib/format';
import { tally } from '@/lib/validate';
import type { Doc, FieldKey, Validation } from '@/lib/types';
import Icon from './Icon';
import { useToast } from './Toast';
import { useBusy } from './useBusy';

export default function ReviewClient({ doc, validation }: { doc: Doc; validation: Validation }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useBusy();
  const [hl, setHl] = useState<FieldKey | null>(null);
  const [reason, setReason] = useState('');
  const t = tally(validation);
  const s = doc.src;
  const row = (k: FieldKey, l: string, v: string, bold = false) => (
    <div className={`row2${hl === k ? ' hl' : ''}`}><span>{bold ? <b>{l}</b> : l}</span><span>{bold ? <b>{v}</b> : v}</span></div>
  );

  const blur = (k: FieldKey, raw: string) => {
    const def = FIELDS.find((x) => x.k === k);
    const cur = def?.type === 'num' ? String(doc.f[k]) : String(doc.f[k]);
    const next = def?.type === 'num' ? String(Number(raw.replace(/\D/g, '') || 0)) : raw.trim();
    if (cur === next) return;
    start(async () => { const r = await correctField(doc.id, k, raw); toast(r.msg, !r.ok); router.refresh(); });
  };
  const decide = (kind: 'approve' | 'reject' | 'reqinfo') =>
    start(async () => {
      const r = await decideDoc(doc.id, kind, reason);
      toast(r.msg, !r.ok);
      if (r.ok) router.push('/finance'); else router.refresh();
    });

  return (
    <div className="split">
      <section className="card">
        <div className="pane-h"><h2>Dokumen asli</h2><span className="m">{doc.id}, {doc.klien}</span></div>
        {doc.hasFile ? (
          <iframe className="pdfframe" title="Dokumen asli" src={`/api/docs/${doc.id}/file`} />
        ) : (
          <div className="paper">
            <h3>INVOICE</h3>
            <div style={{ color: '#777', marginBottom: 10 }}>{s.vendor}</div>
            {row('no', 'Nomor', s.no)}
            {row('tgl', 'Tanggal', dstr(s.tgl))}
            {row('vendor', 'Kepada', doc.klien)}
            {row('npwp', 'NPWP', s.npwp)}
            <hr />
            <table>
              <thead><tr><th>Uraian</th><th>Jumlah</th></tr></thead>
              <tbody>
                <tr><td>Jasa layanan periode berjalan</td><td>{rp(Math.round(s.dpp * 0.7))}</td></tr>
                <tr><td>Biaya tambahan</td><td>{rp(s.dpp - Math.round(s.dpp * 0.7))}</td></tr>
              </tbody>
            </table>
            {row('dpp', 'DPP', rp(s.dpp))}
            {row('ppn', 'PPN 11%', rp(s.ppn))}
            {row('total', 'Total', rp(s.total), true)}
            <hr />
            {row('rek', 'Transfer ke', s.rek)}
          </div>
        )}
      </section>
      <section className="card">
        <div className="pane-h"><h2>Data ekstraksi</h2></div>
        <div className="sumbar">
          <span className="pill ok">{t.ok} sesuai</span><span className="pill warn">{t.warn} perlu dicek</span><span className="pill err">{t.err} bermasalah</span>
        </div>
        {doc.issue && doc.status === 'Perlu Tindakan' && <div className="banner info"><span>Catatan: {doc.issue}</span></div>}
        {FIELDS.map((x) => {
          const r = validation[x.k];
          const val = String(doc.f[x.k]);
          return (
            <div className={`fld ${r.s}`} key={x.k + val}>
              <div className="lbl"><label htmlFor={`f-${x.k}`}>{x.label}</label><em>Keyakinan {Math.round(doc.conf[x.k] * 100)}%</em></div>
              <input type="text" id={`f-${x.k}`} defaultValue={val} inputMode={x.type === 'num' ? 'numeric' : undefined}
                onFocus={() => setHl(x.k)} onBlur={(e) => { setHl(null); blur(x.k, e.target.value); }} />
              <div className="msg"><Icon name={r.s === 'ok' ? 'ok' : 'warn'} size={15} /><span>{r.m}</span></div>
            </div>
          );
        })}
        <div className="reason">
          <label>Alasan <small className="m">(wajib untuk menolak atau meminta info)</small>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tulis alasan singkat untuk klien" />
          </label>
        </div>
        <div className="actions">
          <button className="btn primary" disabled={pending || t.err > 0} onClick={() => decide('approve')}>Setujui hasil ekstraksi</button>
          <button className="btn" disabled={pending} onClick={() => decide('reqinfo')}>Minta info klien</button>
          <button className="btn danger" disabled={pending} onClick={() => decide('reject')}>Tolak</button>
        </div>
        {t.err > 0 && <p className="m" style={{ margin: '10px 0 0' }}>Selesaikan field bermasalah dulu sebelum menyetujui.</p>}
      </section>
    </div>
  );
}
