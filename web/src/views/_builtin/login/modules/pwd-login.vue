<script setup lang="ts">
import { onMounted, nextTick, reactive, ref } from 'vue';
import { useAuthStore } from '@/store/modules/auth';
import { useFormRules, useNaiveForm } from '@/hooks/common/form';
import { fetchPublicSettings } from '@/service/api/settings';

defineOptions({
  name: 'PwdLogin'
});

const authStore = useAuthStore();
const { formRef, validate } = useNaiveForm();

const captchaSiteKey = ref('');
const captchaToken = ref('');
const turnstileWidgetId = ref('turnstile-' + Math.random().toString(36).slice(2));

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

function initTurnstile() {
  if (!captchaSiteKey.value || typeof (window as any).turnstile === 'undefined') return;
  nextTick(() => {
    const el = document.getElementById(turnstileWidgetId.value);
    if (el) {
      (window as any).turnstile.render(el, {
        sitekey: captchaSiteKey.value,
        callback: (token: string) => { captchaToken.value = token; },
        'expired-callback': () => { captchaToken.value = ''; }
      });
    }
  });
}

onMounted(async () => {
  const { data, error } = await fetchPublicSettings();
  if (!error && data.captchaEnabled && data.captchaSiteKey) {
    captchaSiteKey.value = data.captchaSiteKey;
    if (typeof (window as any).turnstile !== 'undefined') {
      initTurnstile();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = initTurnstile;
      document.head.appendChild(script);
    }
  }
});
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
      <div v-if="captchaSiteKey" class="flex-center">
        <div :id="turnstileWidgetId"></div>
      </div>
      <NButton type="primary" size="large" round block :loading="authStore.loginLoading" @click="handleSubmit">
        登录
      </NButton>
      <NButton block @click="$router.push('/login/register')">
        注册账号
      </NButton>
    </NSpace>
  </NForm>
</template>