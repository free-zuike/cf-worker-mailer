<script setup lang="tsx">
import { onMounted, ref, computed } from 'vue';
import { useMessage } from 'naive-ui';
import { useRouter } from 'vue-router';
import { fetchInboxConfigs, fetchInboxEmails, fetchInboxEmail, deleteInboxEmail, syncInbox, fetchInboxFolders, type InboxEmail, type InboxFolder } from '@/service/api/inbox';
import type { SmtpConfig } from '@/service/api/smtp';

const message = useMessage();
const router = useRouter();

const configs = ref<SmtpConfig[]>([]);
const activeId = ref<string | null>(null);
const folders = ref<InboxFolder[]>([]);
const activeFolder = ref('INBOX');
const emails = ref<InboxEmail[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const syncing = ref(false);
const detailEmail = ref<InboxEmail | null>(null);
const showDetail = ref(false);

const activeConfig = computed(() => configs.value.find(c => c.id === activeId.value));

const folderTabs = computed(() => {
  return folders.value.map(f => ({ label: f.label, value: f.name }));
});

onMounted(async () => {
  const { data, error } = await fetchInboxConfigs();
  if (error) return;
  configs.value = data.configs;
  if (configs.value.length > 0) {
    activeId.value = configs.value[0].id;
    await loadFolders();
    await loadEmails();
  }
});

async function loadFolders() {
  if (!activeId.value) return;
  const { data, error } = await fetchInboxFolders(activeId.value);
  if (!error && data) {
    folders.value = data.folders;
  }
}

async function loadEmails() {
  if (!activeId.value) return;
  loading.value = true;
  const { data, error } = await fetchInboxEmails(activeId.value, activeFolder.value, page.value);
  if (!error && data) {
    emails.value = data.emails;
    total.value = data.total;
  }
  loading.value = false;
}

async function switchConfig(id: string) {
  activeId.value = id;
  activeFolder.value = 'INBOX';
  page.value = 1;
  await loadFolders();
  await loadEmails();
}

async function switchFolder(name: string) {
  activeFolder.value = name;
  page.value = 1;
  await loadEmails();
}

async function handleSync() {
  if (!activeId.value) return;
  syncing.value = true;
  const { error } = await syncInbox(activeId.value);
  if (!error) {
    message.success('同步任务已提交，正在后台处理...');
    setTimeout(async () => {
      await loadFolders();
      await loadEmails();
      syncing.value = false;
      message.success('同步完成');
    }, 5000);
  } else {
    message.error('同步提交失败');
    syncing.value = false;
  }
}

async function openDetail(id: string) {
  const { data, error } = await fetchInboxEmail(id);
  if (!error && data) {
    detailEmail.value = data.email;
    showDetail.value = true;
    const email = emails.value.find(e => e.id === id);
    if (email) email.isRead = true;
  }
}

async function handleDelete(id: string) {
  const { error } = await deleteInboxEmail(id);
  if (!error) {
    message.success('已删除');
    emails.value = emails.value.filter(e => e.id !== id);
    total.value--;
  }
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, '').substring(0, 200);
}
</script>

