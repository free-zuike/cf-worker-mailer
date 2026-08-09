<script setup lang="ts">
import { onMounted, reactive, ref, shallowRef, watch, computed } from 'vue';
import { useMessage } from 'naive-ui';
import { useThemeStore } from '@/store/modules/theme';
import { sendEmail, type SendEmailParams } from '@/service/api/email';
import { fetchSmtpConfigs, type SmtpConfig } from '@/service/api/smtp';
import { fetchTemplates, fetchTemplate, type EmailTemplate } from '@/service/api/template';
import { fetchContacts, type Contact } from '@/service/api/contacts';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import { i18nChangeLanguage, type IEditorConfig } from '@wangeditor/editor';
import '@wangeditor/editor/dist/css/style.css';
import { localStg } from '@/utils/storage';

const message = useMessage();
const themeStore = useThemeStore();
const loading = ref(false);
const smtpConfigs = ref<SmtpConfig[]>([]);
const templates = ref<EmailTemplate[]>([]);
const contacts = ref<Contact[]>([]);
const showContactPicker = ref(false);

// 从 localStorage 恢复上次收件人
const toInput = ref(localStg.get('lastTo') || '');
const ccInput = ref('');
const bccInput = ref('');

const form = reactive({
  configId: null as string | null,
  templateId: null as string | null,
  subject: '',
  html: '',
  text: '',
  skipVariableReplace: false
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

// 判断 HTML 是否为空（去除空标签和空白）
function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  const stripped = html
    .replace(/<[^>]*>/g, '')  // 去掉所有标签
    .replace(/&nbsp;/g, '')   // 去掉不换行空格
    .replace(/&nbsp;/gi, '')
    .trim();
  return stripped === '';
}

onMounted(async () => {
  const [smtpRes, tmplRes, contactRes] = await Promise.all([
    fetchSmtpConfigs(),
    fetchTemplates(),
    fetchContacts()
  ]);
  if (!smtpRes.error) {
    smtpConfigs.value = smtpRes.data.configs;
    // 自动填入 SMTP 配置：只有一个则直接用，否则用上次使用的
    const lastConfigId = localStg.get('lastConfigId');
    if (smtpConfigs.value.length === 1) {
      form.configId = smtpConfigs.value[0].id;
    } else if (lastConfigId && smtpConfigs.value.some(c => c.id === lastConfigId)) {
      form.configId = lastConfigId;
    }
  }
  if (!tmplRes.error) {
    templates.value = tmplRes.data.templates;
  }
  if (!contactRes.error) {
    contacts.value = contactRes.data.contacts;
  }
});

// 页面不再缓存（keepAlive = false），每次进入都重新创建

// 标记当前是否是模板自动填充内容（避免误判为用户手动修改）
let templateFilling = false;

// 选中模板时填充主题和内容
watch(() => form.templateId, async (templateId) => {
  if (!templateId) return;
  templateFilling = true;
  const { data, error } = await fetchTemplate(templateId);
  if (!error && data) {
    form.subject = data.template.subject;
    form.html = data.template.htmlContent || '';
    form.text = data.template.textContent || '';
  }
  templateFilling = false;
});

// 用户清空 HTML 编辑器内容时，自动取消模板选择（避免发送时仍用模板内容）
watch(() => form.html, () => {
  if (templateFilling) return;
  const empty = !form.html || form.html === '<p><br></p>';
  if (empty && form.templateId) {
    form.templateId = null;
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
  if (!form.configId) {
    message.error('请选择发件配置');
    return;
  }

  const payload: SendEmailParams = {
    to,
    subject: form.subject,
    html: isHtmlEmpty(form.html) ? undefined : (form.html || undefined),
    text: form.text || undefined,
    configId: form.configId || undefined,
    templateId: form.templateId || undefined,
    skipVariableReplace: form.skipVariableReplace || undefined
  };

  const cc = splitEmails(ccInput.value);
  const bcc = splitEmails(bccInput.value);
  if (cc.length) payload.cc = cc;
  if (bcc.length) payload.bcc = bcc;

  loading.value = true;
  const { error } = await sendEmail(payload);
  if (!error) {
    // 保存本次收件人和发件配置，下次打开自动填入
    localStg.set('lastTo', toInput.value);
    localStg.set('lastConfigId', form.configId || '');
    message.success('邮件已发送');
    toInput.value = '';
    ccInput.value = '';
    bccInput.value = '';
    form.subject = '';
    form.html = '';
    form.text = '';
    form.configId = null;
    form.templateId = null;
  }
  loading.value = false;
}

// 从联系人选择收件人
const selectedContacts = ref<Contact[]>([]);
function openContactPicker() {
  selectedContacts.value = [];
  showContactPicker.value = true;
}
function confirmContacts() {
  const emails = selectedContacts.value.map(c => c.email);
  const existing = splitEmails(toInput.value);
  const merged = [...new Set([...existing, ...emails])];
  toInput.value = merged.join(', ');
  showContactPicker.value = false;
  message.success(`已添加 ${emails.length} 个收件人`);
}

function toggleContact(c: Contact, checked: boolean) {
  if (checked) {
    if (!selectedContacts.value.some(s => s.id === c.id)) selectedContacts.value.push(c);
  } else {
    selectedContacts.value = selectedContacts.value.filter(s => s.id !== c.id);
  }
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
          <div class="flex-y-center gap-8px" style="width: 100%;">
            <NInput v-model:value="toInput" placeholder="多个地址用逗号分隔" style="flex: 1;" />
            <NButton size="small" quaternary @click="openContactPicker" :disabled="contacts.length === 0">
              联系人
            </NButton>
          </div>
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
        <NFormItem label="">
          <NCheckbox v-model:checked="form.skipVariableReplace">
            <span v-pre>不替换变量（保留 {{name}} 原样）</span>
          </NCheckbox>
        </NFormItem>
      </NForm>
    </NCard>
  </NSpace>

  <!-- 联系人选择弹窗 -->
  <NModal v-model:show="showContactPicker" title="选择联系人" preset="card" style="width: 500px;">
    <NList v-if="contacts.length > 0" style="max-height: 400px; overflow-y: auto;">
      <NListItem v-for="c in contacts" :key="c.id">
        <div class="flex-y-center justify-between">
          <div>
            <div class="font-medium">{{ c.name }}</div>
            <div class="text-14px text-#999">{{ c.email }}</div>
          </div>
          <NCheckbox :checked="selectedContacts.some(s => s.id === c.id)" @update:checked="checked => toggleContact(c, checked)" />
        </div>
      </NListItem>
    </NList>
    <NEmpty v-else description="暂无联系人" />
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showContactPicker = false">取消</NButton>
        <NButton type="primary" @click="confirmContacts">确定 ({{ selectedContacts.length }})</NButton>
      </NSpace>
    </template>
  </NModal>
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