import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '@/components/LoginForm';
import Icon from '@/components/Icon';
import { Brand } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/constants';
import { getUser, homeOf } from '@/lib/session';
import { store } from '@/lib/store';

export default function HomePage() {
  const navigate = useNavigate();
  const [demo, setDemo] = useState<{ password: string; accounts: Array<{ name: string; role: string; email: string }> } | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const u = await getUser();
      if (u) {
        navigate(homeOf(u.role), { replace: true });
      }
    };
    checkUser();

    // Setup demo accounts
    const demoMode = import.meta.env.VITE_DEMO_MODE || 'on';
    if (demoMode !== 'off') {
      setDemo({
        password: import.meta.env.VITE_DEMO_PASSWORD || 'amiga2026',
        accounts: store.users.map((x) => ({ 
          name: x.name, 
          role: ROLE_LABEL[x.role], 
          email: `${x.id}@amiga.demo` 
        })),
      });
    }
  }, [navigate]);

  return (
    <div className="auth">
      <section className="auth-brand">
        <Brand />
        <div>
          <h1>Satu pintu, ruang kerja sesuai peran Anda</h1>
          <p className="lead">
            Unggah invoice, periksa hasil ekstraksi, dan terbitkan voucher dalam satu alur yang rapi dan tercatat.
          </p>
        </div>
        <ul className="auth-points">
          <li><Icon name="lock" size={18} /><span>Setiap peran hanya melihat data yang menjadi tanggung jawabnya.</span></li>
          <li><Icon name="audit" size={18} /><span>Semua tindakan tercatat lengkap dengan pelaku dan waktunya.</span></li>
          <li><Icon name="voucher" size={18} /><span>Voucher terbuka hanya setelah disetujui Finance Reviewer.</span></li>
        </ul>
      </section>
      <section className="auth-panel">
        <LoginForm demo={demo} />
      </section>
    </div>
  );
}
