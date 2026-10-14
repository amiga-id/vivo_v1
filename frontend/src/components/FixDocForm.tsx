'use client';

import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { fixDocument } from '@/lib/api';
import Icon from './Icon';
import { useToast } from './Toast';
import { useBusy } from './useBusy';

export default function FixDocForm({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [pending, start] = useBusy();
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [cat, setCat] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});

  const pick = (x: File | undefined | null) => {
    if (!x) return;
    if (!/\.pdf$/i.test(x.name)) { 
      setErrs((e) => ({ ...e, file: 'File harus berformat PDF.' })); 
      return; 
    }
    if (x.size > 10 * 1024 * 1024) { 
      setErrs((e) => ({ ...e, file: 'Ukuran file maksimal 10 MB.' })); 
      return; 
    }
    setFile(x); 
    setErrs((e) => ({ ...e, file: '' }));
  };

  const submit = () => {
    const fd = new FormData();
    if (file) fd.set('file', file);
    fd.set('cat', cat);
    
    start(async () => {
      const r = await fixDocument(docId, fd);
      toast(r.msg, !r.ok);
      if (r.ok) {
        setTimeout(() => navigate('/support'), 500);
      }
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3>Opsi 1: Upload file baru (jika dokumen perlu diganti)</h3>
        <label className={`drop${file ? ' has' : ''}${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} 
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
          <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <Icon name="file" size={34} />
          {file 
            ? <><b>{file.name}</b><span>Klik untuk mengganti file</span></> 
            : <><b>Tarik PDF invoice baru ke sini</b><span>atau klik untuk memilih file dari perangkat Anda</span></>}
        </label>
        {errs.file && <div className="err-t" style={{ marginTop: 8 }}>{errs.file}</div>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <h3>Opsi 2: Perbaikan tanpa file baru</h3>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
          Jika perbaikan hanya berupa penambahan informasi atau klarifikasi tanpa mengganti file invoice.
        </p>
      </div>

      <div className="form" style={{ marginTop: 20 }}>
        <label className="full">
          Catatan perbaikan untuk reviewer <small>(opsional)</small>
          <textarea 
            rows={3} 
            value={cat} 
            onChange={(e) => setCat(e.target.value)} 
            placeholder="Jelaskan perbaikan yang telah dilakukan atau informasi tambahan..." />
        </label>
      </div>

      <div className="actions" style={{ marginTop: 20 }}>
        <button className="btn" onClick={() => navigate(-1)} disabled={pending}>
          Batal
        </button>
        <button className="btn primary" disabled={pending} onClick={submit}>
          {pending ? 'Memproses...' : file ? 'Unggah File Baru' : 'Kirim Perbaikan'}
        </button>
      </div>
    </div>
  );
}
