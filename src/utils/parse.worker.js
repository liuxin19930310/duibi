// 解析 Worker：在后台线程执行纯解析 + 比对，返回可结构化克隆的纯数据。
// 支持三种任务：
//   compare —— 配置对比（runComparePure）
//   device  —— 配置解析页（parseDeviceProtocolsPure）
//   live    —— 在线设备实时状态（parseLiveStatusPure）
import { runComparePure, parseDeviceProtocolsPure, parseLiveStatusPure } from './compareCore.js'

self.onmessage = (e) => {
  const { id, kind, ...payload } = e.data || {}
  try {
    let result
    if (kind === 'device') {
      result = parseDeviceProtocolsPure(payload.text, payload.vendor, payload.subtype)
    } else if (kind === 'live') {
      result = parseLiveStatusPure(payload.text)
    } else {
      result = runComparePure(payload.before, payload.after, payload.options)
    }
    self.postMessage({ id, ok: true, result })
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) })
  }
}