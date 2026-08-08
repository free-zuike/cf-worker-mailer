<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { fetchPreferences, savePreferences } from '@/service/api/settings';

const message = useMessage();
const theme = ref<'light' | 'dark'>('light');
const loading = ref(false);

onMounted(async () => {
  const { data, error } = await fetchPreferences();
  if (!error) {
    theme.value = data.preferences.theme;
  }
});

async function handleChange() {
  loading.value = true;
  const { error } = await savePreferences({ theme: theme.value });
  if (!error) {
    message.success('主题已切换');
  }
  loading.value = false;
}
</script>

<template>
  <NSpace vertical :size="16">
    <h2 class="text-24px font-600">用户偏好</h2>

    <NCard :bordered="false" class="card-wrapper" :loading="loading">
      <NForm label-placement="left" label-width="120">
        <NFormItem label="主题模式">
          <NSwitch :value="theme === 'dark'" @update:value="theme = $event ? 'dark' : 'light'; handleChange()">
            <template #checked>暗色</template>
            <template #unchecked>亮色</template>
          </NSwitch>
        </NFormItem>
      </NForm>
    </NCard>
  </NSpace>
</template>