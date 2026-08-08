<script setup lang="tsx">
import { computed, onMounted, ref } from 'vue';
import { useDialog, NTag } from 'naive-ui';
import {
  fetchEmailHistory,
  fetchEmail,
  type EmailHistoryItem
} from '@/service/api/email';

const dialog = useDialog();

const history = ref<EmailHistoryItem[]>([]);
const loading = ref(false);

const statusMap: Record<string, { text: string; type: 'success' | 'error' | 'warning' | 'default' }> = {
  sent: { text: '成功', type: 'success' },
  failed: { text: '失败', type: 'error' },
  pending: { text: '待发送', type: 'warning' }
};

const columns = computed(() => [
  { title: '收件人', key: 'toEmails', width: 220, render: (row: EmailHistoryItem) => row.toEmails.join(', ') },
  { title: '主题', key: 'subject', width: 300 },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (row: EmailHistoryItem) => {
      const s = statusMap[row.status] || { text: row.status, type: 'default' };
      return <NTag type={s.type}>{s.text}</NTag>;
    }
  },
  { title: '创建时间', key: 'createdAt', width: 180 },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    render: (row: EmailHistoryItem) => (
      <NButton size="small" onClick={() => showDetail(row.id)}>
        详情
      </NButton>
    )
  }
]);

async function loadHistory() {
  loading.value = true;
  const { data, error } = await fetchEmailHistory(50, 0);
  if (!error) {
    history.value = data.history;
  }
  loading.value = false;
}

async function showDetail(id: string) {
  const { data, error } = await fetchEmail(id);
  if (error) return;
  const email = data.email;
  dialog.info({
    title: '邮件详情',
    content: () => (
      <div>
        <p>收件人: {email.toEmails.join(', ')}</p>
        <p>主题: {email.subject}</p>
        <p>状态: {statusMap[email.status]?.text || email.status}</p>
        {email.errorMessage ? <p style="color:#d03050">错误: {email.errorMessage}</p> : null}
      </div>
    ),
    positiveText: '关闭'
  });
}

onMounted(loadHistory);
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">发送历史</h2>
      <NButton @click="loadHistory">刷新</NButton>
    </div>

    <NDataTable
      :columns="columns"
      :data="history"
      :loading="loading"
      :bordered="false"
      class="card-wrapper"
    />
  </NSpace>
</template>