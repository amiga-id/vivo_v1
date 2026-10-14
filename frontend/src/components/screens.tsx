import { Link } from 'react-router-dom';
import { dstr, todayISO } from '@/lib/format';
import { activeDelegations } from '@/lib/rbac';
import * as svc from '@/lib/services';
import type { User } from '@/lib/types';
import AuditFilter from './AuditFilter';
import Icon from './Icon';
import QueueClient from './QueueClient';
import UploadForm from './UploadForm';
import VoucherView from './VoucherView';
import FixDocForm from './FixDocForm';
import AddClientForm from './AddClientForm';
import { Badge, Due, Empty } from './ui';

export function ClientQueueScreen({ user }: { user: User }) {
  const rows = svc.queueFor(user);
  const deleg = svc.delegationsFor(user);
  const alive = new Set(activeDelegations(user.id).map((g) => g.id));
  return (
    <>
      <section className="card">
        <h2>Delegasi Anda</h2>
        <p className="sub">Anda hanya bisa melihat dan menindaklanjuti klien di bawah ini.</p>
        {deleg.length === 0 && <Empty title="Belum ada delegasi">Hubungi System Admin untuk meminta delegasi.</Empty>}
        {deleg.map((g) => (
          <div className="delegate" style={{ marginBottom: 8 }} key={g.id}>
            <Icon name="lock" size={14} />
            <span>
              Klien: <b>{g.klien.join(', ')}</b>. Berlaku sampai {dstr(g.expires)}.{' '}
              <span className={`badge s-${alive.has(g.id) ? 'Aktif' : 'Dicabut'}`}>{alive.has(g.id) ? 'Aktif' : 'Tidak aktif'}</span>
            </span>
          </div>
        ))}
      </section>
      <QueueClient rows={rows} role="support" />
    </>
  );
}

