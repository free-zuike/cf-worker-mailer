<script setup lang="ts">
import { reactive } from 'vue';
import { useRouterPush } from '@/hooks/common/router';
import { useNaiveForm } from '@/hooks/common/form';
import { useMessage } from 'naive-ui';
import { fetchRegister } from '@/service/api/auth';
import { useAuthStore } from '@/store/modules/auth';

defineOptions({
  name: 'Register'
});

const { toggleLoginModule } = useRouterPush();
const { formRef, validate } = useNaiveForm();
const message = useMessage();
const authStore = useAuthStore();

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

  const { error } = await fetchRegister(model.email, model.password);
  if (!error) {
    message.success('注册成功');
    // 自动登录
    await authStore.login(model.email, model.password);
  }
}
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
      <NButton type="primary" size="large" round block @click="handleSubmit">
        注册
      </NButton>
      <NButton size="large" round block @click="toggleLoginModule('pwd-login')">
        返回登录
      </NButton>
    </NSpace>
  </NForm>
</template>