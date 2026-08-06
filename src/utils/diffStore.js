import { reactive } from 'vue'

// 主流程导入（拖拽 / 文件框 / SSH 采集）与「文本逐行对比」页面共享的 before/after 配置对。
// 这样一次导入后，用户可在任意入口切到原始逐行视图，无需重复导入。
export const diffStore = reactive({
  before: '',
  after: '',
  beforeName: '',
  afterName: ''
})

export function setDiffPair (before, after, beforeName = '变更前', afterName = '变更后') {
  diffStore.before = before || ''
  diffStore.after = after || ''
  diffStore.beforeName = beforeName
  diffStore.afterName = afterName
}

export function hasDiffPair () {
  return !!(diffStore.before || diffStore.after)
}
