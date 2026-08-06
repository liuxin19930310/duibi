// 前端采集 API 封装：调用后端 /api/collect 连接设备采集配置文本
// 后端地址在开发期经 vite.config.js 的 '/api' 代理转发到 http://localhost:3001
import request from './axios'
import { storageGet, storageSet, storageRemove, storageKeys } from './db.js'

const BASE = '/api'

// 登录：校验账号密码，返回后端签发的会话 token
export async function loginApi (username, password) {
  const data = await request({ url: '/auth/login', method: 'POST', data: { username, password } })
  return data
}

// 登出：使后端会话 token 失效（尽力而为）
export async function logoutApi () {
  try {
    await request({ url: '/auth/logout', method: 'POST' })
  } catch (e) { /* ignore */ }
}

// ===== 大模型（LLM）接入 =====
export function llmStatus () { return request({ url: '/llm/status', method: 'GET' }) }
export function saveLlmConfig (payload) { return request({ url: '/llm/config', method: 'POST', data: payload }) }
export function llmTest () { return request({ url: '/llm/test', method: 'POST' }) }
export function llmCapabilities () { return request({ url: '/llm/capabilities', method: 'POST' }) }
export function clearLlmConfig () { return request({ url: '/llm/clear', method: 'POST' }) }
export function llmChat (payload) { return request({ url: '/llm/chat', method: 'POST', data: payload }) }
const BASELINE_PREFIX = 'netops_baseline_'
const DRAFT_PREFIX = 'netops_collect_draft_'

// 连接设备并采集配置文本
// conn: { host, port, username, password, vendor, scope?, commands?,
//         authType?, privateKey?, passphrase? }
//   scope: 'config'（仅当前配置，默认）| 'status'（仅运行状态）| 'full'（配置 + 状态）
//   authType: 'password'（默认）| 'key'（公私钥，配合 privateKey/passphrase）
// 返回 { raw, text }，失败时抛出带可读 message 的 Error（含 err.code）
export async function collectDevice(conn) {
  const data = await request({
    url: '/collect',
    method: 'POST',
    data: {
      host: conn.host,
      port: conn.port || 22,
      username: conn.username,
      password: conn.password,
      vendor: conn.vendor,
      scope: conn.scope || 'config',
      commands: conn.commands || undefined,
      authType: conn.authType || 'password',
      privateKey: conn.privateKey || undefined,
      passphrase: conn.passphrase || undefined
    }
  })
  return { raw: data.raw, text: data.text }
}

// ===== 实时同步：建立常驻 SSH 会话，返回 sessionId =====
// 参数同 collectDevice（host/port/username/password/vendor/authType/privateKey/passphrase）
export async function connectDevice(conn) {
  const data = await request({
    url: '/device/connect',
    method: 'POST',
    data: {
      host: conn.host,
      port: conn.port || 22,
      username: conn.username,
      password: conn.password,
      vendor: conn.vendor,
      authType: conn.authType || 'password',
      privateKey: conn.privateKey || undefined,
      passphrase: conn.passphrase || undefined
    }
  })
  return { sessionId: data.sessionId, vendor: data.vendor }
}

// 连通性测试：仅验证目标设备可达 + 凭据正确，不采集数据
// conn: { host, port, username, password, vendor, authType?, privateKey?, passphrase? }
// 返回 { ok, message, costMs }，失败时抛出带可读 message 的 Error（含 err.code）
export async function testConnection(conn) {
  const data = await request({
    url: '/test-connection',
    method: 'POST',
    data: {
      host: conn.host,
      port: conn.port || 22,
      username: conn.username,
      password: conn.password,
      vendor: conn.vendor,
      authType: conn.authType || 'password',
      privateKey: conn.privateKey || undefined,
      passphrase: conn.passphrase || undefined
    }
  })
  return { ok: data.ok, message: data.message, costMs: data.costMs }
}

