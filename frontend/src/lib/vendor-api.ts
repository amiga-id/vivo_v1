import { apiRequest } from './http';
import type { Vendor } from './types';

interface PagedVendorResponse {
  success: boolean;
  page: { index: number; size: number; total: number };
  data: Vendor[];
}

interface VendorResponse {
  success: boolean;
  data: Vendor;
}

export async function getVendors(): Promise<Vendor[]> {
  const pageSize = 100;
  const vendors: Vendor[] = [];
  let pageIndex = 1;
  let total = 0;

  do {
    const result = await apiRequest<PagedVendorResponse>('/vendors', {
      method: 'POST',
      body: JSON.stringify({ page: { index: pageIndex, size: pageSize } }),
    });
    vendors.push(...result.data);
    total = result.page.total;
    if (result.data.length === 0 && vendors.length < total) {
      throw new Error('Server mengembalikan daftar vendor yang tidak lengkap.');
    }
    pageIndex += 1;
  } while (vendors.length < total);

  return vendors;
}

export async function createVendor(input: {
  name: string;
  pic: string;
  email: string;
  phone_number: string;
  address: string;
}): Promise<Vendor> {
  const result = await apiRequest<VendorResponse>('/vendors/create', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      phone_number: input.phone_number || null,
      address: input.address || null,
    }),
  });
  return result.data;
}

export async function updateVendor(
  id: string,
  input: {
    name: string;
    pic: string;
    email: string;
    phone_number: string;
    address: string;
  },
): Promise<Vendor> {
  const result = await apiRequest<VendorResponse>(`/vendors/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...input,
      phone_number: input.phone_number || null,
      address: input.address || null,
    }),
  });
  return result.data;
}

export async function deleteVendor(id: string): Promise<void> {
  await apiRequest<{ success: boolean; data: null }>(
    `/vendors/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}
