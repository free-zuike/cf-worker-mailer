<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useMessage } from 'naive-ui';
import { sendEmail, type SendEmailParams } from '@/service/api/email';
import { fetchSmtpConfigs, type SmtpConfig } from '@/service/api/smtp';
import { fetchTemplates, fetchTemplate, type EmailTemplate } from '@/service/api/template';
import { fetchContacts, type Contact } from '@/service/api/contacts';
import { localStg } from '@/utils/storage';

const message = useMessage();
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

function splitEmails(v: string): string[] {
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

onMounted(async () => {
  const [smtpRes, tmplRes, contactRes] = await Promise.all([
    fetchSmtpConfigs(),
    fetchTemplates(),
    fetchContacts()
  ]);
  if (!smtpRes.error) {
    smtpConfigs.value = smtpRes.data.configs;
    // 自动填入 SMTP 配置
    const lastConfigId = localStg.get('lastConfigId');
    if (smtpConfigs.value.length === 1) {
      form.configId = smtpConfigs.value[0].id;
    } else if (lastConfigId && smtpConfigs.value.some(c => c.id === lastConfigId)) {
      form.configId = lastConfigId;
    }
  }
  if (!tmplRes.error) templates.value = tmplRes.data.templates;
  if (!contactRes.error) contacts.value = contactRes.data.contacts;
});

// 选中模板时填充内容
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
  if (!to.length) { message.error('请输入收件人'); return; }
  if (!form.subject) { message.error('请输入邮件主题'); return; }
  if (!form.configId) { message.error('请选择发件配置'); return; }

  const payload: SendEmailParams = {
    to,
    subject: form.subject,
    html: form.html || undefined,
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
    localStg.set('lastTo', toInput.value);
    localStg.set('lastConfigId', form.configId || '');
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

// 联系人选择
const selectedContacts = ref<Contact[]>([]);
function openContactPicker() {
  selectedContacts.value = [];
  showContactPicker.value = true;
}
function confirmContacts() {
  const emails = selectedContacts.value.map(c => c.email);
  const existing = splitEmails(toInput.value);
  toInput.value = [...new Set([...existing, ...emails])].join(', ');
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
            placeholder="选择发件配置"
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
          <NInput
            v-model:value="form.html"
            type="textarea"
            :autosize="{ minRows: 12, maxRows: 24 }"
            placeholder="支持 HTML 格式"
          />
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
  </NSpace>
</template>