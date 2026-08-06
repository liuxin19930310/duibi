// src/utils/lldp.js  ——  LLDP 邻居解析模块（运行态）
import { ref } from 'vue'

// 接口类型关键字（覆盖华为 / 华三 / 中兴常见命名），用于从运行态输出中定位"对端接口名（Neighbor Intf）"
const IF_TYPE_KEYWORDS = [
  'Ten-GigabitEthernet', 'XGigabitEthernet', 'HundredGigE', 'FortyGigE',
  'TwentyFiveGigE', 'TenGigE', 'GigabitEthernet', 'GigE', 'XGE', 'GE',
  'Eth-Trunk', 'Vlanif', 'Vlan-interface', 'LoopBack', 'Loopback',
  '100GE', '40GE', '25GE', '10GE', '400GE', // 速率前缀接口名（避免 GE 命中 100GE 内部，丢失速率前缀）
  'NULL0', 'NULL', 'MEth', 'Serial', 'Pos', 'FlexE',
  'sxgei-', 'xgei-', 'gei-', 'fei-', 'smartgroup',
  'Bridge-Aggregation', 'Route-Aggregation', 'XGigE', 'HGE', 'FGE'
]

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 判断字符串是否包含合法接口类型关键字；关键字后不能紧跟字母，避免 Pos 命中 position 等普通单词。
const hasInterfaceKeyword = (str) => {
  for (const kw of IF_TYPE_KEYWORDS) {
    const re = new RegExp(escapeRegex(kw) + '(?![a-zA-Z])', 'i')
    if (re.test(str)) return true
  }
  return false
}

// 在一段文本中定位"最靠右结束"的接口类型关键字。
// Neighbor Intf 一定是行末那段接口名，故取 end 最大者；若有子串包含（如 sxgei- 含 xgei-），
// 取 end 相同中关键字更长者，避免把 Neighbor Intf 误切成 xgei- 丢掉前缀。
// 关键字后必须是非字母字符（或字符串结尾），避免命中普通单词。
const findNeighborIntfStart = (body) => {
  const all = []
  for (const kw of IF_TYPE_KEYWORDS) {
    const re = new RegExp(escapeRegex(kw) + '(?![a-zA-Z])', 'gi')
    let m
    while ((m = re.exec(body)) !== null) {
      all.push({ start: m.index, end: m.index + kw.length, kw })
    }
  }
  if (!all.length) return -1
  all.sort((a, b) => b.end - a.end || b.kw.length - a.kw.length)
  return all[0].start
}

// 解析 display lldp neighbor brief 输出，返回邻居数组
export function parseLldpNeighborBrief(text) {
  const rows = []
  if (!text) return rows
  const lines = text.split(/\r?\n/)
  let inTable = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^display\s+/i.test(trimmed)) inTable = false
    // 表头：同时含 Local Intf 与 Neighbor Dev 即进入解析区
    if (/Local Intf/i.test(trimmed) && /Neighbor Dev/i.test(trimmed)) { inTable = true; continue }
    if (!inTable) continue
    if (/^[-]+\s*$/.test(trimmed)) continue
    if (!trimmed) continue
    if (/^Local Intf/i.test(trimmed)) continue // 表头兜底
    if (/^Total\s+items/i.test(trimmed)) continue // 末尾统计行

    // 1) Exptime：行尾的数字（剩余超时秒数）；要求前面有空白，避免把对端接口末尾的数字(如 100GE2/0/11 的 11)误当超时
    const expMatch = trimmed.match(/\s+(\d+)\s*$/)
    const exptime = expMatch ? expMatch[1] : '-'
    const body = expMatch ? trimmed.slice(0, expMatch.index).trim() : trimmed
    if (!body) continue

    // 2) 按空白切分：本端接口=首 token，对端接口=末 token，中间(可含空格)=对端设备
    //    display lldp neighbor brief 为固定 4 列，Exptime 已先剥离，故行末 token 即对端接口、行首即本端接口，
    //    可直接按位置取，避免把 100GE 的速率前缀(100)误切进对端设备；
    //    注意：对端接口可能是短格式(如 2/2/1，不含接口关键字)，故末 token 不强制要求含接口关键字。
    const parts = body.split(/\s+/)
    let localIntf, neighborDev, neighborIntf
    if (parts.length >= 3 && hasInterfaceKeyword(parts[0])) {
      localIntf = parts[0]
      neighborIntf = parts[parts.length - 1]
      neighborDev = parts.slice(1, -1).join(' ').trim()
    } else {
      // 退化：用关键字定位对端接口（兼容对端接口含特殊前缀/格式异常的行）
      const nIdx = findNeighborIntfStart(body)
      if (nIdx < 0) continue
      neighborIntf = body.slice(nIdx).trim()
      const devPart = body.slice(0, nIdx).trim()
      const dp = devPart.split(/\s+/)
      if (dp.length < 2) continue
      localIntf = dp[0]
      neighborDev = dp.slice(1).join(' ').trim()
    }
    if (!localIntf || !neighborDev || !neighborIntf) continue
    // 过滤垃圾行：本端接口必须是合法接口名（含接口类型关键字）
    if (!hasInterfaceKeyword(localIntf)) continue

    rows.push({
      localIntf,
      neighborDev,
      neighborIntf,
      exptime,
      state: '正常',
      _key: localIntf,
      configDiffFields: [],
      isConsistent: null
    })
  }
  return rows
}

export function useLldpModule() {
  const neighborList = ref([])
  const searchText = ref('')
  const showTable = ref(false)

  const getDiffInfo = (row, field) => {
    if (!row || !row.configDiffFields) return null
    const diff = row.configDiffFields.find(d => d.field === field)
    return diff || null
  }

  const detailFields = [
    { key: 'localIntf', label: '本端接口', minWidth: 60 },
    { key: 'neighborDev', label: '对端设备', minWidth: 60 },
    { key: 'neighborIntf', label: '对端接口', minWidth: 60 },
    { key: 'exptime', label: '剩余超时(秒)', minWidth: 50 }
  ]

  const updateNeighbors = (newData) => {
    neighborList.value = newData
  }

  return {
    searchText,
    showTable,
    neighborList,
    getDiffInfo,
    detailFields,
    updateNeighbors,
    parseLldpNeighborBrief
  }
}
