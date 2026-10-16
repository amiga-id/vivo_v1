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

  const initialTax = taxDoc.tax?.[0];
  const initialPreset = TAX_PRESETS.find(p => p.code === initialTax?.code);
  const [selectedTax, setSelectedTax] = useState(
    initialTax ? (initialPreset ? initialPreset.code : 'custom') : '',
  );
  const [selectedRate, setSelectedRate] = useState(
    String(initialTax?.rate ?? initialPreset?.rate ?? ''),
  );
  const [custom, setCustom] = useState<TaxLine | null>(
    initialTax && !initialPreset ? initialTax : null,
  );
  const [nc, setNc]           = useState({ label: '', rate: '', kind: 'withhold' as TaxLine['kind'] });
  const [approvers, setApprovers] = useState<1 | 2>(taxDoc.approvers);
  const [ncErr, setNcErr]     = useState('');

  const selectedPreset = TAX_PRESETS.find(p => p.code === selectedTax);
  const lines: TaxLine[] = selectedPreset
    ? [{
        code: selectedPreset.code,
        label: selectedPreset.label,
        rate: Number(selectedRate.replace(',', '.')),
        kind: selectedPreset.kind,
      }]
    : selectedTax === 'custom' && custom ? [custom] : [];
  const bad = lines.some(l => !isFinite(l.rate) || l.rate <= 0 || l.rate > 100);
  const bd  = computeTaxes(taxDoc.dpp, bad ? [] : lines);

  const addCustom = () => {
    const rate = Number(String(nc.rate).replace(',', '.'));
    if (!nc.label.trim()) { setNcErr('Isi nama pajak.'); return; }
    if (!isFinite(rate) || rate <= 0 || rate > 100) { setNcErr('Tarif harus lebih dari 0 dan paling besar 100%.'); return; }
    setNcErr('');
    setCustom({ code: `LAIN${Date.now() % 100000}`, label: nc.label.trim().slice(0, 40), rate, kind: nc.kind });
    setSelectedTax('custom');
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
          Pilih satu pajak yang berlaku untuk invoice ini. Pajak dihitung dari DPP.
          Tarif adalah nilai awal dan bisa Anda ubah.
        </p>
        <div className="banner info">
          <span>Tarif awal hanya contoh. Pastikan sesuai ketentuan yang berlaku dan konfirmasi ke tim pajak AMIGA bila ragu.</span>
        </div>

        {taxDoc.tax && taxDoc.tax.length > 1 && (
          <div className="banner info">
            Dokumen ini memiliki beberapa pajak tersimpan. Pilih satu pajak; saat disimpan,
            hanya pilihan tersebut yang akan digunakan.
          </div>
        )}

        <label className="tax-select-label">
          Pajak yang berlaku
          <select
            value={selectedTax}
            onChange={event => {
              const code = event.target.value;
              setSelectedTax(code);
              const preset = TAX_PRESETS.find(item => item.code === code);
              if (preset) {
                const savedRate = taxDoc.tax?.find(item => item.code === code)?.rate;
                setSelectedRate(String(savedRate ?? preset.rate));
              }
            }}
          >
            <option value="">Tanpa pajak</option>
            {TAX_PRESETS.map(p => (
              <option key={p.code} value={p.code}>
                {p.label} — {p.kind === 'add' ? 'ditambah' : 'dipotong'}
              </option>
            ))}
            {custom && <option value="custom">{custom.label} — pajak lainnya</option>}
          </select>
        </label>

        {selectedPreset && (
          <div className="taxrow on">
            <div className="taxchk">
              <span>
                <b>{selectedPreset.label}</b>
                <small>{selectedPreset.hint}</small>
              </span>
            </div>
            <label className="rate">
              <input
                type="text"
                inputMode="decimal"
                value={selectedRate}
                onChange={event => setSelectedRate(event.target.value)}
                aria-label={`Tarif ${selectedPreset.label}`}
              />
              <span>%</span>
            </label>
            <div className="amt">
              {`${selectedPreset.kind === 'add' ? '+' : '−'} ${rp(
                Math.round(taxDoc.dpp * (Number(selectedRate.replace(',', '.')) || 0) / 100),
              )}`}
            </div>
          </div>
        )}

        {selectedTax === 'custom' && custom && (
          <div className="taxrow on">
            <div className="taxchk">
              <span>
                <b>{custom.label}</b>
                <small>Pajak lainnya</small>
              </span>
            </div>
            <button
              className="btn sm"
              type="button"
              onClick={() => {
                setCustom(null);
                setSelectedTax('');
              }}
            >
              Hapus
            </button>
            <div className="amt">
              {custom.kind === 'add' ? '+' : '−'} {rp(Math.round(taxDoc.dpp * custom.rate / 100))}
            </div>
          </div>
        )}

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
