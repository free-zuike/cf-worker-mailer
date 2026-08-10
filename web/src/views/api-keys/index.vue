<script setup lang="tsx">
import { onMounted, reactive, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { fetchApiKeys, generateApiKey, deleteApiKey, type ApiKey } from '@/service/api/apiKey';

const dialog = useDialog();
const message = useMessage();

const keys = ref<ApiKey[]>([]);
const loading = ref(false);
const showGenerate = ref(false);
const generatedKey = ref('');
const showKeyModal = ref(false);

const form = reactive({
  name: 'MCP 调用',
  expiresInDays: 30
});

const expiresOptions = [
  { label: '永久有效', value: 0 },
  { label: '1 天', value: 1 },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
  { label: '1 年', value: 365 }
];

const columns = [
  { title: '名称', key: 'name', width: 160 },
  {
    title: '有效期',
    key: 'expiresAt',
    width: 200,
    render: (row: ApiKey) => row.expiresAt ? new Date(row.expiresAt).toLocaleString('zh-CN') : '永久有效'
  },
  { title: '创建时间', key: 'createdAt', width: 200, render: (row: ApiKey) => new Date(row.createdAt).toLocaleString('zh-CN') },
  {
    title: '操作', key: 'actions', width: 120,
    render: (row: ApiKey) => (
      <NButton size="small" type="error" onClick={() => handleDelete(row.id)}>删除</NButton>
    )
  }
];

onMounted(loadKeys);

async function loadKeys() {
  const { data, error } = await fetchApiKeys();
  if (!error) keys.value = data.keys;
}

function openGenerate() {
  form.name = 'MCP 调用';
  form.expiresInDays = 30;
  showGenerate.value = true;
}

async function handleGenerate() {
  loading.value = true;
  const { data, error } = await generateApiKey(form.name, form.expiresInDays || undefined);
  if (!error && data) {
    generatedKey.value = data.key;
    showGenerate.value = false;
    showKeyModal.value = true;
    await loadKeys();
  }
  loading.value = false;
}

function handleDelete(id: string) {
  dialog.warning({
    title: '删除确认',
    content: '删除后使用该 Key 的调用将立即失效，确定吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await deleteApiKey(id);
      if (!error) { message.success('已删除'); await loadKeys(); }
    }
  });
}

function copyKey() {
  navigator.clipboard?.writeText(generatedKey.value);
  message.success('已复制');
}
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">API Key</h2>
      <NButton type="primary" @click="openGenerate">生成 Key</NButton>
    </div>

    <NAlert type="info" :bordered="false">
      API Key 用于供 AI 模型（如 Claude、Cursor）通过 MCP 协议调用邮件服务。请妥善保管，不要泄露。
    </NAlert>

    <NCard :bordered="false" class="card-wrapper">
      <NDataTable :columns="columns" :data="keys" :loading="loading" :bordered="false" :single-line="false" />
    </NCard>

    <!-- 生成 Modal -->
    <NModal v-model:show="showGenerate" preset="card" title="生成 API Key" style="width: 460px">
      <NForm label-placement="top">
        <NFormItem label="名称">
          <NInput v-model:value="form.name" placeholder="用途说明" />
        </NFormItem>
        <NFormItem label="有效期">
          <NSelect v-model:value="form.expiresInDays" :options="expiresOptions" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showGenerate = false">取消</NButton>
          <NButton type="primary" :loading="loading" @click="handleGenerate">生成</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 显示生成的 Key -->
    <NModal v-model:show="showKeyModal" preset="card" title="生成的 API Key" style="width: 520px">
      <div class="mb-8px text-14px text-#999">请复制并妥善保存，关闭后无法再次查看：</div>
      <NInput v-model:value="generatedKey" readonly />
      <template #footer>
        <NSpace justify="end">
          <NButton type="primary" @click="copyKey">复制</NButton>
          <NButton @click="showKeyModal = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>
  </NSpace>
</template>