import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '@/lib/api';
import { ROLE_LABEL } from '@/lib/constants';
import { dstr } from '@/lib/format';
import type { AccessRequest, Delegation, RoleKey } from '@/lib/types';
import { Empty } from './ui';
import { useToast } from './Toast';
import { useBusy } from './useBusy';

export function AdminRequests({ requests }: { requests: AccessRequest[] }) {
  const toast = useToast();
  const [pending, start] = useBusy();
  const act = (id: string, ok: boolean) => start(async () => { const r = await api.decideAccessRequest(id, ok); toast(r.msg, !r.ok); });
  return (
    <>
      <div className="kpis"><div className="kpi warn"><b>{requests.length}</b><span>Permintaan akses menunggu</span></div></div>
      <section className="card">
        <h2>Permintaan akses</h2>
        <p className="sub">Setiap persetujuan dicatat di riwayat audit. Layar ini tidak memuat dokumen atau transaksi.</p>
        {requests.length === 0 ? <Empty title="Tidak ada permintaan">Permintaan akses baru akan muncul di sini.</Empty> : (
          <div className="queue">
            {requests.map((x) => (
              <div className="q" style={{ gridTemplateColumns: '1fr auto' }} key={x.id}>
                <div><div className="t">{x.text}</div><div className="m">{x.id}, diajukan {x.date}</div></div>
                <div className="actions" style={{ margin: 0 }}>
                  <button className="btn sm primary" disabled={pending} onClick={() => act(x.id, true)}>Setujui</button>
                  <button className="btn sm danger" disabled={pending} onClick={() => act(x.id, false)}>Tolak</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function AdminUsers({ me, users, deleg, names }: {
  me: string; users: { id: string; name: string; role: RoleKey }[]; deleg: Delegation[]; names: Record<string, string>;
}) {
  const toast = useToast();
  const [pending, start] = useBusy();
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  return (
    <>
      <section className="card">
        <h2>Akun dan peran</h2>
        <p className="sub">Perubahan peran berlaku saat pengguna memuat halaman berikutnya.</p>
        <div className="tblw">
          <table className="tbl">
            <thead><tr><th>Nama</th><th>Peran</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}{u.id === me && <span className="m"> (Anda)</span>}</td>
                  <td>
                    <select className="inline" value={u.role} disabled={u.id === me || pending} aria-label={`Peran ${u.name}`}
                      onChange={(e) => start(async () => { const r = await api.changeRole(u.id, e.target.value as RoleKey); toast(r.msg, !r.ok); })}>
                      {(Object.keys(ROLE_LABEL) as RoleKey[]).map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>Delegasi Intake Support</h2>
        <p className="sub">Mencabut delegasi langsung menutup akses pengguna ke klien terkait.</p>
        <div className="tblw">
          <table className="tbl">
            <thead><tr><th>Intake Support</th><th>Klien</th><th>Berlaku sampai</th><th>Status</th><th /></tr></thead>
            <tbody>
              {deleg.map((g) => {
                const on = g.active && g.expires >= today;
                return (
                  <tr key={g.id}>
                    <td>{names[g.support]}</td><td>{g.klien.join(', ')}</td><td>{dstr(g.expires)}</td>
                    <td><span className={`badge s-${on ? 'Aktif' : 'Dicabut'}`}>{on ? 'Aktif' : 'Tidak aktif'}</span></td>
                    <td><button className={`btn sm${g.active ? ' danger' : ''}`} disabled={pending}
                      onClick={() => start(async () => { const r = await api.toggleDelegation(g.id); toast(r.msg, !r.ok); })}>{g.active ? 'Cabut' : 'Aktifkan'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
