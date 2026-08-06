// 配置快照：把某一份配置按时间点保存，支持任意两版对比 / 变更时间线。
// 借鉴 Oxidized 的「配置版本化」思路，但用浏览器 localStorage 实现（无需后端 / Git）。
import { storageGet, storageSet } from './db.js'

const KEY = 'netops_snapshots'

function readAll () {
  try {
    const raw = storageGet(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    console.error('[snapshots] 读取失败', e)
    return []
  }
}

async function writeAll (list) {
  try {
    const ok = await storageSet(KEY, JSON.stringify(list))
    if (!ok) {
      throw new Error('本地存储空间不足，请先删除部分旧快照后再保存')
    }
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') {
      throw new Error('本地存储空间不足，请先删除部分旧快照后再保存')
    }
    throw e
  }
}

// 简易哈希：用于快速判断两份配置是否相同（djb2 + 长度）
export function hashText (text) {
  const s = text || ''
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16) + ':' + s.length
}

function fmtTime (ts) {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function listSnapshots () {
  return readAll().sort((a, b) => a.createdAt - b.createdAt)
}

export function getSnapshot (id) {
  return readAll().find(s => s.id === id) || null
}

export async function saveSnapshot ({ name, role = 'manual', device = '', vendor = '', text }) {
  if (!text) throw new Error('快照内容为空，无法保存')
  const all = readAll()
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name || (role === 'before' ? '变更前' : role === 'after' ? '变更后' : '手动快照'),
    role,
    device: device || '',
    vendor: vendor || '',
    text,
    createdAt: Date.now(),
    lines: text.split('\n').length,
    hash: hashText(text),
    timeLabel: fmtTime(Date.now())
  }
  all.push(item)
  await writeAll(all)
  return item
}

export async function removeSnapshot (id) {
  await writeAll(readAll().filter(s => s.id !== id))
}

export async function clearSnapshots () {
  await writeAll([])
}

export { fmtTime }
