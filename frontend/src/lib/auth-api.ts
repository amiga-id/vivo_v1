import type { RoleKey, User } from './types';
import { apiRequest, clearAccessToken, setAccessToken } from './http';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface AccountDto {
  id: string;
  name: string;
  role: string;
  email: string;
  about: string | null;
}

interface LoginDto {
  access_token: string;
}

interface AccountListDto {
  page: { index: number; size: number; total: number };
  data: AccountDto[];
}

function toUser(account: AccountDto): User {
  const roles: Record<string, RoleKey> = {
    support: 'support',
    reviewer: 'finance',
    lead: 'lead',
    admin: 'admin',
    system: 'admin',
  };
  const role = roles[account.role];
  if (!role) throw new Error(`Peran akun dari server tidak dikenal: ${account.role}`);

  return {
    id: account.id,
    name: account.name,
    role,
    about: account.about ?? '',
    email: account.email,
    status: 'Aktif',
  };
}

export async function signInWithDatabase(
  email: string,
  password: string,
): Promise<User> {
  const result = await apiRequest<ApiEnvelope<LoginDto>>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(result.data.access_token);
  try {
    return await getCurrentUser();
  } catch (error) {
    clearAccessToken();
    throw error;
  }
}

export async function getCurrentUser(): Promise<User> {
  const result = await apiRequest<ApiEnvelope<AccountDto>>('/auth/me', { method: 'POST' });
  return toUser(result.data);
}

export async function signOutFromDatabase(): Promise<void> {
  try {
    await apiRequest<ApiEnvelope<null>>('/auth/logout', { method: 'POST' });
  } finally {
    clearAccessToken();
  }
}

export async function getDatabaseAccounts(): Promise<User[]> {
  const pageSize = 100;
  const accounts: AccountDto[] = [];
  let pageIndex = 1;
  let total = 0;

  do {
    const result = await apiRequest<AccountListDto>('/auth/accounts', {
      method: 'POST',
      body: JSON.stringify({ page: { index: pageIndex, size: pageSize } }),
    });
    accounts.push(...result.data);
    total = result.page.total;
    if (result.data.length === 0 && accounts.length < total) {
      throw new Error('Server mengembalikan daftar akun yang tidak lengkap.');
    }
    pageIndex += 1;
  } while (accounts.length < total);

  return accounts.map(toUser);
}

export async function createDatabaseAccount(input: {
  name: string;
  email: string;
  role: RoleKey;
  password: string;
}): Promise<User> {
  const role = input.role === 'finance' ? 'reviewer' : input.role;
  const result = await apiRequest<ApiEnvelope<AccountDto>>('/auth/accounts/create', {
    method: 'POST',
    body: JSON.stringify({ ...input, role, password: input.password }),
  });
  return toUser(result.data);
}

export async function updateDatabaseAccountRole(id: string, role: RoleKey): Promise<User> {
  const backendRole = role === 'finance' ? 'reviewer' : role;
  const result = await apiRequest<ApiEnvelope<AccountDto>>(`/auth/accounts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: backendRole }),
  });
  return toUser(result.data);
}
