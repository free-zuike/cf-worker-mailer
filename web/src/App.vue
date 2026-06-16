<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { usePreferencesStore } from './stores/preferences';
import { useAuthStore } from './stores/auth';

const prefsStore = usePreferencesStore();
const authStore = useAuthStore();

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
}

watch(() => prefsStore.preferences.theme, (t) => {
  applyTheme(t);
});

onMounted(async () => {
  // 只有在已认证时才加载偏好设置
  if (authStore.isAuthenticated) {
    await prefsStore.load();
    applyTheme(prefsStore.preferences.theme);
  }
});
</script>
