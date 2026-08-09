<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import {
  fetchTemplate,
  createTemplate,
  updateTemplate,
  type TemplateVariable
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
  textContent: '',
  variables: [] as TemplateVariable[]
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
    form.variables = data.template.variables || [];
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

// 变量管理
const newVar = reactive({ key: '', defaultValue: '', description: '' });
function addVariable() {
  if (!newVar.key.trim()) { message.warning('请输入变量名'); return; }
  if (form.variables.some(v => v.key === newVar.key.trim())) { message.warning('变量名已存在'); return; }
  form.variables.push({ key: newVar.key.trim(), defaultValue: newVar.defaultValue, description: newVar.description });
  newVar.key = ''; newVar.defaultValue = ''; newVar.description = '';
}
function removeVariable(index: number) {
  form.variables.splice(index, 1);
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
        <NFormItem label="模板变量">
          <NSpace vertical :size="12" style="width: 100%;">
            <NAlert type="info" :bordered="false" v-if="form.variables.length === 0">
              <span v-pre>在内容中使用 {{变量名}} 占位符，发送时可替换为实际值</span>
            </NAlert>
            <NList v-if="form.variables.length > 0" size="small" :bordered="true">
              <NListItem v-for="(v, i) in form.variables" :key="i">
                <div class="flex-y-center justify-between">
                  <div>
                    <span class="font-medium"><span v-pre>{{</span>{{ v.key }}<span v-pre>}}</span></span>
                    <span class="text-#999"> - {{ v.defaultValue || '无默认值' }}</span>
                  </div>
                  <NButton size="tiny" quaternary circle type="error" @click="removeVariable(i)">✕</NButton>
                </div>
              </NListItem>
            </NList>
            <NFormItem label="">
              <div class="w-full flex-y-center gap-8px">
                <NInput v-model:value="newVar.key" placeholder="变量名，如 name" style="width: 140px;" />
                <NInput v-model:value="newVar.defaultValue" placeholder="默认值" style="flex: 1;" />
                <NButton size="small" type="primary" @click="addVariable">添加</NButton>
              </div>
            </NFormItem>
          </NSpace>
        </NFormItem>
      </NForm>
    </NCard>
  </NSpace>
</template>