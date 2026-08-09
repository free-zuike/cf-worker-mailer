<script setup lang="ts">
import { onMounted, reactive, ref, shallowRef, watch, computed } from 'vue';
import { useMessage } from 'naive-ui';
import { useThemeStore } from '@/store/modules/theme';
import { sendEmail, type SendEmailParams } from '@/service/api/email';
import { fetchSmtpConfigs, type SmtpConfig } from '@/service/api/smtp';
import { fetchTemplates, fetchTemplate, type EmailTemplate } from '@/service/api/template';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import { i18nChangeLanguage, type IEditorConfig } from '@wangeditor/editor';
import '@wangeditor/editor/dist/css/style.css';
import { localStg } from '@/utils/storage';

const message = useMessage();
const themeStore = useThemeStore();
const loading = ref(false);
const smtpConfigs = ref<SmtpConfig[]>([]);
const templates = ref<EmailTemplate[]>([]);

const toInput = ref('');
const ccInput = ref('');
const bccInput = ref('');

const form = reactive({
  configId: null as string | null,
  templateId: null as string | null,
  subject: '',
  html: '',
  text: ''
});

// wangEditor 配置
const editorRef = shallowRef();
const handleCreated = (editor: any) => {
  editorRef.value = editor;
  i18nChangeLanguage('zh-CN');
};
const editorConfig: Partial<IEditorConfig> = {
  placeholder: '请输入邮件内容...',
  MENU_CONF: {
    // 图片上传到 R2
    uploadImage: {
      server: '/api/upload/image',
      fieldName: 'file',
      maxFileSize: 10 * 1024 * 1024,
      metaWithUrl: false,
      maxNumberOfFiles: 5,
      allowedFileTypes: ['image/*'],
      headers: {
        Authorization: `Bearer ${localStg.get('token') || ''}`
      }
    },
    // 视频：通过 URL 插入
    uploadVideo: {
      allowedFileTypes: ['video/mp4']
    }
  } as any
};

const toolbarConfig = {};

// 编辑器主题：跟随项目主题
const editorTheme = computed(() => themeStore.darkMode ? 'dark' : 'light');

// 全屏控制：容器 ref 和切换函数
const editorWrapperRef = ref<HTMLDivElement | null>(null);
const isFullScreen = ref(false);
function toggleFullScreen() {
  const el = editorWrapperRef.value;
  if (!el) return;
  if (!isFullScreen.value) {
    el.requestFullscreen?.();
    isFullScreen.value = true;
  } else {
    document.exitFullscreen?.();
    isFullScreen.value = false;
  }
}
// 监听退出全屏事件（ESC 或系统退出）
watch(isFullScreen, (val) => {
  if (!val) return;
  const onExit = () => { isFullScreen.value = false; };
  document.addEventListener('fullscreenchange', onExit, { once: true });
});

