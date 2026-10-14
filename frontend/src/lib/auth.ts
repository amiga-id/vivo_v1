import { stamp } from './format';
import { hashPassword, verifyPassword } from './password';
import { store } from './store';
import type { User } from './types';

const MAX_TRIES = 5;
const LOCK_MS = 60_000;

export type AuthResult = { ok: true; user: User } | { ok: false; msg: string };

const fail = (emailLabel: string, why: string) =>
  store.events.push({ k: 'security', d: '', t: stamp(), a: emailLabel, w: 'Login gagal', x: why });

/** Dummy hash for failed login attempts - generated at runtime */
let DUMMY_HASH: string | null = null;

async function getDummyHash(): Promise<string> {
  if (!DUMMY_HASH) {
    DUMMY_HASH = await hashPassword('tidak-dipakai');
  }
  return DUMMY_HASH;
}

/**
 * Verifikasi email dan kata sandi.
 * Pesan galat sengaja generik agar tidak membocorkan email mana yang terdaftar.
 * Setelah 5 kali gagal, email dikunci 1 menit. Percobaan gagal masuk riwayat audit System Admin.
 * Produksi: ganti dengan Amazon Cognito.
 */
export async function authenticate(emailRaw: string, password: string): Promise<AuthResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, msg: 'Isi email dan kata sandi.' };
  if (email.length > 200 || password.length > 200) return { ok: false, msg: 'Email atau kata sandi salah.' };

  const now = Date.now();
  const a = store.attempts.get(email);
  if (a && a.until > now) {
    return { ok: false, msg: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((a.until - now) / 1000)} detik.` };
  }

  const cred = store.creds.find((c) => c.email === email);
  const ok = verifyPassword(password, cred ? cred.hash : await getDummyHash());
  if (!cred || !ok) {
    const n = (a?.n ?? 0) + 1;
    if (n >= MAX_TRIES) {
      store.attempts.set(email, { n: 0, until: now + LOCK_MS });
      fail(email, `Akun dikunci 1 menit setelah ${MAX_TRIES} percobaan gagal.`);
    } else {
      store.attempts.set(email, { n, until: 0 });
      fail(email, 'Kata sandi salah atau akun tidak dikenal.');
    }
    return { ok: false, msg: 'Email atau kata sandi salah.' };
  }

  store.attempts.delete(email);
  const user = store.users.find((u) => u.id === cred.id);
  if (!user) return { ok: false, msg: 'Email atau kata sandi salah.' };
  return { ok: true, user };
}
