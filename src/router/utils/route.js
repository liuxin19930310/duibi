// 路由组件名工具（从 naive-ui-pro 改造，供 keep-alive 插件使用）。
let uid = 0
const symbol = '__PRO_ROUTER_PLUGIN_AUTO_GENERATED__'

export function generateRouteName() {
  return `${++uid}${symbol}`
}

export function generateRouteComponentName(route) {
  return `${route.fullPath}${symbol}`
}

// 取当前路由匹配到的叶子组件名（keep-alive 的 include 用它）。
// 组件需显式 defineOptions({ name }) 或文件名即组件名，__name 才会稳定。
export function getRouteComponentName(route, namespace = 'default') {
  const currentRoute = route.matched[route.matched.length - 1]
  // 懒加载时 matched 组件可能还是异步加载函数，此时 __name 取不到；
  // 优先用路由 meta.componentName（在 routes.js 中显式声明），保证 keep-alive 缓存键稳定。
  if (currentRoute?.meta?.componentName) return currentRoute.meta.componentName
  const currentRouteComponent = currentRoute?.components?.[namespace]
  return currentRouteComponent?.__name
}

export function ensureRouteName(route) {
  return route.name ? route.name : generateRouteName()
}

export function isRouteName(name) {
  return typeof name === 'string' || typeof name === 'symbol'
}
