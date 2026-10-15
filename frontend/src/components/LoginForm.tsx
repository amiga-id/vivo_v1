import { useNavigate } from 'react-router-dom';
import { useRef, useState, type FormEvent } from 'react';
import { signIn } from '@/lib/api';
import { homeOf, setUser } from '@/lib/session';
import Icon from './Icon';

export default function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setForgot(false);
    if (!email.trim() || !password) {
      setError('Isi email dan kata sandi.');
      return;
    }

    setBusy(true);
    try {
      const result = await signIn(email, password);
      if (result.ok && result.user) {
        setUser(result.user);
        navigate(homeOf(result.user.role), { replace: true });
        return;
      }
      setError(result.msg);
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h2>Masuk</h2>
      <p className="sub">Gunakan akun AMIGA Anda untuk membuka ruang kerja.</p>
      <form onSubmit={submitLogin} noValidate>
        {error && (
          <div className="auth-err" role="alert">
            <Icon name="warn" size={16} />
            <span>{error}</span>
          </div>
        )}
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            autoFocus
            placeholder="nama@perusahaan.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </label>
        <label>
          Kata sandi
          <span className="pwwrap">
            <input
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="pwtoggle"
              onClick={() => setShowPassword(value => !value)}
            >
              {showPassword ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          </span>
        </label>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Memeriksa akun...' : 'Masuk'}
        </button>
      </form>
      <div className="auth-foot">
        <button
          type="button"
          className="pwtoggle"
          style={{ position: 'static', transform: 'none' }}
          onClick={() => setForgot(value => !value)}
        >
          Lupa kata sandi?
        </button>
        {forgot && (
          <p style={{ margin: '6px 0 0' }}>
            Hubungi System Admin untuk mengatur ulang akses akun Anda.
          </p>
        )}
      </div>

      <p className="auth-foot">
        Belum memiliki akun? Hubungi System Admin untuk dibuatkan akun.
      </p>
    </div>
  );
}
