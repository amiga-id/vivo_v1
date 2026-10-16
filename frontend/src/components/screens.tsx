import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dayDiff, dstr, todayISO } from '@/lib/format';
import * as svc from '@/lib/services';
import type { DocSummary, User } from '@/lib/types';
import { getAuditEvents } from '@/lib/audit-api';
import type { AuditEvent } from '@/lib/audit-api';
import AuditFilter from './AuditFilter';
import Icon from './Icon';
import { Badge, Due, Empty } from './ui';
import { store } from '@/lib/store';
import Pagination from './Pagination';
import { usePagination } from '@/lib/pagination';
/* ─────────────────────────────────────────────
   PIC Klien & Intake Support – shared queue
───────────────────────────────────────────── */
export function ClientQueueScreen({ user }: { user: User }) {
  const all  = svc.queueFor(user);
  const pagination = usePagination(all);
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
          {pagination.pageItems.map(d => <ClientQueueRow key={d.id} d={d} base={baseUrl} />)}
        </div>
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          firstItem={pagination.firstItem}
          lastItem={pagination.lastItem}
          totalItems={all.length}
          onPageChange={pagination.setPage}
        />
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
  const pagination = usePagination(rows);
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
          {pagination.pageItems.map(d => (
            <div className="q" style={{ gridTemplateColumns: '1.6fr 1.2fr 1fr auto' }} key={d.id}>
              <div><div className="t">{d.no}</div><div className="m">{d.klien}</div></div>
              <div>{d.jenis}</div>
              <div><Badge status={d.status} /></div>
              <div><Link className="btn sm primary" to={`/finance/review/${d.id}`}>Tinjau</Link></div>
            </div>
          ))}
        </div>
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          firstItem={pagination.firstItem}
          lastItem={pagination.lastItem}
          totalItems={rows.length}
          onPageChange={pagination.setPage}
        />
      </section>
    </>
  );
}

/* ─────────────────────────────────────────────
   Audit (all roles)
───────────────────────────────────────────── */
const AUDIT_SUB: Record<string, string> = {
  support: 'Aktivitas unggahan, pengajuan, revisi, dan sesi akun Anda.',
  finance: 'Aktivitas tugas review yang ditugaskan kepada Anda dan sesi akun Anda.',
  lead: 'Aktivitas pengajuan, penugasan, perubahan vendor, dan sesi akun Anda.',
  admin: 'Seluruh aktivitas aplikasi yang tercatat di database.',
};

export function AuditScreen({ user, doc }: { user: User; doc?: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEvents(await getAuditEvents());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ids = [...new Set(events.flatMap(event =>
    event.entity_type === 'submission' && event.entity_id
      ? [event.entity_id]
      : [],
  ))];
  const showFilter = ['support', 'finance'].includes(user.role) && ids.length > 0;
  const current = doc && ids.includes(doc) ? doc : 'all';
  const shown = events.filter(event =>
    current === 'all' || event.entity_id === current,
  );
  const pagination = usePagination(shown, current);

  return (
    <section className="card">
      <h2>Riwayat audit</h2>
      <p className="sub">{AUDIT_SUB[user.role]}</p>
      {showFilter && (
        <AuditFilter
          base={`/${user.role}/audit`}
          current={current}
          options={ids.map(id => ({
            id,
            label: events.find(event => event.entity_id === id)?.entity_label ?? id,
          }))}
        />
      )}
      {error && (
        <div className="auth-err" role="alert">
          Gagal memuat riwayat: {error}{' '}
          <button className="btn sm" type="button" onClick={() => void load()}>
            Coba lagi
          </button>
        </div>
      )}
      {loading
        ? <div className="loading">Memuat riwayat...</div>
        : error
          ? null
          : (
            shown.length === 0
              ? <Empty title="Belum ada aktivitas">Aktivitas di cakupan Anda akan muncul di sini.</Empty>
              : (
                <ul className="tl">
                  {pagination.pageItems.map(event => (
                    <li key={event.id}>
                      <div className="when">
                        {new Intl.DateTimeFormat('id-ID', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(event.created_at))}
                        {' '}oleh {event.actor_name}
                        {event.entity_label ? ` · ${event.entity_label}` : ''}
                      </div>
                      <div className="what">{event.action}</div>
                      {event.detail && <div className="det">{event.detail}</div>}
                    </li>
                  ))}
                </ul>
              )
          )}
      {!loading && !error && (
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          firstItem={pagination.firstItem}
          lastItem={pagination.lastItem}
          totalItems={shown.length}
          onPageChange={pagination.setPage}
        />
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────
   Admin – access requests queue
───────────────────────────────────────────── */
export function AdminAccessScreen({ user }: { user: User }) {
  const reqs = svc.requestsFor(user);
  const pagination = usePagination(reqs);
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
              {pagination.pageItems.map(r => (
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
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          firstItem={pagination.firstItem}
          lastItem={pagination.lastItem}
          totalItems={reqs.length}
          onPageChange={pagination.setPage}
        />
      </section>
    </>
  );
}
