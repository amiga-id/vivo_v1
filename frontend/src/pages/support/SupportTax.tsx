import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import * as api from '@/lib/api';
import { TAX_PRESETS } from '@/lib/constants';
import { rp } from '@/lib/format';
import { computeTaxes } from '@/lib/services';
import type { TaxLine } from '@/lib/types';
import { useToast } from '@/components/Toast';
import { useBusy } from '@/components/useBusy';
import { Empty } from '@/components/ui';
import Icon from '@/components/Icon';

export default function SupportTax() {
  const { id }           = useParams<{ id: string }>();
  const { user, loading } = useSession();
  const navigate         = useNavigate();
  const toast            = useToast();
  const [pending, start] = useBusy();

  if (loading || !user || !id) return <div className="loading">Loading...</div>;

  let taxDoc: ReturnType<typeof api.getTaxDoc>;
  try { taxDoc = api.getTaxDoc(user, id); }
  catch (e) {
    return <section className="card"><Empty title="Tidak bisa diakses">{(e as Error).message}</Empty></section>;
  }

  return <TaxForm user={user} taxDoc={taxDoc} home={`/${user.role}`} onSave={() => navigate(`/${user.role}`)} />;
}

export function TaxForm({
  user, taxDoc, home, onSave,
}: {
  user: ReturnType<typeof useSession>['user'];
  taxDoc: ReturnType<typeof api.getTaxDoc>;
  home: string;
  onSave?: () => void;
}) {
  const navigate         = useNavigate();
  const toast            = useToast();
  const [pending, start] = useBusy();

  type Sel = Record<string, { on: boolean; rate: string }>;
  const [sel, setSel]         = useState<Sel>(() => {
    const s: Sel = {};
    TAX_PRESETS.forEach(p => {
      const sv = taxDoc.tax?.find(t => t.code === p.code);
      s[p.code] = { on: !!sv, rate: String(sv ? sv.rate : p.rate) };
    });
    return s;
  });
  const [custom, setCustom]   = useState<TaxLine[]>(
    (taxDoc.tax ?? []).filter(t => !TAX_PRESETS.some(p => p.code === t.code)),
  );
  const [nc, setNc]           = useState({ label: '', rate: '', kind: 'withhold' as TaxLine['kind'] });
  const [approvers, setApprovers] = useState<1 | 2>(taxDoc.approvers);
  const [ncErr, setNcErr]     = useState('');

  const lines: TaxLine[] = [
    ...TAX_PRESETS.filter(p => sel[p.code].on).map(p => ({
      code: p.code, label: p.label,
      rate: Number(String(sel[p.code].rate).replace(',', '.')),
      kind: p.kind,
    })),
    ...custom,
  ];
  const bad = lines.some(l => !isFinite(l.rate) || l.rate <= 0 || l.rate > 100);
  const bd  = computeTaxes(taxDoc.dpp, bad ? [] : lines);

  const addCustom = () => {
    const rate = Number(String(nc.rate).replace(',', '.'));
    if (!nc.label.trim()) { setNcErr('Isi nama pajak.'); return; }
    if (!isFinite(rate) || rate <= 0 || rate > 100) { setNcErr('Tarif harus lebih dari 0 dan paling besar 100%.'); return; }
    setNcErr('');
    setCustom(prev => [...prev, { code: `LAIN${Date.now() % 100000}`, label: nc.label.trim().slice(0, 40), rate, kind: nc.kind }]);
    setNc({ label: '', rate: '', kind: 'withhold' });
  };

  if (!user) return null;

  const save = () => start(async () => {
    const r = api.setTax(user, taxDoc.id, lines, approvers);
    toast(r.msg, !r.ok);
    if (r.ok) onSave?.();
  });

  return (
    <div className="split">
      {/* Left: tax selection */}
      <section className="card">
        <div className="pane-h">
          <h2>Pilih pajak</h2>
          <span className="m">{taxDoc.no}, {taxDoc.klien}</span>
        </div>
        <p className="sub" style={{ marginTop: 0 }}>
          Centang pajak yang berlaku untuk invoice ini. Semua dihitung dari DPP.
          Tarif adalah nilai awal dan bisa Anda ubah.
        </p>
        <div className="banner info">
          <span>Tarif awal hanya contoh. Pastikan sesuai ketentuan yang berlaku dan konfirmasi ke tim pajak AMIGA bila ragu.</span>
        </div>

        {TAX_PRESETS.map(p => {
          const x   = sel[p.code];
          const amt = Math.round(taxDoc.dpp * (Number(String(x.rate).replace(',', '.')) || 0) / 100);
          return (
            <div className={`taxrow${x.on ? ' on' : ''}`} key={p.code}>
              <label className="taxchk">
                <input type="checkbox" checked={x.on}
                  onChange={e => setSel(prev => ({ ...prev, [p.code]: { ...prev[p.code], on: e.target.checked } }))} />
                <span>
                  <b>{p.label}</b>{' '}
                  <span className={`tag ${p.kind}`}>{p.kind === 'add' ? 'ditambah' : 'dipotong'}</span>
                  <small>{p.hint}</small>
                </span>
              </label>
              <label className="rate">
                <input type="text" inputMode="decimal" value={x.rate} disabled={!x.on}
                  onChange={e => setSel(prev => ({ ...prev, [p.code]: { ...prev[p.code], rate: e.target.value } }))}
                  aria-label={`Tarif ${p.label}`} />
                <span>%</span>
              </label>
              <div className="amt">
                {x.on ? `${p.kind === 'add' ? '+' : '−'} ${rp(amt)}` : ''}
              </div>
            </div>
          );
        })}

        {custom.map((c, i) => (
          <div className="taxrow on" key={c.code}>
            <div className="taxchk">
              <span>
                <b>{c.label}</b>{' '}
                <span className={`tag ${c.kind}`}>{c.kind === 'add' ? 'ditambah' : 'dipotong'}</span>
                <small>Pajak lain, tarif {c.rate}%</small>
              </span>
            </div>
            <button className="btn sm"
              onClick={() => setCustom(prev => prev.filter((_, j) => j !== i))}>
              Hapus
            </button>
            <div className="amt">
              {c.kind === 'add' ? '+' : '−'} {rp(Math.round(taxDoc.dpp * c.rate / 100))}
            </div>
          </div>
        ))}

        <div className="taxadd">
          <b>Pajak lainnya</b>
          <div className="taxaddrow">
            <input type="text" placeholder="Nama pajak" value={nc.label}
              onChange={e => setNc(prev => ({ ...prev, label: e.target.value }))} />
            <input type="text" inputMode="decimal" placeholder="Tarif %" value={nc.rate}
              onChange={e => setNc(prev => ({ ...prev, rate: e.target.value }))} />
            <select value={nc.kind}
              onChange={e => setNc(prev => ({ ...prev, kind: e.target.value as TaxLine['kind'] }))}>
              <option value="withhold">Dipotong</option>
              <option value="add">Ditambah</option>
            </select>
            <button className="btn sm" onClick={addCustom}>Tambah</button>
          </div>
          {ncErr && <span className="err-t">{ncErr}</span>}
        </div>
      </section>

      {/* Right: summary */}
      <section className="card taxsum">
        <div className="pane-h"><h2>Nominal voucher</h2></div>
        <div className="sumrow">
          <span>DPP (dari invoice)</span><span>{rp(taxDoc.dpp)}</span>
        </div>
        {bd.lines.length === 0
          ? <div className="sumrow m"><span>Tanpa pajak</span><span /></div>
          : bd.lines.map(l => (
            <div className="sumrow" key={l.code}>
              <span>{l.label} {l.rate}%</span>
              <span>{l.kind === 'add' ? '+' : '−'} {rp(l.amount)}</span>
            </div>
          ))}
        <div className="sumrow big">
          <span>Nominal voucher</span><span>{rp(bd.net)}</span>
        </div>

        <fieldset className="approvers">
          <legend>Penyetuju voucher (BOD)</legend>
          <label>
            <input type="radio" name="apv" value="1" checked={approvers === 1}
              onChange={() => setApprovers(1)} /> 1 pihak
          </label>
          <label>
            <input type="radio" name="apv" value="2" checked={approvers === 2}
              onChange={() => setApprovers(2)} /> 2 pihak
          </label>
          <small className="m">Menentukan jumlah kotak tanda tangan di voucher.</small>
        </fieldset>

        <div className="actions" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={pending} onClick={save}>Simpan pajak</button>
          <button className="btn" onClick={() => navigate(home)}>Nanti saja</button>
        </div>
        <p className="m" style={{ margin: '10px 0 0' }}>
          <Icon name="lock" size={13} /> Nomor voucher baru diberikan saat Finance menyetujui dokumen.
        </p>
      </section>
    </div>
  );
}
