import { useNavigate } from 'react-router-dom';
import { useRef, useState, type FormEvent } from 'react';
import { signIn } from '@/lib/api';
import { clearUserCache } from '@/lib/session';
import Icon from './Icon';

interface Demo {
  password: string;
  accounts: { name: string; role: string; email: string }[];
}

export default function LoginForm({ demo }: { demo: Demo | null }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!email.trim() || !pw) {
      setErr('Isi email dan kata sandi.');
      return;
    }
    setBusy(true);
    try {
      const r = await signIn(email, pw);
      if (r.ok && r.to) {
        clearUserCache(); // Clear cache to force fresh user data
        navigate(r.to, { replace: true });
        return;
      }
      setErr(r.msg);
      setPw('');
      pwRef.current?.focus();
    } catch {
      setErr('Tidak bisa terhubung ke server. Coba lagi.');
    }
    setBusy(false);
  }

  return (
    <div className="auth-card">
      <h2>Masuk</h2>
      <p className="sub">Gunakan akun AMIGA Anda untuk membuka ruang kerja.</p>
      <form onSubmit={submit} noValidate>
        {err && (
          <div className="auth-err" role="alert">
            <Icon name="warn" size={16} />
            <span>{err}</span>
          </div>
        )}
        <label>
          Email
          <input type="email" name="email" autoComplete="username" inputMode="email" autoFocus
            placeholder="nama@perusahaan.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Kata sandi
          <span className="pwwrap">
            <input ref={pwRef} type={show ? 'text' : 'password'} name="password" autoComplete="current-password"
              placeholder="Masukkan kata sandi" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" className="pwtoggle" aria-pressed={show} onClick={() => setShow((v) => !v)}>
              {show ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          </span>
        </label>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Memeriksa akun...' : 'Masuk'}
        </button>
      </form>
      <div className="auth-foot">
        <button type="button" className="pwtoggle" style={{ position: 'static', transform: 'none' }} onClick={() => setForgot((v) => !v)}>
          Lupa kata sandi?
        </button>
        {forgot && <p style={{ margin: '6px 0 0' }}>Hubungi System Admin untuk mengatur ulang akses akun Anda.</p>}
      </div>

      {demo && (
        <details className="demo">
          <summary>Akun contoh untuk mencoba</summary>
          <div className="chips">
            {demo.accounts.map((a) => (
              <button key={a.email} type="button" className="chip"
                onClick={() => { setEmail(a.email); setPw(demo.password); setErr(''); }}>
                {a.name.split(' ')[0]} ({a.role})
              </button>
            ))}
          </div>
          <p className="m">Kata sandi contoh: <b>{demo.password}</b>. Hanya untuk prototipe; matikan dengan DEMO_MODE=off.</p>
        </details>
      )}
    </div>
  );
}