<template>
  <NSpace vertical :size="16">
    <div class="flex-y-center justify-between">
      <h2 class="text-24px font-600">收件箱</h2>
      <NSpace>
        <NButton quaternary @click="router.push('/smtp')">配置 IMAP</NButton>
        <NButton v-if="activeId" type="primary" :loading="syncing" @click="handleSync">
          {{ syncing ? '同步中' : '同步新邮件' }}
        </NButton>
      </NSpace>
    </div>

    <NAlert type="info" :bordered="false">
      在【发件配置】中为邮箱配置 IMAP 收件服务器后，即可在此统一查看邮件。QQ邮箱需开启 IMAP 服务并获取授权码。
    </NAlert>

    <!-- 配置选择 -->
    <NSpace v-if="configs.length > 0">
      <NTag v-for="cfg in configs" :key="cfg.id" :bordered="false"
        :type="activeId === cfg.id ? 'primary' : 'default'" style="cursor: pointer;" @click="switchConfig(cfg.id)">
        {{ cfg.name }}
      </NTag>
    </NSpace>

    <!-- 邮件列表 -->
    <NCard :bordered="false" class="card-wrapper" v-if="activeId">
      <template #header>
        <div class="flex-y-center justify-between">
          <span>{{ activeConfig?.name || '' }}</span>
          <span class="text-14px text-#999">共 {{ total }} 封</span>
        </div>
      </template>

      <!-- 文件夹分类 -->
      <div class="flex-y-center gap-8px mb-12px" v-if="folderTabs.length > 0">
        <NTag v-for="tab in folderTabs" :key="tab.value" :bordered="false"
          :type="activeFolder === tab.value ? 'primary' : 'default'"
          style="cursor: pointer;" @click="switchFolder(tab.value)">
          {{ tab.label }}
        </NTag>
      </div>

      <NSpin :show="loading">
        <div v-if="emails.length === 0 && !loading" class="py-40px text-center text-#999">
          暂无邮件，点击"同步新邮件"拉取
        </div>

        <div v-for="email in emails" :key="email.id" class="email-item" :class="{ 'email-unread': !email.isRead }" @click="openDetail(email.id)">
          <div class="flex-y-center justify-between">
            <div class="flex-y-center gap-8px">
              <span v-if="!email.isRead" class="w-8px h-8px rounded-full bg-#2080f0 inline-block" />
              <span class="font-medium" :class="{ 'font-600': !email.isRead }">{{ email.from?.split(',')[0] || '未知' }}</span>
            </div>
            <span class="text-12px text-#999">{{ formatDate(email.internalDate) }}</span>
          </div>
          <div class="text-14px mt-4px" :class="{ 'font-500': !email.isRead }">{{ email.subject || '无主题' }}</div>
          <div class="text-12px text-#999 mt-2px truncate">{{ email.text ? email.text.substring(0, 100) : (email.html ? stripHtml(email.html) : '') }}</div>
        </div>
      </NSpin>
    </NCard>

    <NEmpty v-if="configs.length === 0" description="暂无配置 IMAP 的发件配置，请先到发件配置中设置" />

    <!-- 邮件详情弹窗 -->
    <NModal v-model:show="showDetail" preset="card" style="width: 700px; max-height: 80vh; overflow-y: auto;" :title="detailEmail?.subject || '邮件详情'">
      <template v-if="detailEmail">
        <div class="mb-16px">
          <div class="text-14px text-#999">发件人：{{ detailEmail.from }}</div>
          <div class="text-14px text-#999">收件人：{{ detailEmail.to }}</div>
          <div class="text-14px text-#999" v-if="detailEmail.cc">抄送：{{ detailEmail.cc }}</div>
          <div class="text-14px text-#999">时间：{{ formatDate(detailEmail.internalDate) }}</div>
        </div>
        <div v-if="detailEmail.html" class="email-content" v-html="detailEmail.html" />
        <div v-else-if="detailEmail.text" class="email-content" style="white-space: pre-wrap;">{{ detailEmail.text }}</div>
        <div v-else class="text-#999">(无内容)</div>
      </template>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showDetail = false">关闭</NButton>
          <NButton type="error" @click="handleDelete(detailEmail!.id); showDetail = false;">删除</NButton>
        </NSpace>
      </template>
    </NModal>
  </NSpace>
</template>

<style>
.email-item {
  padding: 12px 16px;
  border-bottom: 1px solid #efefef;
  cursor: pointer;
  transition: background 0.2s;
}
.email-item:hover { background: #f5f7fa; }
.email-item.email-unread { background: #f0f7ff; }
html.dark .email-item { border-color: #333; }
html.dark .email-item:hover { background: #2a2a2a; }
html.dark .email-item.email-unread { background: #1a2a3a; }
.email-content { padding: 16px; border: 1px solid #efefef; border-radius: 4px; min-height: 100px; }
html.dark .email-content { border-color: #333; }
</style>