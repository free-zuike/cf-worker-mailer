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
}

watch(() => prefsStore.preferences.theme, (t) => {
  applyTheme(t);
});

onMounted(async () => {
  await prefsStore.load();
  applyTheme(prefsStore.preferences.theme);
});
</script>
