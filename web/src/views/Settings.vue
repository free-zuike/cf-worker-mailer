<template>
  <Layout>
    <div class="settings-page">
      <div class="page-header">
        <h2>系统设置</h2>
      </div>

      <div class="settings-content">
        <!-- 人机验证设置 -->
        <div class="settings-card">
          <div class="card-header">
            <h3>人机验证</h3>
            <label class="toggle">
              <input type="checkbox" v-model="settings.captchaEnabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label>验证服务</label>
              <select v-model="settings.captchaProvider" class="form-input">
                <option value="turnstile">Cloudflare Turnstile</option>
              </select>
            </div>
            <div class="form-group">
              <label>站点密钥 (Site Key)</label>
              <input
                v-model="settings.captchaSiteKey"
                type="text"
                class="form-input"
                placeholder="1x00000000000000000000AA"
              />
            </div>
            <div class="form-group">
              <label>密钥 (Secret Key)</label>
              <input
                v-model="settings.captchaSecretKey"
                type="password"
                class="form-input"
                placeholder="••••••••••••••••"
              />
            </div>
            <p class="help-text">
              在 <a href="https://dash.cloudflare.com" target="_blank" rel="noopener">Cloudflare</a>
              创建站点后填入密钥，登录和注册页面会启用人机验证。
            </p>
          </div>
        </div>

        <!-- OAuth 提供商设置 -->
        <div class="settings-card">
          <div class="card-header">
            <h3>第三方登录 (OpenAuth)</h3>
            <label class="toggle">
              <input type="checkbox" v-model="settings.oauthEnabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="card-body">
            <div
              v-for="(provider, index) in settings.oauthProviders"
              :key="provider.name"
              class="provider-section"
            >
              <div class="provider-header">
                <span class="provider-name">{{ provider.label }}</span>
                <label class="toggle small">
                  <input type="checkbox" v-model="provider.enabled" />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="form-group">
                <label>提供商名称 (仅显示用)</label>
                <input
                  v-model="provider.label"
                  type="text"
                  class="form-input"
                  placeholder="My OpenAuth Provider"
                />
              </div>

              <div class="form-group">
                <label>Issuer URL (发现端点)</label>
                <input
                  v-model="(provider as any).issuer"
                  type="text"
                  class="form-input"
                  placeholder="https://your-oidc-provider.com"
                />
              </div>

              <div class="form-group">
                <label>客户端 ID (Client ID)</label>
                <input
                  v-model="provider.clientId"
                  type="text"
                  class="form-input"
                  placeholder="your-client-id"
                />
              </div>

              <div class="form-group">
                <label>客户端密钥 (Client Secret)</label>
                <input
                  v-model="provider.clientSecret"
                  type="password"
                  class="form-input"
                  placeholder="••••••••"
                />
              </div>

              <div class="form-group">
                <label>作用域 (Scopes，空格分隔)</label>
                <input
                  v-model="scopesText[index]"
                  type="text"
                  class="form-input"
                  placeholder="openid email profile"
                />
              </div>

              <div class="callback-info">
                <strong>回调地址：</strong>
                <code>{{ callbackUrl }}</code>
              </div>
            </div>
            <p class="help-text">
              通用 OIDC / OpenAuth 配置。在你的 OpenAuth 控制台创建 OAuth App，将 Issuer、Client
              ID、Client Secret 填入。回调地址需配置为部署地址 + <code>/api/oauth/callback</code>
            </p>
          </div>
        </div>

        <!-- 主题设置 -->
        <div class="settings-card">
          <div class="card-header">
            <h3>主题</h3>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label>主题</label>
              <select v-model="settings.theme" class="form-input">
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </div>
          </div>
        </div>

        <div class="actions">
          <button @click="saveSettings" :disabled="saving" class="btn-primary">
            {{ saving ? '保存中...' : '保存设置' }}
          </button>
          <p v-if="saveMessage" class="save-message" :class="saveMessageClass">
            {{ saveMessage }}
          </p>
        </div>
      </div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import Layout from '../components/Layout.vue';
import { api } from '../api';
import { showToast } from '../utils/toast';

interface OAuthProviderConfig {
  name: string;
  label: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  type?: string;
  issuer?: string;
}

