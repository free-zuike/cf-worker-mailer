<script setup lang="tsx">
import { onMounted, reactive, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { fetchInboxAccounts, createInboxAccount, updateInboxAccount, deleteInboxAccount, syncInboxAccount, type InboxAccount } from '@/service/api/inbox';

const dialog = useDialog();
const message = useMessage();

const accounts = ref<InboxAccount[]>([]);
const loading = ref(false);
const showModal = ref(false);
const editingId = ref<string | null>(null);
const syncing = ref<string | null>(null);

const form = reactive({
  name: '',
  host: '',
  port: 993,
  username: '',
  password: '',
  useTls: true,
  syncInterval: 15
});

const columns = [
  { title: '名称', key: 'name', width: 160 },
  { title: '服务器', key: 'host', width: 160 },
  { title: '用户名', key: 'username', width: 200 },
  { title: '最近同步', key: 'lastSyncAt', width: 180, render: (row: InboxAccount) => row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString('zh-CN') : '从未' },
  { title: '状态', key: 'enabled', width: 80, render: (row: InboxAccount) => row.enabled ? '启用' : '禁用' },
  {
    title: '操作', key: 'actions', width: 240,
    render: (row: InboxAccount) => (
      <NSpace>
        <NButton size="small" loading={syncing.value === row.id} onClick={() => handleSync(row.id)}>
          {syncing.value === row.id ? '同步中' : '同步'}
        </NButton>
        <NButton size="small" type="primary" onClick={() => openEdit(row)}>编辑</NButton>
        <NButton size="small" type="error" onClick={() => handleDelete(row.id)}>删除</NButton>
      </NSpace>
    )
  }
];

onMounted(async () => {
  await loadAccounts();
});

async function loadAccounts() {
  const { data } = await fetchInboxAccounts();
  if (data) accounts.value = data.accounts;
}

function openAdd() {
  editingId.value = null;
  form.name = '';
  form.host = '';
  form.port = 993;
  form.username = '';
  form.password = '';
  form.useTls = true;
  form.syncInterval = 15;
  showModal.value = true;
}

function openEdit(row: InboxAccount) {
  editingId.value = row.id;
  form.name = row.name;
  form.host = row.host;
  form.port = row.port;
  form.username = row.username;
  form.password = '';
  form.useTls = row.useTls;
  form.syncInterval = row.syncInterval;
  showModal.value = true;
}

async function handleSave() {
  if (!form.name || !form.host || !form.port || !form.username) {
    message.warning('请填写完整信息');
    return;
  }
  if (!editingId.value && !form.password) {
    message.warning('请输入密码');
    return;
  }
  loading.value = true;
  const { error } = editingId.value
    ? await updateInboxAccount(editingId.value, form)
    : await createInboxAccount(form);
  if (!error) {
    message.success(editingId.value ? '已更新' : '已创建');
    showModal.value = false;
    await loadAccounts();
  }
  loading.value = false;
}

async function handleDelete(id: string) {
  dialog.warning({ title: '确认删除', content: '删除后同步的邮件也会一起删除，确定吗？', positiveText: '删除', negativeText: '取消',
    async onPositiveClick() {
      const { error } = await deleteInboxAccount(id);
      if (!error) { message.success('已删除'); await loadAccounts(); }
    }
  });
}

async function handleSync(id: string) {
  syncing.value = id;
  const { error } = await syncInboxAccount(id);
  if (!error) {
    message.success('同步完成');
  }
  syncing.value = null;
  await loadAccounts();
}
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">收件账户</h2>
      <NButton type="primary" @click="openAdd">添加账户</NButton>
    </div>

    <NAlert type="info" :bordered="false">
      添加 QQ邮箱、Gmail 等第三方邮箱的 IMAP 账户，即可在此统一收件。
      QQ邮箱需在设置中开启 IMAP 服务并获取授权码。
    </NAlert>

    <NCard :bordered="false" class="card-wrapper">
      <NDataTable :columns="columns" :data="accounts" :loading="false" :bordered="false" :single-line="false" />
    </NCard>

    <NModal v-model:show="showModal" title="收件账户" preset="card" style="width: 520px;">
      <NForm label-placement="top">
        <NFormItem label="名称">
          <NInput v-model:value="form.name" placeholder="如 QQ邮箱" />
        </NFormItem>
        <NFormItem label="服务器">
          <NInput v-model:value="form.host" placeholder="如 imap.qq.com" />
        </NFormItem>
        <NFormItem label="端口">
          <NInputNumber v-model:value="form.port" :min="1" :max="65535" style="width: 100%;" />
        </NFormItem>
        <NFormItem label="用户名">
          <NInput v-model:value="form.username" placeholder="邮箱地址" />
        </NFormItem>
        <NFormItem label="密码/授权码">
          <NInput v-model:value="form.password" type="password" :placeholder="editingId ? '留空不修改' : '授权码'" />
        </NFormItem>
        <NFormItem label="同步间隔">
          <NInputNumber v-model:value="form.syncInterval" :min="1" :max="1440" style="width: 100%;">
            <template #suffix>分钟</template>
          </NInputNumber>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" :loading="loading" @click="handleSave">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </NSpace>
</template>