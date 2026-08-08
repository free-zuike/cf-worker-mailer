import { useAuthStore } from '@/store/modules/auth';

export function useAuth() {
  const authStore = useAuthStore();

  function hasAuth(roles: string | string[]) {
    if (!authStore.isLogin) {
      return false;
    }

    if (typeof roles === 'string') {
      return authStore.userInfo.role === roles;
    }

    return roles.includes(authStore.userInfo.role);
  }

  return {
    hasAuth
  };
}