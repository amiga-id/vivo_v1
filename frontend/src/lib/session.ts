import { useState, useEffect } from 'react';
import type { RoleKey, User } from './types';

let userCache: User | null = null;

export async function getUser(): Promise<User | null> {
  if (userCache !== null) return userCache;
  try {
    const s = localStorage.getItem('amiga_user');
    if (s) { userCache = JSON.parse(s); return userCache; }
  } catch { /* ignore */ }
  userCache = null;
  return null;
}

export function setUser(user: User): void {
  userCache = user;
  localStorage.setItem('amiga_user', JSON.stringify(user));
}

export function clearUser(): void {
  userCache = null;
  localStorage.removeItem('amiga_user');
}

export const homeOf = (role: RoleKey): string => `/${role}`;

export function useSession() {
  const [user, setUserState]   = useState<User | null>(null);
  const [loading, setLoading]  = useState(true);
  useEffect(() => {
    getUser().then(u => { setUserState(u); setLoading(false); });
  }, []);
  return { user, loading, setUser: setUserState, clearUser };
}

export function clearUserCache(): void { clearUser(); }

export async function requireUser(role: RoleKey): Promise<User> {
  const u = await getUser();
  if (!u) throw new Error('Not authenticated');
  if (u.role !== role) throw new Error(`Wrong role`);
  return u;
}
