import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('./views/Login.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('./views/Register.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/oauth-callback',
    name: 'OAuthCallback',
    component: () => import('./views/OAuthCallback.vue')
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('./views/Dashboard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/smtp',
    name: 'SmtpConfigs',
    component: () => import('./views/SmtpConfigs.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/templates',
    name: 'Templates',
    component: () => import('./views/Templates.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/history',
    name: 'EmailHistory',
    component: () => import('./views/EmailHistory.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/preferences',
    name: 'Preferences',
    component: () => import('./views/Preferences.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('./views/Settings.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();

  if (to.meta.requiresAuth) {
    if (!authStore.isAuthenticated) {
      next('/login');
    } else if (authStore.isTokenExpired()) {
      // Token 已过期，清除会话并跳转到登录页
      authStore.logout();
      next('/login');
    } else {
      next();
    }
  } else if (to.meta.requiresAdmin && !authStore.isAdmin) {
    next('/');
  } else if (to.meta.requiresGuest && authStore.isAuthenticated) {
    next('/');
  } else {
    next();
  }
});

export default router;
