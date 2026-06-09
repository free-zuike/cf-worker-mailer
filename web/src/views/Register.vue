<template>
  <div class="auth-container">
    <div class="auth-card">
      <h1>Worker Mailer</h1>
      <h2>注册</h2>
      
      <form @submit.prevent="handleRegister">
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
            minlength="6"
          />
        </div>
        
        <div class="form-group">
          <label>确认密码</label>
          <input
            v-model="confirmPassword"
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
          {{ authStore.loading ? '注册中...' : '注册' }}
        </button>
      </form>
      
      <p v-if="authStore.error" class="error">{{ authStore.error }}</p>
      <p v-if="passwordError" class="error">{{ passwordError }}</p>
      
      <p class="link">
        已有账号？ <router-link to="/login">立即登录</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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
const confirmPassword = ref('');
const captchaRef = ref<HTMLElement | null>(null);
const captchaEnabled = ref(false);
const captchaSiteKey = ref('');
const captchaError = ref(false);
const captchaToken = ref('');
let widgetId: string | null = null;

const passwordError = computed(() => {
  if (password.value && confirmPassword.value && password.value !== confirmPassword.value) {
    return '两次输入的密码不一致';
  }
  return null;
});

async function loadCaptchaSettings() {
  try {
    const result = await api.get<{ captchaEnabled: boolean; captchaSiteKey: string }>('/settings/public');
    if (result.captchaEnabled && result.captchaSiteKey) {
      captchaEnabled.value = true;
      captchaSiteKey.value = result.captchaSiteKey;
    }
  } catch (e) {
    console.error('Failed to load captcha settings', e);
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

async function handleRegister() {
  if (passwordError.value) return;

  // 如果启用了人机验证，检查是否通过
  if (captchaEnabled.value && !captchaToken.value) {
    captchaError.value = true;
    return;
  }

  const success = await authStore.register(email.value, password.value, captchaToken.value || undefined);
  if (success) {
    router.push('/');
  }
}

onMounted(async () => {
  await loadCaptchaSettings();
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
