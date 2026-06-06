import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api';

interface User {
  id: string;
  email: string;
  role: string;
}

interface Token {
  token: string;
  refreshToken: string;
  expiresAt: number;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<Token | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!user.value && !!token.value);

  // 从 localStorage 恢复会话
  function restoreSession() {
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token');

    if (savedUser && savedToken) {
      try {
        user.value = JSON.parse(savedUser);
        token.value = JSON.parse(savedToken);
      } catch (e) {
        console.error('Failed to restore session:', e);
        logout();
      }
    }
  }

  // 保存会话到 localStorage
  function saveSession() {
    if (user.value && token.value) {
      localStorage.setItem('user', JSON.stringify(user.value));
      localStorage.setItem('token', JSON.stringify(token.value));
    }
  }

  // 清除会话
  function clearSession() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    user.value = null;
    token.value = null;
  }

  // 登录
  async function login(email: string, password: string) {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.post('/auth/login', { email, password });
      user.value = response.user;
      token.value = response.token;
      saveSession();
      return true;
    } catch (e: any) {
      error.value = e.message || '登录失败';
      return false;
    } finally {
      loading.value = false;
    }
  }

  // 注册
  async function register(email: string, password: string) {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.post('/auth/register', { email, password });
      user.value = response.user;
      token.value = response.token;
      saveSession();
      return true;
    } catch (e: any) {
      error.value = e.message || '注册失败';
      return false;
    } finally {
      loading.value = false;
    }
  }

  // 登出
  function logout() {
    clearSession();
  }

  // 初始化
  restoreSession();

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated,
    login,
    register,
    logout
  };
});
