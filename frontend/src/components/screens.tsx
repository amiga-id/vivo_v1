import { Link } from 'react-router-dom';
import { dayDiff, dstr, todayISO } from '@/lib/format';
import * as svc from '@/lib/services';
import type { DocSummary, User } from '@/lib/types';
import AuditFilter from './AuditFilter';
import Icon from './Icon';
import { Badge, Due, Empty } from './ui';
import { store } from '@/lib/store';
/* ─────────────────────────────────────────────
   PIC Klien & Intake Support – shared queue
───────────────────────────────────────────── */
export function ClientQueueScreen({ user }: { user: User }) {
  const all  = svc.queueFor(user);
  const byStatus = (s: string) => all.filter(d => d.status === s).length;
  const unpaidTax = all.filter(d =>
    d.status !== 'Disetujui' && d.status !== 'Ditolak' && !d.taxSet).length;
  const baseUrl = `/${user.role}`;

  return (
    <>
      {user.role === 'support' && (
        <section className="card">
          <h2>Cara kerja Intake Support</h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            Anda bisa mengunggah dokumen dari klien mana pun atas order PIC Klien yang meminta.
            Dokumen yang dikembalikan Finance muncul di antrean ini untuk Anda perbaiki lalu kirim ulang.
          </p>
        </section>
      )}

      <div className="kpis">
        <div className="kpi"><b>{all.length}</b><span>Dokumen Anda</span></div>
        <div className="kpi warn"><b>{byStatus('Dikembalikan')}</b><span>Dikembalikan, perlu diperbaiki</span></div>
        <div className="kpi warn"><b>{unpaidTax}</b><span>Pajak belum diatur</span></div>
        <div className="kpi good"><b>{byStatus('Disetujui')}</b><span>Voucher terbit</span></div>
      </div>

      <section className="card">
        <h2>Antrean Intake Support</h2>
        <p className="sub">Dokumen yang dikembalikan Finance untuk diperbaiki ditandai merah.</p>

        <div className="queue">
          {all.length === 0 && (
            <Empty title="Belum ada dokumen di cakupan Anda">
              Unggah invoice lewat tab Unggah dan pajak.
            </Empty>
          )}
          {all.map(d => <ClientQueueRow key={d.id} d={d} base={baseUrl} />)}
        </div>
      </section>
    </>
  );
}

