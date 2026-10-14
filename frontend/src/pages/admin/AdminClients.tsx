import { useState } from 'react';
import { useSession } from '@/lib/session';
import { AdminClientsScreen } from '@/components/screens';
import * as api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useBusy } from '@/components/useBusy';

export default function AdminClients() {
  const { user }         = useSession();
  const toast            = useToast();
  const [pending, start] = useBusy();
  const [name, setName]  = useState('');
  const [key, setKey]    = useState(0); // force re-render of screen

  if (!user) return <div className="loading">Loading...</div>;

  const addClient = () => start(async () => {
    const r = api.addClient(user, name);
    toast(r.msg, !r.ok);
    if (r.ok) { setName(''); setKey(k => k + 1); }
  });

  return (
    <>
      <section className="card">
        <h2>Tambah klien</h2>
        <p className="sub">
          Setelah terdaftar, PIC Klien dan Intake Support mana pun bisa mengunggah dokumen untuk klien ini.
        </p>
        <div className="form">
          <label className="full">
            Nama perusahaan
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Contoh: PT Sumber Makmur" />
          </label>
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn primary" disabled={pending} onClick={addClient}>Tambah klien</button>
        </div>
      </section>
      <AdminClientsScreen key={key} user={user} />
    </>
  );
}
