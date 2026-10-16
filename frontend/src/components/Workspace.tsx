import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from '@/lib/api';
import { useSession } from '@/lib/session';
import { ROLE_LABEL, ROLE_UI } from '@/lib/constants';
import type { User } from '@/lib/types';
import Icon from './Icon';
import NavTabs from './NavTabs';
import { useToast } from './Toast';
import { Brand } from './ui';
import ChatBot from './ChatBot';

export default function Workspace({ user, children }: { user: User; children: ReactNode }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { clearUser } = useSession();
  const ui = ROLE_UI[user.role];

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), true);
    }
    clearUser();
    navigate('/', { replace: true });
  };

  return (
    <>
      <header className="top">
        <div className="top-in">
          <Brand />
          <div className="me">
            <div className="av" aria-hidden="true">{user.name[0]}</div>
            <div><b>{user.name}</b><span className="r">{ROLE_LABEL[user.role]}</span></div>
          </div>
          <button className="btn sm" type="button" onClick={handleLogout}>Keluar</button>
        </div>
      </header>
      <div className="hero">
        <div className="hero-in">
          <h1>{ui.h}</h1>
          <p>{ui.p}</p>
          {ui.scope && (
            <div className="scope"><Icon name="lock" size={14} /><span>{ui.scope}</span></div>
          )}
        </div>
      </div>
      <main>
        <NavTabs tabs={ui.tabs} label={`Menu ${ROLE_LABEL[user.role]}`} />
        <div className="screen">
          {children}
        </div>
      </main>
      <footer className="workspace-footer">© 2026 AMIGA</footer>
      <ChatBot user={user} />
    </>
  );
}
