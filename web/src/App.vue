<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { usePreferencesStore } from './stores/preferences';

const prefsStore = usePreferencesStore();

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    document.body.classList.add('dark');
    // 深色主题 CSS 变量
    document.documentElement.style.setProperty('--bg-color', '#1a1a2e');
    document.documentElement.style.setProperty('--text-color', '#e0e0e0');
    document.documentElement.style.setProperty('--sidebar-bg', 'linear-gradient(180deg, #0f0f1a 0%, #0a0a14 100%)');
    document.documentElement.style.setProperty('--card-bg', '#252540');
    document.documentElement.style.setProperty('--input-bg', '#1e1e35');
    document.documentElement.style.setProperty('--input-border', '#3a3a5c');
    document.documentElement.style.setProperty('--border-color', '#3a3a5c');
    document.documentElement.style.setProperty('--nav-active-bg', 'rgba(102, 126, 234, 0.4)');
  } else {
    document.body.classList.remove('dark');
    document.documentElement.style.setProperty('--bg-color', '#f5f7fa');
    document.documentElement.style.setProperty('--text-color', '#333');
    document.documentElement.style.setProperty('--sidebar-bg', 'linear-gradient(180deg, #1e3a5f 0%, #0f1f33 100%)');
    document.documentElement.style.setProperty('--card-bg', '#ffffff');
    document.documentElement.style.setProperty('--input-bg', '#ffffff');
    document.documentElement.style.setProperty('--input-border', '#d1d5db');
    document.documentElement.style.setProperty('--border-color', '#e1e5eb');
    document.documentElement.style.setProperty('--nav-active-bg', 'rgba(102, 126, 234, 0.3)');
  }
}

// 监听主题变化
watch(() => prefsStore.preferences.theme, (t) => {
  applyTheme(t);
});

onMounted(async () => {
  await prefsStore.load();
  applyTheme(prefsStore.preferences.theme);
});
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: var(--bg-color, #f5f7fa);
  color: var(--text-color, #333);
  transition: background 0.3s, color 0.3s;
}

#app {
  min-height: 100vh;
}
</style>
