<script setup lang="tsx">
import { computed, onMounted, ref } from 'vue';
import { NTag } from 'naive-ui';
import { fetchEmailHistory, fetchEmail, type EmailHistoryItem } from '@/service/api/email';

const history = ref<EmailHistoryItem[]>([]);
const loading = ref(false);
const showDetail = ref(false);
const detailEmail = ref<EmailHistoryItem | null>(null);
const showHtml = ref(false);

const statusMap: Record<string, { text: string; type: 'success' | 'error' | 'warning' | 'default' }> = {
  sent: { text: '成功', type: 'success' },
  failed: { text: '失败', type: 'error' },
  pending: { text: '待发送', type: 'warning' }
};

const columns = computed(() => [
  { title: '收件人', key: 'toEmails', width: 220, render: (row: EmailHistoryItem) => row.toEmails.join(', ') },
  { title: '主题', key: 'subject', width: 300, ellipsis: true },
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
      <NButton size="small" onClick={() => showDetailFn(row.id)}>详情</NButton>
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

async function showDetailFn(id: string) {
  const { data, error } = await fetchEmail(id);
  if (error) return;
  detailEmail.value = data.email;
  showHtml.value = false;
  showDetail.value = true;
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

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="showDetail" :width="640" placement="right">
      <NDrawerContent title="邮件详情" closable>
        <template v-if="detailEmail">
          <NDescriptions label-placement="left" bordered :column="1" size="small">
            <NDescriptionsItem label="状态">
              <NTag :type="detailEmail.status === 'sent' ? 'success' : detailEmail.status === 'failed' ? 'error' : 'warning'">
                {{ statusMap[detailEmail.status]?.text || detailEmail.status }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="收件人">{{ detailEmail.toEmails.join(', ') }}</NDescriptionsItem>
            <NDescriptionsItem v-if="detailEmail.ccEmails?.length" label="抄送">{{ detailEmail.ccEmails.join(', ') }}</NDescriptionsItem>
            <NDescriptionsItem v-if="detailEmail.bccEmails?.length" label="密送">{{ detailEmail.bccEmails.join(', ') }}</NDescriptionsItem>
            <NDescriptionsItem label="主题">{{ detailEmail.subject }}</NDescriptionsItem>
            <NDescriptionsItem label="发件人">{{ detailEmail.fromEmail }}</NDescriptionsItem>
            <NDescriptionsItem label="发送时间">{{ detailEmail.sentAt || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="创建时间">{{ detailEmail.createdAt }}</NDescriptionsItem>
            <NDescriptionsItem v-if="detailEmail.errorMessage" label="错误信息">
              <span style="color: #d03050;">{{ detailEmail.errorMessage }}</span>
            </NDescriptionsItem>
          </NDescriptions>

          <NDivider />

          <div v-if="detailEmail.htmlContent">
            <NSpace align="center" class="mb-8px">
              <span class="text-16px font-500">HTML 预览</span>
              <NSwitch v-model:value="showHtml" />
              <span class="text-14px text-#999">{{ showHtml ? '源码' : '预览' }}</span>
            </NSpace>
            <div v-if="showHtml" class="html-source">
              <pre><code>{{ detailEmail.htmlContent }}</code></pre>
            </div>
            <iframe v-else :srcdoc="detailEmail.htmlContent" class="html-preview" sandbox="allow-same-origin"></iframe>
          </div>

          <div v-if="detailEmail.textContent" class="mt-16px">
            <h3 class="text-16px font-500 mb-8px">纯文本内容</h3>
            <pre class="text-preview">{{ detailEmail.textContent }}</pre>
          </div>
        </template>
      </NDrawerContent>
    </NDrawer>
  </NSpace>
</template>

<style scoped>
.html-preview {
  width: 100%;
  height: 400px;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
}
.html-source {
  max-height: 400px;
  overflow: auto;
  background: #f5f5f5;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  padding: 12px;
}
.html-source code {
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
}
.text-preview {
  white-space: pre-wrap;
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
}
html.dark .html-preview { border-color: #333; }
html.dark .html-source,
html.dark .text-preview { background: #2a2a2a; border-color: #333; }
.mt-16px { margin-top: 16px; }
.mb-8px { margin-bottom: 8px; }
</style>