import type { RoleKey, User } from './types';

/**
 * Client-side session management
 * Session state stored server-side with httpOnly cookies
 * Client calls API to get current user info
 */

let userCache: User | null | undefined = undefined;

/** Get current user from server */
export async function getUser(): Promise<User | null> {
  // Return cached value if available
  if (userCache !== undefined) {
    return userCache;
  }

  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include',
    });

    if (!response.ok) {
      userCache = null;
      return null;
    }

    const data = await response.json();
    userCache = data.user || null;
    return userCache;
  } catch {
    userCache = null;
    return null;
  }
}

/** Clear user cache (call after login/logout) */
export function clearUserCache(): void {
  userCache = undefined;
}

export const homeOf = (role: RoleKey): string => `/${role}`;

/** Require user to be logged in with specific role */
export async function requireUser(role: RoleKey): Promise<User> {
  const u = await getUser();
  if (!u) {
    throw new Error('Not authenticated');
  }
  if (u.role !== role) {
    throw new Error(`Wrong role: expected ${role}, got ${u.role}`);
  }
  return u;
}