function ClientQueueRow({ d, base }: { d: DocSummary; base: string }) {
  const open = d.status !== 'Disetujui' && d.status !== 'Ditolak';
  const ownerName = store.users.find(u => u.id === d.owner)?.name ?? d.owner;

  let action: React.ReactNode;
  if (d.status === 'Dikembalikan') {
    action = <Link className="btn sm pink" to={`${base}/fix/${d.id}`}>Perbaiki</Link>;
  } else if (open && !d.taxSet) {
    action = <Link className="btn sm pink" to={`${base}/tax/${d.id}`}>Atur pajak</Link>;
  } else if (d.status === 'Disetujui') {
    action = <Link className="btn sm" to={`${base}/voucher?id=${d.id}`}>Lihat voucher</Link>;
  } else {
    action = <Link className="btn sm" to={`${base}/audit?doc=${d.id}`}>Lacak</Link>;
  }

  let notice: React.ReactNode;
  if (d.status === 'Dikembalikan' && d.issue) {
    notice = <div className="issue"><Icon name="warn" size={15} /><span>{d.issue}</span></div>;
  } else if (d.voucherNo) {
    notice = <div className="m">No. voucher <b>{d.voucherNo}</b></div>;
  } else if (open && !d.taxSet) {
    notice = <div className="issue" style={{ color: 'var(--warn)' }}><Icon name="warn" size={15} /><span>Pajak voucher belum diatur</span></div>;
  } else {
    notice = <div className="none">Tidak ada kendala</div>;
  }

  return (
    <div className="q" style={{ gridTemplateColumns: '1.5fr 1.2fr 1fr 1.2fr auto' }}>
      <div><div className="t">{d.no}</div><div className="m">{d.klien}</div></div>
      <div><div>{d.jenis}</div><div className="m">PIC {ownerName}</div></div>
      <div><Badge status={d.status} /></div>
      <div>{notice}</div>
      <div>{action}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Finance Reviewer – queue
───────────────────────────────────────────── */
export function FinanceQueueScreen({ user }: { user: User }) {
  const rows = svc.queueFor(user);
  const late = rows.filter(d => dayDiff(d.deadline) <= 0).length;
  return (
    <>
      <div className="kpis">
        <div className="kpi"><b>{rows.length}</b><span>Tugas review Anda</span></div>
        <div className="kpi warn"><b>{late}</b><span>Jatuh tempo hari ini atau lewat</span></div>
      </div>
      <section className="card">
        <h2>Tugas review saya</h2>
        <p className="sub">
          Hanya dokumen yang ditugaskan kepada Anda.
          Dokumen yang Anda unggah sendiri tidak pernah muncul di sini.
        </p>
        <div className="queue">
          {rows.length === 0 && (
            <Empty title="Tidak ada tugas review">
              Dokumen yang lolos pemeriksaan robot dan ditugaskan kepada Anda akan muncul di sini.
            </Empty>
          )}
          {rows.map(d => (
            <div className="q" style={{ gridTemplateColumns: '1.6fr 1.2fr 1fr auto' }} key={d.id}>
              <div><div className="t">{d.no}</div><div className="m">{d.klien}</div></div>
              <div>{d.jenis}</div>
              <div><Badge status={d.status} /></div>
              <div><Link className="btn sm primary" to={`/finance/review/${d.id}`}>Tinjau</Link></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ─────────────────────────────────────────────
   Service Lead – workload
───────────────────────────────────────────── */
export function LeadWorkloadScreen({ user }: { user: User }) {
  const rows  = svc.workloadFor(user);
  const fin   = store.users.filter(u => u.role === 'finance' && u.status === 'Aktif');
  const open  = (d: (typeof rows)[0]) => ['Dalam Review', 'Dikembalikan', 'Diproses'].includes(d.status);

  return (
    <>
      <div className="kpis">
        {fin.map(f => (
          <div className="kpi" key={f.id}>
            <b>{rows.filter(d => d.reviewer === f.id && open(d)).length}</b>
            <span>Tugas terbuka: {f.name}</span>
          </div>
        ))}
        <div className="kpi warn">
          <b>{rows.filter(d => d.conflict).length}</b>
          <span>Konflik penugasan</span>
        </div>
      </div>

      <section className="card">
        <h2>Beban kerja tim</h2>
        <p className="sub">
          Layar ini hanya memuat status dan penugasan.
          Nilai transaksi dan isi dokumen tidak dikirim ke peran Anda.
        </p>
        <div className="tblw">
          <table className="tbl">
            <thead>
              <tr>
                <th>Dokumen</th><th>Status</th>
                <th>Penugasan</th><th>Reviewer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(d => (
                <tr key={d.id}>
                  <td><b>{d.no}</b><div className="m">{d.klien}</div></td>
                  <td><Badge status={d.status} /></td>
                  <td>{d.conflict
                    ? <span className="badge s-Konflik">Konflik penugasan</span>
                    : <span className="m">Aman</span>}
                  </td>
                  <td>
                    {open(d)
                      ? <LeadReassignSelect docId={d.id} current={d.reviewer} uploader={d.uploader} fin={fin} />
                      : <span className="m">Selesai</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function LeadReassignSelect({
  docId, current, uploader, fin,
}: {
  docId: string;
  current: string;
  uploader: string;
  fin: { id: string; name: string }[];
}) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    try {
      const u = store.users.find(x => x.id === fin[0]?.id);
      if (!u) return;
      svc.reassign(u, docId, e.target.value);
    } catch { /* handled upstream */ }
  };
  return (
    <select className="inline" value={current} onChange={handleChange}
      aria-label="Alihkan reviewer">
      {fin.map(f => (
        <option key={f.id} value={f.id} disabled={f.id === uploader}>
          {f.name}{f.id === uploader ? ' (pengunggah)' : ''}
        </option>
      ))}
    </select>
  );
}

/* ─────────────────────────────────────────────
   Audit (all roles)
───────────────────────────────────────────── */
const AUDIT_SUB: Record<string, string> = {
  pic:     'Hanya aktivitas pada dokumen order yang masuk lewat Anda.',
  support: 'Hanya aktivitas pada dokumen yang Anda unggah atau yang dikembalikan ke Intake Support.',
  finance: 'Hanya aktivitas pada tugas review yang ditugaskan kepada Anda.',
  lead:    'Hanya catatan penugasan dan beban kerja. Isi dokumen tidak dicatat di sini.',
  admin:   'Perubahan akun, peran, delegasi, dan upaya akses yang ditolak.',
};

export function AuditScreen({ user, doc }: { user: User; doc?: string }) {
  const events = svc.auditFor(user);
  const ids = [...new Set(events.filter(e => e.d).map(e => e.d))];
  const showFilter = ['pic', 'support', 'finance'].includes(user.role) && ids.length > 0;
  const current = doc && ids.includes(doc) ? doc : 'all';
  const shown = events.filter(e => current === 'all' || e.d === current);

  return (
    <section className="card">
      <h2>Riwayat audit</h2>
      <p className="sub">{AUDIT_SUB[user.role]}</p>
      {showFilter && (
        <AuditFilter
          base={`/${user.role}/audit`}
          current={current}
          options={ids.map(id => ({ id, label: svc.docLabel(id) }))}
        />
      )}
      {shown.length === 0
        ? <Empty title="Belum ada aktivitas">Aktivitas di cakupan Anda akan muncul di sini.</Empty>
        : (
          <ul className="tl">
            {shown.map((e, i) => {
              const docObj = e.d ? store.docs.find(x => x.id === e.d) : null;
              return (
                <li key={i} className={e.k === 'security' ? 'sec' : e.bot ? 'bot' : ''}>
                  <div className="when">
                    {e.t} oleh {e.a}
                    {docObj && current === 'all' ? `, ${svc.docLabel(e.d).split(' – ')[0]}` : ''}
                  </div>
                  <div className="what">{e.w}</div>
                  {e.x && <div className="det">{e.x}</div>}
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

/* ─────────────────────────────────────────────
   Admin – access requests queue
───────────────────────────────────────────── */
export function AdminAccessScreen({ user }: { user: User }) {
  const reqs = svc.requestsFor(user);
  return (
    <>
      <div className="kpis">
        <div className="kpi warn"><b>{reqs.length}</b><span>Permintaan akses menunggu</span></div>
      </div>
      <section className="card">
        <h2>Permintaan akses</h2>
        <p className="sub">
          Tinjau permintaan akses akun di sini. Akun pegawai baru dibuat langsung oleh
          System Admin melalui panel pengguna.
        </p>
        {reqs.length === 0
          ? <Empty title="Tidak ada permintaan">Permintaan akses baru akan muncul di sini.</Empty>
          : (
            <div className="queue">
              {reqs.map(r => (
                <div className="q" style={{ gridTemplateColumns: '1fr auto' }} key={r.id}>
                  <div>
                    <div className="t">{r.text}</div>
                    <div className="m">{r.id}, diajukan {r.date}</div>
                  </div>
                  <div className="actions" style={{ margin: 0 }}>
                    <button className="btn sm primary"
                      onClick={() => svc.decideAccess(user, r.id, true)}>
                      Setujui
                    </button>
                    <button className="btn sm danger"
                      onClick={() => svc.decideAccess(user, r.id, false)}>
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
