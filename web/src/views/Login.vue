<template>
  <div class="auth-container">
    <div class="auth-card">
      <h1>Worker Mailer</h1>
      <h2>登录</h2>
      
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>邮箱</label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="your@email.com"
          />
        </div>
        
        <div class="form-group">
          <label>密码</label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="••••••••"
          />
        </div>
        
        <button type="submit" :disabled="authStore.loading" class="btn-primary">
          {{ authStore.loading ? '登录中...' : '登录' }}
        </button>
      </form>
      
      <div v-if="oauthProviders.length > 0" class="oauth-section">
        <div class="divider">
          <span>或者</span>
        </div>
        
        <div class="oauth-buttons">
          <button
            v-for="provider in oauthProviders"
            :key="provider.name"
            @click="handleOAuth(provider.name)"
            :disabled="authStore.loading"
            class="btn-oauth"
            :class="provider.name"
          >
            <span class="oauth-icon">{{ provider.name === 'github' ? '' : '' }}</span>
            {{ provider.label }}
          </button>
        </div>
      </div>
      
      <p v-if="authStore.error" class="error">{{ authStore.error }}</p>
      
      <p class="link">
        还没有账号？ <router-link to="/register">立即注册</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { api } from '../api';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const oauthProviders = ref<{ name: string; label: string; enabled: boolean }[]>([]);

async function loadOAuthProviders() {
  try {
    const result = await api.get<{ providers: typeof oauthProviders.value }>('/oauth/providers');
    oauthProviders.value = result.providers.filter(p => p.enabled);
  } catch (e) {
    console.error('Failed to load OAuth providers:', e);
  }
}

async function handleLogin() {
  const success = await authStore.login(email.value, password.value);
  if (success) {
    router.push('/');
  }
}

async function handleOAuth(provider: string) {
  try {
    const redirectUri = `${window.location.origin}/oauth/callback`;
    const result = await api.get<{ authUrl: string }>('/oauth/authorize', {
      params: { provider, redirect_uri: redirectUri }
    });
    window.location.href = result.authUrl;
  } catch (e) {
    console.error('OAuth authorization failed:', e);
  }
}

onMounted(() => {
  loadOAuthProviders();
});
</script>

<style scoped>
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.auth-card {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 400px;
}

.auth-card h1 {
  text-align: center;
  color: #667eea;
  margin-bottom: 10px;
}

.auth-card h2 {
  text-align: center;
  color: #333;
  margin-bottom: 30px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #555;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 12px;
  border: 2px solid #e1e5eb;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

button {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error {
  color: #e74c3c;
  text-align: center;
  margin-top: 20px;
}

.link {
  text-align: center;
  margin-top: 20px;
  color: #666;
}

.link a {
  color: #667eea;
  text-decoration: none;
  font-weight: 600;
}

.link a:hover {
  text-decoration: underline;
}

.oauth-section {
  margin-top: 24px;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin-bottom: 16px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #e1e5eb;
}

.divider span {
  padding: 0 12px;
  color: #888;
  font-size: 14px;
}

.oauth-buttons {
  display: flex;
  gap: 12px;
}

.btn-oauth {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-oauth.github {
  background: #24292e;
  color: white;
}

.btn-oauth.github:hover:not(:disabled) {
  background: #30363d;
}

.btn-oauth.google {
  background: #fff;
  color: #333;
  border: 1px solid #ddd;
}

.btn-oauth.google:hover:not(:disabled) {
  background: #f5f5f5;
}

.oauth-icon {
  font-size: 18px;
}

.btn-primary {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
