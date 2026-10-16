import { useState } from 'react';
import * as api from '@/lib/api';
import { ROLE_LABEL } from '@/lib/constants';
import type { AccessRequest, RoleKey, User } from '@/lib/types';
import { Empty } from './ui';
import { useToast } from './Toast';
import { useBusy } from './useBusy';
import { useSession } from '@/lib/session';
import Pagination from './Pagination';
import { usePagination } from '@/lib/pagination';

export function AdminRequests({ requests }: { requests: AccessRequest[] }) {
  const { user }         = useSession();
  const toast            = useToast();
  const [pending, start] = useBusy();
  const pagination       = usePagination(requests);

  const act = (id: string, ok: boolean) =>
    start(async () => {
      if (!user) return;
      const r = api.decideAccess(user, id, ok);
      toast(r.msg, !r.ok);
    });

  return (
    <>
      <div className="kpis">
        <div className="kpi warn"><b>{requests.length}</b><span>Permintaan akses menunggu</span></div>
      </div>
      <section className="card">
        <h2>Permintaan akses</h2>
        <p className="sub">
          Tinjau permintaan akses pegawai. Akun baru dibuat melalui form Buat akun pegawai.
          Setiap keputusan dicatat di riwayat audit.
        </p>
        {requests.length === 0
          ? <Empty title="Tidak ada permintaan">Permintaan akses baru akan muncul di sini.</Empty>
          : (
            <div className="queue">
              {pagination.pageItems.map(x => (
                <div className="q" style={{ gridTemplateColumns: '1fr auto' }} key={x.id}>
                  <div>
                    <div className="t">{x.text}</div>
                    <div className="m">{x.id}, diajukan {x.date}</div>
                  </div>
                  <div className="actions" style={{ margin: 0 }}>
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
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          firstItem={pagination.firstItem}
          lastItem={pagination.lastItem}
          totalItems={requests.length}
          onPageChange={pagination.setPage}
        />
      </section>
    </>
  );
}

export function AdminUsersList({
  me,
  users,
  onRoleUpdated,
}: {
  me: string;
  users: User[];
  onRoleUpdated: () => Promise<void>;
}) {
  const { user: currentUser } = useSession();
  const toast                 = useToast();
  const [pending, start]      = useBusy();
  const pagination            = usePagination(users);

  return (
    <section className="card">
      <h2>Akun pegawai</h2>
      <p className="sub">
        Akun dibuat dan dikelola oleh System Admin. Perubahan peran berlaku saat pengguna memuat halaman berikutnya.
      </p>
      <div className="tblw">
        <table className="tbl">
          <thead>
            <tr><th>Nama</th><th>Email</th><th>Status</th><th>Peran</th></tr>
          </thead>
          <tbody>
            {pagination.pageItems.map(u => (
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
                      const r = await api.setRole(currentUser, u.id, e.target.value as RoleKey);
                      toast(r.msg, !r.ok);
                      if (r.ok) await onRoleUpdated();
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
      <Pagination
        page={pagination.page}
        pageCount={pagination.pageCount}
        firstItem={pagination.firstItem}
        lastItem={pagination.lastItem}
        totalItems={users.length}
        onPageChange={pagination.setPage}
      />
    </section>
  );
}

export function AdminCreateUser({ onCreated }: { onCreated: () => Promise<void> }) {
  const { user: currentUser } = useSession();
  const toast                 = useToast();
  const [pending, start]      = useBusy();
  const [f, setF] = useState({ name: '', email: '', role: 'support' as RoleKey, pw: '' });
  const set = (k: keyof typeof f, v: string) => setF(prev => ({ ...prev, [k]: v }));

  const submit = () => start(async () => {
    if (!currentUser) return;
    const r = await api.createUser(currentUser, f);
    toast(r.msg, !r.ok);
    if (r.ok) {
      setF({ name: '', email: '', role: 'support', pw: '' });
      await onCreated();
    }
  });

  return (
    <section className="card">
      <h2>Buat akun pegawai</h2>
      <p className="sub">
        Buat akun pegawai dan tetapkan perannya. Sampaikan kata sandi awal dengan aman
        kepada pegawai. Finance dapat mendaftarkan tanda tangannya sendiri dari halaman Finance.
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
