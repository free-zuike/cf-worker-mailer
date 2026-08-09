<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useAuthStore } from '@/store/modules/auth';
import { useFormRules, useNaiveForm } from '@/hooks/common/form';
import { fetchPublicSettings } from '@/service/api/settings';
import { fetchGitHubAuthUrl } from '@/service/api/auth';

defineOptions({
  name: 'PwdLogin'
});

const authStore = useAuthStore();
const { formRef, validate } = useNaiveForm();

const captchaSiteKey = ref('');
const captchaToken = ref('');
const turnstileLoaded = ref(false);
const turnstileWidgetId = 'turnstile-widget';
const githubOAuthEnabled = ref(false);

const model = reactive({
  email: '',
  password: ''
});

const rules: Record<string, App.Global.FormRule[]> = {
  email: [{ key: 'email', required: true, trigger: 'blur' } as any],
  password: [{ key: 'password', required: true, trigger: 'blur' } as any]
};

async function handleSubmit() {
  await validate();
  await authStore.login(model.email, model.password, true, captchaToken.value || undefined);
}

function renderTurnstile() {
  if (!captchaSiteKey.value || !turnstileLoaded.value) return;
  const el = document.getElementById(turnstileWidgetId);
  if (el) {
    el.innerHTML = '';
    (window as any).turnstile.render(el, {
      sitekey: captchaSiteKey.value,
      callback: (token: string) => { captchaToken.value = token; },
      'expired-callback': () => { captchaToken.value = ''; }
    });
  }
}

// 当 captchaKey 就绪或脚本加载完成时渲染
watch([captchaSiteKey, turnstileLoaded], renderTurnstile, { flush: 'post' });

onMounted(async () => {
  const { data, error } = await fetchPublicSettings();
  if (!error) {
    githubOAuthEnabled.value = data.githubOAuthEnabled;
    if (data.captchaEnabled && data.captchaSiteKey) {
      captchaSiteKey.value = data.captchaSiteKey;
    }
  }

  if (typeof (window as any).turnstile !== 'undefined') {
    turnstileLoaded.value = true;
  } else {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => { turnstileLoaded.value = true; };
    document.head.appendChild(script);
  }
});

async function handleGithubLogin() {
  const { data, error } = await fetchGitHubAuthUrl();
  if (!error && data.authUrl) {
    window.location.href = data.authUrl;
  }
}
</script>

<template>
  <NForm ref="formRef" :model="model" :rules="rules" size="large" :show-label="false" @keyup.enter="handleSubmit">
    <NFormItem path="email">
      <NInput v-model:value="model.email" placeholder="邮箱地址" />
    </NFormItem>
    <NFormItem path="password">
      <NInput
        v-model:value="model.password"
        type="password"
        show-password-on="click"
        placeholder="密码"
      />
    </NFormItem>
    <NSpace vertical :size="24">
      <div v-if="captchaSiteKey && turnstileLoaded" class="flex-center">
        <div :id="turnstileWidgetId"></div>
      </div>
      <NButton type="primary" size="large" round block :loading="authStore.loginLoading" @click="handleSubmit">
        登录
      </NButton>
      <NButton block @click="$router.push('/login/register')">
        注册账号
      </NButton>
      <NButton v-if="githubOAuthEnabled" block secondary ghost @click="handleGithubLogin">
        <template #icon>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </template>
        GitHub 登录
      </NButton>
    </NSpace>
  </NForm>
</template>