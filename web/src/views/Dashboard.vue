<template>
  <Layout>
    <div class="dashboard">
      <div class="page-header">
        <h2>仪表板</h2>
        <p>欢迎使用 Worker Mailer 邮件发送服务</p>
      </div>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon total">📧</div>
          <div class="stat-content">
            <div class="stat-value">{{ metrics?.total || 0 }}</div>
            <div class="stat-label">总发送量</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon success">✅</div>
          <div class="stat-content">
            <div class="stat-value">{{ metrics?.sent || 0 }}</div>
            <div class="stat-label">成功发送</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon failed">❌</div>
          <div class="stat-content">
            <div class="stat-value">{{ metrics?.failed || 0 }}</div>
            <div class="stat-label">发送失败</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon pending">⏳</div>
          <div class="stat-content">
            <div class="stat-value">{{ metrics?.pending || 0 }}</div>
            <div class="stat-label">等待发送</div>
          </div>
        </div>
      </div>
      
      <div class="quick-actions">
        <h3>快速操作</h3>
        <div class="actions-grid">
          <router-link to="/smtp" class="action-card">
            <div class="action-icon">⚙️</div>
            <div class="action-title">配置 SMTP</div>
            <div class="action-desc">设置你的邮件服务器</div>
          </router-link>
          
          <router-link to="/templates" class="action-card">
            <div class="action-icon">📝</div>
            <div class="action-title">创建模板</div>
            <div class="action-desc">管理邮件模板</div>
          </router-link>
          
          <router-link to="/history" class="action-card">
            <div class="action-icon">📜</div>
            <div class="action-title">查看历史</div>
            <div class="action-desc">查看发送记录</div>
          </router-link>
        </div>
      </div>
      
      <div class="send-section">
        <h3>快速发送邮件</h3>
        <form @submit.prevent="handleSend" class="send-form">
          <div class="form-row">
            <div class="form-group">
              <label>收件人</label>
              <input v-model="emailData.to" type="email" required placeholder="recipient@email.com" />
            </div>
          </div>
          
          <div class="form-group">
            <label>主题</label>
            <input v-model="emailData.subject" type="text" required placeholder="邮件主题" />
          </div>
          
          <div class="form-group">
            <label>内容 (HTML)</label>
            <textarea v-model="emailData.html" rows="8" placeholder="<p>邮件内容...</p>" />
          </div>
          
          <div class="form-actions">
            <button type="submit" :disabled="sending" class="btn-primary">
              {{ sending ? '发送中...' : '发送邮件' }}
            </button>
          </div>
        </form>
        
        <p v-if="sendError" class="error">{{ sendError }}</p>
        <p v-if="sendSuccess" class="success">邮件发送成功！</p>
      </div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Layout from '../components/Layout.vue';
import { api } from '../api';

interface Metrics {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

const metrics = ref<Metrics | null>(null);
const sending = ref(false);
const sendError = ref<string | null>(null);
const sendSuccess = ref(false);

const emailData = ref({
  to: '',
  subject: '',
  html: ''
});

async function loadMetrics() {
  try {
    const result = await api.get<{ metrics: Metrics }>('/metrics');
    metrics.value = result.metrics;
  } catch (e) {
    console.error('Failed to load metrics:', e);
  }
}

async function handleSend() {
  sending.value = true;
  sendError.value = null;
  sendSuccess.value = false;
  
  try {
    await api.post('/emails', {
      to: emailData.value.to,
      subject: emailData.value.subject,
      html: emailData.value.html
    });
    sendSuccess.value = true;
    emailData.value = { to: '', subject: '', html: '' };
    setTimeout(() => sendSuccess.value = false, 3000);
    loadMetrics();
  } catch (e: any) {
    sendError.value = e.message || '发送失败';
  } finally {
    sending.value = false;
  }
}

onMounted(() => {
  loadMetrics();
});
</script>

<style scoped>
.dashboard {
  max-width: 1200px;
}

.page-header {
  margin-bottom: 32px;
}

.page-header h2 {
  font-size: 28px;
  color: #1e3a5f;
  margin-bottom: 8px;
}

.page-header p {
  color: #666;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.stat-icon.total { background: #e8f4fd; }
.stat-icon.success { background: #e8f8f0; }
.stat-icon.failed { background: #ffebee; }
.stat-icon.pending { background: #fff3e0; }

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #1e3a5f;
}

.stat-label {
  color: #888;
  font-size: 14px;
}

.quick-actions {
  margin-bottom: 40px;
}

.quick-actions h3 {
  font-size: 20px;
  color: #1e3a5f;
  margin-bottom: 20px;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.action-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  text-decoration: none;
  color: inherit;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s, box-shadow 0.2s;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.action-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.action-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e3a5f;
  margin-bottom: 4px;
}

.action-desc {
  color: #888;
  font-size: 14px;
}

.send-section {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.send-section h3 {
  font-size: 20px;
  color: #1e3a5f;
  margin-bottom: 24px;
}

.send-form {
  max-width: 700px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid #e1e5eb;
  border-radius: 8px;
  font-size: 15px;
  font-family: inherit;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
}

.form-group textarea {
  resize: vertical;
}

.form-actions {
  margin-top: 24px;
}

.btn-primary {
  padding: 14px 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
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

.error {
  color: #e74c3c;
  margin-top: 16px;
}

.success {
  color: #27ae60;
  margin-top: 16px;
}
</style>
