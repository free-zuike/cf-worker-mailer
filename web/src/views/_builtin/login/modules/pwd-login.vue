<script setup lang="ts">
import { reactive } from 'vue';
import { useAuthStore } from '@/store/modules/auth';
import { useFormRules, useNaiveForm } from '@/hooks/common/form';
import { $t } from '@/locales';

defineOptions({
  name: 'PwdLogin'
});

const authStore = useAuthStore();
const { formRef, validate } = useNaiveForm();

interface FormModel {
  email: string;
  password: string;
}

const model: FormModel = reactive({
  email: '',
  password: ''
});

const rules: Record<keyof FormModel, App.Global.FormRule[]> = {
  email: { key: 'email', required: true, trigger: 'blur' } as any,
  password: { key: 'password', required: true, trigger: 'blur' } as any
};

async function handleSubmit() {
  await validate();
  await authStore.login(model.email, model.password);
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
      <NButton type="primary" size="large" round block :loading="authStore.loginLoading" @click="handleSubmit">
        登录
      </NButton>
      <NButton block @click="$router.push('/login/register')">
        注册账号
      </NButton>
    </NSpace>
  </NForm>
</template>