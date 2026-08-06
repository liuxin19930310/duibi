// Router 实例装配（从 naive-ui-pro 的 create-router 精简而来）。
// 不复制其复杂的 install 重写，仅初始化 EFFECT_SCOPE 槽位后逐个 setupPlugin。
// 进度条 / 动态标题 / 路由缓存三个插件均与 UI 库解耦，可直接用。
import { effectScope } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { setupPlugin } from './plugin'
import { EFFECT_SCOPE } from './symbols'
import { progressPlugin } from './plugins/progress-plugin'
import { documentTitlePlugin } from './plugins/document-title-plugin'
import { keepAlivePlugin } from './plugins/keep-alive-plugin'
import { routes } from './routes'
import { useTabsStore } from '../store/tabs-store'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

// 初始化插件运行所需的 effectScope 槽位
router[EFFECT_SCOPE] ??= effectScope(true)

// 装载与 UI 库解耦的路由插件
setupPlugin({ router, plugin: progressPlugin() })
setupPlugin({ router, plugin: documentTitlePlugin() })
setupPlugin({ router, plugin: keepAlivePlugin({ defaultKeepAlive: true }) })

// 收集已访问路由 → 多标签页导航（afterEach 在导航完成后触发，此时 pinia 已就绪）
router.afterEach((to) => {
  try {
    useTabsStore().addVisitedView(to)
  } catch (e) {
    /* pinia 未就绪时静默跳过 */
  }
})

export default router
