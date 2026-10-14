/**
 * UploadForm – 4-step upload wizard
 *  Step 1: Pick PDF
 *  Step 2: Fill metadata (klien, jenis, tgl, notes) + tax checkboxes
 *  Step 3: Preview (simulated AI extraction result)
 *  Step 4: Confirm submit → creates doc
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '@/lib/api';
import { JENIS, TAX_PRESETS } from '@/lib/constants';
import { computeTaxes } from '@/lib/services';
import { rp } from '@/lib/format';
import type { TaxLine, User } from '@/lib/types';
import Icon from './Icon';
import { Banner } from './ui';
import { useToast } from './Toast';
import { useBusy } from './useBusy';

/* ── helpers ── */
type TaxSel = Record<string, { on: boolean; rate: string }>;

function initSel(): TaxSel {
  const s: TaxSel = {};
  TAX_PRESETS.forEach(p => { s[p.code] = { on: p.code === 'PPN', rate: String(p.rate) }; });
  return s;
}

function toLines(sel: TaxSel): TaxLine[] {
  return TAX_PRESETS
    .filter(p => sel[p.code].on)
    .map(p => ({
      code: p.code, label: p.label,
      rate: Number(String(sel[p.code].rate).replace(',', '.')),
      kind: p.kind,
    }));
}

/* ── Simulated AI preview (replace with real Bedrock call when available) ── */
function simulateExtraction(file: File, klien: string, tgl: string) {
  return {
    vendor: `${klien} (vendor)`,
    npwp: '06.789.012.3-456.000',
    dpp: 8_000_000,
    ppn: 880_000,
    total: 8_880_000,
    rek: 'BCA 1122334455',
    no: `INV-${Date.now().toString().slice(-6)}`,
    tgl,
    confidence: { no: 0.98, tgl: 0.97, vendor: 0.95, npwp: 0.93, dpp: 0.96, ppn: 0.94, total: 0.97, rek: 0.90 },
  };
}

