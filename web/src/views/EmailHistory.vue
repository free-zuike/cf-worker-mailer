<template>
  <Layout>
    <div class="history-page">
      <div class="page-header">
        <h2>发送历史</h2>
      </div>
      
      <div v-if="history.length === 0" class="empty-state">
        <div class="empty-icon">📜</div>
        <p>还没有发送记录</p>
        <p class="empty-desc">发送邮件后会在这里显示记录</p>
      </div>
      
      <div v-else class="history-list">
        <div v-for="item in history" :key="item.id" class="history-item">
          <div class="history-header">
            <div class="history-subject">{{ item.subject }}</div>
            <div class="history-status" :class="item.status">
              {{ item.status === 'sent' ? '已发送' : item.status === 'failed' ? '发送失败' : '等待发送' }}
            </div>
          </div>
          
          <div class="history-details">
            <div class="detail-row">
              <span class="detail-label">收件人:</span>
              <span class="detail-value">{{ Array.isArray(item.toEmails) ? item.toEmails.join(', ') : item.toEmails }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">发件人:</span>
              <span class="detail-value">{{ item.fromEmail }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">时间:</span>
              <span class="detail-value">{{ new Date(item.createdAt).toLocaleString() }}</span>
            </div>
          </div>
          
          <div v-if="item.errorMessage" class="history-error">
            错误: {{ item.errorMessage }}
          </div>
        </div>
      </div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Layout from '../components/Layout.vue';
import { api } from '../api';

interface EmailHistoryItem {
  id: string;
  fromEmail: string;
  toEmails: string[] | string;
  subject: string;
  status: 'sent' | 'failed' | 'pending';
  errorMessage?: string;
  createdAt: string;
}

const history = ref<EmailHistoryItem[]>([]);

async function loadHistory() {
  try {
    const result = await api.get<{ history: EmailHistoryItem[] }>('/emails');
    history.value = result.history;
  } catch (e) {
    console.error('Failed to load history:', e);
  }
}

onMounted(() => {
  loadHistory();
});
</script>

<style scoped>
.history-page {
  max-width: 1200px;
}

.page-header h2 {
  font-size: 28px;
  color: var(--text-color);
  margin-bottom: 32px;
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

.history-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-item {
  background-color: var(--card-bg);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--card-shadow);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.history-subject {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.history-status {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.history-status.sent {
  background: #e8f8f0;
  color: #27ae60;
}

.history-status.failed {
  background: #ffebee;
  color: #c0392b;
}

.history-status.pending {
  background: #fff3e0;
  color: #f39c12;
}

.history-details {
  margin-bottom: 12px;
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

.history-error {
  color: #c0392b;
  font-size: 14px;
  padding: 12px;
  background: #ffebee;
  border-radius: 8px;
}
</style>
