<template>
  <Layout>
    <div class="templates-page">
      <div class="page-header">
        <h2>邮件模板</h2>
        <button @click="showModal = true" class="btn-primary">创建模板</button>
      </div>
      
      <div v-if="templates.length === 0" class="empty-state">
        <div class="empty-icon">📝</div>
        <p>还没有邮件模板</p>
        <p class="empty-desc">创建模板来快速发送常用邮件</p>
      </div>
      
      <div v-else class="templates-grid">
        <div v-for="template in templates" :key="template.id" class="template-card">
          <div class="template-header">
            <h3>{{ template.name }}</h3>
            <p class="template-subject">{{ template.subject }}</p>
          </div>
          <div class="template-preview">
            <p>{{ template.htmlContent ? template.htmlContent.substring(0, 100) : (template.textContent || '') }}...</p>
          </div>
          <div class="template-actions">
            <button @click="editTemplate(template)" class="btn-secondary">编辑</button>
            <button @click="deleteTemplate(template.id)" class="btn-danger">删除</button>
          </div>
        </div>
      </div>
      
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ editingTemplate ? '编辑模板' : '创建模板' }}</h3>
            <button @click="showModal = false" class="modal-close">&times;</button>
          </div>
          
          <form @submit.prevent="handleSubmit" class="modal-form">
            <div class="form-group">
              <label>模板名称</label>
              <input v-model="formData.name" type="text" required placeholder="欢迎邮件" />
            </div>
            
            <div class="form-group">
              <label>邮件主题</label>
              <input v-model="formData.subject" type="text" required placeholder="欢迎使用我们的服务！" />
            </div>
            
            <div class="form-group">
              <label>HTML 内容</label>
              <textarea v-model="formData.htmlContent" rows="8" placeholder="<p>你好，{{name}}...</p>" />
            </div>
            
            <div class="form-group">
              <label>纯文本内容</label>
              <textarea v-model="formData.textContent" rows="4" placeholder="你好，{{name}}..." />
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

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  variables?: any[];
}

const templates = ref<EmailTemplate[]>([]);
const showModal = ref(false);
const editingTemplate = ref<EmailTemplate | null>(null);
const saving = ref(false);

const formData = ref({
  name: '',
  subject: '',
  htmlContent: '',
  textContent: '',
  variables: []
});

async function loadTemplates() {
  try {
    const result = await api.get<{ templates: EmailTemplate[] }>('/templates');
    templates.value = result.templates;
  } catch (e) {
    console.error('Failed to load templates:', e);
  }
}

function editTemplate(template: EmailTemplate) {
  editingTemplate.value = template;
  formData.value = {
    name: template.name,
    subject: template.subject,
    htmlContent: template.htmlContent || '',
    textContent: template.textContent || '',
    variables: template.variables || []
  };
  showModal.value = true;
}

async function deleteTemplate(id: string) {
  if (!confirm('确定要删除这个模板吗？')) return;
  
  try {
    await api.delete(`/templates/${id}`);
    loadTemplates();
  } catch (e) {
    console.error('Failed to delete template:', e);
  }
}

async function handleSubmit() {
  saving.value = true;
  
  try {
    if (editingTemplate.value) {
      await api.put(`/templates/${editingTemplate.value.id}`, formData.value);
    } else {
      await api.post('/templates', formData.value);
    }
    
    showModal.value = false;
    resetForm();
    loadTemplates();
  } catch (e) {
    console.error('Failed to save template:', e);
  } finally {
    saving.value = false;
  }
}

function resetForm() {
  editingTemplate.value = null;
  formData.value = {
    name: '',
    subject: '',
    htmlContent: '',
    textContent: '',
    variables: []
  };
}

onMounted(() => {
  loadTemplates();
});
</script>

<style scoped>
.templates-page {
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

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

.template-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.template-header h3 {
  font-size: 18px;
  color: #1e3a5f;
  margin: 0 0 8px 0;
}

.template-subject {
  color: #888;
  font-size: 14px;
  margin: 0 0 16px 0;
}

.template-preview {
  color: #666;
  font-size: 14px;
  margin-bottom: 20px;
}

.template-actions {
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

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
