<template>
  <Layout>
    <div class="settings-page">
      <div class="page-header">
        <h2>系统设置</h2>
      </div>

      <!-- ==================== 人机验证设置 ==================== -->
      <div class="settings-card">
        <div class="card-header">
          <h3>人机验证</h3>
          <label class="toggle">
            <input type="checkbox" v-model="captcha.enabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label>站点密钥 (Site Key)</label>
            <input v-model="captcha.siteKey" type="text" class="form-input" placeholder="1x00000000000000000000AA" />
          </div>
          <div class="form-group">
            <label>密钥 (Secret Key)</label>
            <input v-model="captcha.secretKey" type="password" class="form-input" placeholder="留空则保持不变" />
          </div>
          <p class="help-text">
            在 <a href="https://dash.cloudflare.com" target="_blank" rel="noopener">Cloudflare</a>
            创建站点后填入密钥，登录和注册页面会启用人机验证。
          </p>
          <div class="card-actions">
            <button @click="saveCaptcha" :disabled="savingCaptcha" class="btn-primary">
              {{ savingCaptcha ? '保存中...' : '保存人机验证' }}
            </button>
            <span v-if="captchaMsg" class="msg" :class="captchaMsgType">{{ captchaMsg }}</span>
          </div>
        </div>
      </div>

      <!-- ==================== OpenAuth 设置 ==================== -->
      <div class="settings-card">
        <div class="card-header">
          <h3>第三方登录 (OpenAuth)</h3>
          <label class="toggle">
            <input type="checkbox" v-model="oauth.enabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="card-body">
          <div
            v-for="(provider, index) in oauth.providers"
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
              <label>显示名称</label>
              <input v-model="provider.label" type="text" class="form-input" placeholder="My OpenAuth" />
            </div>

            <div class="form-group">
              <label>Issuer URL</label>
              <input v-model="provider.issuer" type="text" class="form-input" placeholder="https://your-oidc-provider.com" />
            </div>

            <div class="form-group">
              <label>客户端 ID (Client ID)</label>
              <input v-model="provider.clientId" type="text" class="form-input" placeholder="your-client-id" />
            </div>

            <div class="form-group">
              <label>客户端密钥 (Client Secret)</label>
              <input v-model="provider.clientSecret" type="password" class="form-input" placeholder="留空则保持不变" />
            </div>

            <div class="form-group">
              <label>作用域 (Scopes，空格分隔)</label>
              <input v-model="oauthScopes[index]" type="text" class="form-input" placeholder="openid email profile" />
            </div>

            <div class="callback-info">
              <strong>回调地址：</strong>
              <code>{{ callbackUrl }}</code>
            </div>
          </div>

          <div class="card-actions">
            <button @click="saveOAuth" :disabled="savingOAuth" class="btn-primary">
              {{ savingOAuth ? '保存中...' : '保存 OpenAuth' }}
            </button>
            <span v-if="oauthMsg" class="msg" :class="oauthMsgType">{{ oauthMsg }}</span>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import Layout from '../components/Layout.vue';
import { api } from '../api';

interface OAuthProviderConfig {
  name: string;
  label: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  issuer?: string;
}

interface CaptchaSettings {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
}

interface OAuthSettings {
  enabled: boolean;
  providers: OAuthProviderConfig[];
}

const captcha = reactive<CaptchaSettings>({ enabled: false, siteKey: '', secretKey: '' });
const oauth = reactive<OAuthSettings>({ enabled: false, providers: [] });
const oauthScopes = ref<string[]>([]);
const savingCaptcha = ref(false);
const savingOAuth = ref(false);
const captchaMsg = ref('');
const captchaMsgType = ref('');
const oauthMsg = ref('');
const oauthMsgType = ref('');

const callbackUrl = `${window.location.origin}/api/oauth/callback`;

