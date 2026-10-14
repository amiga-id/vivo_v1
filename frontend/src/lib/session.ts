import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { RoleKey, User } from './types';

/**
 * Client-side session management
 * Session state stored in localStorage for React compatibility
 */

export interface SessionState {
  user: User | null;
  loading: boolean;
}

let userCache: User | null = null;

/** Get current user from localStorage or return null */
export async function getUser(): Promise<User | null> {
  if (userCache !== null) {
    return userCache;
  }

  try {
    const storedUser = localStorage.getItem('amiga_user');
    if (storedUser) {
      userCache = JSON.parse(storedUser);
      return userCache;
    }
  } catch (e) {
    console.error('Error reading user from localStorage:', e);
  }

  userCache = null;
  return null;
}

/** Store user in cache and localStorage */
export function setUser(user: User): void {
  userCache = user;
  localStorage.setItem('amiga_user', JSON.stringify(user));
}

/** Clear user from cache and localStorage */
export function clearUser(): void {
  userCache = null;
  localStorage.removeItem('amiga_user');
}

export const homeOf = (role: RoleKey): string => `/${role}`;

/** Custom hook for React components to use session state */
export function useSession() {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const storedUser = await getUser();
      setUserState(storedUser);
      setLoading(false);
    };

    checkSession();
  }, []);

  return { user, loading, setUser: setUserState, clearUser };
}

/** For backward compatibility with Next.js migration */
export function clearUserCache(): void {
  clearUser();
}

/** Require user to be logged in with specific role (throws error if not authenticated) */
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