<script setup lang="tsx">
import { onMounted, reactive, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { fetchContacts, createContact, updateContact, deleteContact, type Contact } from '@/service/api/contacts';

const dialog = useDialog();
const message = useMessage();

const contacts = ref<Contact[]>([]);
const loading = ref(false);
const showModal = ref(false);
const editingId = ref<string | null>(null);
const isEdit = ref(false);

const form = reactive({ name: '', email: '', remark: '' });

const columns = [
  { title: '姓名', key: 'name', width: 160 },
  { title: '邮箱', key: 'email', width: 280 },
  { title: '备注', key: 'remark', width: 200 },
  {
    title: '操作', key: 'actions', width: 160,
    render: (row: Contact) => (
      <NSpace>
        <NButton size="small" type="primary" onClick={() => openEdit(row)}>编辑</NButton>
        <NButton size="small" type="error" onClick={() => handleDelete(row.id)}>删除</NButton>
      </NSpace>
    )
  }
];

async function load() {
  loading.value = true;
  const { data, error } = await fetchContacts();
  if (!error) contacts.value = data.contacts;
  loading.value = false;
}

function openCreate() {
  editingId.value = null; isEdit.value = false;
  form.name = ''; form.email = ''; form.remark = '';
  showModal.value = true;
}
function openEdit(c: Contact) {
  editingId.value = c.id; isEdit.value = true;
  form.name = c.name; form.email = c.email; form.remark = c.remark || '';
  showModal.value = true;
}

async function handleSave() {
  if (!form.name.trim() || !form.email.trim()) { message.warning('请填写姓名和邮箱'); return; }
  const { error } = editingId.value
    ? await updateContact(editingId.value, { ...form })
    : await createContact({ ...form });
  if (!error) { message.success('保存成功'); showModal.value = false; load(); }
}

function handleDelete(id: string) {
  dialog.warning({
    title: '删除确认', content: '确定删除该联系人？',
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await deleteContact(id);
      if (!error) { message.success('删除成功'); load(); }
    }
  });
}

onMounted(load);
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">联系人</h2>
      <NButton type="primary" @click="openCreate">新增联系人</NButton>
    </div>
    <NDataTable :columns="columns" :data="contacts" :loading="loading" :bordered="false" class="card-wrapper" />
    <NModal v-model:show="showModal" preset="card" :title="isEdit ? '编辑联系人' : '新增联系人'" style="width: 480px">
      <NForm label-placement="left" label-width="60">
        <NFormItem label="姓名"><NInput v-model:value="form.name" placeholder="联系人姓名" /></NFormItem>
        <NFormItem label="邮箱"><NInput v-model:value="form.email" placeholder="邮箱地址" /></NFormItem>
        <NFormItem label="备注"><NInput v-model:value="form.remark" placeholder="备注（可选）" /></NFormItem>
        <NSpace><NButton type="primary" @click="handleSave">保存</NButton><NButton @click="showModal = false">取消</NButton></NSpace>
      </NForm>
    </NModal>
  </NSpace>
</template>