<template>
  <div class="auth-container">
    <div class="auth-card">
      <h1>Worker Mailer</h1>
      <h2>登录</h2>
      
      <!-- GitHub 登录按钮 -->
      <button v-if="githubOAuthEnabled" @click="handleGithubLogin" class="btn-github" :disabled="githubLoading">
        <svg v-if="!githubLoading" class="github-icon" viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
        <span v-if="githubLoading">正在跳转...</span>
        <span v-else>使用 GitHub 登录</span>
      </button>

      <div v-if="githubOAuthEnabled" class="divider">
        <span>或使用邮箱登录</span>
      </div>
      
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

        <div v-if="captchaEnabled" class="captcha-container">
          <div ref="captchaRef" class="turnstile-widget"></div>
          <p v-if="captchaError" class="captcha-error">请完成人机验证</p>
        </div>
        
        <button type="submit" :disabled="authStore.loading">
          {{ authStore.loading ? '登录中...' : '登录' }}
        </button>
      </form>
      
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

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: any) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const captchaRef = ref<HTMLElement | null>(null);
const captchaEnabled = ref(false);
const captchaSiteKey = ref('');
const captchaError = ref(false);
const captchaToken = ref('');
const githubOAuthEnabled = ref(false);
const githubLoading = ref(false);
let widgetId: string | null = null;

async function loadSettings() {
  try {
    const result = await api.get<{ githubOAuthEnabled: boolean; captchaEnabled: boolean; captchaSiteKey: string }>('/settings/public');
    githubOAuthEnabled.value = result.githubOAuthEnabled;
    if (result.captchaEnabled && result.captchaSiteKey) {
      captchaEnabled.value = true;
      captchaSiteKey.value = result.captchaSiteKey;
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

function renderTurnstile() {
  if (!captchaRef.value || !captchaEnabled.value || !captchaSiteKey.value) return;
  if (window.turnstile && widgetId === null) {
    widgetId = window.turnstile.render(captchaRef.value, {
      sitekey: captchaSiteKey.value,
      callback: (token: string) => {
        captchaToken.value = token;
        captchaError.value = false;
      },
      'error-callback': () => {
        captchaToken.value = '';
        captchaError.value = true;
      },
      'expired-callback': () => {
        captchaToken.value = '';
        captchaError.value = true;
      }
    });
  }
}

async function handleGithubLogin() {
  githubLoading.value = true;
  try {
    const result = await api.get<{ authUrl: string }>('/auth/github');
    window.location.href = result.authUrl;
  } catch (e: any) {
    alert(e.message || 'GitHub 登录失败');
    githubLoading.value = false;
  }
}

async function handleLogin() {
  // 如果启用了人机验证，检查是否通过
  if (captchaEnabled.value && !captchaToken.value) {
    captchaError.value = true;
    return;
  }

  const success = await authStore.login(email.value, password.value, captchaToken.value || undefined);
  if (success) {
    router.push('/');
  }
}

onMounted(async () => {
  await loadSettings();
  if (captchaEnabled.value) {
    await loadTurnstileScript();
    renderTurnstile();
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

.btn-github {
  width: 100%;
  padding: 14px;
  background: #24292e;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.btn-github:hover:not(:disabled) {
  background: #333;
}

.btn-github:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.github-icon {
  flex-shrink: 0;
}

.divider {
  text-align: center;
  margin: 24px 0;
  position: relative;
}

.divider::before,
.divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 40%;
  height: 1px;
  background: #e1e5eb;
}

.divider::before {
  left: 0;
}

.divider::after {
  right: 0;
}

.divider span {
  color: #888;
  font-size: 14px;
  background: white;
  padding: 0 12px;
  position: relative;
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

button[type="submit"] {
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

button[type="submit"]:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}

button[type="submit"]:disabled {
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

.captcha-container {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.captcha-error {
  color: #e74c3c;
  font-size: 14px;
  margin-top: 8px;
}
</style>
