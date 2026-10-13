import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import Icon from '@/components/Icon';
import { Brand } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/constants';
import { getUser, homeOf } from '@/lib/session';
import { store } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const u = await getUser();
  if (u) redirect(homeOf(u.role));

  // Akun contoh hanya tampil selama DEMO_MODE tidak diset "off".
  const demo =
    process.env.DEMO_MODE === 'off'
      ? null
      : {
          password: process.env.DEMO_PASSWORD || 'amiga2026',
          accounts: store.users.map((x) => ({ name: x.name, role: ROLE_LABEL[x.role], email: `${x.id}@amiga.demo` })),
        };

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
