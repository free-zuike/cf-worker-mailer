<script setup lang="tsx">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDialog, useMessage } from 'naive-ui';
import {
  fetchTemplates,
  deleteTemplate,
  type EmailTemplate
} from '@/service/api/template';

const router = useRouter();
const dialog = useDialog();
const message = useMessage();

const templates = ref<EmailTemplate[]>([]);
const loading = ref(false);

const columns = computed(() => [
  { title: '名称', key: 'name', width: 200 },
  { title: '主题', key: 'subject', width: 300 },
  { title: '创建时间', key: 'createdAt', width: 180 },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    render: (row: EmailTemplate) => (
      <NSpace justify="center">
        <NButton size="small" type="primary" onClick={() => router.push(`/templates/editor?id=${row.id}`)}>
          编辑
        </NButton>
        <NButton size="small" type="error" onClick={() => handleDelete(row.id)}>
          删除
        </NButton>
      </NSpace>
    )
  }
]);

async function loadTemplates() {
  loading.value = true;
  const { data, error } = await fetchTemplates();
  if (!error) {
    templates.value = data.templates;
  }
  loading.value = false;
}

function handleDelete(id: string) {
  dialog.warning({
    title: '删除确认',
    content: '确定要删除该模板吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await deleteTemplate(id);
      if (!error) {
        message.success('删除成功');
        loadTemplates();
      }
    }
  });
}

onMounted(loadTemplates);
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">邮件模板</h2>
      <NButton type="primary" @click="router.push('/templates/editor')">新建模板</NButton>
    </div>

    <NDataTable
      :columns="columns"
      :data="templates"
      :loading="loading"
      :bordered="false"
      class="card-wrapper"
    />
  </NSpace>
</template>