async function loadSettings() {
  try {
    const result = await api.get<{ settings: { captcha: CaptchaSettings; oauth: OAuthSettings } }>('/settings');
    const s = result.settings;

    captcha.enabled = s.captcha.enabled;
    captcha.siteKey = s.captcha.siteKey;
    captcha.secretKey = '';

    oauth.enabled = s.oauth.enabled;
    oauth.providers = s.oauth.providers.map(p => ({
      name: p.name,
      label: p.label,
      enabled: p.enabled,
      clientId: p.clientId,
      clientSecret: '',
      scopes: p.scopes,
      issuer: p.issuer
    }));
    oauthScopes.value = oauth.providers.map(p => (p.scopes as string[]).join(' '));
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

async function saveCaptcha() {
  savingCaptcha.value = true;
  captchaMsg.value = '';
  try {
    const result = await api.put<{ captcha: CaptchaSettings }>('/settings/captcha', { captcha });
    captcha.enabled = result.captcha.enabled;
    captcha.siteKey = result.captcha.siteKey;
    captcha.secretKey = '';
    captchaMsg.value = '✓ 人机验证设置已保存';
    captchaMsgType.value = 'success';
  } catch (e: any) {
    captchaMsg.value = '保存失败';
    captchaMsgType.value = 'error';
  } finally {
    savingCaptcha.value = false;
    setTimeout(() => { captchaMsg.value = ''; }, 3000);
  }
}

async function saveOAuth() {
  savingOAuth.value = true;
  oauthMsg.value = '';
  try {
    const providers = oauth.providers.map((p, i) => ({
      name: p.name,
      label: p.label,
      enabled: p.enabled,
      clientId: p.clientId,
      clientSecret: p.clientSecret,
      scopes: oauthScopes.value[i] ? oauthScopes.value[i].split(/\s+/) : ['openid', 'email', 'profile'],
      issuer: p.issuer
    }));
    const result = await api.put<{ oauth: OAuthSettings }>('/settings/oauth', { oauth: { enabled: oauth.enabled, providers } });
    oauth.enabled = result.oauth.enabled;
    oauth.providers = result.oauth.providers.map(p => ({ ...p, clientSecret: '' }));
    oauthScopes.value = oauth.providers.map(p => (p.scopes as string[]).join(' '));
    oauthMsg.value = '✓ OpenAuth 设置已保存';
    oauthMsgType.value = 'success';
  } catch (e: any) {
    oauthMsg.value = '保存失败';
    oauthMsgType.value = 'error';
  } finally {
    savingOAuth.value = false;
    setTimeout(() => { oauthMsg.value = ''; }, 3000);
  }
}

onMounted(() => { loadSettings(); });
</script>

<style scoped>
.settings-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 28px; color: #1e3a5f; margin: 0; }

.settings-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
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
.card-header h3 { margin: 0; font-size: 18px; font-weight: 600; color: #1f2937; }
.card-body { display: flex; flex-direction: column; gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 14px; font-weight: 500; color: #4b5563; }
.form-input {
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
}
.form-input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
.help-text { margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6; }
.card-actions { display: flex; align-items: center; gap: 16px; padding-top: 8px; }
.msg { font-size: 14px; }
.msg.success { color: #10b981; }
.msg.error { color: #ef4444; }

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
.provider-name { font-weight: 500; color: #1f2937; }
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
  font-family: monospace;
  color: #667eea;
  font-size: 12px;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  cursor: pointer;
}
.toggle.small { width: 40px; height: 22px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute;
  inset: 0;
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
.toggle.small .toggle-slider:before { height: 14px; width: 14px; }
.toggle input:checked + .toggle-slider { background-color: #667eea; }
.toggle input:checked + .toggle-slider:before { transform: translateX(22px); }
.toggle.small input:checked + .toggle-slider:before { transform: translateX(18px); }

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
a { color: #667eea; text-decoration: none; }
a:hover { text-decoration: underline; }
</style>
