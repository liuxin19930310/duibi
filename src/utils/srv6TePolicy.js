// src/utils/srv6TePolicy.js
// SRv6 TE Policy 解析：从运行态 `display srv6-te policy brief` 提取 SRv6 隧道策略表项
// （策略名称 / Color / Endpoint / TunnelId / 状态 / 状态变更时间 / Binding SID / 候选路径数）。
// 整体结构与 ipv6neigh.js / arp.js 对齐，供设备采集页面（华为路由协议）与配置对比页面展示与导出。
//
// 输入格式示例：
//   <HIQZ-CPE-CMNET-RT01-NE40E>display srv6-te policy brief
//   PolicyName : HIQZCPE01_FJXIMCPE05_100100
//   Color                   : 100100                         Endpoint             : 2409:8080:1::2253
//   TunnelId                : 3
//   Policy State            : Down (Init)                    State Change Time    : 2025-04-16 10:35:48
//   Binding SID             : -
//   Candidate-path Count    : 0
// 每个策略以 `PolicyName :` 起头；同一行可能含两个 key:value（如 Color 与 Endpoint）。
import { ref } from 'vue'

export function useSrv6TePolicyModule() {
  const neighborList = ref([])

  const getDiffInfo = (row, field) => {
    if (!row || !row.configDiffFields) return null
    const diff = row.configDiffFields.find(d => d.field === field)
    return diff || null
  }

  // 华为：解析 display srv6-te policy（兼容 brief 与 detail 输出）。
  // 注意：detail 输出每个策略后会跟 candidate-path 嵌套子块，其中的
  //   Discriminator / Binding SID / GroupId / Segment-List 等均为缩进行，
  //   需跳过以免污染主策略字段；同一日志里可能多次执行该命令（含
  //   traffic-statistics 子命令），故需排除 traffic-statistics 并按策略名去重。
  const parseHuaweiSrv6TePolicyLog = (text) => {
    const entries = []
    if (!text) return entries
    const lines = text.split('\n')
    let started = false
    let cur = null
    const pushCur = () => { if (cur) { entries.push(cur); cur = null } }
    for (const raw of lines) {
      const t = raw.trim()
      // 进入 display srv6-te policy 区域（brief / detail）；排除 traffic-statistics 子命令
      if (/^<.*>display srv6-te policy(?![\s-]*traffic)/i.test(t)) { started = true; cur = null; continue }
      if (!started) continue
      // 遇到下一个命令行提示符（其它命令输出）即结束本区域
      if (/^<.*>$/.test(t)) { started = false; pushCur(); continue }
      if (/^-+/.test(t) || !t) continue
      // 跳过缩行：candidate-path 嵌套子块（Discriminator / Binding SID / Segment-List 等）
      if (/^\s/.test(raw)) continue
      let m
      // 策略起始
      if ((m = t.match(/^PolicyName\s*:\s*(.+?)\s*$/i))) {
        pushCur()
        cur = {
          policyName: m[1].trim(),
          color: '-',
          endpoint: '-',
          tunnelId: '-',
          policyState: '-',
          stateChangeTime: '-',
          bindingSid: '-',
          candidatePathCount: '-'
        }
        continue
      }
      if (!cur) continue
      // 以下为同行双字段（Color+Endpoint、Policy State+State Change Time），需优先匹配
      if ((m = t.match(/^Color\s*:\s*(\S+)\s+Endpoint\s*:\s*(\S+)/i))) { cur.color = m[1]; cur.endpoint = m[2]; continue }
      if ((m = t.match(/^Policy State\s*:\s*(.+?)\s+State Change Time\s*:\s*(.+)$/i))) { cur.policyState = m[1].trim(); cur.stateChangeTime = m[2].trim(); continue }
      // 单行单字段（兼容字段分多行呈现的情况）
      if ((m = t.match(/^Color\s*:\s*(\S+)/i))) { cur.color = m[1]; continue }
      if ((m = t.match(/^Endpoint\s*:\s*(\S+)/i))) { cur.endpoint = m[1]; continue }
      if ((m = t.match(/^TunnelId\s*:\s*(\S+)/i))) { cur.tunnelId = m[1]; continue }
      if ((m = t.match(/^Policy State\s*:\s*(.+?)\s+State Change Time\s*:/i))) { cur.policyState = m[1].trim(); continue }
      if ((m = t.match(/^State Change Time\s*:\s*(.+)$/i))) { cur.stateChangeTime = m[1].trim(); continue }
      // Binding SID 可能带空格（如 2409:...:4:0(Encaps, Preferred)），需抓整段
      if ((m = t.match(/^Binding SID\s*:\s*(.+?)\s*$/i))) { cur.bindingSid = m[1].trim(); continue }
      if ((m = t.match(/^Candidate-path Count\s*:\s*(\S+)/i))) { cur.candidatePathCount = m[1]; continue }
    }
    pushCur()
    return entries
  }

  // 华三（H3C）：解析 display segment-routing ipv6 te policy。
  // 格式特点：每个策略以顶格 `Name/ID: 名称/ID` 起头，其余字段带缩进；
  //   - Name/ID 拆成 策略名称 + TunnelId（斜杠后的 ID）
  //   - Status: Up            → Policy State（注意区分 AdminStatus / Candidate paths state）
  //   - Color / End-point     → Color / Endpoint
  //   - Current BSID          → Binding SID
  //   - Up time               → State Change Time
  //   - Candidate paths statistics: 下一行 `CLI paths: 0  BGP paths: 2  PCEP paths: 0  ODN paths: 0`
  //     四类求和 → Candidate-path Count
  const parseH3cSrv6TePolicyLog = (text) => {
    const entries = []
    if (!text) return entries
    const lines = text.split('\n')
    let started = false
    let cur = null
    let inCandStats = false
    const pushCur = () => { if (cur) { entries.push(cur); cur = null } }
    for (const raw of lines) {
      const t = raw.trim()
      if (/^<.*>display segment-routing ipv6 te policy\b/i.test(t)) { started = true; cur = null; inCandStats = false; continue }
      if (!started) continue
      if (/^<.*>$/.test(t)) { started = false; pushCur(); continue }
      if (!t) continue
      let m
      // 策略起始：Name/ID: HIHKCPE01_SHSHCPE02_100100/0
      if ((m = t.match(/^Name\/ID\s*:\s*(.+?)\s*$/i))) {
        pushCur()
        inCandStats = false
        const nameId = m[1].trim()
        const slash = nameId.lastIndexOf('/')
        cur = {
          policyName: slash >= 0 ? nameId.slice(0, slash) : nameId,
          color: '-',
          endpoint: '-',
          tunnelId: slash >= 0 && nameId.slice(slash + 1) !== '' ? nameId.slice(slash + 1) : '-',
          policyState: '-',
          stateChangeTime: '-',
          bindingSid: '-',
          candidatePathCount: '-'
        }
        continue
      }
      if (!cur) continue
      // Candidate paths statistics 汇总行：CLI paths: 0  BGP paths: 2  PCEP paths: 0  ODN paths: 0
      if (/^Candidate paths statistics\s*:/i.test(t)) { inCandStats = true; continue }
      if (inCandStats) {
        const nums = [...t.matchAll(/(?:CLI|BGP|PCEP|ODN)\s+paths\s*:\s*(\d+)/gi)]
        if (nums.length) {
          cur.candidatePathCount = String(nums.reduce((s, n) => s + parseInt(n[1], 10), 0))
          inCandStats = false
        } else if (!/paths/i.test(t)) {
          inCandStats = false
        }
        if (nums.length) continue
      }
      if ((m = t.match(/^Color\s*:\s*(\S+)/i))) { if (cur.color === '-') cur.color = m[1]; continue }
      if ((m = t.match(/^End-point\s*:\s*(\S+)/i))) { if (cur.endpoint === '-') cur.endpoint = m[1]; continue }
      if ((m = t.match(/^Current BSID\s*:\s*(\S+)/i))) { if (cur.bindingSid === '-' && m[1] !== '-') cur.bindingSid = m[1]; continue }
      // Status 需精确匹配行首（排除 AdminStatus / Request state / Candidate paths state 等）
      if ((m = t.match(/^Status\s*:\s*(.+?)\s*$/i))) { if (cur.policyState === '-') cur.policyState = m[1].trim(); continue }
      if ((m = t.match(/^Up time\s*:\s*(.+?)\s*$/i))) { if (cur.stateChangeTime === '-') cur.stateChangeTime = m[1].trim(); continue }
    }
    pushCur()
    return entries
  }

  // 统一入口：同时跑华为 / 华三两套解析，再按策略名称去重合并。
  const parseSrv6TePolicyLog = (text) => {
    const entries = [
      ...parseHuaweiSrv6TePolicyLog(text),
      ...parseH3cSrv6TePolicyLog(text)
    ]
    // 按策略名称合并：同一日志可能多次执行 display srv6-te policy（先 detail 后 brief）。
    // 以 brief 为权威来源（用户参考格式即 display srv6-te policy brief），
    // 后出现的 brief 记录覆盖先出现的 detail 字段，确保 TunnelId / 状态等以 brief 为准。
    const map = new Map()
    for (const e of entries) {
      const prev = map.get(e.policyName)
      if (!prev) { map.set(e.policyName, { ...e }); continue }
      for (const k of Object.keys(e)) {
        if (k === 'policyName') continue
        if (e[k] !== '-' && e[k] !== undefined) prev[k] = e[k]
      }
    }
    return [...map.values()]
  }

  // entries: 解析出的 SRv6 TE Policy 表项
  const mergeSrv6TePolicyToTable = (entries) => {
    return entries.map(e => ({
      _key: e.policyName, // 主键：策略名称（同一设备内唯一）
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
    parseSrv6TePolicyLog,
    mergeSrv6TePolicyToTable
  }
}
