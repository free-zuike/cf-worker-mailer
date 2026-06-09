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

        <div v-if="publicSettings?.captchaEnabled && publicSettings.captchaSiteKey" class="captcha-wrapper">
          <div ref="turnstileRef" class="cf-turnstile" :data-sitekey="publicSettings.captchaSiteKey"></div>
        </div>
        
        <button type="submit" :disabled="authStore.loading" class="btn-primary">
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { api } from '../api';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const turnstileRef = ref<HTMLElement | null>(null);
const captchaToken = ref<string>('');
const publicSettings = ref<{
  captchaEnabled: boolean;
  captchaSiteKey: string;
} | null>(null);

const passwordError = computed(() => {
  if (password.value && confirmPassword.value && password.value !== confirmPassword.value) {
    return '两次输入的密码不一致';
  }
  return null;
});

async function loadPublicSettings() {
  try {
    const result = await api.get<{ captchaEnabled: boolean; captchaSiteKey: string }>('/settings/public');
    publicSettings.value = result;

    if (result.captchaEnabled && result.captchaSiteKey) {
      loadTurnstile();
    }
  } catch (e) {
    console.error('Failed to load public settings:', e);
  }
}

function loadTurnstile(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).turnstile) {
      renderTurnstile();
      resolve();
      return;
    }

    const existingScript = document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
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
      }
    });
  }
}

async function handleRegister() {
  if (passwordError.value) return;
  
  const success = await authStore.register(email.value, password.value, captchaToken.value);
  if (success) {
    router.push('/');
  }
}

onMounted(() => {
  loadPublicSettings();
});

onUnmounted(() => {
  const script = document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
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

.captcha-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.cf-turnstile {
  display: inline-flex;
}

.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}
</style>
