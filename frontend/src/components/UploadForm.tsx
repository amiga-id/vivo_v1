'use client';

import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { uploadDocument } from '@/lib/api';
import { JENIS, SALURAN, JENIS_PAJAK } from '@/lib/constants';
import Icon from './Icon';
import { Banner } from './ui';
import { useToast } from './Toast';
import { useBusy } from './useBusy';

export default function UploadForm({ klien, support, today, home }: { klien: string[]; support: boolean; today: string; home: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [pending, start] = useBusy();
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [f, setF] = useState({ klien: '', jenis: '', jenisPajak: '', saluran: '', tgl: today, cat: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: '' })); };
  const now = !file ? 1 : !f.klien || !f.jenis || !f.jenisPajak || !f.saluran ? 2 : 3;

  const pick = (x: File | undefined | null) => {
    if (!x) return;
    if (!/\.pdf$/i.test(x.name)) { setErrs((e) => ({ ...e, file: 'File harus berformat PDF.' })); return; }
    if (x.size > 10 * 1024 * 1024) { setErrs((e) => ({ ...e, file: 'Ukuran file maksimal 10 MB.' })); return; }
    setFile(x); setErrs((e) => ({ ...e, file: '' }));
  };

  const submit = () => {
    const er: Record<string, string> = {};
    if (!file) er.file = 'Pilih file PDF invoice terlebih dulu.';
    if (!f.klien) er.klien = 'Pilih klien.';
    if (!f.jenis) er.jenis = 'Pilih jenis permintaan.';
    if (!f.jenisPajak) er.jenisPajak = 'Pilih jenis pajak.';
    if (!f.saluran) er.saluran = 'Pilih saluran masuk.';
    setErrs(er);
    if (Object.values(er).some(Boolean)) { toast('Lengkapi data yang ditandai merah.', true); return; }
    const fd = new FormData();
    fd.set('file', file as File);
    Object.entries(f).forEach(([k, v]) => fd.set(k, v));
    start(async () => {
      const r = await uploadDocument(fd);
      toast(r.msg, !r.ok);
      if (r.ok) navigate(home);
    });
  };

  const step = (n: number, t: string) => (
    <div className={`step ${n < now ? 'done' : n === now ? 'now' : ''}`}><i>{n < now ? '\u2713' : n}</i>{t}</div>
  );
  const select = (k: 'klien' | 'jenis' | 'jenisPajak' | 'saluran', ph: string, opts: string[]) => (
    <>
      <select value={f[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">{ph}</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
      {errs[k] && <span className="err-t">{errs[k]}</span>}
    </>
  );

  return (
    <section className="card">
      <div className="steps">{step(1, 'Pilih file PDF')}<span className="m">/</span>{step(2, 'Isi metadata')}<span className="m">/</span>{step(3, 'Kirim untuk diperiksa')}</div>
      {support && <div className="delegate" style={{ margin: '12px 0' }}><Icon name="lock" size={14} /><span>Anda mengunggah untuk klien. Pilihan klien dibatasi sesuai delegasi aktif Anda.</span></div>}
      {klien.length === 0 && <Banner kind="block">Anda belum punya klien yang bisa dipilih. Hubungi System Admin.</Banner>}
      <label className={`drop${file ? ' has' : ''}${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <Icon name="file" size={34} />
        {file ? <><b>{file.name}</b><span>Klik untuk mengganti file</span></> : <><b>Tarik PDF invoice ke sini</b><span>atau klik untuk memilih file dari perangkat Anda</span></>}
      </label>
      {errs.file && <div className="err-t" style={{ marginTop: 8 }}>{errs.file}</div>}
      <div className="form" style={{ marginTop: 20 }}>
        <label>Klien{select('klien', 'Pilih klien', klien)}</label>
        <label>Jenis permintaan{select('jenis', 'Pilih jenis', JENIS)}</label>
        <label>Jenis pajak{select('jenisPajak', 'Pilih jenis pajak', JENIS_PAJAK)}</label>
        <label>Saluran masuk{select('saluran', 'Pilih saluran', SALURAN)}</label>
        <label>Tanggal diterima<input type="date" value={f.tgl} onChange={(e) => set('tgl', e.target.value)} /></label>
        <label className="full">Catatan untuk reviewer <small>(opsional)</small>
          <textarea rows={3} value={f.cat} onChange={(e) => set('cat', e.target.value)} placeholder="Contoh: invoice ini sudah ditagih dua kali bulan lalu." />
        </label>
      </div>
      <div className="actions" style={{ marginTop: 20 }}>
        <button className="btn primary" disabled={pending || klien.length === 0} onClick={submit}>
          {pending ? 'Robot Admin sedang membaca file...' : 'Kirim untuk diperiksa'}
        </button>
      </div>
    </section>
  );
}
