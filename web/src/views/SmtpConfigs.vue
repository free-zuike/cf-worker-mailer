<template>
  <Layout>
    <div class="smtp-page">
      <div class="page-header">
        <h2>SMTP 配置</h2>
        <button @click="showModal = true" class="btn-primary">添加配置</button>
      </div>
      
      <div v-if="configs.length === 0" class="empty-state">
        <div class="empty-icon">⚙️</div>
        <p>还没有配置 SMTP 服务器</p>
        <p class="empty-desc">添加你的邮件服务器配置开始发送邮件</p>
      </div>
      
      <div v-else class="configs-grid">
        <div v-for="config in configs" :key="config.id" class="config-card">
          <div class="config-header">
            <div class="config-name">{{ config.name }}</div>
            <div class="config-status" :class="config.enabled ? 'active' : 'inactive'">
              {{ config.enabled ? '启用' : '禁用' }}
            </div>
          </div>
          
          <div class="config-details">
            <div class="detail-row">
              <span class="detail-label">服务器:</span>
              <span class="detail-value">{{ config.host }}:{{ config.port }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">用户名:</span>
              <span class="detail-value">{{ config.username }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">发件人:</span>
              <span class="detail-value">{{ config.fromName || '' }} &lt;{{ config.fromEmail }}&gt;</span>
            </div>
            <div class="detail-row">
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
              <label>配置名称</label>
              <input v-model="formData.name" type="text" required placeholder="我的 SMTP 服务器" />
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>服务器地址</label>
                <input v-model="formData.host" type="text" required placeholder="smtp.example.com" />
              </div>
              <div class="form-group">
                <label>端口</label>
                <input v-model.number="formData.port" type="number" required :min="1" :max="65535" />
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>用户名</label>
                <input v-model="formData.username" type="text" required placeholder="user@example.com" />
              </div>
              <div class="form-group">
                <label>密码</label>
                <input v-model="formData.password" type="password" :required="!editingConfig" placeholder="••••••••" />
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
              <label>
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
  host: string;
  port: number;
  username: string;
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

function editConfig(config: SmtpConfig) {
  editingConfig.value = config;
  formData.value = {
    name: config.name,
    host: config.host,
    port: config.port,
    username: config.username,
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
  color: #1e3a5f;
}

.btn-primary {
  padding: 12px 24px;
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

.btn-secondary {
  padding: 10px 20px;
  background: #f0f4f8;
  color: #1e3a5f;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: #e1e8f0;
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
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-state p {
  color: #333;
  font-size: 18px;
  margin-bottom: 8px;
}

.empty-desc {
  color: #888 !important;
  font-size: 14px !important;
}

.configs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
}

.config-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.config-name {
  font-size: 18px;
  font-weight: 600;
  color: #1e3a5f;
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
  background: #f5f5f5;
  color: #888;
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
  color: #888;
  width: 80px;
}

.detail-value {
  color: #333;
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
  background: white;
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
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  font-size: 20px;
  color: #1e3a5f;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 28px;
  color: #888;
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
  color: #333;
  font-weight: 500;
  font-size: 14px;
}

.form-group input {
  width: 100%;
  padding: 12px;
  border: 2px solid #e1e5eb;
  border-radius: 8px;
  font-size: 15px;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
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
