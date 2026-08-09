<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import {
  fetchTemplate,
  createTemplate,
  updateTemplate
} from '@/service/api/template';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import { i18nChangeLanguage, type IEditorConfig } from '@wangeditor/editor';
import '@wangeditor/editor/dist/css/style.css';

const route = useRoute();
const router = useRouter();
const message = useMessage();

const templateId = computed(() => (route.query.id as string) || null);
const loading = ref(false);

const form = reactive({
  name: '',
  subject: '',
  htmlContent: '',
  textContent: ''
});

// wangEditor
const editorRef = shallowRef();
const handleCreated = (editor: any) => {
  editorRef.value = editor;
  i18nChangeLanguage('zh-CN');
};
const editorConfig: Partial<IEditorConfig> = {
  placeholder: '输入模板 HTML 内容，支持 {{变量}} 语法...',
  MENU_CONF: {}
};

async function loadTemplate() {
  if (!templateId.value) return;
  loading.value = true;
  const { data, error } = await fetchTemplate(templateId.value);
  if (!error) {
    form.name = data.template.name;
    form.subject = data.template.subject;
    form.htmlContent = data.template.htmlContent || '';
    form.textContent = data.template.textContent || '';
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
          <div style="border: 1px solid #d9d9d9; border-radius: 4px; width: 100%;">
            <Toolbar
              :editor="editorRef"
              :defaultConfig="{}"
              style="border-bottom: 1px solid #d9d9d9;"
            />
            <Editor
              @onCreated="handleCreated"
              v-model="form.htmlContent"
              :defaultConfig="editorConfig"
              mode="default"
              style="height: 500px; overflow-y: auto;"
            />
          </div>
        </NFormItem>
        <NFormItem label="纯文本内容">
          <NInput
            v-model:value="form.textContent"
            type="textarea"
            :autosize="{ minRows: 6, maxRows: 16 }"
            placeholder="纯文本版本（可选，用于不支持 HTML 的邮件客户端）"
          />
        </NFormItem>
      </NForm>
    </NCard>
  </NSpace>
</template>