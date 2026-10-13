import { redirect } from 'next/navigation';

/** Halaman utama adalah login. Alamat lama /login dialihkan ke sana. */
export default function LoginRedirect() {
  redirect('/');
}
