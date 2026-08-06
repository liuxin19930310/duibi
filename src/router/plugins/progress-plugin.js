// 路由进度条插件（从 naive-ui-pro 原样搬，仅依赖 nprogress，UI 库无关）。
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

export function progressPlugin() {
  return ({ router }) => {
    router.beforeEach(() => {
      NProgress.start()
    })

    router.afterEach(() => {
      NProgress.done()
    })

    router.onError((err) => {
      NProgress.done()
      if (import.meta.env.DEV) {
        console.error(err)
      }
    })
  }
}
