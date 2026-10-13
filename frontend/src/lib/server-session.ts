/**
 * Server-side session management
 * This file should run on the backend/API server
 */

import { jwtVerify, SignJWT } from 'jose';
import { COOKIE, secretKey } from './authkey';
import { store } from './store';
import type { RoleKey, User } from './types';

/**
 * Sesi DEMO: cookie JWT bertanda tangan yang menyimpan id pengguna.
 * Untuk produksi ganti dengan Amazon Cognito (OIDC) dan petakan grup Cognito ke peran.
 */
export async function createSession(userId: string): Promise<string> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secretKey());
  return token;
}

/** Parse JWT token and get user */
export async function getUserFromToken(token: string): Promise<User | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return store.users.find((u) => u.id === payload.sub) ?? null;
  } catch {
    return null;
  }
}

/** Get user from request cookies */
export async function getUserFromCookies(cookies: Record<string, string>): Promise<User | null> {
  const token = cookies[COOKIE];
  return getUserFromToken(token);
}

export const homeOf = (role: RoleKey): string => `/${role}`;

/** Require specific role */
export function requireRole(user: User | null, role: RoleKey): User {
  if (!user) throw new Error('401 Belum masuk. Silakan masuk kembali.');
  if (user.role !== role) throw new Error(`403 Akses ditolak. Role ${role} diperlukan.`);
  return user;
}