// 关闭常驻会话
export async function disconnectDevice(sessionId) {
  if (!sessionId) return
  try {
    await request({
      url: '/device/disconnect',
      method: 'POST',
      data: { sessionId }
    })
  } catch (e) { /* 忽略关闭失败 */ }
}

// 基线快照（变更前配置）存浏览器本地，便于下次采集后自动比对
// 存储结构升级为带元数据的 JSON：{ text, savedAt, deviceId, deviceName, chars, scope, _v }
// loadBaseline 仍返回正文字符串，且向后兼容旧的纯文本基线（不会因升级丢失已存基线）

// meta: { deviceName, scope } 可选
export function saveBaseline(deviceId, text, meta = {}) {
  try {
    const record = {
      _v: 2,
      text: text || '',
      deviceId,
      deviceName: meta.deviceName || deviceId,
      scope: meta.scope || 'config',
      chars: (text || '').length,
      savedAt: Date.now()
    }
    storageSet(BASELINE_PREFIX + deviceId, JSON.stringify(record))
  } catch (e) {}
}

// 内部：读原始值并解析为记录对象（兼容旧纯文本）
function readBaselineRecord(deviceId) {
  try {
    const raw = storageGet(BASELINE_PREFIX + deviceId)
    if (raw == null) return null
    // 新结构为 JSON 对象
    if (raw.charAt(0) === '{') {
      try {
        const obj = JSON.parse(raw)
        if (obj && typeof obj === 'object' && typeof obj.text === 'string') return obj
      } catch (e) { /* 落到纯文本兼容 */ }
    }
    // 旧纯文本
    return { _v: 1, text: raw, deviceId, deviceName: deviceId, scope: 'config', chars: raw.length, savedAt: 0 }
  } catch (e) { return null }
}

export function loadBaseline(deviceId) {
  const rec = readBaselineRecord(deviceId)
  return rec ? rec.text : ''
}

// 返回某设备基线的元数据（不含正文），无则返回 null
export function loadBaselineMeta(deviceId) {
  const rec = readBaselineRecord(deviceId)
  if (!rec) return null
  return {
    deviceId: rec.deviceId || deviceId,
    deviceName: rec.deviceName || deviceId,
    scope: rec.scope || 'config',
    chars: rec.chars != null ? rec.chars : (rec.text || '').length,
    savedAt: rec.savedAt || 0
  }
}

// 遍历本地存储，返回所有基线元数据列表（按保存时间倒序）
export function listBaselines() {
  const out = []
  try {
    for (const key of storageKeys(BASELINE_PREFIX)) {
      const deviceId = key.slice(BASELINE_PREFIX.length)
      const meta = loadBaselineMeta(deviceId)
      if (meta) out.push(meta)
    }
  } catch (e) {}
  out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
  return out
}

export function clearBaseline(deviceId) {
  try { storageRemove(BASELINE_PREFIX + deviceId) } catch (e) {}
}

// ===== 采集草稿（关窗/刷新不丢，割接隔几小时也能续采） =====
// 按设备存本次采集进度：{ before, after, scope, deviceName, savedAt }
// draft: { before?, after?, scope?, deviceName? } 只保存已有字段
export function saveCollectDraft(deviceId, draft = {}) {
  if (!deviceId) return
  try {
    const record = {
      before: draft.before || '',
      after: draft.after || '',
      scope: draft.scope || 'config',
      deviceName: draft.deviceName || deviceId,
      savedAt: Date.now()
    }
    // 前后都为空时不留空记录，直接清掉
    if (!record.before && !record.after) {
      storageRemove(DRAFT_PREFIX + deviceId)
      return
    }
    storageSet(DRAFT_PREFIX + deviceId, JSON.stringify(record))
  } catch (e) {}
}

export function loadCollectDraft(deviceId) {
  if (!deviceId) return null
  try {
    const raw = storageGet(DRAFT_PREFIX + deviceId)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') return obj
  } catch (e) {}
  return null
}

export function clearCollectDraft(deviceId) {
  if (!deviceId) return
  try { storageRemove(DRAFT_PREFIX + deviceId) } catch (e) {}
}
