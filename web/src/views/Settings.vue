<template>
  <Layout>
    <div class="settings-page">
      <div class="page-header">
        <h2>系统设置</h2>
      </div>

      <!-- ==================== GitHub OAuth 设置 ==================== -->
      <div class="settings-card">
        <div class="card-header">
          <h3>GitHub 登录</h3>
          <label class="toggle">
            <input type="checkbox" v-model="github.enabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="card-body">
          <p class="help-text">
            启用后，用户可以使用 GitHub 账号登录。
            请先在 GitHub 创建 OAuth App，然后在下方填入配置。
          </p>
          
          <div class="form-group">
            <label>GitHub OAuth App 客户端 ID</label>
            <input v-model="github.clientId" type="text" class="form-input" placeholder="Iv1.xxxxxxxx" />
          </div>
          
          <div class="form-group">
            <label>GitHub OAuth App 客户端密钥</label>
            <input v-model="github.clientSecret" type="password" class="form-input" placeholder="留空则保持不变" />
          </div>

          <div class="github-help">
            <h4>如何创建 GitHub OAuth App:</h4>
            <ol>
              <li>登录 GitHub 后进入 Settings - Developer settings - OAuth Apps</li>
              <li>点击 "New OAuth App"</li>
              <li>填写:
                <ul>
                  <li>Application name: Worker Mailer</li>
                  <li>Homepage URL: {{ homepageUrl }}</li>
                  <li>Authorization callback URL: {{ callbackUrl }}</li>
                </ul>
              </li>
              <li>点击 "Register application"</li>
              <li>复制生成的 Client ID 和 Client Secret 到上方输入框</li>
            </ol>
          </div>
          
          <div class="card-actions">
            <button @click="saveGithub" :disabled="savingGithub" class="btn-primary">
              {{ savingGithub ? '保存中...' : '保存 GitHub 登录' }}
            </button>
            <span v-if="githubMsg" class="msg" :class="githubMsgType">{{ githubMsg }}</span>
          </div>
        </div>
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
            在 Cloudflare Dashboard 创建站点后填入密钥，登录和注册页面会启用人机验证。
          </p>
          <div class="card-actions">
            <button @click="saveCaptcha" :disabled="savingCaptcha" class="btn-primary">
              {{ savingCaptcha ? '保存中...' : '保存人机验证' }}
            </button>
            <span v-if="captchaMsg" class="msg" :class="captchaMsgType">{{ captchaMsg }}</span>
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import Layout from '../components/Layout.vue';
import { api } from '../api';

interface CaptchaSettings {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
}

interface GitHubSettings {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
}

const captcha = reactive<CaptchaSettings>({ enabled: false, siteKey: '', secretKey: '' });
const github = reactive<GitHubSettings>({ enabled: false, clientId: '', clientSecret: '' });
const savingCaptcha = ref(false);
const savingGithub = ref(false);
const captchaMsg = ref('');
const captchaMsgType = ref('');
const githubMsg = ref('');
const githubMsgType = ref('');

const homepageUrl = computed(() => window.location.origin);
const callbackUrl = computed(() => `${window.location.origin}/api/auth/github/callback`);

async function loadSettings() {
  try {
    const result = await api.get<{ settings: { captcha: CaptchaSettings; oauth: any } }>('/settings');
    const s = result.settings;

    captcha.enabled = s.captcha.enabled;
    captcha.siteKey = s.captcha.siteKey;
    captcha.secretKey = '';

    // 加载 GitHub 设置
    const githubProvider = s.oauth.providers.find((p: any) => p.name === 'github');
    if (githubProvider) {
      github.enabled = githubProvider.enabled;
      github.clientId = githubProvider.clientId;
      github.clientSecret = '';
    }
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
    captchaMsg.value = '保存成功';
    captchaMsgType.value = 'success';
  } catch (e: any) {
    captchaMsg.value = '保存失败';
    captchaMsgType.value = 'error';
  } finally {
    savingCaptcha.value = false;
    setTimeout(() => { captchaMsg.value = ''; }, 3000);
  }
}

async function saveGithub() {
  savingGithub.value = true;
  githubMsg.value = '';
  try {
    const result = await api.put<{ oauth: any }>('/settings/github', {
      enabled: github.enabled,
      clientId: github.clientId,
      clientSecret: github.clientSecret
    });
    const githubProvider = result.oauth.providers.find((p: any) => p.name === 'github');
    if (githubProvider) {
      github.enabled = githubProvider.enabled;
      github.clientId = githubProvider.clientId;
      github.clientSecret = '';
    }
    githubMsg.value = '保存成功';
    githubMsgType.value = 'success';
  } catch (e: any) {
    githubMsg.value = '保存失败';
    githubMsgType.value = 'error';
  } finally {
    savingGithub.value = false;
    setTimeout(() => { githubMsg.value = ''; }, 3000);
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
.page-header h2 { font-size: 28px; color: var(--text-color); margin: 0; }

.settings-card {
  background-color: var(--card-bg);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: var(--card-shadow);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}
.card-header h3 { margin: 0; font-size: 18px; font-weight: 600; color: var(--text-color); }
.card-body { display: flex; flex-direction: column; gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 14px; font-weight: 500; color: var(--text-color); }
.form-input {
  padding: 10px 14px;
  border: 2px solid var(--input-border);
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
  background-color: var(--input-bg);
  color: var(--text-color);
}
.form-input:focus { outline: none; border-color: var(--input-focus); box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
.form-input::placeholder { color: var(--text-muted); }
.help-text { margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
.card-actions { display: flex; align-items: center; gap: 16px; padding-top: 8px; }
.msg { font-size: 14px; }
.msg.success { color: var(--success-color); }
.msg.error { color: var(--error-color); }

.github-help {
  background-color: var(--hover-bg);
  border-radius: 8px;
  padding: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.github-help h4 {
  margin: 0 0 12px 0;
  color: var(--text-color);
}

.github-help ol {
  margin: 0;
  padding-left: 20px;
}

.github-help li {
  margin-bottom: 8px;
}

.github-help ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  cursor: pointer;
}
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
.toggle input:checked + .toggle-slider { background-color: #667eea; }
.toggle input:checked + .toggle-slider:before { transform: translateX(22px); }

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
