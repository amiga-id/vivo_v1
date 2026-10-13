'use client';

import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { addNewClient } from '@/lib/api';
import { useToast } from './Toast';
import { useBusy } from './useBusy';

export default function AddClientForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useBusy();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    namaPT: '',
    namaPIC: '',
    email: '',
    phone: '',
    address: '',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => {
    setForm((x) => ({ ...x, [k]: v }));
    setErrs((e) => ({ ...e, [k]: '' }));
  };

  const submit = () => {
    const er: Record<string, string> = {};
    if (!form.namaPT.trim()) er.namaPT = 'Nama PT wajib diisi.';
    if (!form.namaPIC.trim()) er.namaPIC = 'Nama PIC wajib diisi.';
    if (!form.email.trim()) er.email = 'Email wajib diisi.';
    
    setErrs(er);
    if (Object.values(er).some(Boolean)) {
      toast('Lengkapi data yang ditandai merah.', true);
      return;
    }

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    
    start(async () => {
      const r = await addNewClient(fd);
      toast(r.msg, !r.ok);
      if (r.ok) {
        setForm({ namaPT: '', namaPIC: '', email: '', phone: '', address: '' });
        setShowForm(false);
        router.refresh();
      }
    });
  };

  if (!showForm) {
    return (
      <div style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={() => setShowForm(true)}>
          + Tambah Klien Baru
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 4, background: '#f9f9f9' }}>
      <h3 style={{ marginTop: 0 }}>Tambah Klien Baru</h3>
      <div className="form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label>
          Nama PT <span style={{ color: 'red' }}>*</span>
          <input 
            type="text" 
            value={form.namaPT} 
            onChange={(e) => set('namaPT', e.target.value)}
            placeholder="PT Contoh Perusahaan" 
          />
          {errs.namaPT && <span className="err-t">{errs.namaPT}</span>}
        </label>
        
        <label>
          Nama PIC <span style={{ color: 'red' }}>*</span>
          <input 
            type="text" 
            value={form.namaPIC} 
            onChange={(e) => set('namaPIC', e.target.value)}
            placeholder="John Doe" 
          />
          {errs.namaPIC && <span className="err-t">{errs.namaPIC}</span>}
        </label>
        
        <label>
          Email <span style={{ color: 'red' }}>*</span>
          <input 
            type="email" 
            value={form.email} 
            onChange={(e) => set('email', e.target.value)}
            placeholder="pic@perusahaan.com" 
          />
          {errs.email && <span className="err-t">{errs.email}</span>}
        </label>
        
        <label>
          Telepon
          <input 
            type="text" 
            value={form.phone} 
            onChange={(e) => set('phone', e.target.value)}
            placeholder="021-1234567" 
          />
        </label>
        
        <label className="full" style={{ gridColumn: '1 / -1' }}>
          Alamat
          <textarea 
            rows={2} 
            value={form.address} 
            onChange={(e) => set('address', e.target.value)}
            placeholder="Alamat lengkap perusahaan" 
          />
        </label>
      </div>
      
      <div className="actions" style={{ marginTop: 16 }}>
        <button 
          className="btn" 
          onClick={() => {
            setShowForm(false);
            setForm({ namaPT: '', namaPIC: '', email: '', phone: '', address: '' });
            setErrs({});
          }}
          disabled={pending}
        >
          Batal
        </button>
        <button className="btn primary" onClick={submit} disabled={pending}>
          {pending ? 'Menyimpan...' : 'Simpan Klien'}
        </button>
      </div>
    </div>
  );
}
