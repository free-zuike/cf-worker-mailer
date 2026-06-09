<template>
  <Layout>
    <div class="prefs-page">
      <div class="page-header">
        <h2>偏好设置</h2>
      </div>

      <div class="settings-card">
        <div class="card-header">
          <h3>主题</h3>
        </div>
        <div class="card-body">
          <div class="theme-options">
            <div
              v-for="t in themes"
              :key="t.value"
              class="theme-option"
              :class="{ active: preferences.theme === t.value }"
              @click="selectTheme(t.value)"
            >
              <div class="theme-preview" :class="t.value">
                <div class="preview-sidebar"></div>
                <div class="preview-content">
                  <div class="preview-header"></div>
                  <div class="preview-body"></div>
                </div>
              </div>
              <span class="theme-label">{{ t.label }}</span>
            </div>
          </div>
          <div class="card-actions">
            <button @click="saveTheme" :disabled="saving || preferences.theme === currentTheme" class="btn-primary">
              {{ saving ? '保存中...' : '保存主题' }}
            </button>
            <span v-if="msg" class="msg" :class="msgType">{{ msg }}</span>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import Layout from '../components/Layout.vue';
import { usePreferencesStore } from '../stores/preferences';

const prefsStore = usePreferencesStore();
const preferences = reactive({ theme: 'light' as 'light' | 'dark' });
const currentTheme = ref('light');
const saving = ref(false);
const msg = ref('');
const msgType = ref('');

const themes = [
  { value: 'light' as const, label: '浅色' },
  { value: 'dark' as const, label: '深色' }
];

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.className = theme;
}

async function selectTheme(t: 'light' | 'dark') {
  preferences.theme = t;
  applyTheme(t);
}

async function saveTheme() {
  saving.value = true;
  msg.value = '';
  try {
    await prefsStore.saveTheme(preferences.theme);
    currentTheme.value = preferences.theme;
    msg.value = '✓ 主题已保存';
    msgType.value = 'success';
  } catch {
    msg.value = '保存失败';
    msgType.value = 'error';
  } finally {
    saving.value = false;
    setTimeout(() => { msg.value = ''; }, 3000);
  }
}

onMounted(async () => {
  await prefsStore.load();
  preferences.theme = prefsStore.preferences.theme;
  currentTheme.value = prefsStore.preferences.theme;
  applyTheme(preferences.theme);
});
</script>

<style scoped>
.prefs-page { max-width: 600px; margin: 0 auto; padding: 20px; }
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 28px; color: var(--text-color); margin: 0; }

.settings-card {
  background-color: var(--card-bg);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--card-shadow);
}
.card-header {
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}
.card-header h3 { margin: 0; font-size: 18px; font-weight: 600; color: var(--text-color); }
.card-body { display: flex; flex-direction: column; gap: 20px; }

.theme-options {
  display: flex;
  gap: 20px;
}
.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 12px;
  border-radius: 12px;
  border: 2px solid transparent;
  transition: all 0.2s;
}
.theme-option:hover { background-color: var(--hover-bg); }
.theme-option.active { border-color: var(--primary-color); background: #f0f0ff; }
.theme-label { font-size: 14px; font-weight: 500; color: var(--text-color); }

.theme-preview {
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.theme-preview.light { background: #f5f7fa; }
.theme-preview.dark { background: #1a1a2e; }
.preview-sidebar {
  width: 30%;
  height: 100%;
}
.light .preview-sidebar { background: #1e3a5f; }
.dark .preview-sidebar { background: #0f0f1a; }
.preview-content { flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.preview-header {
  height: 20%;
  border-radius: 4px;
}
.light .preview-header { background: #fff; }
.dark .preview-header { background: #2a2a3e; }
.preview-body { flex: 1; border-radius: 4px; }
.light .preview-body { background: #fff; }
.dark .preview-body { background: #2a2a3e; }

.card-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.msg { font-size: 14px; }
.msg.success { color: #10b981; }
.msg.error { color: #ef4444; }

.btn-primary {
  padding: 10px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
}
.btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
</style>
