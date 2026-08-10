<script setup lang="tsx">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useMessage } from 'naive-ui';
import { useRouter } from 'vue-router';
import { fetchInboxConfigs, fetchInboxEmails, fetchInboxEmailFull, deleteInboxEmail, syncInbox, fetchInboxFolders, markInboxEmailRead, markInboxEmailUnread, toggleInboxStar, searchInboxEmails, moveInboxEmail, type InboxEmail, type InboxFolder } from '@/service/api/inbox';
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
const searchQuery = ref('');
const isSearching = ref(false);

const activeConfig = computed(() => configs.value.find(c => c.id === activeId.value));

const folderTabs = computed(() => {
  return folders.value.map(f => ({ label: f.label, value: f.name }));
});

const attachments = computed(() => {
  if (!detailEmail.value?.attachments) return [];
  try { return JSON.parse(detailEmail.value.attachments); } catch { return []; }
});

onMounted(async () => {
  const { data, error } = await fetchInboxConfigs();
  if (error) return;
  configs.value = data.configs;
  if (configs.value.length > 0) {
    activeId.value = configs.value[0].id;
    await loadFolders();
    await loadEmails();
    autoSync();
  }
});

let syncTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  syncTimer = setInterval(() => autoSync(), 120_000);
});
onUnmounted(() => {
  if (syncTimer) clearInterval(syncTimer);
});

async function loadFolders() {
  if (!activeId.value) return;
  const { data, error } = await fetchInboxFolders(activeId.value);
  if (!error && data) folders.value = data.folders;
}

async function loadEmails() {
  if (!activeId.value) return;
  loading.value = true;
  const { data, error } = isSearching.value
    ? await searchInboxEmails(activeId.value, searchQuery.value, page.value)
    : await fetchInboxEmails(activeId.value, activeFolder.value, page.value);
  if (!error && data) {
    emails.value = data.emails;
    total.value = data.total;
  }
  loading.value = false;
}

function onPageChange(p: string | number) {
  page.value = Number(p);
  loadEmails();
}

async function switchConfig(id: string) {
  activeId.value = id;
  activeFolder.value = 'INBOX';
  page.value = 1;
  isSearching.value = false;
  searchQuery.value = '';
  await loadFolders();
  await loadEmails();
}

async function switchFolder(name: string) {
  activeFolder.value = name;
  page.value = 1;
  isSearching.value = false;
  searchQuery.value = '';
  await loadEmails();
}

async function autoSync() {
  if (!activeId.value || syncing.value) return;
  syncing.value = true;
  const { error } = await syncInbox(activeId.value);
  if (!error) {
    setTimeout(async () => {
      await loadFolders();
      await loadEmails();
      syncing.value = false;
    }, 5000);
  } else {
    syncing.value = false;
  }
}

async function handleSync() {
  message.success('同步任务已提交，正在后台处理...');
  await autoSync();
}

async function handleSearch() {
  if (!searchQuery.value.trim()) {
    isSearching.value = false;
    await loadEmails();
    return;
  }
  isSearching.value = true;
  page.value = 1;
  await loadEmails();
}

async function openDetail(id: string) {
  const { data, error } = await fetchInboxEmailFull(id);
  if (!error && data) {
    detailEmail.value = data.email;
    showDetail.value = true;
    const email = emails.value.find(e => e.id === id);
    if (email) email.isRead = true;
  }
}

async function toggleRead(email: InboxEmail) {
  if (email.isRead) {
    await markInboxEmailUnread(email.id);
    email.isRead = false;
  } else {
    await markInboxEmailRead(email.id);
    email.isRead = true;
  }
  message.success('已更新');
}

async function toggleStar(email: InboxEmail, e: Event) {
  e.stopPropagation();
  const { data, error } = await toggleInboxStar(email.id);
  if (!error && data) {
    email.starred = data.starred;
    message.success(data.starred ? '已加星标' : '已取消星标');
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

// 回复（带原文引用，标准邮件格式）
function reply() {
  if (!detailEmail.value) return;
  const e = detailEmail.value;
  const to = e.from;
  const subject = e.subject.startsWith('Re:') ? e.subject : `Re: ${e.subject}`;
  const original = e.text || stripHtmlBasic(e.html || '') || '';
  const date = formatFullDate(e.internalDate);
  const quote = `\n\n\n${date} ${e.from} 写道:\n> ${original.split('\n').join('\n> ')}`;
  router.push({
    path: '/compose',
    query: { to, subject, replyBody: quote }
  });
  showDetail.value = false;
}

// 转发（带完整邮件头）
function forward() {
  if (!detailEmail.value) return;
  const e = detailEmail.value;
  const subject = e.subject.startsWith('Fwd:') ? e.subject : `Fwd: ${e.subject}`;
  const original = e.text || stripHtmlBasic(e.html || '') || '';
  const header = `\n\n\n-------- 转发的邮件 --------\n主题: ${e.subject}\n日期: ${formatFullDate(e.internalDate)}\n发件人: ${e.from}\n收件人: ${e.to}\n抄送: ${e.cc || '无'}\n\n${original}`;
  router.push({
    path: '/compose',
    query: { subject, forwardBody: header }
  });
  showDetail.value = false;
}

// 移动邮件
async function moveToFolder(targetFolder: string) {
  if (!detailEmail.value) return;
  const { error } = await moveInboxEmail(detailEmail.value.id, targetFolder);
  if (!error) {
    message.success(`已移动到 ${targetFolder}`);
    emails.value = emails.value.filter(e => e.id !== detailEmail.value!.id);
    total.value--;
    showDetail.value = false;
  } else {
    message.error('移动失败');
  }
}

function stripHtmlBasic(html: string) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function formatFullDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, '').substring(0, 200);
}

