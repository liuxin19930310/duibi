// 路由级 keep-alive 插件（从 naive-ui-pro 改造，去 TS 类型增强，仅依赖 vue + lodash-es）。
// 给 router 挂 cachedComponentNames（响应式组件名数组），供 <keep-alive :include> 使用。
import { isBoolean } from 'lodash-es'
import { ref } from 'vue'
import { getRouteComponentName } from '../utils/route'

export function keepAlivePlugin({ defaultKeepAlive = false } = {}) {
  return ({ router, onUnmount }) => {
    const cachedComponentNames = router.cachedComponentNames = ref([])

    router.beforeResolve((to, from) => {
      // 判断 from 路由组件是否需要被缓存
      if (matched(to, from, defaultKeepAlive)) {
        const fromName = getRouteComponentName(from)
        cachedComponentNames.value = Array.from(new Set([
          ...cachedComponentNames.value,
          fromName,
        ]))
        return
      }

      // 判断 to 路由组件是否需要被删除
      if (!matched(from, to, defaultKeepAlive)) {
        const toName = getRouteComponentName(to)
        cachedComponentNames.value = cachedComponentNames.value.filter(name => name !== toName)
      }
    })

    onUnmount(() => {
      delete router.cachedComponentNames
    })

    return {
      onCleanup: () => {
        cachedComponentNames.value = []
      },
    }
  }
}

function matched(to, from, defaultKeepAlive) {
  const keepAlive = from.meta?.keepAlive ?? defaultKeepAlive
  if (isBoolean(keepAlive)) {
    return keepAlive
  }
  const exclude = keepAlive.exclude ?? []
  if (to.name && exclude.includes(to.name)) {
    return false
  }
  const include = keepAlive.include ?? []
  if (to.name && include.includes(to.name)) {
    return true
  }
  return false
}
