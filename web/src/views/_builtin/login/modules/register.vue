<script setup lang="ts">
import { onMounted, nextTick, reactive, ref } from 'vue';
import { useRouterPush } from '@/hooks/common/router';
import { useNaiveForm } from '@/hooks/common/form';
import { useMessage } from 'naive-ui';
import { fetchRegister } from '@/service/api/auth';
import { fetchPublicSettings } from '@/service/api/settings';
import { useAuthStore } from '@/store/modules/auth';

defineOptions({
  name: 'Register'
});

const { toggleLoginModule } = useRouterPush();
const { formRef, validate } = useNaiveForm();
const message = useMessage();
const authStore = useAuthStore();

const captchaSiteKey = ref('');
const captchaToken = ref('');
const turnstileWidgetId = ref('turnstile-' + Math.random().toString(36).slice(2));

const model = reactive({
  email: '',
  password: '',
  confirmPassword: ''
});

async function handleSubmit() {
  await validate();
  if (model.password !== model.confirmPassword) {
    message.error('两次密码不一致');
    return;
  }

  const { error } = await fetchRegister(model.email, model.password, captchaToken.value || undefined);
  if (!error) {
    message.success('注册成功');
    await authStore.login(model.email, model.password);
  }
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
  <NForm ref="formRef" :model="model" size="large" :show-label="false" @keyup.enter="handleSubmit">
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
    <NFormItem path="confirmPassword">
      <NInput
        v-model:value="model.confirmPassword"
        type="password"
        show-password-on="click"
        placeholder="确认密码"
      />
    </NFormItem>
    <NSpace vertical :size="18" class="w-full">
      <div v-if="captchaSiteKey" class="flex-center">
        <div :id="turnstileWidgetId"></div>
      </div>
      <NButton type="primary" size="large" round block @click="handleSubmit">
        注册
      </NButton>
      <NButton size="large" round block @click="toggleLoginModule('pwd-login')">
        返回登录
      </NButton>
    </NSpace>
  </NForm>
</template>