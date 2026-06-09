<template>
  <div class="oauth-callback">
    <div class="loading">
      <div class="spinner"></div>
      <p>正在处理登录...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

onMounted(async () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const refreshToken = urlParams.get('refreshToken');
    const expiresAt = urlParams.get('expiresAt');

    if (token && refreshToken && expiresAt) {
      authStore.setToken(token, refreshToken, parseInt(expiresAt));
      await authStore.fetchUser();
      router.push('/');
    } else {
      console.error('OAuth callback missing parameters');
      router.push('/login');
    }
  } catch (e) {
    console.error('OAuth callback error:', e);
    router.push('/login');
  }
});
</script>

<style scoped>
.oauth-callback {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.loading {
  text-align: center;
  color: white;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading p {
  font-size: 18px;
  font-weight: 500;
}
</style>