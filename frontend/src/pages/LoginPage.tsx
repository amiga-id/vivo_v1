import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Halaman utama adalah login. Alamat lama /login dialihkan ke sana. */
export default function LoginPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  return null;
}
