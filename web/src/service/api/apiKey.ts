import { request } from '../request';

export interface ApiKey {
  id: string;
  name: string;
  maskedKey: string;
  expiresAt: string | null;
  createdAt: string;
}

export function fetchApiKeys() {
  return request<{ keys: ApiKey[] }>({ url: '/api-keys' });
}

export function generateApiKey(name: string, expiresInDays?: number) {
  return request<{ id: string; key: string; expiresAt: string | null }>({
    url: '/api-key/generate',
    method: 'post',
    data: { name, expiresInDays }
  });
}

export function deleteApiKey(id: string) {
  return request<{ success: boolean }>({ url: `/api-key/${id}`, method: 'delete' });
}