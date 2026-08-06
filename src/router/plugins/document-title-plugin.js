// 动态文档标题插件（从 naive-ui-pro 原样搬，仅依赖 @vueuse/core 的 useTitle）。
import { useTitle } from '@vueuse/core'
import { ref } from 'vue'

export function documentTitlePlugin({ resolveTitle = r => r.meta.title } = {}) {
  return ({ router }) => {
    const ready = ref(false)
    router.isReady().then(() => {
      ready.value = true
    })
    useTitle(() => {
      return ready.value
        ? resolveTitle(router.currentRoute.value)
        : null
    })
  }
}
