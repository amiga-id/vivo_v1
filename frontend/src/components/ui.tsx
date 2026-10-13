import type { ReactNode } from 'react';
import { dayDiff, dstr } from '@/lib/format';
import type { Status } from '@/lib/types';
import Icon from './Icon';

export function Badge({ status }: { status: string }) {
  return <span className={`badge s-${status.split(' ')[0]}`}>{status}</span>;
}

export function Due({ deadline, status }: { deadline: string; status: Status }) {
  if (status === 'Disetujui' || status === 'Ditolak') return <span className="due m">Selesai</span>;
  const n = dayDiff(deadline);
  if (n < 0) return <span className="due late">Terlambat {-n} hari</span>;
  if (n === 0) return <span className="due today">Hari ini</span>;
  return <span className="due">{n} hari lagi ({dstr(deadline)})</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Banner({ kind, children }: { kind: 'block' | 'info'; children: ReactNode }) {
  return (
    <div className={`banner ${kind}`}>
      {kind === 'block' && <Icon name="lock" size={14} />}
      <span>{children}</span>
    </div>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">
        <g fill="#f08fb0"><circle cx="14" cy="14" r="9" /><circle cx="26" cy="14" r="9" /><circle cx="14" cy="26" r="9" /><circle cx="26" cy="26" r="9" /></g>
        <circle cx="20" cy="20" r="5.5" fill="#308087" />
      </svg>
      <span className="word">amiga</span>
      <small>Intake dokumen</small>
    </div>
  );
}
