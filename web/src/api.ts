import { useAuthStore } from './stores/auth';
import { useRouter } from 'vue-router';

const API_BASE = '/api';

// 防止循环导入的问题
let authStore: ReturnType<typeof useAuthStore> | null = null;
let router: ReturnType<typeof useRouter> | null = null;

// 安全的获取 store 和 router
function getAuthStore() {
  if (!authStore) {
    authStore = useAuthStore();
  }
  return authStore;
}

function getRouter() {
  if (!router) {
    try {
      router = useRouter();
    } catch (e) {
      // 忽略路由未初始化的情况
    }
  }
  return router;
}

// 创建一个简单的 API 客户端
async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: any
): Promise<T> {
  const store = getAuthStore();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (store.token) {
    headers['Authorization'] = `Bearer ${store.token.token}`;
  }

  const options: RequestInit = {
    method,
    headers
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  let response = await fetch(`${API_BASE}${endpoint}`, options);

  // 如果是 401 错误，尝试刷新 token
  if (response.status === 401 && store.token?.refreshToken) {
    try {
      const newToken = await store.refreshToken();
      if (newToken) {
        // 使用新 token 重试请求
        headers['Authorization'] = `Bearer ${newToken.token}`;
        response = await fetch(`${API_BASE}${endpoint}`, options);
      }
    } catch (refreshError) {
      // 刷新失败，跳转到登录页
      const r = getRouter();
      if (r) {
        r.push('/login');
      }
      throw new Error('Session expired. Please login again.');
    }
  }

  // 如果仍然是 401 或者 refresh token 也失败了
  if (response.status === 401) {
    const r = getRouter();
    if (r) {
      r.push('/login');
    }
    throw new Error('Unauthorized');
  }

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
