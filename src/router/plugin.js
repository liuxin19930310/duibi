// 插件装载器（从 naive-ui-pro 改造，支持函数型或对象型插件）。
import { APP, EFFECT_SCOPE, UNMOUNT_HANDLERS, RUN_WITH_APP_HANDLERS } from './symbols'

export function setupPlugin({ router, plugin }) {
  const install = typeof plugin === 'function' ? plugin : plugin.install
  router[EFFECT_SCOPE].run(() => {
    install({
      router,
      onUnmount(handler) {
        const handlers = (router[UNMOUNT_HANDLERS] ??= [])
        handlers.push(handler)
      },
      runWithApp(handler) {
        if (router[APP]) {
          handler(router[APP])
          return
        }
        const handlers = (router[RUN_WITH_APP_HANDLERS] ??= [])
        handlers.push(handler)
      },
    })
  })
}
