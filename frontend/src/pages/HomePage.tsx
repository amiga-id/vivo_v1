import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '@/components/LoginForm';
import Icon from '@/components/Icon';
import { Brand } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/constants';
import { useSession, homeOf } from '@/lib/session';
import { store } from '@/lib/store';

export default function HomePage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      navigate(homeOf(user.role), { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return <div className="loading">Loading...</div>;

  // Build demo accounts from store
  const demoMode = (import.meta.env.VITE_DEMO_MODE as string | undefined) ?? 'on';
  const demo = demoMode !== 'off' ? {
    password: (import.meta.env.VITE_DEMO_PASSWORD as string | undefined) ?? 'amiga2026',
    accounts: store.users
      .filter(u => u.status === 'Aktif')
      .map(u => ({ name: u.name, role: ROLE_LABEL[u.role], email: u.email })),
  } : null;

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
          <li>
            <Icon name="lock" size={18} />
            <span>Setiap peran hanya melihat data yang menjadi tanggung jawabnya.</span>
          </li>
          <li>
            <Icon name="audit" size={18} />
            <span>Semua tindakan tercatat lengkap dengan pelaku dan waktunya.</span>
          </li>
          <li>
            <Icon name="voucher" size={18} />
            <span>Voucher hanya terbit setelah disetujui Finance Reviewer. Dokumen bermasalah dikembalikan ke Intake Support.</span>
          </li>
        </ul>
      </section>
      <section className="auth-panel">
        <LoginForm demo={demo} />
      </section>
    </div>
  );
}
