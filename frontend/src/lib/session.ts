import { useEffect, useState } from 'react';
import { getCurrentUser } from './auth-api';
import { ApiError, clearAccessToken, getAccessToken } from './http';
import type { RoleKey, User } from './types';

let userCache: User | null | undefined;
let userRequest: Promise<User | null> | null = null;

export async function getUser(): Promise<User | null> {
  if (userCache !== undefined) return userCache;
  if (!getAccessToken()) {
    userCache = null;
    return null;
  }
  if (userRequest) return userRequest;

  userRequest = getCurrentUser()
    .then(user => {
      userCache = user;
      return user;
    })
    .catch(error => {
      if (error instanceof ApiError && error.status === 401) {
        clearAccessToken();
        userCache = null;
      }
      throw error;
    })
    .finally(() => {
      userRequest = null;
    });

  return userRequest;
}

export function setUser(user: User): void {
  userCache = user;
}

export function clearUser(): void {
  userCache = null;
  clearAccessToken();
}

export const homeOf = (role: RoleKey): string => `/${role}`;

export function useSession() {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const onUnauthorized = () => {
      clearUser();
      setUserState(null);
    };
    window.addEventListener('amiga:unauthorized', onUnauthorized);
    getUser()
      .then(current => {
        if (active) setUserState(current);
      })
      .catch(reason => {
        if (active && !(reason instanceof ApiError && reason.status === 401)) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.removeEventListener('amiga:unauthorized', onUnauthorized);
    };
  }, []);

  return {
    user,
    loading,
    error,
    setUser: (current: User) => {
      setUser(current);
      setUserState(current);
    },
    clearUser: () => {
      clearUser();
      setUserState(null);
      setError('');
    },
  };
}

export function clearUserCache(): void {
  clearUser();
}

export async function requireUser(role: RoleKey): Promise<User> {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');
  if (user.role !== role) throw new Error('Wrong role');
  return user;
}
