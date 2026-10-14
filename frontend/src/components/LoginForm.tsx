import { useNavigate } from 'react-router-dom';
import { useRef, useState, type FormEvent } from 'react';
import { signIn, register } from '@/lib/api';
import { setUser, homeOf } from '@/lib/session';
import { ROLE_LABEL, SELF_ROLES } from '@/lib/constants';
import type { RoleKey } from '@/lib/types';
import Icon from './Icon';

interface DemoAccount { name: string; role: string; email: string }
interface Demo { password: string; accounts: DemoAccount[] }

type Tab = 'login' | 'register';

export default function LoginForm({ demo }: { demo: Demo | null }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('login');

  /* ── login state ── */
  const [email, setEmail]   = useState('');
  const [pw, setPw]         = useState('');
  const [show, setShow]     = useState(false);
  const [err, setErr]       = useState('');
  const [busy, setBusy]     = useState(false);
  const [forgot, setForgot] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  /* ── register state ── */
  const [regName, setRegName]   = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole]   = useState<RoleKey>('support');
  const [regPw, setRegPw]       = useState('');
  const [regPw2, setRegPw2]     = useState('');
  const [regErr, setRegErr]     = useState('');
  const [regOk, setRegOk]       = useState('');
  const [regBusy, setRegBusy]   = useState(false);

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    setErr(''); setForgot(false);
    if (!email.trim() || !pw) { setErr('Isi email dan kata sandi.'); return; }
    setBusy(true);
    try {
      const r = signIn(email, pw);
      if (r.ok && r.user) {
        setUser(r.user);
        navigate(homeOf(r.user.role), { replace: true });
        return;
      }
      setErr(r.msg);
      setPw('');
      pwRef.current?.focus();
    } finally { setBusy(false); }
  }

  async function submitRegister(e: FormEvent) {
    e.preventDefault();
    setRegErr(''); setRegOk('');
    setRegBusy(true);
    try {
      const r = register({ name: regName, email: regEmail, role: regRole, pw: regPw, pw2: regPw2 });
      if (r.ok) {
        setRegOk('Pendaftaran terkirim. Akun aktif setelah disetujui System Admin. Masuk dengan email dan kata sandi yang Anda buat.');
        setRegName(''); setRegEmail(''); setRegPw(''); setRegPw2('');
        setTimeout(() => setTab('login'), 3500);
      } else {
        setRegErr(r.msg);
      }
    } finally { setRegBusy(false); }
  }

  return (
    <div className="auth-card">
      {/* Tab switcher */}
      <div className="authtabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'login'}
          onClick={() => { setTab('login'); setErr(''); setRegErr(''); setRegOk(''); }}>
          Masuk
        </button>
        <button type="button" role="tab" aria-selected={tab === 'register'}
          onClick={() => { setTab('register'); setErr(''); }}>
          Daftar pegawai
        </button>
      </div>

      {/* ── LOGIN ── */}
      {tab === 'login' && (
        <>
          <h2>Masuk</h2>
          <p className="sub">Gunakan akun AMIGA Anda untuk membuka ruang kerja.</p>
          <form onSubmit={submitLogin} noValidate>
            {err && (
              <div className="auth-err" role="alert">
                <Icon name="warn" size={16} /><span>{err}</span>
              </div>
            )}
            <label>
              Email
              <input type="email" autoComplete="username" inputMode="email" autoFocus
                placeholder="nama@perusahaan.com" value={email}
                onChange={e => setEmail(e.target.value)} />
            </label>
            <label>
              Kata sandi
              <span className="pwwrap">
                <input ref={pwRef} type={show ? 'text' : 'password'} autoComplete="current-password"
                  placeholder="Masukkan kata sandi" value={pw}
                  onChange={e => setPw(e.target.value)} />
                <button type="button" className="pwtoggle"
                  onClick={() => setShow(v => !v)}>
                  {show ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </span>
            </label>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Memeriksa akun...' : 'Masuk'}
            </button>
          </form>
          <div className="auth-foot">
            <button type="button" className="pwtoggle"
              style={{ position: 'static', transform: 'none' }}
              onClick={() => setForgot(v => !v)}>
              Lupa kata sandi?
            </button>
            {forgot && <p style={{ margin: '6px 0 0' }}>Hubungi System Admin untuk mengatur ulang akses akun Anda.</p>}
          </div>

          {demo && (
            <details className="demo">
              <summary>Akun contoh untuk mencoba</summary>
              <div className="chips">
                {demo.accounts.filter(a => a.email).map(a => (
                  <button key={a.email} type="button" className="chip"
                    onClick={() => { setEmail(a.email); setPw(demo.password); setErr(''); }}>
                    {a.name.split(' ')[0]} ({a.role})
                  </button>
                ))}
              </div>
              <p className="m">Kata sandi contoh: <b>{demo.password}</b>. Hanya untuk prototipe.</p>
            </details>
          )}
        </>
      )}

      {/* ── REGISTER ── */}
      {tab === 'register' && (
        <>
          <h2>Daftar sebagai pegawai</h2>
          <p className="sub">Akun baru aktif setelah disetujui System Admin. Admin juga menetapkan peran akhir Anda.</p>
          <form onSubmit={submitRegister} noValidate>
            {regErr && (
              <div className="auth-err" role="alert">
                <Icon name="warn" size={16} /><span>{regErr}</span>
              </div>
            )}
            {regOk && (
              <div className="auth-ok" role="status">
                <Icon name="ok" size={16} /><span>{regOk}</span>
              </div>
            )}
            <label>
              Nama lengkap
              <input type="text" autoComplete="name" value={regName}
                onChange={e => setRegName(e.target.value)} />
            </label>
            <label>
              Email kerja
              <input type="email" autoComplete="email" placeholder="nama@perusahaan.com"
                value={regEmail} onChange={e => setRegEmail(e.target.value)} />
            </label>
            <label>
              Peran yang diajukan
              <select value={regRole} onChange={e => setRegRole(e.target.value as RoleKey)}>
                {SELF_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <label>
              Kata sandi <small className="m">(minimal 8 karakter)</small>
              <input type="password" autoComplete="new-password" value={regPw}
                onChange={e => setRegPw(e.target.value)} />
            </label>
            <label>
              Ulangi kata sandi
              <input type="password" autoComplete="new-password" value={regPw2}
                onChange={e => setRegPw2(e.target.value)} />
            </label>
            <button className="btn primary" type="submit" disabled={regBusy}>
              {regBusy ? 'Mengirim...' : 'Kirim pendaftaran'}
            </button>
          </form>
          <div className="auth-foot">
            Sudah punya akun?{' '}
            <button type="button" className="pwtoggle" style={{ position: 'static', transform: 'none' }}
              onClick={() => setTab('login')}>
              Masuk
            </button>
          </div>
        </>
      )}
    </div>
  );
}
