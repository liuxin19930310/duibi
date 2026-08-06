import { ref } from 'vue'

// 模块级单例：当前激活的「一键导出全部」函数与是否有可导出数据
// 由解析页（DevicePage）/ 配置对比页（ComparePage）按 page 注册/注销，Header 读取并触发
// 用 { page, fn } 记录来源页面，注销时仅清除自身，避免 keep-alive 切换时激活/停用顺序导致互相覆盖
const exportAllFn = ref(null)
const hasExportData = ref(false)

export function useExportAll() {
  function registerExportAll(page, fn) {
    exportAllFn.value = { page, fn }
  }
  function setExportHasData(v) {
    hasExportData.value = !!v
  }
  function unregisterExportAll(page) {
    if (exportAllFn.value && exportAllFn.value.page === page) {
      exportAllFn.value = null
      hasExportData.value = false
    }
  }
  function triggerExportAll() {
    if (exportAllFn.value && typeof exportAllFn.value.fn === 'function') return exportAllFn.value.fn()
  }
  return { exportAllFn, hasExportData, registerExportAll, setExportHasData, unregisterExportAll, triggerExportAll }
}
