import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/lib/session';
import * as api from '@/lib/api';
import { FIELDS } from '@/lib/constants';
import { rp, dstr } from '@/lib/format';
import { computeTaxes } from '@/lib/services';
import { tally, validate } from '@/lib/validate';
import Icon from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useBusy } from '@/components/useBusy';
import { Empty } from '@/components/ui';
import { useState } from 'react';
import type { FieldKey } from '@/lib/types';

export default function SupportFix() {
  const { id }           = useParams<{ id: string }>();
  const { user, loading } = useSession();
  const navigate         = useNavigate();
  const toast            = useToast();
  const [pending, start] = useBusy();
  const [reason, setReason] = useState('');
  const [key, setKey]    = useState(0);

  if (loading || !user || !id) return <div className="loading">Loading...</div>;

  let doc: ReturnType<typeof api.getFixDoc>;
  try { doc = api.getFixDoc(user, id); }
  catch (e) {
    return <section className="card"><Empty title="Tidak bisa diakses">{(e as Error).message}</Empty></section>;
  }

  if (doc.status !== 'Dikembalikan') {
    return <section className="card">
      <Empty title="Dokumen tidak perlu diperbaiki">Status saat ini: {doc.status}.</Empty>
    </section>;
  }

  const v   = validate(doc.f, doc.conf);
  const t   = tally(v);
  const bd  = doc.tax ? computeTaxes(doc.f.dpp, doc.tax) : null;
  const s   = doc.src;

  const blur = (k: FieldKey, raw: string) => {
    start(async () => {
      const r = api.correctFixField(user, doc.id, k, raw);
      toast(r.msg, !r.ok);
      setKey(n => n + 1);
    });
  };

  const send = () => start(async () => {
    const r = api.resubmit(user, doc.id, reason);
    toast(r.msg, !r.ok);
    if (r.ok) navigate('/support');
  });

  return (
    <div className="split" key={key}>
      {/* Left: original document */}
      <section className="card">
        <div className="pane-h"><h2>Dokumen asli</h2><span className="m">{doc.id}, {doc.klien}</span></div>
        <div className="paper">
          <h3>INVOICE</h3>
          <div style={{ color: '#777', marginBottom: 10 }}>{s.vendor}</div>
          <div className="row2"><span>Nomor</span><span>{s.no}</span></div>
          <div className="row2"><span>Tanggal</span><span>{dstr(s.tgl)}</span></div>
          <div className="row2"><span>Kepada</span><span>{doc.klien}</span></div>
          <div className="row2"><span>NPWP</span><span>{s.npwp}</span></div>
          <hr />
          <div className="row2"><span>DPP</span><span>{rp(s.dpp)}</span></div>
          <div className="row2"><span>PPN 11%</span><span>{rp(s.ppn)}</span></div>
          <div className="row2"><span><b>Total</b></span><span><b>{rp(s.total)}</b></span></div>
          <hr />
          <div className="row2"><span>Transfer ke</span><span>{s.rek}</span></div>
        </div>
      </section>

      {/* Right: editable data */}
      <section className="card">
        <div className="pane-h"><h2>Perbaiki data</h2></div>
        <div className="banner block">
          <Icon name="warn" size={15} />
          <span><b>Dikembalikan:</b> {doc.issue || 'Perlu perbaikan.'}</span>
        </div>
        <div className="sumbar">
          <span className="pill ok">{t.ok} sesuai</span>
          <span className="pill warn">{t.warn} perlu dicek</span>
          <span className="pill err">{t.err} bermasalah</span>
        </div>

        {FIELDS.map(x => {
          const r   = v[x.k];
          const val = String(doc.f[x.k]);
          return (
            <div className={`fld ${r.s}`} key={x.k}>
              <div className="lbl">
                <label htmlFor={`fix-${x.k}`}>{x.label}</label>
                <em>Keyakinan {Math.round(doc.conf[x.k] * 100)}%</em>
              </div>
              <input type="text" id={`fix-${x.k}`} defaultValue={val}
                inputMode={x.type === 'num' ? 'numeric' : undefined}
                onBlur={e => blur(x.k, e.target.value)} />
              <div className="msg">
                <Icon name={r.s === 'ok' ? 'ok' : 'warn'} size={15} />
                <span>{r.m}</span>
              </div>
            </div>
          );
        })}

        {/* Tax box */}
        <div className="fld ok" style={{ borderLeftColor: doc.tax ? 'var(--teal)' : 'var(--warn)' }}>
          <div className="lbl">
            <span>Pajak dan nominal voucher</span>
            <a href={`/support/tax/${doc.id}`} className="btn sm pink">
              {doc.tax ? 'Ubah pajak' : 'Atur pajak'}
            </a>
          </div>
          {doc.tax
            ? (
              <>
                {bd?.lines.length === 0 && <div className="m">Tanpa pajak</div>}
                {bd?.lines.map(l => (
                  <div key={l.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 14 }}>
                    <span>{l.label} {l.rate}%</span>
                    <span>{l.kind === 'add' ? '+' : '−'} {rp(l.amount)}</span>
                  </div>
                ))}
                {bd && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: 700 }}>
                    <span>Nominal akhir</span><span>{rp(bd.net)}</span>
                  </div>
                )}
              </>
            )
            : (
              <div className="msg" style={{ color: 'var(--warn)' }}>
                <Icon name="warn" size={15} />
                <span>Pajak belum diatur. Atur dulu sebelum mengirim ulang.</span>
              </div>
            )}
        </div>

        <div className="reason">
          <label>
            Catatan untuk Finance Reviewer <small className="m">(opsional)</small>
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Jelaskan apa yang sudah diperbaiki" />
          </label>
        </div>
        <div className="actions">
          <button className="btn primary" disabled={pending || t.err > 0 || !doc.tax} onClick={send}>
            Kirim ulang ke Finance
          </button>
          <button className="btn" disabled={pending} onClick={() => navigate('/support')}>
            Kembali ke antrean
          </button>
        </div>
        {(t.err > 0 || !doc.tax) && (
          <p className="m" style={{ margin: '10px 0 0' }}>
            {t.err > 0 ? 'Selesaikan field bermasalah. ' : ''}
            {!doc.tax ? 'Atur pajak dulu sebelum mengirim ulang.' : ''}
          </p>
        )}
      </section>
    </div>
  );
}
