<script setup lang="tsx">
import { onMounted, reactive, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import {
  fetchGlobalVariables,
  createGlobalVariable,
  updateGlobalVariable,
  deleteGlobalVariable,
  type GlobalVariable
} from '@/service/api/variables';

const dialog = useDialog();
const message = useMessage();

const variables = ref<GlobalVariable[]>([]);
const loading = ref(false);
const showModal = ref(false);
const editingId = ref<string | null>(null);
const isEdit = ref(false);

const form = reactive({
  key: '',
  defaultValue: '',
  description: ''
});

const columns = [
  { title: '变量名', key: 'key', width: 200 },
  { title: '默认值', key: 'defaultValue', width: 200 },
  { title: '说明', key: 'description', width: 300 },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    render: (row: GlobalVariable) => (
      <NSpace>
        <NButton size="small" type="primary" onClick={() => openEdit(row)}>编辑</NButton>
        <NButton size="small" type="error" onClick={() => handleDelete(row.id)}>删除</NButton>
      </NSpace>
    )
  }
];

async function loadVariables() {
  loading.value = true;
  const { data, error } = await fetchGlobalVariables();
  if (!error) {
    variables.value = data.variables;
  }
  loading.value = false;
}

function openCreate() {
  editingId.value = null;
  isEdit.value = false;
  form.key = '';
  form.defaultValue = '';
  form.description = '';
  showModal.value = true;
}

function openEdit(v: GlobalVariable) {
  editingId.value = v.id;
  isEdit.value = true;
  form.key = v.key;
  form.defaultValue = v.defaultValue;
  form.description = v.description || '';
  showModal.value = true;
}

async function handleSave() {
  if (!form.key.trim()) { message.warning('请输入变量名'); return; }
  const { error } = editingId.value
    ? await updateGlobalVariable(editingId.value, { ...form })
    : await createGlobalVariable({ ...form });
  if (!error) {
    message.success('保存成功');
    showModal.value = false;
    loadVariables();
  }
}

function handleDelete(id: string) {
  dialog.warning({
    title: '删除确认',
    content: '删除后所有模板中该变量的引用将失效，确定删除？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await deleteGlobalVariable(id);
      if (!error) { message.success('删除成功'); loadVariables(); }
    }
  });
}

onMounted(loadVariables);
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">全局变量</h2>
      <NButton type="primary" @click="openCreate">新增变量</NButton>
    </div>

    <NAlert type="info" :bordered="false">
      <span v-pre>在模板中使用 {{变量名}} 引用全局变量，发送邮件时会自动替换为对应值。</span>
    </NAlert>

    <NDataTable
      :columns="columns"
      :data="variables"
      :loading="loading"
      :bordered="false"
      class="card-wrapper"
    />

    <NModal v-model:show="showModal" preset="card" :title="isEdit ? '编辑变量' : '新增变量'" style="width: 480px">
      <NForm label-placement="left" label-width="80">
        <NFormItem label="变量名">
          <NInput v-model:value="form.key" placeholder="如 name" />
        </NFormItem>
        <NFormItem label="默认值">
          <NInput v-model:value="form.defaultValue" placeholder="替换后的默认值" />
        </NFormItem>
        <NFormItem label="说明">
          <NInput v-model:value="form.description" placeholder="变量用途说明（可选）" />
        </NFormItem>
        <NSpace>
          <NButton type="primary" @click="handleSave">保存</NButton>
          <NButton @click="showModal = false">取消</NButton>
        </NSpace>
      </NForm>
    </NModal>
  </NSpace>
</template>