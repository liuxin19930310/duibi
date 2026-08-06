// 全局设置：单一真相源，localStorage 持久化，跨组件共享
// 覆盖「外观与布局」「比对规则」「数据与历史」「关于」四类的可配置项
import { reactive, watch } from 'vue'
import { compareState } from './compare.js'
import { collectScope } from './scope.js'

const STORAGE_KEY = 'netops_settings'

const defaults = {
  theme: 'light',                          // light | dark | system
  sidebarCollapsed: false,                 // 首页/设置页默认折叠侧栏
  ignoreCase: true,                        // 比对时忽略大小写差异（割接跨版本推荐开启）
  ignoreWhitespace: true,                  // 比对时忽略空白/空行差异
  ignoreOrder: false,                      // 比对时忽略字段内顺序重排
  interfaceMatchPriority: ['ip', 'desc', 'name'], // 接口匹配优先级（IP > 描述 > 名称，整机替换端口迁移推荐）
  cutoverMode: true,                       // 割接模式：开=IP优先+忽略大小写/空白（整机替换）；关=名称优先+精确（日常核查）
  aiAutoLearn: true,                           // 解析后自动分析未识别行（消耗模型额度，可在设置页关闭）
  collectTemplates: [],                         // 用户自定义采集命令模板
  deviceConnections: []                    // 设备连接配置（用于后端 SSH 采集），每项：
                                           // { id, name, host, port, vendor, username, password, authType }
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    // 兼容旧数据：过滤掉已移除的内置采集模板
    if (Array.isArray(saved.collectTemplates)) saved.collectTemplates = saved.collectTemplates.filter(t => !t.builtin)
    return { ...defaults, ...saved }
  } catch (e) {
    return { ...defaults }
  }
}

export const settings = reactive(loadSettings())

// 当前生效主题（浅色 true / 深色 false），供 UI 实时反映，含「跟随系统」变化
export const themeState = reactive({ isLight: true })

function getPrefersDark() {
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

export function applyTheme() {
  const isDark = settings.theme === 'dark' ||
    (settings.theme === 'system' && getPrefersDark())
  document.documentElement.classList.toggle('light', !isDark)
  themeState.isLight = !isDark
}

// 跟随系统时，系统主题切换实时响应
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => { if (settings.theme === 'system') applyTheme() }
  if (mq.addEventListener) mq.addEventListener('change', handler)
  else if (mq.addListener) mq.addListener(handler)
}

// 模块加载即应用一次主题（刷新后保持用户选择）
applyTheme()

// 设置变更自动持久化
watch(settings, () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch (e) {}
}, { deep: true })

// 主题变更时实时应用到 <html> 的 light 类，从而切换 CSS 主题变量
watch(() => settings.theme, () => {
  applyTheme()
})

// 清空所有比对与采集数据（保留设置）
export function clearAllData() {
  for (const k in compareState) {
    const list = compareState[k] && compareState[k].list
    if (list && typeof list.value !== 'undefined') list.value = []
  }
  for (const k in collectScope) {
    const list = collectScope[k] && collectScope[k].neighborList
    if (list && typeof list.value !== 'undefined') list.value = []
  }
}

// 恢复默认设置（不影响数据）
export function resetSettings() {
  Object.assign(settings, JSON.parse(JSON.stringify(defaults)))
  applyTheme()
}

// 割接模式一键切换：两套固定档位，避免手动逐项调设置
// on=true  → 整机替换割接档：IP 优先 + 忽略大小写 + 忽略空白（端口迁移/跨版本命令差异友好）
// on=false → 日常核查档：名称优先 + 区分大小写（忽略空白保持开启，无害）
export function setCutoverMode(on) {
  if (on) {
    settings.interfaceMatchPriority = ['ip', 'desc', 'name']
    settings.ignoreCase = true
    settings.ignoreWhitespace = true
  } else {
    settings.interfaceMatchPriority = ['name', 'ip', 'desc']
    settings.ignoreCase = false
    settings.ignoreWhitespace = true
  }
  settings.cutoverMode = on
}
