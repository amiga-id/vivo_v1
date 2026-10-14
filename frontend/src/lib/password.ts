/**
 * Client-side password hashing (browser compatible)
 * For demo purposes only - use server-side hashing in production
 */

/** Simple hash function using Web Crypto API for browser compatibility */
async function simpleHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  
  // Use SHA-256 for hashing
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return hash;
}

/** Hash kata sandi dengan scrypt dan salt acak. Format: salt:hash (hex). */
export async function hashPassword(pw: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = Array.from(saltBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const hash = await simpleHash(pw, salt);
  return `${salt}:${hash}`;
}

/** Verify password (async for Web Crypto API) */
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(':');
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    const newHash = await simpleHash(pw, salt);
    return newHash === hash;
  } catch {
    return false;
  }
}
