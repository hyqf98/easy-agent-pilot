import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import i18n from '@/i18n'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: {
      titleKey: 'routes.home'
    }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: {
      titleKey: 'routes.settings'
    }
  },
  {
    path: '/mcp-test',
    name: 'mcp-test',
    component: () => import('@/views/McpTestView.vue'),
    meta: {
      titleKey: 'routes.mcpTest'
    }
  },
  {
    path: '/mini-panel',
    name: 'mini-panel',
    component: () => import('@/views/MiniPanelView.vue'),
    meta: {
      titleKey: 'routes.home'
    }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/'
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  }
})

// 路由守卫 - 更新页面标题
router.beforeEach((to, _from, next) => {
  const titleKey = to.meta.titleKey as string | undefined
  const title = titleKey ? i18n.global.t(titleKey) : undefined
  if (title) {
    document.title = title
  }
  next()
})

export default router
