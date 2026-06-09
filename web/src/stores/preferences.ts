import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api';

interface UserPreferences {
  theme: 'light' | 'dark';
}

export const usePreferencesStore = defineStore('preferences', () => {
  const preferences = ref<UserPreferences>({ theme: 'light' });
  const loading = ref(false);

  async function load() {
    loading.value = true;
    try {
      const result = await api.get<{ preferences: UserPreferences }>('/user/preferences');
      preferences.value = result.preferences;
    } catch (e) {
      console.error('Failed to load preferences', e);
    } finally {
      loading.value = false;
    }
  }

  async function saveTheme(theme: 'light' | 'dark') {
    loading.value = true;
    try {
      const result = await api.put<{ preferences: UserPreferences }>('/user/preferences', {
        preferences: { theme }
      });
      preferences.value = result.preferences;
    } catch (e) {
      console.error('Failed to save theme', e);
    } finally {
      loading.value = false;
    }
  }

  return { preferences, loading, load, saveTheme };
});
