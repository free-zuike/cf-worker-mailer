<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>📧 Worker Mailer</h1>
      </div>
      
      <nav class="sidebar-nav">
        <router-link to="/" class="nav-item" active-class="active">
          <span>📊</span> 仪表板
        </router-link>
        <router-link to="/smtp" class="nav-item" active-class="active">
          <span>⚙️</span> SMTP配置
        </router-link>
        <router-link to="/templates" class="nav-item" active-class="active">
          <span>📝</span> 邮件模板
        </router-link>
        <router-link to="/history" class="nav-item" active-class="active">
          <span>📜</span> 发送历史
        </router-link>
        <router-link to="/settings" class="nav-item" active-class="active">
          <span>🔧</span> 设置
        </router-link>
      </nav>
      
      <div class="sidebar-footer">
        <div class="user-info">
          <span class="user-email">{{ authStore.user?.email }}</span>
        </div>
        <button @click="handleLogout" class="logout-btn">
          退出登录
        </button>
      </div>
    </aside>
    
    <main class="main-content">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

function handleLogout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 260px;
  background: linear-gradient(180deg, #1e3a5f 0%, #0f1f33 100%);
  color: white;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 24px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-header h1 {
  font-size: 20px;
  font-weight: 700;
}

.sidebar-nav {
  flex: 1;
  padding: 20px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition: all 0.2s;
  font-size: 15px;
}

.nav-item:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.nav-item.active {
  color: white;
  background: rgba(102, 126, 234, 0.3);
  border-left: 3px solid #667eea;
}

.sidebar-footer {
  padding: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.user-info {
  margin-bottom: 12px;
}

.user-email {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.logout-btn {
  width: 100%;
  padding: 10px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 14px;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.main-content {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}
</style>
