<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useMessage } from 'naive-ui';
import {
  fetchSettings,
  saveCaptchaSettings,
  saveGithubOAuthSettings,
  type CaptchaSettings
} from '@/service/api/settings';

const message = useMessage();
const loading = ref(false);

const captcha = reactive<CaptchaSettings>({
  enabled: false,
  siteKey: '',
  secretKey: ''
});

const githubOAuth = reactive({
  enabled: false,
  clientId: '',
  clientSecret: '',
  label: 'GitHub'
});

async function loadSettings() {
  loading.value = true;
  const { data, error } = await fetchSettings();
  if (!error) {
    Object.assign(captcha, data.settings.captcha);
    const github = data.settings.oauth.providers.find(p => p.name === 'github');
    if (github) {
      githubOAuth.enabled = github.enabled;
      githubOAuth.clientId = github.clientId;
      githubOAuth.clientSecret = github.clientSecret;
    }
  }
  loading.value = false;
}

async function handleSaveCaptcha() {
  const { error } = await saveCaptchaSettings({ ...captcha });
  if (!error) {
    message.success('人机验证设置已保存');
  }
}

async function handleSaveOAuth() {
  const { error } = await saveGithubOAuthSettings({ ...githubOAuth });
  if (!error) {
    message.success('GitHub OAuth 设置已保存');
  }
}

onMounted(loadSettings);
</script>

<template>
  <NSpace vertical :size="16">
    <h2 class="text-24px font-600">系统设置</h2>

    <NCard title="人机验证 (Cloudflare Turnstile)" :bordered="false" class="card-wrapper" :loading="loading">
      <NForm label-placement="left" label-width="120">
        <NFormItem label="启用验证">
          <NSwitch v-model:value="captcha.enabled" />
        </NFormItem>
        <NFormItem label="Site Key">
          <NInput v-model:value="captcha.siteKey" placeholder="Cloudflare Turnstile Site Key" />
        </NFormItem>
        <NFormItem label="Secret Key">
          <NInput v-model:value="captcha.secretKey" type="password" show-password-on="click" placeholder="Cloudflare Turnstile Secret Key" />
        </NFormItem>
        <NButton type="primary" @click="handleSaveCaptcha">保存设置</NButton>
      </NForm>
    </NCard>

    <NCard title="GitHub OAuth 登录" :bordered="false" class="card-wrapper" :loading="loading">
      <NForm label-placement="left" label-width="120">
        <NFormItem label="启用 OAuth">
          <NSwitch v-model:value="githubOAuth.enabled" />
        </NFormItem>
        <NFormItem label="Client ID">
          <NInput v-model:value="githubOAuth.clientId" placeholder="GitHub OAuth App Client ID" />
        </NFormItem>
        <NFormItem label="Client Secret">
          <NInput v-model:value="githubOAuth.clientSecret" type="password" show-password-on="click" placeholder="GitHub OAuth App Client Secret" />
        </NFormItem>
        <NButton type="primary" @click="handleSaveOAuth">保存设置</NButton>
      </NForm>
    </NCard>
  </NSpace>
</template>