// 页面 key（原 Dashboard 的 page 字符串）→ 路由 path 映射。
// 供 Sidebar 跳转与 Dashboard 内部导航（onHomeNavigate / onGoto 等）统一使用。
export const PAGE_PATHS = {
  home: '/home',
  'hw-p': '/compare/hw-p',
  'hw-i': '/compare/hw-i',
  'h3c-p': '/compare/h3c-p',
  'device-huawei': '/device/huawei',
  'device-huawei-ar': '/device/huawei-ar',
  'device-h3c': '/device/h3c',
  'device-global': '/device/global',
  'text-diff': '/text-diff',
  'cutover-check': '/cutover-check',
  'srv6-te-multi': '/srv6-te-multi',
  'cutover-summary': '/cutover-summary',
  'live-device': '/live-device',
  'snapshots': '/snapshots',
  settings: '/settings',
}
