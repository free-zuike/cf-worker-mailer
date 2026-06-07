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
        <div class="section-header">
          <h3>发送邮件</h3>
          <div class="editor-toggle">
            <button 
              :class="['toggle-btn', { active: editorMode === 'html' }]"
              @click="editorMode = 'html'"
            >
              HTML 编辑
            </button>
            <button 
              :class="['toggle-btn', { active: editorMode === 'rich' }]"
              @click="editorMode = 'rich'"
            >
              富文本
            </button>
          </div>
        </div>
        
        <form @submit.prevent="handleSend" class="send-form">
          <div class="template-select">
            <label>选择模板</label>
            <select v-model="selectedTemplate" @change="loadTemplate" class="form-select">
              <option value="">不使用模板</option>
              <option v-for="t in templates" :key="t.id" :value="t">{{ t.name }}</option>
            </select>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>收件人 <span class="required">*</span></label>
              <input v-model="emailData.to" type="email" required placeholder="recipient@email.com" />
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>抄送</label>
              <input v-model="emailData.cc" type="email" placeholder="cc@email.com" />
            </div>
            <div class="form-group">
              <label>密送</label>
              <input v-model="emailData.bcc" type="email" placeholder="bcc@email.com" />
            </div>
          </div>
          
          <div class="form-group">
            <label>主题 <span class="required">*</span></label>
            <input v-model="emailData.subject" type="text" required placeholder="邮件主题" />
          </div>
          
          <div class="form-group">
            <div class="content-header">
              <label>内容 <span class="required">*</span></label>
              <div v-if="editorMode === 'rich'" class="rich-editor-toolbar">
                <button type="button" @click="execCommand('bold')" title="加粗"><b>B</b></button>
                <button type="button" @click="execCommand('italic')" title="斜体"><i>I</i></button>
                <button type="button" @click="execCommand('underline')" title="下划线"><u>U</u></button>
                <span class="toolbar-separator"></span>
                <button type="button" @click="execCommand('insertUnorderedList')" title="无序列表">• 列表</button>
                <button type="button" @click="execCommand('insertOrderedList')" title="有序列表">1. 列表</button>
                <span class="toolbar-separator"></span>
                <button type="button" @click="insertLink" title="插入链接">🔗 链接</button>
                <button type="button" @click="insertImage" title="插入图片">🖼️ 图片</button>
                <span class="toolbar-separator"></span>
                <button type="button" @click="togglePreview" :class="{ active: showPreview }" title="预览">
                  👁️ {{ showPreview ? '编辑' : '预览' }}
                </button>
              </div>
            </div>
            
            <div v-if="editorMode === 'rich'" class="rich-editor-wrapper">
              <div v-if="!showPreview"
                ref="richEditor"
                class="rich-editor"
                contenteditable="true"
                @input="handleRichEditorInput"
                placeholder="输入邮件内容..."
              ></div>
              <div v-else class="email-preview" v-html="emailData.html"></div>
            </div>
            
            <textarea 
              v-else
              v-model="emailData.html"
              rows="12"
              placeholder="<p>邮件内容...</p>"
              class="html-editor"
            ></textarea>
          </div>
          
          <div class="form-actions">
            <button type="button" @click="clearForm" class="btn-secondary">
              清空
            </button>
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

interface Template {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
}

const metrics = ref<Metrics | null>(null);
const templates = ref<Template[]>([]);
const sending = ref(false);
const sendError = ref<string | null>(null);
const sendSuccess = ref(false);
const editorMode = ref<'html' | 'rich'>('rich');
const showPreview = ref(false);
const selectedTemplate = ref<Template | null>(null);
const richEditor = ref<HTMLElement | null>(null);

