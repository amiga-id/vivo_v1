import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '@/components/LoginForm';
import Icon from '@/components/Icon';
import { Brand } from '@/components/ui';
import { useSession, homeOf } from '@/lib/session';

export default function HomePage() {
  const { user, loading, error } = useSession();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      navigate(homeOf(user.role), { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return <div className="loading">Loading...</div>;
  if (error) {
    return (
      <div className="auth">
        <section className="auth-panel">
          <div className="auth-err" role="alert">{error}</div>
          <button className="btn" onClick={() => window.location.reload()}>Coba lagi</button>
        </section>
      </div>
    );
  }

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
        <LoginForm />
      </section>
    </div>
  );
}
