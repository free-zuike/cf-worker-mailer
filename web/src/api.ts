import { useAuthStore } from './stores/auth';

const API_BASE = '/api';

// 创建一个简单的 API 客户端
async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: any
): Promise<T> {
  const authStore = useAuthStore();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (authStore.token) {
    headers['Authorization'] = `Bearer ${authStore.token.token}`;
  }

  const options: RequestInit = {
    method,
    headers
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || '请求失败');
  }

  return result;
}

export const api = {
  get: <T>(endpoint: string) => request<T>('GET', endpoint),
  post: <T>(endpoint: string, data?: any) => request<T>('POST', endpoint, data),
  put: <T>(endpoint: string, data?: any) => request<T>('PUT', endpoint, data),
  delete: <T>(endpoint: string) => request<T>('DELETE', endpoint)
};