const emailData = ref({
  to: '',
  cc: '',
  bcc: '',
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

async function loadTemplates() {
  try {
    const result = await api.get<{ templates: Template[] }>('/templates');
    templates.value = result.templates;
  } catch (e) {
    console.error('Failed to load templates:', e);
  }
}

function loadTemplate() {
  if (selectedTemplate.value) {
    emailData.value.subject = selectedTemplate.value.subject;
    emailData.value.html = selectedTemplate.value.htmlContent;
    if (editorMode.value === 'rich' && richEditor.value) {
      richEditor.value.innerHTML = selectedTemplate.value.htmlContent;
    }
  }
}

function handleRichEditorInput() {
  if (richEditor.value) {
    emailData.value.html = richEditor.value.innerHTML;
  }
}

function execCommand(command: string) {
  if (richEditor.value) {
    richEditor.value.focus();
    document.execCommand(command, false, null);
    handleRichEditorInput();
  }
}

function insertLink() {
  const url = prompt('请输入链接地址:', 'https://');
  if (url && richEditor.value) {
    richEditor.value.focus();
    document.execCommand('createLink', false, url);
    handleRichEditorInput();
  }
}

function insertImage() {
  const url = prompt('请输入图片地址:', 'https://');
  if (url && richEditor.value) {
    richEditor.value.focus();
    document.execCommand('insertImage', false, url);
    handleRichEditorInput();
  }
}

function togglePreview() {
  showPreview.value = !showPreview.value;
}

function clearForm() {
  emailData.value = { to: '', cc: '', bcc: '', subject: '', html: '' };
  selectedTemplate.value = null;
  if (richEditor.value) {
    richEditor.value.innerHTML = '';
  }
  sendError.value = null;
  sendSuccess.value = false;
}

async function handleSend() {
  sending.value = true;
  sendError.value = null;
  sendSuccess.value = false;
  
  try {
    const payload: any = {
      to: emailData.value.to,
      subject: emailData.value.subject,
      html: emailData.value.html
    };
    
    if (emailData.value.cc) {
      payload.cc = emailData.value.cc;
    }
    
    if (emailData.value.bcc) {
      payload.bcc = emailData.value.bcc;
    }
    
    await api.post('/emails', payload);
    sendSuccess.value = true;
    clearForm();
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
  loadTemplates();
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

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-header h3 {
  font-size: 20px;
  color: #1e3a5f;
  margin: 0;
}

.editor-toggle {
  display: flex;
  gap: 4px;
  background: #f5f7fa;
  padding: 4px;
  border-radius: 8px;
}

.toggle-btn {
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}

.toggle-btn:hover {
  color: #333;
}

.toggle-btn.active {
  background: white;
  color: #1e3a5f;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.send-form {
  max-width: 100%;
}

.template-select {
  margin-bottom: 24px;
}

.template-select label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
}

.form-select {
  width: 100%;
  padding: 12px;
  border: 2px solid #e1e5eb;
  border-radius: 8px;
  font-size: 15px;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s;
}

.form-select:focus {
  outline: none;
  border-color: #667eea;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

@media (min-width: 768px) {
  .form-row {
    grid-template-columns: 1fr 1fr;
  }
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

.required {
  color: #e74c3c;
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

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.rich-editor-toolbar {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}

.rich-editor-toolbar button {
  padding: 6px 10px;
  background: #f5f7fa;
  border: 1px solid #e1e5eb;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.rich-editor-toolbar button:hover {
  background: #e8f0f7;
  border-color: #cbd5e1;
}

.rich-editor-toolbar button.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.toolbar-separator {
  width: 1px;
  height: 20px;
  background: #e1e5eb;
  margin: 0 4px;
}

.rich-editor-wrapper {
  border: 2px solid #e1e5eb;
  border-radius: 8px;
  overflow: hidden;
}

.rich-editor {
  min-height: 300px;
  padding: 16px;
  outline: none;
  line-height: 1.6;
}

.rich-editor:focus {
  border-color: #667eea;
}

.rich-editor:empty:before {
  content: attr(placeholder);
  color: #999;
}

.email-preview {
  min-height: 300px;
  padding: 16px;
  background: #fafafa;
  border-top: 1px solid #e1e5eb;
}

.html-editor {
  min-height: 300px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.btn-primary,
.btn-secondary {
  padding: 14px 32px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
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
  background: #f5f7fa;
  color: #1e3a5f;
}

.btn-secondary:hover {
  background: #e8f0f7;
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
