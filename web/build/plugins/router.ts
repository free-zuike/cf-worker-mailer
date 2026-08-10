import type { RouteMeta } from 'vue-router';
import ElegantVueRouter from '@elegant-router/vue/vite';
import type { RouteKey } from '@elegant-router/types';

export function setupElegantRouter() {
  return ElegantVueRouter({
    layouts: {
      base: 'src/layouts/base-layout/index.vue',
      blank: 'src/layouts/blank-layout/index.vue'
    },
    routePathTransformer(routeName, routePath) {
      const key = routeName as RouteKey;

      if (key === 'login') {
        const modules: UnionKey.LoginModule[] = ['pwd-login', 'code-login', 'register', 'reset-pwd', 'bind-wechat'];

        const moduleReg = modules.join('|');

        return `/login/:module(${moduleReg})?`;
      }

      return routePath;
    },
    onRouteMetaGen(routeName) {
      const key = routeName as RouteKey;

      const constantRoutes: RouteKey[] = ['login', '403', '404', '500'];

      const hideInMenuRoutes: RouteKey[] = ['login', '403', '404', '500', 'template-edit', 'oauth-callback', 'iframe-page', 'inbox-account'];

      const menuConfig: Record<string, { order: number; icon: string }> = {
        home: { order: 1, icon: 'mdi:monitor-dashboard' },
        compose: { order: 2, icon: 'mdi:email-plus-outline' },
        inbox: { order: 3, icon: 'mdi:email-open-outline' },
        'inbox-account': { order: 3, icon: 'mdi:email-account' },
        smtp: { order: 4, icon: 'mdi:server' },
        templates: { order: 5, icon: 'mdi:file-document-outline' },
        history: { order: 6, icon: 'mdi:history' },
        settings: { order: 7, icon: 'mdi:cog-outline' },
        'global-variables': { order: 8, icon: 'mdi:variable' },
        contacts: { order: 9, icon: 'mdi:book-account-outline' }
      };

      const meta: Partial<RouteMeta> = {
        title: key,
        i18nKey: `route.${key}` as App.I18n.I18nKey
      };

      if (constantRoutes.includes(key)) {
        meta.constant = true;
      }

      if (hideInMenuRoutes.includes(key)) {
        meta.hideInMenu = true;
      }

      if (menuConfig[key]) {
        meta.order = menuConfig[key].order;
        meta.icon = menuConfig[key].icon;
      }

      // 使用富文本编辑器的页面，禁止缓存避免空白页
      if (key === 'compose' || key === 'template-edit') {
        meta.keepAlive = false;
      }

      return meta;
    }
  });
}
