// 路由表：把原 Dashboard 的 page key 映射为真实路由。
// name 作为缓存键；meta.pageKey 供组件/侧栏识别；meta.title 供动态标题；meta.keepAlive 供缓存；
// meta.componentName 供 keep-alive 在路由懒加载场景下稳定取到组件名。
// 视图已改为路由级懒加载：首屏只加载首页，其余页面进入时才拉取对应代码块。

export const routes = [
  { path: '/', redirect: '/home' },

  { path: '/home', name: 'home', component: () => import('../views/HomePage.vue'), meta: { title: '首页', pageKey: 'home', keepAlive: true, componentName: 'HomePage' } },

  { path: '/compare/hw-p', name: 'compare-hw-p', component: () => import('../views/ComparePage.vue'), meta: { title: '华为 · 路由协议(对比)', pageKey: 'hw-p', keepAlive: true, componentName: 'ComparePage' } },
  { path: '/compare/hw-i', name: 'compare-hw-i', component: () => import('../views/ComparePage.vue'), meta: { title: '华为 · 接口信息', pageKey: 'hw-i', keepAlive: true, componentName: 'ComparePage' } },
  { path: '/compare/h3c-p', name: 'compare-h3c-p', component: () => import('../views/ComparePage.vue'), meta: { title: '华三 · 路由协议(对比)', pageKey: 'h3c-p', keepAlive: true, componentName: 'ComparePage' } },

  { path: '/device/huawei', name: 'device-huawei', component: () => import('../views/DevicePage.vue'), meta: { title: '华为 · 路由协议(解析)', pageKey: 'device-huawei', keepAlive: true, componentName: 'DevicePage' } },
  { path: '/device/huawei-ar', name: 'device-huawei-ar', component: () => import('../views/DevicePage.vue'), meta: { title: '华为 · 接口信息', pageKey: 'device-huawei-ar', keepAlive: true, componentName: 'DevicePage' } },
  { path: '/device/huawei-trunk', name: 'device-huawei-trunk', component: () => import('../views/DevicePage.vue'), meta: { title: '华为 · 聚合口(解析)', pageKey: 'device-huawei-trunk', keepAlive: true, componentName: 'DevicePage' } },
  { path: '/device/h3c', name: 'device-h3c', component: () => import('../views/DevicePage.vue'), meta: { title: '华三 · 接口信息', pageKey: 'device-h3c', keepAlive: true, componentName: 'DevicePage' } },
  { path: '/device/global', name: 'device-global', component: () => import('../views/DevicePage.vue'), meta: { title: '全局配置(解析)', pageKey: 'device-global', keepAlive: true, componentName: 'DevicePage' } },

  { path: '/text-diff', name: 'text-diff', component: () => import('../views/TextDiffPage.vue'), meta: { title: '文本逐行对比', pageKey: 'text-diff', keepAlive: true, componentName: 'TextDiffPage' } },
  { path: '/cutover-check', name: 'cutover-check', component: () => import('../views/CutoverCheckPage.vue'), meta: { title: '割接迁移核查', pageKey: 'cutover-check', keepAlive: true, componentName: 'CutoverCheckPage' } },
  { path: '/srv6-te-multi', name: 'srv6-te-multi', component: () => import('../views/Srv6TePolicyMulti.vue'), meta: { title: 'SRv6 TE Policy', pageKey: 'srv6-te-multi', keepAlive: true, componentName: 'Srv6TePolicyMulti' } },
  { path: '/cutover-summary', name: 'cutover-summary', component: () => import('../views/CutoverSummary.vue'), meta: { title: '割接汇总', pageKey: 'cutover-summary', keepAlive: true, componentName: 'CutoverSummary' } },
  { path: '/live-device', name: 'live-device', component: () => import('../views/LiveDevicePage.vue'), meta: { title: '在线设备', pageKey: 'live-device', keepAlive: true, componentName: 'LiveDevicePage' } },
  { path: '/snapshots', name: 'snapshot', component: () => import('../views/SnapshotPage.vue'), meta: { title: '配置快照', pageKey: 'snapshots', keepAlive: true, componentName: 'SnapshotPage' } },
  { path: '/settings', name: 'settings', component: () => import('../views/SettingsPage.vue'), meta: { title: '设置', pageKey: 'settings', keepAlive: true, componentName: 'SettingsPage' } },

  // 未匹配路由兜底回首页
  { path: '/:pathMatch(.*)*', name: 'not-found', redirect: '/home' },
]