function downloadAttachment(index: string | number) {
  if (!detailEmail.value) return;
  const att = attachments.value[Number(index)];
  if (!att) return;
  const url = `/api/inbox/attachment/${detailEmail.value.id}/${index}`;
  window.open(url, '_blank');
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
      在【发件配置】中为邮箱配置 IMAP 收件服务器后，即可在此统一处理邮件。
    </NAlert>

    <NSpace v-if="configs.length > 0">
      <NTag v-for="cfg in configs" :key="cfg.id" :bordered="false"
        :type="activeId === cfg.id ? 'primary' : 'default'" style="cursor: pointer;" @click="switchConfig(cfg.id)">
        {{ cfg.name }}
      </NTag>
    </NSpace>

    <NCard :bordered="false" class="card-wrapper" v-if="activeId">
      <template #header>
        <div class="flex-y-center justify-between">
          <span>{{ activeConfig?.name || '' }} - 共 {{ total }} 封</span>
          <NInput v-model:value="searchQuery" placeholder="搜索主题/发件人/收件人" clearable style="width: 260px;"
            @keyup.enter="handleSearch" @clear="handleSearch">
            <template #prefix><span class="text-#999">🔍</span></template>
          </NInput>
        </div>
      </template>

      <div class="flex-y-center gap-8px mb-12px" v-if="folderTabs.length > 0">
        <NTag v-for="tab in folderTabs" :key="tab.value" :bordered="false"
          :type="activeFolder === tab.value ? 'primary' : 'default'" style="cursor: pointer;" @click="switchFolder(tab.value)">
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
              <span class="star-btn" :class="{ starred: email.starred }" @click="e => toggleStar(email, e)">{{ email.starred ? '★' : '☆' }}</span>
              <span v-if="!email.isRead" class="w-8px h-8px rounded-full bg-#2080f0 inline-block" />
              <span class="font-medium" :class="{ 'font-600': !email.isRead }">{{ email.from?.split(',')[0] || '未知' }}</span>
            </div>
            <span class="text-12px text-#999">{{ formatDate(email.internalDate) }}</span>
          </div>
          <div class="text-14px mt-4px" :class="{ 'font-500': !email.isRead }">{{ email.subject || '无主题' }}</div>
          <div class="text-12px text-#999 mt-2px truncate">{{ email.text ? email.text.substring(0, 100) : (email.html ? stripHtml(email.html) : '') }}</div>
        </div>

        <div class="flex-y-center justify-center mt-16px" v-if="total > 0">
          <NPagination :page="page" :page-size="20" :item-count="total" @update:page="onPageChange" />
        </div>
      </NSpin>
    </NCard>

    <NEmpty v-if="configs.length === 0" description="暂无配置 IMAP 的发件配置，请先到发件配置中设置" />

    <!-- 邮件详情弹窗 -->
    <NModal v-model:show="showDetail" preset="card" class="w-4/5 max-w-800px" :title="detailEmail?.subject || '邮件详情'">
      <template v-if="detailEmail">
        <div class="mb-16px">
          <div class="text-14px text-#999">发件人：{{ detailEmail.from }}</div>
          <div class="text-14px text-#999">收件人：{{ detailEmail.to }}</div>
          <div class="text-14px text-#999" v-if="detailEmail.cc">抄送：{{ detailEmail.cc }}</div>
          <div class="text-14px text-#999">时间：{{ formatDate(detailEmail.internalDate) }}</div>
        </div>
        <div v-if="detailEmail.html" class="email-content" v-html="detailEmail.html" />
        <div v-else-if="detailEmail.text" class="email-content" style="white-space: pre-wrap;">{{ detailEmail.text }}</div>
        <div v-else class="text-#999">(正文加载中...)</div>

        <!-- 附件 -->
        <div v-if="attachments.length > 0" class="mt-16px">
          <div class="text-14px font-medium mb-8px">附件 ({{ attachments.length }})</div>
          <div v-for="(att, i) in attachments" :key="i" class="attachment-item">
            <span>{{ att.filename }}</span>
            <NButton size="small" type="primary" quaternary @click="downloadAttachment(i)">下载</NButton>
          </div>
        </div>
      </template>
      <template #footer>
        <NSpace justify="space-between">
          <NSpace>
            <NButton @click="toggleStar(detailEmail!, $event)">{{ detailEmail?.starred ? '取消星标' : '加星标' }}</NButton>
            <NButton @click="toggleRead(detailEmail!)">{{ detailEmail?.isRead ? '标为未读' : '标为已读' }}</NButton>
            <NButton @click="reply">回复</NButton>
            <NButton @click="forward">转发</NButton>
            <NPopselect :options="folderTabs.filter(f => f.value !== detailEmail?.folder).map(f => ({ label: f.label, value: f.value }))"
              @update:value="v => moveToFolder(String(v))">
              <NButton>移动到</NButton>
            </NPopselect>
            <NButton type="error" @click="handleDelete(detailEmail!.id); showDetail = false;">删除</NButton>
          </NSpace>
          <NButton @click="showDetail = false">关闭</NButton>
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
.attachment-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border: 1px solid #efefef; border-radius: 4px; margin-bottom: 8px;
}
.star-btn {
  cursor: pointer; font-size: 18px; line-height: 1; color: #d9d9d9; user-select: none;
  transition: color 0.2s, transform 0.2s;
}
.star-btn:hover { transform: scale(1.2); }
.star-btn.starred { color: #f5a623; }
</style>