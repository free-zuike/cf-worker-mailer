<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
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
const turnstileLoaded = ref(false);
const turnstileWidgetId = 'turnstile-widget';

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
  if (!error && data.captchaEnabled && data.captchaSiteKey) {
    captchaSiteKey.value = data.captchaSiteKey;
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
    </NSpace>
  </NForm>
</template>