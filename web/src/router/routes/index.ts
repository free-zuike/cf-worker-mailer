import type { CustomRoute, ElegantConstRoute, ElegantRoute } from '@elegant-router/types';
import { generatedRoutes } from '../elegant/routes';
import { layouts, views } from '../elegant/imports';
import { transformElegantRoutesToVueRoutes } from '../elegant/transform';

/** 将特定路由的布局改为 blank（无侧边栏） */
function patchBlankLayoutRoutes(routes: ElegantConstRoute[]): ElegantConstRoute[] {
  const blankLayoutRoutes = ['login', '403', '404', '500', 'oauth-callback'];
  return routes.map(route => {
    if (blankLayoutRoutes.includes(route.name as string) && route.component) {
      const viewName = route.component.split('$view.').pop();
      if (viewName) {
        return { ...route, component: `layout.blank$view.${viewName}` };
      }
    }
    return route;
  });
}

const customRoutes: CustomRoute[] = [];

/** create routes when the auth route mode is static */
export function createStaticRoutes() {
  const constantRoutes: ElegantRoute[] = [];

  const authRoutes: ElegantRoute[] = [];

  const patchedRoutes = patchBlankLayoutRoutes(generatedRoutes);

  [...customRoutes, ...patchedRoutes].forEach((item: any) => {
    if (item.meta?.constant) {
      constantRoutes.push(item);
    } else {
      authRoutes.push(item);
    }
  });

  return {
    constantRoutes,
    authRoutes
  };
}

/**
 * Get auth vue routes
 *
 * @param routes Elegant routes
 */
export function getAuthVueRoutes(routes: ElegantConstRoute[]) {
  return transformElegantRoutesToVueRoutes(routes, layouts, views);
}
