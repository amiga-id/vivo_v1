import { useState } from 'react';
import * as api from '@/lib/api';
import { ROLE_LABEL } from '@/lib/constants';
import type { AccessRequest, RoleKey, User } from '@/lib/types';
import { Empty } from './ui';
import { useToast } from './Toast';
import { useBusy } from './useBusy';
import { useSession } from '@/lib/session';

export function AdminRequests({ requests }: { requests: AccessRequest[] }) {
  const { user }         = useSession();
  const toast            = useToast();
  const [pending, start] = useBusy();
  const [roles, setRoles] = useState<Record<string, RoleKey>>({});

  const act = (id: string, ok: boolean) =>
    start(async () => {
      if (!user) return;
      const req = requests.find(r => r.id === id);
      const role = req?.type === 'register' ? (roles[id] ?? req?.uid as any) : undefined;
      const r = api.decideAccess(user, id, ok, role);
      toast(r.msg, !r.ok);
    });

  return (
    <>
      <div className="kpis">
        <div className="kpi warn"><b>{requests.length}</b><span>Permintaan akses menunggu</span></div>
      </div>
      <section className="card">
        <h2>Pendaftaran dan permintaan akses</h2>
        <p className="sub">
          Pendaftaran pegawai baru menunggu persetujuan Anda di sini.
          Tetapkan peran akhir sebelum menyetujui.
          Setiap keputusan dicatat di riwayat audit.
        </p>
        {requests.length === 0
          ? <Empty title="Tidak ada permintaan">Permintaan akses baru akan muncul di sini.</Empty>
          : (
            <div className="queue">
              {requests.map(x => (
                <div className="q" style={{ gridTemplateColumns: '1fr auto' }} key={x.id}>
                  <div>
                    <div className="t">{x.text}</div>
                    <div className="m">{x.id}, diajukan {x.date}</div>
                  </div>
                  <div className="actions" style={{ margin: 0 }}>
                    {x.type === 'register' && (
                      <select className="inline"
                        value={roles[x.id] ?? 'support'}
                        onChange={e => setRoles(prev => ({ ...prev, [x.id]: e.target.value as RoleKey }))}
                        aria-label="Peran akhir">
                        {(Object.keys(ROLE_LABEL) as RoleKey[]).map(k => (
                          <option key={k} value={k}>{ROLE_LABEL[k]}</option>
                        ))}
                      </select>
                    )}
                    <button className="btn sm primary" disabled={pending} onClick={() => act(x.id, true)}>
                      Setujui
                    </button>
                    <button className="btn sm danger" disabled={pending} onClick={() => act(x.id, false)}>
                      Tolak
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </section>
    </>
  );
}

export function AdminUsersList({ me, users }: { me: string; users: User[] }) {
  const { user: currentUser } = useSession();
  const toast                 = useToast();
  const [pending, start]      = useBusy();

  return (
    <section className="card">
      <h2>Akun pegawai</h2>
      <p className="sub">
        Perubahan peran berlaku saat pengguna memuat halaman berikutnya.
        Akun berstatus Menunggu belum bisa masuk.
      </p>
      <div className="tblw">
        <table className="tbl">
          <thead>
            <tr><th>Nama</th><th>Email</th><th>Status</th><th>Peran</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.name}{u.id === me && <span className="m"> (Anda)</span>}</td>
                <td className="m">{u.email}</td>
                <td><span className={`badge s-${u.status}`}>{u.status}</span></td>
                <td>
                  <select className="inline" value={u.role}
                    disabled={u.id === me || pending}
                    aria-label={`Peran ${u.name}`}
                    onChange={e => start(async () => {
                      if (!currentUser) return;
                      const r = api.setRole(currentUser, u.id, e.target.value as RoleKey);
                      toast(r.msg, !r.ok);
                    })}>
                    {(Object.keys(ROLE_LABEL) as RoleKey[]).map(k => (
                      <option key={k} value={k}>{ROLE_LABEL[k]}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminCreateUser() {
  const { user: currentUser } = useSession();
  const toast                 = useToast();
  const [pending, start]      = useBusy();
  const [f, setF] = useState({ name: '', email: '', role: 'support' as RoleKey, pw: '' });
  const set = (k: keyof typeof f, v: string) => setF(prev => ({ ...prev, [k]: v }));

  const submit = () => start(async () => {
    if (!currentUser) return;
    const r = api.createUser(currentUser, f);
    toast(r.msg, !r.ok);
    if (r.ok) setF({ name: '', email: '', role: 'support', pw: '' });
  });

  return (
    <section className="card">
      <h2>Buat akun pegawai</h2>
      <p className="sub">
        Pegawai juga bisa mendaftar sendiri lewat halaman masuk.
        Pendaftaran baru aktif setelah Anda setujui.
        Gunakan form ini untuk membuat akun langsung.
      </p>
      <div className="form">
        <label>
          Nama lengkap
          <input type="text" value={f.name} onChange={e => set('name', e.target.value)}
            placeholder="Contoh: Maya Sartika" />
        </label>
        <label>
          Email
          <input type="text" inputMode="email" value={f.email}
            onChange={e => set('email', e.target.value)}
            placeholder="nama@perusahaan.com" />
        </label>
        <label>
          Peran
          <select value={f.role} onChange={e => set('role', e.target.value)}>
            {(Object.keys(ROLE_LABEL) as RoleKey[]).map(k => (
              <option key={k} value={k}>{ROLE_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label>
          Kata sandi awal <small className="m">(minimal 8 karakter)</small>
          <input type="text" value={f.pw} onChange={e => set('pw', e.target.value)}
            placeholder="Sampaikan ke pegawai" />
        </label>
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={pending} onClick={submit}>Buat akun</button>
      </div>
    </section>
  );
}
