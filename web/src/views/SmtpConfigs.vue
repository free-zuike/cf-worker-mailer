<template>
  <Layout>
    <div class="smtp-page">
      <div class="page-header">
        <h2>邮件配置</h2>
        <button @click="showModal = true" class="btn-primary">添加配置</button>
      </div>
      
      <div v-if="configs.length === 0" class="empty-state">
        <div class="empty-icon">⚙️</div>
        <p>还没有配置邮件服务器</p>
        <p class="empty-desc">添加你的邮件配置开始发送邮件</p>
        <p class="empty-tip">推荐使用 <strong>MailChannels</strong> - 免费且无需配置 SMTP</p>
      </div>
      
      <div v-else class="configs-grid">
        <div v-for="config in configs" :key="config.id" class="config-card">
          <div class="config-header">
            <div class="config-name">{{ config.name }}</div>
            <div class="config-type" :class="config.type">{{ config.type === 'mailchannels' ? 'MailChannels' : 'SMTP' }}</div>
            <div class="config-status" :class="config.enabled ? 'active' : 'inactive'">
              {{ config.enabled ? '启用' : '禁用' }}
            </div>
          </div>
          
          <div class="config-details">
            <div v-if="config.type === 'mailchannels'" class="detail-row">
              <span class="detail-label">服务:</span>
              <span class="detail-value">MailChannels (免费)</span>
            </div>
            <div v-else class="detail-row">
              <span class="detail-label">服务器:</span>
              <span class="detail-value">{{ config.host }}:{{ config.port }}</span>
            </div>
            <div v-if="config.type === 'smtp'" class="detail-row">
              <span class="detail-label">用户名:</span>
              <span class="detail-value">{{ config.username }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">发件人:</span>
              <span class="detail-value">{{ config.fromName || '' }} &lt;{{ config.fromEmail }}&gt;</span>
            </div>
            <div v-if="config.type === 'smtp'" class="detail-row">
              <span class="detail-label">安全:</span>
              <span class="detail-value">{{ config.secure ? 'TLS' : '无' }}</span>
            </div>
          </div>
          
          <div class="config-actions">
            <button @click="editConfig(config)" class="btn-secondary">编辑</button>
            <button @click="deleteConfig(config.id)" class="btn-danger">删除</button>
          </div>
        </div>
      </div>
      
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ editingConfig ? '编辑配置' : '添加配置' }}</h3>
            <button @click="showModal = false" class="modal-close">&times;</button>
          </div>
          
          <form @submit.prevent="handleSubmit" class="modal-form">
            <div class="form-group">
              <label>配置类型</label>
              <select v-model="formData.type" @change="onTypeChange" class="form-select">
                <option value="mailchannels">MailChannels (推荐 - 免费)</option>
                <option value="smtp">SMTP 服务器</option>
              </select>
            </div>

            <div class="form-group">
              <label>配置名称</label>
              <input v-model="formData.name" type="text" required placeholder="我的邮件服务" />
            </div>

            <div v-if="formData.type === 'mailchannels'" class="mailchannels-notice">
              <p>📧 MailChannels 是 Cloudflare 提供的免费邮件发送服务</p>
              <p>无需配置服务器地址和密码，只需设置发件人邮箱即可</p>
            </div>
            
            <div v-if="formData.type === 'smtp'" class="form-row">
              <div class="form-group">
                <label>服务器地址</label>
                <input v-model="formData.host" type="text" :required="formData.type === 'smtp'" placeholder="smtp.example.com" />
              </div>
              <div class="form-group">
                <label>端口</label>
                <input v-model.number="formData.port" type="number" :required="formData.type === 'smtp'" :min="1" :max="65535" />
              </div>
            </div>
            
            <div v-if="formData.type === 'smtp'" class="form-row">
              <div class="form-group">
                <label>用户名</label>
                <input v-model="formData.username" type="text" :required="formData.type === 'smtp'" placeholder="user@example.com" />
              </div>
              <div class="form-group">
                <label>密码</label>
                <input v-model="formData.password" type="password" :required="formData.type === 'smtp' && !editingConfig" placeholder="••••••••" />
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>发件人邮箱</label>
                <input v-model="formData.fromEmail" type="email" required placeholder="noreply@example.com" />
              </div>
              <div class="form-group">
                <label>发件人名称</label>
                <input v-model="formData.fromName" type="text" placeholder="我的应用" />
              </div>
            </div>
            
            <div class="form-group checkbox-group">
              <label v-if="formData.type === 'smtp'">
                <input type="checkbox" v-model="formData.secure" /> 启用 TLS/SSL
              </label>
              <label>
                <input type="checkbox" v-model="formData.enabled" /> 启用此配置
              </label>
            </div>
            
            <div class="modal-actions">
              <button type="button" @click="showModal = false" class="btn-secondary">取消</button>
              <button type="submit" :disabled="saving" class="btn-primary">
                {{ saving ? '保存中...' : '保存' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Layout from '../components/Layout.vue';
import { api } from '../api';

interface SmtpConfig {
  id: string;
  name: string;
  type: 'smtp' | 'mailchannels';
  host?: string;
  port?: number;
  username?: string;
  fromEmail: string;
  fromName?: string;
  secure: boolean;
  enabled: boolean;
}

const configs = ref<SmtpConfig[]>([]);
const showModal = ref(false);
const editingConfig = ref<SmtpConfig | null>(null);
const saving = ref(false);

const formData = ref({
  name: '',
  type: 'mailchannels' as const,
  host: '',
  port: 587,
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
  secure: true,
  enabled: true
});

async function loadConfigs() {
  try {
    const result = await api.get<{ configs: SmtpConfig[] }>('/smtp-configs');
    configs.value = result.configs;
  } catch (e) {
    console.error('Failed to load configs:', e);
  }
}

function onTypeChange() {
  if (formData.value.type === 'mailchannels') {
    formData.value.host = '';
    formData.value.port = 587;
    formData.value.username = '';
    formData.value.password = '';
    formData.value.secure = true;
  } else {
    formData.value.host = 'smtp.example.com';
    formData.value.port = 587;
  }
}

function editConfig(config: SmtpConfig) {
  editingConfig.value = config;
  formData.value = {
    name: config.name,
    type: config.type || 'smtp',
    host: config.host || '',
    port: config.port || 587,
    username: config.username || '',
    password: '',
    fromEmail: config.fromEmail,
    fromName: config.fromName || '',
    secure: config.secure,
    enabled: config.enabled
  };
  showModal.value = true;
}

async function deleteConfig(id: string) {
  if (!confirm('确定要删除这个配置吗？')) return;
  
  try {
    await api.delete(`/smtp-configs/${id}`);
    loadConfigs();
  } catch (e) {
    console.error('Failed to delete config:', e);
  }
}

async function handleSubmit() {
  saving.value = true;
  
  try {
    if (editingConfig.value) {
      await api.put(`/smtp-configs/${editingConfig.value.id}`, formData.value);
    } else {
      await api.post('/smtp-configs', formData.value);
    }
    
    showModal.value = false;
    resetForm();
    loadConfigs();
  } catch (e) {
    console.error('Failed to save config:', e);
  } finally {
    saving.value = false;
  }
}

function resetForm() {
  editingConfig.value = null;
  formData.value = {
    name: '',
    type: 'mailchannels',
    host: '',
    port: 587,
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
    secure: true,
    enabled: true
  };
}

onMounted(() => {
  loadConfigs();
});
</script>

<style scoped>
.smtp-page {
  max-width: 1200px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.page-header h2 {
  font-size: 28px;
  color: var(--text-color);
  margin: 0;
}

.btn-secondary {
  padding: 10px 20px;
  background-color: var(--hover-bg);
  color: var(--text-color);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-secondary:hover {
  background-color: var(--active-bg);
}

.btn-danger {
  padding: 10px 20px;
  background: #ffebee;
  color: #c0392b;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-danger:hover {
  background: #ffcdd2;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  background-color: var(--card-bg);
  border-radius: 12px;
  box-shadow: var(--card-shadow);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-state p {
  color: var(--text-color);
  font-size: 18px;
  margin-bottom: 8px;
}

.empty-desc {
  color: var(--text-muted) !important;
  font-size: 14px !important;
}

.empty-tip {
  color: var(--primary-color) !important;
  font-size: 14px !important;
  margin-top: 16px;
}

.configs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
}

.config-card {
  background-color: var(--card-bg);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--card-shadow);
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}

.config-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.config-type {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.config-type.mailchannels {
  background: #e8f5e9;
  color: #2e7d32;
}

.config-type.smtp {
  background: #e3f2fd;
  color: #1565c0;
}

.config-status {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.config-status.active {
  background: #e8f8f0;
  color: #27ae60;
}

.config-status.inactive {
  background: var(--hover-bg);
  color: var(--text-muted);
}

.config-details {
  margin-bottom: 20px;
}

.detail-row {
  display: flex;
  margin-bottom: 8px;
  font-size: 14px;
}

.detail-label {
  color: var(--text-muted);
  width: 80px;
  flex-shrink: 0;
}

.detail-value {
  color: var(--text-color);
}

.config-actions {
  display: flex;
  gap: 12px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background-color: var(--card-bg);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 20px;
  color: var(--text-color);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
}

.modal-form {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-color);
  font-weight: 500;
  font-size: 14px;
}

.form-group input,
.form-group .form-select {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--input-border);
  border-radius: 8px;
  font-size: 15px;
  transition: border-color 0.2s;
  background-color: var(--input-bg);
  color: var(--text-color);
}

.form-group input:focus,
.form-group .form-select:focus {
  outline: none;
  border-color: var(--input-focus);
}

.form-group .form-select {
  cursor: pointer;
}

.mailchannels-notice {
  background: #e8f5e9;
  border: 1px solid #a5d6a7;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.mailchannels-notice p {
  margin: 0 0 8px 0;
  color: #2e7d32;
  font-size: 14px;
}

.mailchannels-notice p:last-child {
  margin-bottom: 0;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.checkbox-group {
  display: flex;
  gap: 24px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  cursor: pointer;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