function splitEmails(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

onMounted(async () => {
  const [smtpRes, tmplRes] = await Promise.all([
    fetchSmtpConfigs(),
    fetchTemplates()
  ]);
  if (!smtpRes.error) {
    smtpConfigs.value = smtpRes.data.configs;
  }
  if (!tmplRes.error) {
    templates.value = tmplRes.data.templates;
  }
});

// 选中模板时填充主题和内容
watch(() => form.templateId, async (templateId) => {
  if (!templateId) return;
  const { data, error } = await fetchTemplate(templateId);
  if (!error && data) {
    form.subject = data.template.subject;
    form.html = data.template.htmlContent || '';
    form.text = data.template.textContent || '';
  }
});

async function handleSend() {
  const to = splitEmails(toInput.value);
  if (!to.length) {
    message.error('请输入收件人');
    return;
  }
  if (!form.subject) {
    message.error('请输入邮件主题');
    return;
  }

  const payload: SendEmailParams = {
    to,
    subject: form.subject,
    html: form.html || undefined,
    text: form.text || undefined,
    configId: form.configId || undefined,
    templateId: form.templateId || undefined
  };

  const cc = splitEmails(ccInput.value);
  const bcc = splitEmails(bccInput.value);
  if (cc.length) payload.cc = cc;
  if (bcc.length) payload.bcc = bcc;

  loading.value = true;
  const { error } = await sendEmail(payload);
  if (!error) {
    message.success('邮件已发送');
    toInput.value = '';
    ccInput.value = '';
    bccInput.value = '';
    form.subject = '';
    form.html = '';
    form.text = '';
  }
  loading.value = false;
}
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">发送邮件</h2>
      <NButton type="primary" :loading="loading" @click="handleSend">发送</NButton>
    </div>

    <NCard :bordered="false" class="card-wrapper">
      <NForm label-placement="top">
        <NFormItem label="发件配置">
          <NSelect
            v-model:value="form.configId"
            :options="smtpConfigs.map(c => ({ label: `${c.name} (${c.fromEmail})`, value: c.id }))"
            placeholder="选择 SMTP 配置（可选）"
            clearable
          />
        </NFormItem>
        <NFormItem label="邮件模板">
          <NSelect
            v-model:value="form.templateId"
            :options="templates.map(t => ({ label: t.name, value: t.id }))"
            placeholder="选择模板（可选）"
            clearable
          />
        </NFormItem>
        <NFormItem label="收件人">
          <NInput v-model:value="toInput" placeholder="多个地址用逗号分隔" />
        </NFormItem>
        <NFormItem label="抄送">
          <NInput v-model:value="ccInput" placeholder="多个地址用逗号分隔（可选）" />
        </NFormItem>
        <NFormItem label="密送">
          <NInput v-model:value="bccInput" placeholder="多个地址用逗号分隔（可选）" />
        </NFormItem>
        <NFormItem label="主题">
          <NInput v-model:value="form.subject" placeholder="邮件主题" />
        </NFormItem>
        <NFormItem label="HTML 内容">
          <div
            ref="editorWrapperRef"
            class="editor-wrapper"
            :class="{ 'editor-fullscreen': isFullScreen }"
          >
            <div class="editor-toolbar-row">
              <NButton size="small" quaternary circle @click="toggleFullScreen">
                <template #icon>
                  <span class="text-16px">{{ isFullScreen ? '⤡' : '⤢' }}</span>
                </template>
              </NButton>
            </div>
            <Toolbar
              :editor="editorRef"
              :defaultConfig="toolbarConfig"
              style="border-bottom: 1px solid #d9d9d9;"
            />
            <Editor
              @onCreated="handleCreated"
              v-model="form.html"
              :defaultConfig="editorConfig"
              mode="default"
              style="height: 400px; overflow-y: auto;"
            />
          </div>
        </NFormItem>
        <NFormItem label="纯文本内容">
          <NInput
            v-model:value="form.text"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 10 }"
            placeholder="纯文本内容（可选）"
          />
        </NFormItem>
      </NForm>
    </NCard>
  </NSpace>
</template>

<!-- wangEditor 暗色主题适配 & 全屏修复 -->
<style>
/* 编辑器外部容器 */
.editor-wrapper {
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  width: 100%;
  position: relative;
}

/* 编辑器全屏模式 */
.editor-wrapper.editor-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #fff;
  border: none;
  border-radius: 0;
  display: flex;
  flex-direction: column;
}
.editor-wrapper.editor-fullscreen .w-e-text-container {
  flex: 1;
  height: auto !important;
}
html.dark .editor-wrapper.editor-fullscreen {
  background: #1e1e1e;
}

/* 全屏工具栏行（含全屏按钮） */
.editor-toolbar-row {
  display: flex;
  justify-content: flex-end;
  padding: 2px 4px;
  background: #f5f5f5;
  border-bottom: 1px solid #e8e8e8;
}
html.dark .editor-toolbar-row {
  background: #2a2a2a;
  border-color: #333;
}

/* 暗色模式适配 */
html.dark .w-e-bar {
  background-color: #1e1e1e;
  border-color: #333;
}
html.dark .w-e-bar-item button {
  color: #ccc;
}
html.dark .w-e-bar-item button:hover {
  background-color: #333;
  color: #fff;
}
html.dark .w-e-text-container {
  background-color: #1e1e1e;
  color: #ccc;
}
html.dark .w-e-text-container [data-slate-editor] {
  background-color: #1e1e1e;
  color: #ccc;
}
html.dark .w-e-modal {
  background-color: #2a2a2a;
  border-color: #444;
  color: #ccc;
}
html.dark .w-e-modal .btn-primary {
  background-color: #409eff;
}
</style>