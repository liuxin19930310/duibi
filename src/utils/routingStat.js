// src/utils/routingStat.js
// IPV4路由表解析：从运行态 `display ip routing-table statistics` 提取路由条目数统计前后对比。
// 割接验证最核心的硬指标之一是「割接前后路由总数(Total)与活跃路由数(Active)是否一致」，
// 故该模块重点对比 Proto 表「Total」行的 total / active 两项（DIRECT/STATIC/ISIS/BGP… 协议级一并列出供参考）；
// added/deleted/freed 为累计增量（割接后必然很大），仅展示不参与差异判定。
// 注：华为输出里「Summary Prefixes（前缀总数）」与 Proto 表「Total」行的 total 口径重复且缺 active，解析时已去重。
//
// 输入格式示例：
//   <HISAY-CPE-CMNET-RT02-NE40E>display ip routing-table statistics
//   Summary Prefixes : 13562
//   Proto      total      active     added      deleted    freed
//              routes     routes     routes     routes     routes
//   DIRECT     24         24         6180       6156       6156
//   STATIC     0          0          0          0          0
//   IS-IS      34326      34318      16818669   16784343   16784343
//   BGP        0          0          0          0          0
//   Total      34350      34342      16824849   16790499   16790499
import { ref } from 'vue'

export function useRoutingStatModule() {
  const neighborList = ref([])

  const getDiffInfo = (row, field) => {
    if (!row || !row.configDiffFields) return null
    const diff = row.configDiffFields.find(d => d.field === field)
    return diff || null
  }

  // 华为：解析 display ip routing-table statistics
  const parseHuaweiRoutingStatLog = (text) => {
    const entries = []
    if (!text) return entries
    const lines = text.split('\n')
    let started = false
    // 常见设备提示符独占一行： <Host>  [Host]  Host>  Host#  Host]
    const isPromptLike = (s) => /^<.*>$/.test(s) || /^\[.*\]$/.test(s) || /^[A-Za-z0-9_\-.*]+[>#\]]$/.test(s)
    for (const raw of lines) {
      const t = raw.trim()
      // 进入统计区域：行中任意位置出现该命令即可，不再强依赖提示符格式
      if (/\bdisplay ip routing-table statistics\b/i.test(t)) { started = true; continue }
      if (!started) continue
      // 遇到下一个命令行提示符或下一个 display 命令即结束本区域
      if (isPromptLike(t) || /\bdisplay\s+\w/i.test(t)) { started = false; continue }
      if (!t) continue
      let m
      // Summary Prefixes : 13562（前缀总数，最贴近“路由条目数”的口径）
      if ((m = t.match(/^Summary\s+Prefixes?\s*[:：]\s*(\d+)/i))) {
        entries.push({ proto: 'Summary Prefixes', total: m[1], active: '-', added: '-', deleted: '-', freed: '-' })
        continue
      }
      // 表头两行（Proto ... / routes ...）跳过
      if (/^Proto\b/i.test(t) || /^routes\b/i.test(t)) continue
      // 数据行：协议名 + 5 个整数
      if ((m = t.match(/^([A-Za-z][\w-]*)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/))) {
        const proto = m[1].toUpperCase()
        if (proto === 'ROUTES') continue
        entries.push({ proto, total: m[2], active: m[3], added: m[4], deleted: m[5], freed: m[6] })
      }
    }
    return entries
  }

  // 统一入口（当前以华为为主；华三格式差异较大，后续可在此并联 parseH3c）
  // 去重：华为 `display ip routing-table statistics` 同时存在「Summary Prefixes（前缀总数）」与
  // Proto 表「Total」行（路由条目总数），二者 total 口径重复且 Summary Prefixes 缺 active，
  // 一律丢弃冗余的 Summary Prefixes，仅当它是唯一记录（退化设备无 Proto 表）时保留。
  const parseRoutingStatLog = (text) => {
    const entries = parseHuaweiRoutingStatLog(text)
    const hasProtoTable = entries.some(e => e.proto !== 'Summary Prefixes')
    return hasProtoTable ? entries.filter(e => e.proto !== 'Summary Prefixes') : entries
  }

  const mergeRoutingStatToTable = (entries) => {
    return entries.map(e => ({
      _key: e.proto, // 主键：协议类别（同一设备内唯一）
      ...e,
      configDiffFields: [],
      isConsistent: null
    }))
  }

  const updateNeighbors = (newData) => {
    neighborList.value = newData
  }

  return {
    neighborList,
    getDiffInfo,
    updateNeighbors,
    parseRoutingStatLog,
    mergeRoutingStatToTable
  }
}
