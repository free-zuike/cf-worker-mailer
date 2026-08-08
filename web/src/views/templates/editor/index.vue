<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import {
  fetchTemplate,
  createTemplate,
  updateTemplate
} from '@/service/api/template';

const route = useRoute();
const router = useRouter();
const message = useMessage();

const templateId = computed(() => (route.query.id as string) || null);
const loading = ref(false);

const form = reactive({
  name: '',
  subject: '',
  htmlContent: ''
});

async function loadTemplate() {
  if (!templateId.value) return;
  loading.value = true;
  const { data, error } = await fetchTemplate(templateId.value);
  if (!error) {
    form.name = data.template.name;
    form.subject = data.template.subject;
    form.htmlContent = data.template.htmlContent || '';
  }
  loading.value = false;
}

async function handleSave() {
  const { error } = templateId.value
    ? await updateTemplate(templateId.value, form as any)
    : await createTemplate(form as any);

  if (!error) {
    message.success('保存成功');
    router.push('/templates');
  }
}

onMounted(loadTemplate);
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">{{ templateId ? '编辑模板' : '新建模板' }}</h2>
      <NSpace>
        <NButton @click="router.push('/templates')">返回</NButton>
        <NButton type="primary" :loading="loading" @click="handleSave">保存</NButton>
      </NSpace>
    </div>

    <NCard :bordered="false" class="card-wrapper">
      <NForm label-placement="left" label-width="90">
        <NFormItem label="模板名称">
          <NInput v-model:value="form.name" placeholder="模板名称" />
        </NFormItem>
        <NFormItem label="邮件主题">
          <NInput v-model:value="form.subject" placeholder="邮件主题" />
        </NFormItem>
        <NFormItem label="HTML 内容">
          <NInput
            v-model:value="form.htmlContent"
            type="textarea"
            :autosize="{ minRows: 12, maxRows: 24 }"
            placeholder="支持 {{变量}} 语法"
          />
        </NFormItem>
      </NForm>
    </NCard>
  </NSpace>
</template>