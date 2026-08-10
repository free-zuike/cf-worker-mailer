<script setup lang="tsx">
import { onMounted, ref, computed } from 'vue';
import { useMessage } from 'naive-ui';
import { useRouter } from 'vue-router';
import { fetchInboxAccounts, fetchInboxEmails, fetchInboxEmail, deleteInboxEmail, markInboxEmailRead, type InboxAccount, type InboxEmail } from '@/service/api/inbox';

const message = useMessage();
const router = useRouter();

const accounts = ref<InboxAccount[]>([]);
const activeAccount = ref<string | null>(null);
const emails = ref<InboxEmail[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const detailEmail = ref<InboxEmail | null>(null);
const showDetail = ref(false);

const selectedAccount = computed(() => accounts.value.find(a => a.id === activeAccount.value));

onMounted(async () => {
  const { data } = await fetchInboxAccounts();
  if (!data) return;
  accounts.value = data.accounts;
  if (accounts.value.length > 0) {
    activeAccount.value = accounts.value[0].id;
    await loadEmails();
  }
});

async function loadEmails() {
  if (!activeAccount.value) return;
  loading.value = true;
  const { data, error } = await fetchInboxEmails(activeAccount.value, page.value);
  if (!error && data) {
    emails.value = data.emails;
    total.value = data.total;
  }
  loading.value = false;
}

async function switchAccount(id: string) {
  activeAccount.value = id;
  page.value = 1;
  await loadEmails();
}

async function openDetail(id: string) {
  const { data, error } = await fetchInboxEmail(id);
  if (!error && data) {
    detailEmail.value = data.email;
    showDetail.value = true;
    // 更新列表中的已读状态
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
      <NButton quaternary @click="router.push('/inbox-account')">管理账户</NButton>
    </div>

    <!-- 账户选择 -->
    <NSpace v-if="accounts.length > 0">
      <NTag v-for="acc in accounts" :key="acc.id" :bordered="false"
        :type="activeAccount === acc.id ? 'primary' : 'default'"
        style="cursor: pointer;" @click="switchAccount(acc.id)">
        {{ acc.name }}
      </NTag>
    </NSpace>
    <NEmpty v-else description="暂无收件账户，请先添加" />

    <!-- 邮件列表 -->
    <NCard :bordered="false" class="card-wrapper" v-if="activeAccount">
      <template #header>
        <div class="flex-y-center justify-between">
          <span>{{ selectedAccount?.name || '' }} - 收件箱</span>
          <span class="text-14px text-#999">共 {{ total }} 封</span>
        </div>
      </template>

      <NSpin :show="loading">
        <div v-if="emails.length === 0 && !loading" class="py-40px text-center text-#999">
          暂无邮件，请点击"同步"按钮拉取
        </div>

        <div v-for="email in emails" :key="email.id"
          class="email-item" :class="{ 'email-unread': !email.isRead }"
          @click="openDetail(email.id)">
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
.email-item:hover {
  background: #f5f7fa;
}
.email-item.email-unread {
  background: #f0f7ff;
}
html.dark .email-item {
  border-color: #333;
}
html.dark .email-item:hover {
  background: #2a2a2a;
}
html.dark .email-item.email-unread {
  background: #1a2a3a;
}
.email-content {
  padding: 16px;
  border: 1px solid #efefef;
  border-radius: 4px;
  min-height: 100px;
}
html.dark .email-content {
  border-color: #333;
}
</style>