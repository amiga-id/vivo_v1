'use client';

import { Link, useLocation } from 'react-router-dom';
import type { TabDef } from '@/lib/constants';
import Icon from './Icon';

export default function NavTabs({ tabs, label }: { tabs: TabDef[]; label: string }) {
  const location = useLocation();
  const path = location.pathname;
  const root = '/' + (tabs[0]?.href.split('/')[1] ?? '');
  const on = (t: TabDef) =>
    path === t.href ||
    (t.match ?? []).some((m) => path.startsWith(m)) ||
    (t.href !== root && path.startsWith(t.href + '/'));
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.href} to={t.href} aria-current={on(t) ? 'page' : undefined}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 18px', borderRadius: 16,
            textDecoration: 'none', flex: '1 0 auto', whiteSpace: 'nowrap', fontWeight: on(t) ? 600 : 500,
            background: on(t) ? 'var(--teal)' : 'transparent', color: on(t) ? 'var(--on-teal)' : 'var(--muted)' }}>
          <Icon name={t.icon} size={17} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
