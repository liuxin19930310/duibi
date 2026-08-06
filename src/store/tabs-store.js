// 已访问路由标签（多标签页导航），建立在 vue-router 之上。
// 思路借鉴 naive-ui-pro 的 visited-routes 插件，但这里用 Pinia 维护列表、用 Element Plus 渲染，
// 与 UI 库无关的核心（收集已访问路由 + 组件名）保持一致。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getRouteComponentName } from '../router/utils/route'

export const useTabsStore = defineStore('tabs', () => {
  // 已访问视图：{ path, fullPath, name, title, affix, componentName }
  const visitedViews = ref([])

  function isAffix(route) {
    return !!route.meta?.affix || route.name === 'home'
  }

  // 收集一条已访问路由（去重；首页固定且置于最前）
  function addVisitedView(route) {
    if (!route.name) return
    const title = route.meta?.title || route.name

    if (isAffix(route)) {
      if (!visitedViews.value.find(v => v.name === 'home')) {
        visitedViews.value.unshift({
          path: route.path,
          fullPath: route.fullPath,
          name: route.name,
          title: title,
          affix: true,
          componentName: getRouteComponentName(route),
        })
      }
      return
    }

    if (visitedViews.value.find(v => v.fullPath === route.fullPath)) return
    visitedViews.value.push({
      path: route.path,
      fullPath: route.fullPath,
      name: route.name,
      title: title,
      affix: false,
      componentName: getRouteComponentName(route),
    })
  }

  function removeVisitedView(view) {
    const idx = visitedViews.value.findIndex(v => v.fullPath === view.fullPath)
    if (idx > -1) visitedViews.value.splice(idx, 1)
    return idx
  }

  function closeOthers(view) {
    visitedViews.value = visitedViews.value.filter(v => v.affix || v.fullPath === view.fullPath)
  }

  function closeAll() {
    visitedViews.value = visitedViews.value.filter(v => v.affix)
  }

  return { visitedViews, addVisitedView, removeVisitedView, closeOthers, closeAll, isAffix }
})
