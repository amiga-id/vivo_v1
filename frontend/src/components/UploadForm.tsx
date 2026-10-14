import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import * as api from '@/lib/api';
import { JENIS, SALURAN } from '@/lib/constants';
import Icon from './Icon';
import { Banner } from './ui';
import { useToast } from './Toast';
import { useBusy } from './useBusy';
import type { User } from '@/lib/types';

export default function UploadForm({ user, home }: { user: User; home: string }) {
  const navigate     = useNavigate();
  const toast        = useToast();
  const [pending, start] = useBusy();
  const [file, setFile]  = useState<File | null>(null);
  const [over, setOver]  = useState(false);
  const [f, setF]        = useState({
    klien: '', pic: '', jenis: '', saluran: '',
    tgl: new Date().toISOString().slice(0, 10), cat: '',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const isSup  = user.role === 'support';
  const klien  = api.getKlienOptions(user);
  const pics   = isSup ? api.getPicOptions() : [];
  const ready  = f.klien && f.jenis && f.saluran && (!isSup || f.pic);
  const blocked = !klien.length || (isSup && !pics.length);
  const now    = !file ? 1 : !ready ? 2 : 3;

  const set = (k: string, v: string) => {
    setF(prev => ({ ...prev, [k]: v }));
    setErrs(prev => ({ ...prev, [k]: '' }));
  };

  const pick = (x: File | null | undefined) => {
    if (!x) return;
    if (!/\.pdf$/i.test(x.name)) { setErrs(e => ({ ...e, file: 'File harus berformat PDF.' })); return; }
    if (x.size > 10 * 1024 * 1024) { setErrs(e => ({ ...e, file: 'Ukuran file maksimal 10 MB.' })); return; }
    setFile(x); setErrs(e => ({ ...e, file: '' }));
  };

  const submit = () => {
    const er: Record<string, string> = {};
    if (!file)    er.file    = 'Pilih file PDF invoice terlebih dulu.';
    if (!f.klien) er.klien   = 'Pilih klien.';
    if (!f.jenis) er.jenis   = 'Pilih jenis permintaan.';
    if (!f.saluran) er.saluran = 'Pilih saluran masuk.';
    if (isSup && !f.pic) er.pic = 'Pilih PIC Klien yang menerima order ini.';
    setErrs(er);
    if (Object.keys(er).length) { toast('Lengkapi data yang ditandai merah.', true); return; }

    start(async () => {
      const r = api.uploadDocument(user, {
        klien: f.klien, jenis: f.jenis, saluran: f.saluran, tgl: f.tgl,
        cat: f.cat, picId: f.pic || undefined, fileName: file!.name,
      });
      toast(r.msg, !r.ok);
      if (r.ok) {
        const docId = (r as any).docId;
        navigate(docId ? `${home}/tax/${docId}` : home);
      }
    });
  };

  const step = (n: number, label: string) => (
    <div className={`step ${n < now ? 'done' : n === now ? 'now' : ''}`}>
      <i>{n < now ? '✓' : n}</i>{label}
    </div>
  );

  const sel = (k: 'klien' | 'jenis' | 'saluran', ph: string, opts: string[]) => (
    <>
      <select value={f[k]} onChange={e => set(k, e.target.value)}>
        <option value="">{ph}</option>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
      {errs[k] && <span className="err-t">{errs[k]}</span>}
    </>
  );

  return (
    <section className="card">
      <div className="steps">
        {step(1, 'Pilih file PDF')}
        <span className="m">/</span>
        {step(2, 'Isi metadata')}
        <span className="m">/</span>
        {step(3, 'Atur pajak voucher')}
      </div>

      <div className="delegate" style={{ margin: '12px 0' }}>
        <Icon name="lock" size={14} />
        <span>
          {isSup
            ? 'Anda bisa mengunggah dokumen dari klien mana pun. Pilih PIC Klien yang menerima order tersebut.'
            : 'Anda bisa mengunggah dokumen dari klien mana pun. Dokumen tercatat sebagai order Anda.'}
        </span>
      </div>

      {blocked && (
        <Banner kind="block">
          <Icon name="lock" size={14} />
          Belum ada klien atau PIC Klien aktif yang bisa dipilih. Hubungi System Admin.
        </Banner>
      )}

      <label
        className={`drop${file ? ' has' : ''}${over ? ' over' : ''}`}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <input type="file" accept="application/pdf,.pdf" hidden
          onChange={e => pick(e.target.files?.[0])} />
        <Icon name="file" size={34} />
        {file
          ? <><b>{file.name}</b><span>Klik untuk mengganti file</span></>
          : <><b>Tarik PDF invoice ke sini</b><span>atau klik untuk memilih file dari perangkat Anda</span></>}
      </label>
      {errs.file && <div className="err-t" style={{ marginTop: 8 }}>{errs.file}</div>}

      <div className="form" style={{ marginTop: 20 }}>
        <label>Klien{sel('klien', 'Pilih klien', klien)}</label>

        {isSup && (
          <label>
            PIC Klien pemesan
            <select value={f.pic} onChange={e => set('pic', e.target.value)}>
              <option value="">Pilih PIC</option>
              {pics.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {errs.pic && <span className="err-t">{errs.pic}</span>}
          </label>
        )}

        <label>Jenis permintaan{sel('jenis', 'Pilih jenis', JENIS)}</label>
        <label>Saluran masuk{sel('saluran', 'Pilih saluran', SALURAN)}</label>
        <label>
          Tanggal diterima
          <input type="date" value={f.tgl} onChange={e => set('tgl', e.target.value)} />
        </label>
        <label className="full">
          Catatan untuk reviewer <small className="m">(opsional)</small>
          <textarea rows={3} value={f.cat} onChange={e => set('cat', e.target.value)}
            placeholder="Contoh: invoice ini sudah ditagih dua kali bulan lalu." />
        </label>
      </div>

      <div className="actions" style={{ marginTop: 20 }}>
        <button className="btn primary" disabled={pending || blocked} onClick={submit}>
          {pending ? 'Robot Admin sedang membaca file...' : 'Kirim, lanjut atur pajak'}
        </button>
      </div>
    </section>
  );
}
