<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { localStg } from '@/utils/storage';
import { useAuthStore } from '@/store/modules/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

onMounted(async () => {
  const token = route.query.token as string;
  const refreshToken = route.query.refreshToken as string;
  const expiresAt = route.query.expiresAt as string;

  if (!token) {
    router.push('/login');
    return;
  }

  // 保存 token
  localStg.set('token', token);
  localStg.set('refreshToken', refreshToken || '');

  // 获取用户信息
  await authStore.initUserInfo();

  // 跳转到首页
  router.push('/home');
});
</script>

<template>
  <div class="flex-center size-full">
    <NSpin>
      <span>正在登录...</span>
    </NSpin>
  </div>
</template>