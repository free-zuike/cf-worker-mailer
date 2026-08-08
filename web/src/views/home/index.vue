<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchMetrics, type Metrics } from '@/service/api/email';

const router = useRouter();
const metrics = ref<Metrics>({ total: 0, sent: 0, failed: 0, pending: 0 });
const loading = ref(false);

async function loadMetrics() {
  loading.value = true;
  const { data, error } = await fetchMetrics();
  if (!error) {
    metrics.value = data.metrics;
  }
  loading.value = false;
}

onMounted(loadMetrics);
</script>

<template>
  <NSpace vertical :size="16">
    <h2 class="text-24px font-600">邮件服务概览</h2>

    <NGrid :x-gap="16" :y-gap="16" cols="2 s:2 m:4">
      <NGi>
        <NCard :bordered="false" class="card-wrapper" :loading="loading">
          <div class="flex-col-center">
            <p class="text-14px text-#999">总发送</p>
            <p class="text-32px font-700 text-primary">{{ metrics.total }}</p>
          </div>
        </NCard>
      </NGi>
      <NGi>
        <NCard :bordered="false" class="card-wrapper" :loading="loading">
          <div class="flex-col-center">
            <p class="text-14px text-#999">成功</p>
            <p class="text-32px font-700 text-success">{{ metrics.sent }}</p>
          </div>
        </NCard>
      </NGi>
      <NGi>
        <NCard :bordered="false" class="card-wrapper" :loading="loading">
          <div class="flex-col-center">
            <p class="text-14px text-#999">失败</p>
            <p class="text-32px font-700 text-error">{{ metrics.failed }}</p>
          </div>
        </NCard>
      </NGi>
      <NGi>
        <NCard :bordered="false" class="card-wrapper" :loading="loading">
          <div class="flex-col-center">
            <p class="text-14px text-#999">待处理</p>
            <p class="text-32px font-700 text-warning">{{ metrics.pending }}</p>
          </div>
        </NCard>
      </NGi>
    </NGrid>

    <NButton type="primary" size="large" @click="router.push('/compose')">
      发送邮件
    </NButton>
  </NSpace>
</template>