export function FinanceQueueScreen({ user }: { user: User }) {
  const rows = svc.queueFor(user);
  const late = rows.filter((d) => d.deadline <= todayISO()).length;
  return (
    <>
      <div className="kpis">
        <div className="kpi"><b>{rows.length}</b><span>Tugas review Anda</span></div>
        <div className="kpi warn"><b>{late}</b><span>Jatuh tempo hari ini atau lewat</span></div>
      </div>
      <section className="card">
        <h2>Tugas review saya</h2>
        <p className="sub">Hanya dokumen yang ditugaskan kepada Anda. Dokumen yang Anda unggah sendiri tidak pernah muncul di sini.</p>
        <div className="queue">
          {rows.length === 0 && <Empty title="Tidak ada tugas review">Dokumen yang lolos pemeriksaan robot dan ditugaskan kepada Anda akan muncul di sini.</Empty>}
          {rows.map((d) => (
            <div className="q" style={{ gridTemplateColumns: '1.6fr 1.2fr 1fr 1.2fr auto' }} key={d.id}>
              <div><div className="t">{d.no}</div><div className="m">{d.klien}</div></div>
              <div>{d.jenis}</div>
              <div><Badge status={d.status} /></div>
              <div><Due deadline={d.deadline} status={d.status} /></div>
              <div><Link className="btn sm primary" to={`/finance/review/${d.id}`}>Tinjau</Link></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function UploadScreen({ user }: { user: User }) {
  const klien = svc.klienOptions(user);
  return <UploadForm klien={klien} support={user.role === 'support'} today={todayISO()} home={`/${user.role}`} />;
}

export function VoucherScreen({ user, id }: { user: User; id?: string }) {
  const list = svc.vouchersFor(user);
  if (list.length === 0) {
    return (
      <section className="card">
        <Empty title="Belum ada voucher">
          {user.role === 'support' ? 'Voucher muncul di sini setelah Finance menyetujui dokumen Anda.' : 'Voucher muncul untuk dokumen yang ditugaskan kepada Anda.'}
        </Empty>
      </section>
    );
  }
  const pick = list.find((x) => x.id === id) ?? list[0];
  const v = svc.getVoucher(user, pick.id);
  return <VoucherView list={list} v={v} base={`/${user.role}/voucher`} canDownload={user.role === 'support'} />;
}

const SUB: Record<string, string> = {
  support: 'Hanya aktivitas pada klien yang didelegasikan kepada Anda.',
  finance: 'Hanya aktivitas pada tugas review yang ditugaskan kepada Anda.',
  lead: 'Hanya catatan penugasan dan beban kerja. Isi dokumen tidak dicatat di sini.',
  admin: 'Perubahan akun, peran, delegasi, dan upaya akses yang ditolak.',
};

export function AuditScreen({ user, doc }: { user: User; doc?: string }) {
  const events = svc.auditFor(user);
  const ids = [...new Set(events.filter((e) => e.d).map((e) => e.d))];
  const showFilter = ['support', 'finance'].includes(user.role) && ids.length > 0;
  const current = doc && ids.includes(doc) ? doc : 'all';
  const shown = events.filter((e) => current === 'all' || e.d === current);
  return (
    <section className="card">
      <h2>Riwayat audit</h2>
      <p className="sub">{SUB[user.role]}</p>
      {showFilter && <AuditFilter base={`/${user.role}/audit`} current={current} options={ids.map((id) => ({ id, label: svc.docLabel(id) }))} />}
      {shown.length === 0 ? <Empty title="Belum ada aktivitas">Aktivitas di cakupan Anda akan muncul di sini.</Empty> : (
        <ul className="tl">
          {shown.map((e, i) => (
            <li key={i} className={e.k === 'security' ? 'sec' : e.bot ? 'bot' : ''}>
              <div className="when">{e.t} oleh {e.a}{e.d && current === 'all' ? `, ${svc.docLabel(e.d).split(' - ')[0]}` : ''}</div>
              <div className="what">{e.w}</div>
              {e.x && <div className="det">{e.x}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


export function FixDocScreen({ user, doc }: { user: User; doc: any }) {
  return (
    <>
      <section className="card">
        <h2>Perbaiki Dokumen yang Ditolak</h2>
        <div style={{ marginBottom: 16, padding: 12, background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4 }}>
          <strong>Alasan penolakan:</strong>
          <p style={{ margin: '8px 0 0', color: '#856404' }}>{doc.issue}</p>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div><strong>Nomor Dokumen:</strong> {doc.no}</div>
          <div><strong>Klien:</strong> {doc.namaPT} (PIC: {doc.namaPIC})</div>
          <div><strong>Jenis:</strong> {doc.jenis}</div>
          <div><strong>Reviewer:</strong> {doc.reviewer}</div>
        </div>
        <FixDocForm docId={doc.id} />
      </section>
    </>
  );
}


export function ClientManagementScreen({ user }: { user: User }) {
  const clients = svc.clientsFor(user);
  
  return (
    <>
      <section className="card">
        <h2>Manajemen Data Klien</h2>
        <p className="sub">
          {user.role === 'admin' 
            ? 'Kelola data perusahaan klien. Hanya System Admin dan Intake Support yang dapat menambah klien baru.' 
            : 'Lihat dan tambahkan data perusahaan klien.'}
        </p>
        
        <AddClientForm />
        
        <div style={{ marginTop: 24 }}>
          <h3>Daftar Klien</h3>
          <div className="tblw">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nama PT</th>
                  <th>Nama PIC</th>
                  <th>Email</th>
                  <th>Telepon</th>
                  <th>Alamat</th>
                  <th>Nomor Urut Berikutnya</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#999' }}>
                      Belum ada data klien
                    </td>
                  </tr>
                )}
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td><strong>{c.namaPT}</strong></td>
                    <td>{c.namaPIC}</td>
                    <td>{c.email}</td>
                    <td>{c.phone || '-'}</td>
                    <td>{c.address || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{c.nextSequence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
