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

        <div
          v-if="publicSettings?.captchaEnabled && publicSettings.captchaSiteKey"
          class="captcha-wrapper"
        >
          <div ref="turnstileRef" class="cf-turnstile" :data-sitekey="publicSettings.captchaSiteKey"></div>
        </div>

        <button type="submit" :disabled="authStore.loading" class="btn-primary">
          {{ authStore.loading ? '登录中...' : '登录' }}
        </button>
      </form>

      <div
        v-if="publicSettings?.oauthEnabled && enabledProviders.length > 0"
        class="oauth-section"
      >
        <div class="divider">
          <span>或使用以下方式登录</span>
        </div>

        <div class="oauth-buttons">
          <button
            v-for="provider in enabledProviders"
            :key="provider.name"
            @click="handleOAuth(provider.name)"
            class="btn-oauth"
            :class="provider.name"
          >
            <span class="oauth-icon">{{ providerIcon(provider.name, provider.type) }}</span>
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
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { api } from '../api';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const turnstileRef = ref<HTMLElement | null>(null);
const captchaToken = ref<string>('');
const publicSettings = ref<{
  captchaEnabled: boolean;
  captchaProvider: string;
  captchaSiteKey: string;
  oauthEnabled: boolean;
  oauthProviders: { name: string; label: string; enabled: boolean; type?: string }[];
} | null>(null);

const enabledProviders = computed(() => {
  return publicSettings.value?.oauthProviders?.filter(p => p.enabled) || [];
});

function providerIcon(name: string, type?: string): string {
  return 'üîê';
}

async function loadPublicSettings() {
  try {
    const result = await api.get<{
      captchaEnabled: boolean;
      captchaProvider: string;
      captchaSiteKey: string;
      oauthEnabled: boolean;
      oauthProviders: { name: string; label: string; enabled: boolean; type?: string }[];
    }>('/settings/public');
    publicSettings.value = result;

    if (result.captchaEnabled && result.captchaSiteKey) {
      await loadTurnstile();
    }
  } catch (e) {
    console.error('Failed to load public settings:', e);
  }
}

function loadTurnstile(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).turnstile) {
      renderTurnstile();
      resolve();
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        renderTurnstile();
        resolve();
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.onload = () => {
      renderTurnstile();
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(script);
  });
}

function renderTurnstile() {
  if (!turnstileRef.value || !publicSettings.value?.captchaSiteKey) return;

  if ((window as any).turnstile) {
    (window as any).turnstile.render(turnstileRef.value, {
      sitekey: publicSettings.value.captchaSiteKey,
      callback: (token: string) => {
        captchaToken.value = token;
      },
      'error-callback': () => {
        captchaToken.value = '';
      }
    });
  }
}

async function handleLogin() {
  const success = await authStore.login(email.value, password.value, captchaToken.value);
  if (success) {
    router.push('/');
  }
}

async function handleOAuth(provider: string) {
  try {
    const result = await api.get<{ authUrl: string }>('/oauth/authorize', {
      params: {
        provider,
        redirect_uri: `${window.location.origin}/oauth/callback`
      }
    });
    window.location.href = result.authUrl;
  } catch (e) {
    console.error('OAuth authorization failed:', e);
    if (e instanceof Error) {
      alert(e.message || 'OAuth 登录失败');
    }
  }
}

onMounted(() => {
  loadPublicSettings();
});

onUnmounted(() => {
  const script = document.querySelector(
    'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
  );
  if (script) {
    document.head.removeChild(script);
  }
});
</script>

<style scoped>
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.auth-card {
  background: white;
  padding: 40px;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 400px;
}

.auth-card h1 {
  text-align: center;
  color: #1f2937;
  font-size: 24px;
  margin: 0 0 8px 0;
}

.auth-card h2 {
  text-align: center;
  color: #6b7280;
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 30px 0;
}

form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #4b5563;
}

.form-group input {
  padding: 12px 16px;
  border: 1px solid #e1e5eb;
  border-radius: 8px;
  font-size: 15px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.captcha-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.cf-turnstile {
  display: inline-flex;
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
  flex-direction: column;
  gap: 12px;
}

.btn-oauth {
  padding: 12px;
  border: 1px solid #e1e5eb;
  background: white;
  color: #1f2937;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.btn-oauth:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #d1d5db;
}



.oauth-icon {
  font-size: 18px;
}

.error {
  color: #ef4444;
  text-align: center;
  margin-top: 16px;
  font-size: 14px;
}

.link {
  text-align: center;
  margin-top: 20px;
  color: #6b7280;
  font-size: 14px;
}

.link a {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

.link a:hover {
  text-decoration: underline;
}
</style>