// 统一本地存储：以 IndexedDB 为主（容量大，可存大配置），localStorage 为兜底
// （隐私模式 / 旧浏览器不支持 IndexedDB 时自动降级）。
// 对外提供同步读 API（内部维护内存缓存，应用启动时一次性灌入），
// 写 API 为「内存同步更新 + 后台异步落盘」，因此现有调用方无需改成异步。
import { reactive } from 'vue'

const DB_NAME = 'netops-db'
const STORE = 'kv'

// 体积较大的数据前缀：基线 / 采集草稿 / 快照。启动时从旧 localStorage 一次性迁移到 IndexedDB。
const MIGRATE_PREFIXES = ['netops_baseline_', 'netops_collect_draft_', 'netops_snapshots']

// 响应式缓存：写操作同步更新内存，依赖它的 computed（如快照/基线列表）会自动刷新
const memory = reactive(new Map())
let ready = false
let fallback = false
let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { fallback = true; resolve(null); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => { fallback = true; resolve(null) }
      req.onblocked = () => { fallback = true; resolve(null) }
    } catch (e) {
      fallback = true
      resolve(null)
    }
  })
  return dbPromise
}

function hydrateFromDB(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const cursor = tx.objectStore(STORE).openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (c) {
          memory.set(String(c.key), c.value)
          c.continue()
        } else {
          resolve()
        }
      }
      cursor.onerror = () => resolve()
    } catch (e) {
      resolve()
    }
  })
}

function hydrateFromLocalStorage() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) memory.set(k, localStorage.getItem(k))
    }
  } catch (e) { /* ignore */ }
}

// 应用启动时调用一次：灌入内存缓存，并把旧的 localStorage 大配置迁移到 IndexedDB。
export async function initDB() {
  if (ready) return
  const db = await openDB()
  if (db) {
    await hydrateFromDB(db)
    // 一次性迁移：仅迁移已知的大数据前缀，成功后移除 localStorage 副本，避免重复占用配额
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (!k || !MIGRATE_PREFIXES.some(p => k.startsWith(p))) continue
        if (memory.has(k)) {
          localStorage.removeItem(k)
          continue
        }
        const v = localStorage.getItem(k)
        if (v == null) continue
        memory.set(k, v)
        const ok = await putToDB(db, k, v)
        if (ok) localStorage.removeItem(k)
      }
    } catch (e) { /* ignore */ }
  } else {
    hydrateFromLocalStorage()
  }
  ready = true
}

function putToDB(db, key, value) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch (e) {
      resolve(false)
    }
  })
}

function removeFromDB(db, key) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch (e) {
      resolve(false)
    }
  })
}

// ===== 同步读（内存缓存） =====
export function storageGet(key) {
  return memory.has(key) ? memory.get(key) : null
}

export function storageHas(key) {
  return memory.has(key)
}

// 列出所有以指定前缀开头的 key（已按 key 排序）
export function storageKeys(prefix) {
  return Array.from(memory.keys()).filter(k => k.startsWith(prefix)).sort()
}

// 粗略估算缓存中的字符总量（用于容量提示）
export function storageTotalChars() {
  let n = 0
  for (const v of memory.values()) {
    if (typeof v === 'string') n += v.length
  }
  return n
}

// ===== 异步写（内存立即生效，后台落盘；IndexedDB 不可用时写 localStorage） =====
export async function storageSet(key, value) {
  memory.set(key, value)
  const db = await openDB()
  if (!db) {
    try {
      localStorage.setItem(key, value)
      return true
    } catch (e) {
      return false
    }
  }
  return putToDB(db, key, value)
}

export async function storageRemove(key) {
  memory.delete(key)
  const db = await openDB()
  if (!db) {
    try {
      localStorage.removeItem(key)
      return true
    } catch (e) {
      return false
    }
  }
  return removeFromDB(db, key)
}