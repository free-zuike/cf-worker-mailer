<script setup lang="tsx">
import { computed, onMounted, reactive, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import {
  fetchSmtpConfigs,
  createSmtpConfig,
  updateSmtpConfig,
  deleteSmtpConfig,
  type SmtpConfig,
  type CreateSmtpConfigParams
} from '@/service/api/smtp';

const dialog = useDialog();
const message = useMessage();

const configs = ref<SmtpConfig[]>([]);
const loading = ref(false);
const showModal = ref(false);
const editingId = ref<string | null>(null);

const form = reactive<CreateSmtpConfigParams>({
  name: '',
  host: '',
  port: 587,
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
  secure: false
});

const isEdit = computed(() => Boolean(editingId.value));

const columns = computed(() => [
  { title: '名称', key: 'name', width: 160 },
  { title: '主机', key: 'host', width: 180 },
  { title: '端口', key: 'port', width: 80 },
  { title: '发件邮箱', key: 'fromEmail', width: 200 },
  {
    title: '状态',
    key: 'enabled',
    width: 90,
    render: (row: SmtpConfig) => (row.enabled ? '启用' : '停用')
  },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    render: (row: SmtpConfig) => (
      <NSpace justify="center">
        <NButton size="small" type="primary" onClick={() => openEdit(row)}>
          编辑
        </NButton>
        <NButton size="small" type="error" onClick={() => handleDelete(row.id)}>
          删除
        </NButton>
      </NSpace>
    )
  }
]);

async function loadConfigs() {
  loading.value = true;
  const { data, error } = await fetchSmtpConfigs();
  if (!error) {
    configs.value = data.configs;
  }
  loading.value = false;
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    name: '',
    host: '',
    port: 587,
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
    secure: false
  });
  showModal.value = true;
}

function openEdit(config: SmtpConfig) {
  editingId.value = config.id;
  Object.assign(form, {
    name: config.name,
    type: config.type,
    host: config.host,
    port: config.port,
    username: config.username,
    password: '',
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    secure: config.secure
  });
  showModal.value = true;
}

async function handleSave() {
  const { error } = editingId.value
    ? await updateSmtpConfig(editingId.value, form as any)
    : await createSmtpConfig(form as any);

  if (!error) {
    message.success('保存成功');
    showModal.value = false;
    loadConfigs();
  }
}

function handleDelete(id: string) {
  dialog.warning({
    title: '删除确认',
    content: '确定要删除该 SMTP 配置吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await deleteSmtpConfig(id);
      if (!error) {
        message.success('删除成功');
        loadConfigs();
      }
    }
  });
}

onMounted(loadConfigs);
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">SMTP 配置</h2>
      <NButton type="primary" @click="openCreate">新增配置</NButton>
    </div>

    <NDataTable
      :columns="columns"
      :data="configs"
      :loading="loading"
      :bordered="false"
      class="card-wrapper"
    />

    <NModal v-model:show="showModal" preset="card" :title="isEdit ? '编辑配置' : '新增配置'" style="width: 560px">
      <NForm label-placement="left" label-width="90">
        <NFormItem label="名称">
          <NInput v-model:value="form.name" placeholder="配置名称" />
        </NFormItem>
        <NFormItem label="主机">
          <NInput v-model:value="form.host" placeholder="smtp.example.com" />
        </NFormItem>
        <NFormItem label="端口">
          <NInputNumber v-model:value="form.port" :min="1" :max="65535" style="width: 100%" />
        </NFormItem>
        <NFormItem label="用户名">
          <NInput v-model:value="form.username" placeholder="SMTP 用户名" />
        </NFormItem>
        <NFormItem label="密码">
          <NInput v-model:value="form.password" type="password" show-password-on="click" :placeholder="isEdit ? '留空则不修改' : 'SMTP 密码'" />
        </NFormItem>
        <NFormItem label="发件邮箱">
          <NInput v-model:value="form.fromEmail" placeholder="noreply@example.com" />
        </NFormItem>
        <NFormItem label="发件人名">
          <NInput v-model:value="form.fromName" placeholder="发件人名称" />
        </NFormItem>
        <NSpace>
          <NButton type="primary" @click="handleSave">保存</NButton>
          <NButton @click="showModal = false">取消</NButton>
        </NSpace>
      </NForm>
    </NModal>
  </NSpace>
</template>