interface Settings {
  oauthEnabled: boolean;
  oauthProviders: OAuthProviderConfig[];
  captchaEnabled: boolean;
  captchaProvider: 'turnstile';
  captchaSiteKey: string;
  captchaSecretKey: string;
  theme: 'light' | 'dark';
  updatedAt: string;
}

const defaultSettings: Settings = {
  oauthEnabled: false,
  oauthProviders: [
    {
      name: 'openauth',
      label: 'OpenAuth',
      enabled: false,
      clientId: '',
      clientSecret: '',
      type: 'oidc',
      scopes: ['openid', 'email', 'profile'],
      issuer: ''
    }
  ],
  captchaEnabled: false,
  captchaProvider: 'turnstile',
  captchaSiteKey: '',
  captchaSecretKey: '',
  theme: 'light',
  updatedAt: ''
};

const settings = ref<Settings>({ ...defaultSettings });
const scopesText = reactive<string[]>(defaultSettings.oauthProviders.map(() => ''));
const saving = ref(false);
const saveMessage = ref('');
const saveMessageClass = computed(() => ({
  'success': saveMessage.value && !saveMessage.value.includes('失败'),
  'error': saveMessage.value && saveMessage.value.includes('失败')
}));

const callbackUrl = computed(() => {
  const base = window.location.origin;
  return `${base}/api/oauth/callback`;
});

async function loadSettings() {
  try {
    const result = await api.get<{ settings: Settings }>('/settings');
    if (result.settings) {
      settings.value = {
        ...defaultSettings,
        ...result.settings,
        oauthProviders: defaultSettings.oauthProviders.map(defaultProvider => {
          const saved = result.settings.oauthProviders?.find(
            (p: OAuthProviderConfig) => p.name === defaultProvider.name
          );
          const merged: OAuthProviderConfig = {
            ...defaultProvider,
            ...saved
          };
          return merged;
        })
      };

      // 把 scopes 数组转字符串用于 UI 编辑
      settings.value.oauthProviders.forEach((p, index) => {
        scopesText[index] = p.scopes?.join(' ') || 'openid email profile';
      });
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

async function saveSettings() {
  saving.value = true;
  saveMessage.value = '';

  try {
    // 合并 scopes 文本为数组
    const toSave: Settings = {
      ...settings.value,
      oauthProviders: settings.value.oauthProviders.map((p, index) => ({
        ...p,
        scopes: scopesText[index]
          ? scopesText[index].split(/\s+/).filter(Boolean)
          : p.scopes || []
      })),
      updatedAt: new Date().toISOString()
    };

    await api.put('/settings', { settings: toSave });
    saveMessage.value = '✓ 设置已保存';
    showToast('设置已保存', 'success');

    // 3 秒后清除提示
    setTimeout(() => {
      saveMessage.value = '';
    }, 3000);
  } catch (e) {
    console.error('Failed to save settings:', e);
    saveMessage.value = '保存失败，请重试';
    showToast('保存失败', 'error');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.settings-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e1e5eb;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f2f5;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #4b5563;
}

.form-input {
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.help-text {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  cursor: pointer;
}

.toggle.small {
  width: 40px;
  height: 22px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #d1d5db;
  border-radius: 26px;
  transition: 0.3s;
}

.toggle-slider:before {
  position: absolute;
  content: '';
  height: 18px;
  width: 18px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle.small .toggle-slider:before {
  height: 14px;
  width: 14px;
}

.toggle input:checked + .toggle-slider {
  background-color: #667eea;
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(22px);
}

.toggle.small input:checked + .toggle-slider:before {
  transform: translateX(18px);
}

.provider-section {
  padding: 16px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.provider-name {
  font-weight: 500;
  color: #1f2937;
}

.callback-info {
  margin-top: 8px;
  padding: 10px 12px;
  background: #f1f5f9;
  border-radius: 8px;
  font-size: 13px;
  color: #475569;
}

.callback-info code {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 8px;
  background: white;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  color: #667eea;
  font-size: 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
  padding-top: 12px;
}

.btn-primary {
  padding: 12px 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.save-message {
  font-size: 14px;
  margin: 0;
}

.save-message.success {
  color: #10b981;
}

.save-message.error {
  color: #ef4444;
}

a {
  color: #667eea;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
</style>