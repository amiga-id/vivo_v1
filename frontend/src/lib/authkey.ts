export const COOKIE = 'amiga_session';

/** 
 * Kunci penandatangan sesi. Di produksi AUTH_SECRET wajib diisi.
 * Note: This should only be used server-side, not in client code.
 */
export function secretKey(): Uint8Array {
  // For server-side usage (Node.js environment)
  const s = typeof process !== 'undefined' && process.env ? process.env.AUTH_SECRET || process.env.VITE_AUTH_SECRET : import.meta.env?.VITE_AUTH_SECRET;
  const isProduction = typeof process !== 'undefined' && process.env ? process.env.NODE_ENV === 'production' : import.meta.env?.PROD;
  
  if (!s && isProduction) {
    throw new Error('AUTH_SECRET belum diatur di environment produksi.');
  }
  return new TextEncoder().encode(s || 'dev-only-secret-change-me-0123456789abcdef');
}

