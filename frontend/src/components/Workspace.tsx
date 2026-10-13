import type { ReactNode } from 'react';
import { logout } from '@/lib/api';
import { clearUserCache } from '@/lib/session';
import { ROLE_LABEL, ROLE_UI } from '@/lib/constants';
import type { User } from '@/lib/types';
import Icon from './Icon';
import NavTabs from './NavTabs';
import ProbePanel from './ProbePanel';
import { Brand } from './ui';

/** Kerangka satu ruang kerja. Dipakai layout tiap peran dengan menu dan batasan milik peran itu sendiri. */
export default function Workspace({ user, children }: { user: User; children: ReactNode }) {
  const ui = ROLE_UI[user.role];
  return (
    <>
      <header className="top">
        <div className="top-in">
          <Brand />
          <div className="me">
            <div className="av" aria-hidden="true">{user.name[0]}</div>
            <div><b>{user.name}</b><span className="r">{ROLE_LABEL[user.role]}</span></div>
          </div>
          <button className="btn sm" type="button" onClick={async () => { clearUserCache(); await logout(); }}>Keluar</button>
        </div>
      </header>
      <div className="hero">
        <div className="hero-in">
          <h1>{ui.h}</h1>
          <p>{ui.p}</p>
          <div className="scope"><Icon name="lock" size={14} /><span>{ui.scope}</span></div>
        </div>
      </div>
      <main>
        <NavTabs tabs={ui.tabs} label={`Menu ${ROLE_LABEL[user.role]}`} />
        <div className="screen">
          {children}
          <ProbePanel who={`${user.name} (${ROLE_LABEL[user.role]})`} />
        </div>
      </main>
    </>
  );
}
