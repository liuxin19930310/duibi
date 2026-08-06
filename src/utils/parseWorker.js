// 解析调度器：优先在 Web Worker 中执行纯解析（compareCore.js），
// Worker 不可用或初始化失败时自动降级为主线程动态加载解析。
let worker = null
let seq = 0
const pending = new Map()

export function runInWorker(kind, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof Worker === 'undefined') throw new Error('当前环境不支持 Web Worker')
      if (!worker) {
        worker = new Worker(new URL('./parse.worker.js', import.meta.url), { type: 'module' })
        worker.onmessage = (e) => {
          const p = pending.get(e.data.id)
          if (!p) return
          pending.delete(e.data.id)
          if (e.data.ok) p.resolve(e.data.result)
          else p.reject(new Error(e.data.error || '解析失败'))
        }
        worker.onerror = (err) => {
          const list = Array.from(pending.values())
          pending.clear()
          try { worker?.terminate() } catch (e) { /* ignore */ }
          worker = null
          list.forEach(p => p.reject(new Error((err && err.message) || 'Worker 解析失败')))
        }
      }
      const id = ++seq
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, kind, ...payload })
    } catch (err) {
      // 降级：主线程动态加载纯解析核心（不阻塞首屏，只在必要时拉取）
      import('./compareCore.js').then((core) => {
        try {
          let result
          if (kind === 'device') result = core.parseDeviceProtocolsPure(payload.text, payload.vendor, payload.subtype)
          else if (kind === 'live') result = core.parseLiveStatusPure(payload.text)
          else result = core.runComparePure(payload.before, payload.after, payload.options)
          resolve(result)
        } catch (e2) {
          reject(e2)
        }
      }, reject)
    }
  })
}

export const runCompareInWorker = (before, after, options) => runInWorker('compare', { before, after, options })
export const runDeviceParseInWorker = (text, vendor, subtype) => runInWorker('device', { text, vendor, subtype })
export const runLiveParseInWorker = (text) => runInWorker('live', { text })