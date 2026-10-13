import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Hash kata sandi dengan scrypt dan salt acak. Format: salt:hash (hex). */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