export default function UploadForm({ user, home }: { user: User; home: string }) {
  const navigate     = useNavigate();
  const toast        = useToast();
  const [pending, start] = useBusy();

  /* ── Step state ── */
  const [step, setStep]  = useState<1 | 2 | 3>(1);
  const [file, setFile]  = useState<File | null>(null);
  const [over, setOver]  = useState(false);
  const [errs, setErrs]  = useState<Record<string, string>>({});

  /* ── Form fields ── */
  const [klien,  setKlien]  = useState('');
  const [jenis,  setJenis]  = useState('');
  const [tgl,    setTgl]    = useState(new Date().toISOString().slice(0, 10));
  const [cat,    setCat]    = useState('');
  const [approvers, setApprovers] = useState<1 | 2>(1);

  /* ── Tax selection ── */
  const [sel, setSel]        = useState<TaxSel>(initSel);
  const [customTax, setCustomTax] = useState<TaxLine[]>([]);
  const [nc, setNc]          = useState({ label: '', rate: '', kind: 'withhold' as TaxLine['kind'] });
  const [ncErr, setNcErr]    = useState('');

  /* ── Preview (simulated) ── */
  const [preview, setPreview] = useState<ReturnType<typeof simulateExtraction> | null>(null);

  const klienList = api.getKlienOptions(user);
  const blocked   = klienList.length === 0;
  const lines     = toLines(sel).concat(customTax);
  const bd        = computeTaxes(preview?.dpp ?? 8_000_000, lines);

  /* ── File pick ── */
  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) { setErrs(e => ({ ...e, file: 'File harus PDF.' })); return; }
    if (f.size > 10 * 1024 * 1024) { setErrs(e => ({ ...e, file: 'Maksimal 10 MB.' })); return; }
    setFile(f); setErrs(e => ({ ...e, file: '' }));
  };

  /* ── Validate step 2 → go to preview ── */
  const goPreview = () => {
    const e: Record<string, string> = {};
    if (!file)  e.file  = 'Pilih file PDF.';
    if (!klien) e.klien = 'Pilih klien.';
    if (!jenis) e.jenis = 'Pilih jenis permintaan.';
    const badRate = lines.some(l => !isFinite(l.rate) || l.rate <= 0 || l.rate > 100);
    if (badRate) e.tax = 'Periksa tarif pajak.';
    setErrs(e);
    if (Object.keys(e).length) return;
    // Simulate AI reading the file
    setPreview(simulateExtraction(file!, klien, tgl));
    setStep(3);
  };

  /* ── Submit ── */
  const submit = () => start(async () => {
    const r = api.uploadDocument(user, {
      klien, jenis, tgl, cat,
      tax: lines, approvers, fileName: file!.name,
    });
    toast(r.msg, !r.ok);
    if (r.ok) navigate(home);
  });

  /* ── Add custom tax ── */
  const addCustom = () => {
    const rate = Number(String(nc.rate).replace(',', '.'));
    if (!nc.label.trim()) { setNcErr('Isi nama pajak.'); return; }
    if (!isFinite(rate) || rate <= 0 || rate > 100) { setNcErr('Tarif harus 0–100%.'); return; }
    setNcErr('');
    setCustomTax(p => [...p, { code: `LAIN${Date.now() % 100000}`, label: nc.label.trim().slice(0, 40), rate, kind: nc.kind }]);
    setNc({ label: '', rate: '', kind: 'withhold' });
  };

  /* ── Render step indicator ── */
  const StepBar = () => (
    <div className="steps" style={{ marginBottom: 18 }}>
      {(['1', '2', '3'] as const).map((s, i) => {
        const labels = ['Pilih file', 'Metadata & pajak', 'Preview & konfirmasi'];
        const n = i + 1;
        const done = n < step;
        const now  = n === step;
        return (
          <div key={s} className={`step ${done ? 'done' : now ? 'now' : ''}`}>
            <i>{done ? '✓' : n}</i>{labels[i]}
            {i < 2 && <span className="m" style={{ margin: '0 6px' }}>/</span>}
          </div>
        );
      })}
    </div>
  );

  /* ════════════════════════ STEP 1 ════════════════════════ */
  if (step === 1) return (
    <section className="card">
      <StepBar />
      {blocked && (
        <Banner kind="block">
          <Icon name="lock" size={14} />
          Belum ada klien yang ditugaskan kepada Anda. Hubungi Service Lead.
        </Banner>
      )}
      <label
        className={`drop${file ? ' has' : ''}${over ? ' over' : ''}`}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <input type="file" accept="application/pdf,.pdf" hidden onChange={e => pick(e.target.files?.[0])} />
        <Icon name="file" size={34} />
        {file
          ? <><b>{file.name}</b><span>Klik untuk mengganti file</span></>
          : <><b>Tarik PDF invoice ke sini</b><span>atau klik untuk memilih</span></>}
      </label>
      {errs.file && <div className="err-t" style={{ marginTop: 8 }}>{errs.file}</div>}
      <div className="actions" style={{ marginTop: 20 }}>
        <button className="btn primary" disabled={!file || blocked} onClick={() => setStep(2)}>
          Lanjut isi metadata
        </button>
      </div>
    </section>
  );

  /* ════════════════════════ STEP 2 ════════════════════════ */
  if (step === 2) return (
    <section className="card">
      <StepBar />
      <div className="form">
        {/* Klien */}
        <label>
          Klien
          <select value={klien} onChange={e => { setKlien(e.target.value); setErrs(v => ({ ...v, klien: '' })); }}>
            <option value="">Pilih klien</option>
            {klienList.map(k => <option key={k}>{k}</option>)}
          </select>
          {errs.klien && <span className="err-t">{errs.klien}</span>}
        </label>

        {/* Jenis */}
        <label>
          Jenis permintaan
          <select value={jenis} onChange={e => { setJenis(e.target.value); setErrs(v => ({ ...v, jenis: '' })); }}>
            <option value="">Pilih jenis</option>
            {JENIS.map(j => <option key={j}>{j}</option>)}
          </select>
          {errs.jenis && <span className="err-t">{errs.jenis}</span>}
        </label>

        {/* Tanggal */}
        <label>
          Tanggal diterima
          <input type="date" value={tgl} onChange={e => setTgl(e.target.value)} />
        </label>

        {/* Penyetuju */}
        <label>
          Penyetuju voucher (BOD)
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <label style={{ display: 'flex', gap: 8, fontWeight: 400 }}>
              <input type="radio" name="apv" checked={approvers === 1} onChange={() => setApprovers(1)} /> 1 pihak
            </label>
            <label style={{ display: 'flex', gap: 8, fontWeight: 400 }}>
              <input type="radio" name="apv" checked={approvers === 2} onChange={() => setApprovers(2)} /> 2 pihak
            </label>
          </div>
        </label>

        {/* Catatan */}
        <label className="full">
          Catatan untuk reviewer <small className="m">(opsional)</small>
          <textarea rows={2} value={cat} onChange={e => setCat(e.target.value)}
            placeholder="Contoh: invoice ini sudah ditagih sebelumnya." />
        </label>
      </div>

      {/* ─── Tax checkboxes (replaces saluran) ─── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
          Pajak yang berlaku
          <small className="m" style={{ marginLeft: 8, fontWeight: 400 }}>
            Tarif awal hanya contoh — konfirmasi ke tim pajak Anda
          </small>
        </div>
        {errs.tax && <div className="err-t" style={{ marginBottom: 8 }}>{errs.tax}</div>}

        {TAX_PRESETS.map(p => {
          const x   = sel[p.code];
          const amt = Math.round((preview?.dpp ?? 8_000_000) * (Number(String(x.rate).replace(',', '.')) || 0) / 100);
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
                  onChange={e => setSel(prev => ({ ...prev, [p.code]: { ...prev[p.code], rate: e.target.value } }))} />
                <span>%</span>
              </label>
              <div className="amt">{x.on ? `${p.kind === 'add' ? '+' : '−'} ${rp(amt)}` : ''}</div>
            </div>
          );
        })}

        {customTax.map((c, i) => (
          <div className="taxrow on" key={c.code}>
            <div className="taxchk">
              <span>
                <b>{c.label}</b>{' '}
                <span className={`tag ${c.kind}`}>{c.kind === 'add' ? 'ditambah' : 'dipotong'}</span>
              </span>
            </div>
            <button className="btn sm" onClick={() => setCustomTax(prev => prev.filter((_, j) => j !== i))}>Hapus</button>
            <div className="amt">{c.kind === 'add' ? '+' : '−'} {rp(Math.round((preview?.dpp ?? 8_000_000) * c.rate / 100))}</div>
          </div>
        ))}

        <div className="taxadd">
          <b style={{ fontSize: 13 }}>Pajak lainnya</b>
          <div className="taxaddrow">
            <input type="text" placeholder="Nama pajak" value={nc.label} onChange={e => setNc(v => ({ ...v, label: e.target.value }))} />
            <input type="text" inputMode="decimal" placeholder="Tarif %" value={nc.rate} onChange={e => setNc(v => ({ ...v, rate: e.target.value }))} />
            <select value={nc.kind} onChange={e => setNc(v => ({ ...v, kind: e.target.value as TaxLine['kind'] }))}>
              <option value="withhold">Dipotong</option>
              <option value="add">Ditambah</option>
            </select>
            <button className="btn sm" onClick={addCustom}>Tambah</button>
          </div>
          {ncErr && <span className="err-t">{ncErr}</span>}
        </div>
      </div>

      <div className="actions" style={{ marginTop: 20 }}>
        <button className="btn" onClick={() => setStep(1)}>← Kembali</button>
        <button className="btn primary" onClick={goPreview}>Lihat preview →</button>
      </div>
    </section>
  );

  /* ════════════════════════ STEP 3 — PREVIEW ════════════════════════ */
  const p = preview!;
  return (
    <div className="split">
      {/* Left: simulated document */}
      <section className="card">
        <div className="pane-h">
          <h2>Preview dokumen</h2>
          <span className="m">Hasil pembacaan AI (simulasi)</span>
        </div>
        <div className="banner info" style={{ marginBottom: 14 }}>
          <Icon name="ok" size={14} />
          <span>AI Engine membaca file <b>{file?.name}</b>. Hasil ini bisa dikoreksi oleh Finance Reviewer setelah dikirim.</span>
        </div>
        <div className="paper">
          <h3>INVOICE</h3>
          <div style={{ color: '#777', marginBottom: 10 }}>{p.vendor}</div>
          {([
            ['Nomor',   p.no],
            ['Tanggal', p.tgl],
            ['Vendor',  p.vendor],
            ['NPWP',    p.npwp],
          ] as [string, string][]).map(([l, v]) => (
            <div className="row2" key={l}>
              <span>{l}</span>
              <span>{v}</span>
            </div>
          ))}
          <hr />
          <div className="row2"><span>DPP</span><span>{rp(p.dpp)}</span></div>
          <div className="row2"><span>PPN 11%</span><span>{rp(p.ppn)}</span></div>
          <div className="row2"><span><b>Total</b></span><span><b>{rp(p.total)}</b></span></div>
          <hr />
          <div className="row2"><span>Rekening</span><span>{p.rek}</span></div>
        </div>

        {/* Confidence scores */}
        <div style={{ marginTop: 14 }}>
          <div className="m" style={{ marginBottom: 6 }}>Tingkat kepercayaan AI per field:</div>
          {Object.entries(p.confidence).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span className="m" style={{ width: 80, fontSize: 12 }}>{k}</span>
              <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 3 }}>
                <div style={{ width: `${Math.round(v * 100)}%`, height: '100%', background: v >= 0.9 ? 'var(--ok)' : v >= 0.8 ? 'var(--warn)' : 'var(--err)', borderRadius: 3 }} />
              </div>
              <span className="m" style={{ width: 34, fontSize: 12 }}>{Math.round(v * 100)}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* Right: voucher summary */}
      <section className="card">
        <div className="pane-h"><h2>Ringkasan voucher</h2></div>

        <div className="sumrow"><span>Klien</span><span><b>{klien}</b></span></div>
        <div className="sumrow"><span>Jenis</span><span>{jenis}</span></div>
        <div className="sumrow"><span>Tanggal</span><span>{tgl}</span></div>
        <div className="sumrow"><span>Penyetuju</span><span>{approvers} pihak</span></div>
        <hr style={{ borderTop: '1px solid var(--line)', margin: '12px 0' }} />
        <div className="sumrow"><span>DPP</span><span>{rp(bd.dpp)}</span></div>
        {bd.lines.map(l => (
          <div className="sumrow" key={l.code}>
            <span>{l.label} {l.rate}%</span>
            <span style={{ color: l.kind === 'add' ? 'var(--ok)' : 'var(--warn)' }}>
              {l.kind === 'add' ? '+' : '−'} {rp(l.amount)}
            </span>
          </div>
        ))}
        {bd.lines.length === 0 && <div className="sumrow m"><span>Tanpa pajak</span></div>}
        <div className="sumrow big"><span>Nominal voucher</span><span>{rp(bd.net)}</span></div>

        {cat && (
          <div className="banner info" style={{ marginTop: 14 }}>
            <span>Catatan: {cat}</span>
          </div>
        )}

        <div className="actions" style={{ marginTop: 20 }}>
          <button className="btn" onClick={() => setStep(2)} disabled={pending}>← Ubah</button>
          <button className="btn primary" disabled={pending} onClick={submit}>
            {pending ? 'Mengirim...' : 'Kirim ke Finance Reviewer ✓'}
          </button>
        </div>
        <p className="m" style={{ marginTop: 10 }}>
          Setelah dikirim, Robot Admin akan membaca file dan Finance Reviewer akan memeriksa hasilnya.
        </p>
      </section>
    </div>
  );
}
