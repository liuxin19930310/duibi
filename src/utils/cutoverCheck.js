/**
 * 割接迁移核查 · 核心纯函数（不依赖 Vue / DOM，可单测）
 * 输入：割接前 / 割接后配置文本
 * 输出：端口迁移对、逐项差异、给 LLM 的摘要、LLM 结果解析
 */

// ===================== 接口块提取 =====================

export function extractIfaces (text) {
  const lines = String(text || '').split('\n')
  const ifaces = {}
  let cur = null
  let inEcho = false
  let block = []
  const flush = () => { if (cur) ifaces[cur] = block; block = [] }
  for (const raw of lines) {
    const t = raw.trim()
    if (/^[<>]/.test(t) || /^display\b/i.test(t)) { inEcho = true; flush(); cur = null; continue }
    if (inEcho) { if (/^#\s*$/.test(t) || /^!\s*$/.test(t)) inEcho = false; continue }
    if (/^#\s*$/.test(t) || /^!\s*$/.test(t)) { flush(); cur = null; continue }
    const im = t.match(/^interface\s+(\S+)/i)
    if (im) { flush(); cur = im[1]; block = []; continue }
    if (cur) {
      if (/^[ \t]/.test(raw)) block.push(t)
      else if (/^(return|quit)$/i.test(t)) { flush(); cur = null }
      else { flush(); cur = null }
    }
  }
  flush()
  return ifaces
}

export const ifaceIps = (block) => {
  const ips = []
  for (const line of block || []) {
    const m = line.match(/^ip\s+address\s+([\d.]+)/i)
    if (m) ips.push(m[1])
  }
  return ips
}

export const ifaceDesc = (block) => {
  const m = (block || []).find(l => /^description\s+/i.test(l))
  return m ? m.replace(/^description\s+/i, '').trim() : ''
}

export const normBlock = (arr) => (arr || [])
  .map(l => l.replace(/\s+/g, ' ').trim().toLowerCase())
  .filter(l => !/^(interface|undo shutdown|shutdown)$/.test(l))
  .sort()

// ===================== 端口映射（IP → 描述） =====================

/**
 * 端口映射：返回 { matched, descMatched, beforeOnly, afterOnly }
 * matched: [{ before, after, ip, conf: 'high' }]
 * descMatched: [{ before, after, desc, conf: 'medium' }]
 * beforeOnly / afterOnly: 未匹配端口名数组
 */
export function buildPortPairs (beforeText, afterText) {
  const bIf = extractIfaces(beforeText)
  const aIf = extractIfaces(afterText)
  const bIpMap = {}
  for (const [n, b] of Object.entries(bIf)) {
    for (const ip of ifaceIps(b)) {
      if (!bIpMap[ip]) bIpMap[ip] = []
      bIpMap[ip].push(n)
    }
  }
  const matched = []
  const descMatched = []
  const bMatched = new Set()
  const aMatched = new Set()

  // IP 匹配
  for (const [an, b] of Object.entries(aIf)) {
    for (const ip of ifaceIps(b)) {
      const cands = bIpMap[ip] || []
      const bn = cands.find(x => !bMatched.has(x))
      if (bn) {
        matched.push({ before: bn, after: an, ip, conf: 'high' })
        bMatched.add(bn)
        aMatched.add(an)
        break
      }
    }
  }

  // 描述匹配
  const aByDesc = new Map()
  for (const [n, b] of Object.entries(aIf)) {
    const d = ifaceDesc(b)
    if (d) {
      if (!aByDesc.has(d)) aByDesc.set(d, [])
      aByDesc.get(d).push(n)
    }
  }
  for (const [n, b] of Object.entries(bIf)) {
    if (bMatched.has(n)) continue
    const d = ifaceDesc(b)
    const cand = d && (aByDesc.get(d) || []).find(x => !aMatched.has(x))
    if (cand) {
      descMatched.push({ before: n, after: cand, desc: d, conf: 'medium' })
      bMatched.add(n)
      aMatched.add(cand)
    }
  }

  // 同名匹配：槽位未变（before 端口名在 after 中存在且未匹配），如管理口、空端口
  const sameName = []
  for (const n of Object.keys(bIf)) {
    if (bMatched.has(n)) continue
    if (aIf[n] && !aMatched.has(n)) {
      sameName.push({ before: n, after: n, conf: 'medium' })
      bMatched.add(n)
      aMatched.add(n)
    }
  }

  return {
    matched,
    descMatched,
    sameName,
    beforeOnly: Object.keys(bIf).filter(n => !bMatched.has(n)),
    afterOnly: Object.keys(aIf).filter(n => !aMatched.has(n))
  }
}

// ===================== 逐项对比 =====================

/**
 * 对比一对端口配置块：返回 { lost, added }（规范化行集合差集）
 */
export function comparePortPair (beforeBlock, afterBlock) {
  const bSet = new Set(normBlock(beforeBlock))
  const aSet = new Set(normBlock(afterBlock))
  return {
    lost: [...bSet].filter(l => !aSet.has(l)),
    added: [...aSet].filter(l => !bSet.has(l))
  }
}

// ===================== LLM 摘要构造 =====================

/**
 * 生成给 LLM 的割接摘要（结构化文本）。
 */
export function buildCutoverSummary (beforeText, afterText, pairs) {
  const bIf = extractIfaces(beforeText)
  const aIf = extractIfaces(afterText)
  const p = pairs || buildPortPairs(beforeText, afterText)
  const { matched, descMatched, beforeOnly, afterOnly, sameName = [] } = p

  const diffSamples = []
  for (const p of matched.slice(0, 8)) {
    const d = comparePortPair(bIf[p.before], aIf[p.after])
    if (d.lost.length || d.added.length) {
      diffSamples.push(`${p.before}->${p.after} 丢[${d.lost.slice(0, 3).join(',')}] 增[${d.added.slice(0, 3).join(',')}]`)
    }
  }

  return [
    '【割接场景】设备整机替换',
    '【配置规模】割接前 ' + beforeText.length + ' 字符 / 割接后 ' + afterText.length + ' 字符',
    '【接口】before ' + Object.keys(bIf).length + ' → after ' + Object.keys(aIf).length,
    '【端口迁移对】IP 匹配 ' + matched.length + ' 个（含 Eth-Trunk）；描述匹配 ' + descMatched.length + ' 个；同名匹配 ' + sameName.length + ' 个',
    '【未匹配】老设备 ' + beforeOnly.length + ' 个端口无对应（多为无描述空端口）；新设备 ' + afterOnly.length + ' 个端口无对应（疑似新增板卡/端口）',
    '【端口迁移对示例】' + matched.filter(p => p.before !== p.after).slice(0, 10).map(p => p.before + '→' + p.after + '(' + p.ip + ')').join('、'),
    '【迁移对差异样例】' + (diffSamples.length ? diffSamples.join('；') : '抽查前 8 个迁移对无差异'),
    '【解析器未识别命令类型】' + unknownCmdTypes(beforeText).map(([k, v]) => k + ' ' + v).join('、')
  ].join('\n')
}

// 未识别命令类型统计（简化版：接口块内不在白名单的命令首词分布）
const KNOWN_IFACE = [/^description\b/i, /^ip\s+address\b/i, /^ipv6\s+address\b/i, /^ip\s+vpn-instance\b/i, /^binding\s+vpn-instance\b/i, /^shutdown\b/i, /^undo\b/i, /^mtu\b/i, /^speed\b/i, /^isis\b/i, /^segment-routing\s+ipv6\b/i, /^eth-trunk\b/i, /^port\b/i, /^vlan\b/i, /^flow-control\b/i, /^storm\b/i, /^qos\b/i, /^car\b/i, /^duplex\b/i, /^negotiation\b/i, /^priority\b/i, /^statistic/i, /^stp\b/i, /^lldp\b/i, /^bfd\b/i, /^ospf\b/i, /^ospfv3\b/i, /^rip\b/i, /^nat\b/i, /^vrrp\b/i, /^acl\b/i, /^traffic\b/i, /^mirror/i, /^diagnostic/i, /^collect\b/i, /^dampening/i, /^jumboframe/i, /^link-delay/i, /^loopback/i, /^default\b/i, /^ip\s+report\b/i, /^display/i, /^return\s*$/i, /^quit\s*$/i]
const TOP_LEVEL = /^(interface\s|sysname\s|vlan\s|bgp\s|router\s|isis\s|ospf\s|ospfv3\s|rip\s|mpls\s|segment-routing\s|ip\s+route-static\s|snmp\s|ntp\s|acl\s|traffic\s|qos\s|telnet\s|ssh\s|radius\s|tacacs\s|dhcp\s|dns\s|undo\s|return\s*$|quit\s*$)/i

export function unknownCmdTypes (text) {
  const lines = String(text || '').split('\n')
  let state = 'skip'
  const byCmd = {}
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/^[<>]/.test(line) || /^display\b/i.test(line)) { state = 'skip'; continue }
    if (/^#\s*$/.test(line) || /^!\s*$/.test(line)) { state = 'config'; continue }
    if (state === 'skip') continue
    if (/^interface\s+/i.test(line)) { state = 'iface'; continue }
    if (state === 'iface') {
      if (/^[ \t]/.test(raw)) {
        if (line.length >= 2 && !/^[\d\-.%]+$/.test(line) && !KNOWN_IFACE.some(re => re.test(line))) {
          const w = (line.split(/\s+/)[0] || '?').toLowerCase()
          byCmd[w] = (byCmd[w] || 0) + 1
        }
      } else { state = TOP_LEVEL.test(line) ? 'config' : 'skip' }
    }
  }
  return Object.entries(byCmd).sort((a, b) => b[1] - a[1]).slice(0, 12)
}

// ===================== LLM 结果解析 =====================

/**
 * 解析模型返回的割接核查 JSON（兼容 markdown 代码块 / 前后说明）。
 * 期望结构：{ themes: [...], risks: [...], verify: [...] }
 */
export function parseCutoverResult (content) {
  let text = String(content || '').trim()
  if (!text) return { themes: [], risks: [], verify: [], raw: text }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return { themes: [], risks: [], verify: [], raw: text }
  let obj
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch (e) {
    return { themes: [], risks: [], verify: [], raw: text }
  }
  const sevMap = (s) => ({ high: '极高', medium: '高', low: '中', info: '低' }[String(s || '').toLowerCase()] || '高')
  const themes = Array.isArray(obj.themes) ? obj.themes.map((x, i) => ({
    id: 'th_' + i,
    title: (x && x.title) || '',
    modules: (x && x.modules) || '',
    scale: (x && x.scale) || '',
    risk: (x && x.risk) || ''
  })).filter(t => t.title) : []
  const risks = Array.isArray(obj.risks) ? obj.risks.map((x, i) => ({
    id: 'rk_' + i,
    severity: sevMap(x && x.severity),
    title: (x && x.title) || '',
    evidence: (x && x.evidence) || '',
    suggestion: (x && x.suggestion) || ''
  })).filter(r => r.title) : []
  const verify = Array.isArray(obj.verify) ? obj.verify.map((x, i) => ({
    id: 'vf_' + i,
    group: (x && x.group) || '',
    command: (x && x.command) || '',
    expect: (x && x.expect) || ''
  })).filter(v => v.command) : []
  return { themes, risks, verify, raw: text }
}

// ===================== 汇总统计 =====================

/**
 * 汇总端口迁移核查结果（前端表格数据）。
 */
export function buildPortReport (beforeText, afterText) {
  const bIf = extractIfaces(beforeText)
  const aIf = extractIfaces(afterText)
  const pairs = buildPortPairs(beforeText, afterText)
  const rows = pairs.matched.map(p => {
    const d = comparePortPair(bIf[p.before], aIf[p.after])
    return {
      before: p.before,
      after: p.after,
      matchBy: 'IP ' + p.ip,
      conf: '高',
      lost: d.lost,
      added: d.added,
      lostCount: d.lost.length,
      addedCount: d.added.length,
      status: d.lost.length || d.added.length ? '有差异' : '一致'
    }
  })
  const descRows = pairs.descMatched.map(p => {
    const d = comparePortPair(bIf[p.before], aIf[p.after])
    return {
      before: p.before,
      after: p.after,
      matchBy: '描述',
      conf: '中',
      lost: d.lost,
      added: d.added,
      lostCount: d.lost.length,
      addedCount: d.added.length,
      status: d.lost.length || d.added.length ? '有差异' : '一致'
    }
  })
  const sameRows = pairs.sameName.map(p => {
    const d = comparePortPair(bIf[p.before], aIf[p.after])
    return {
      before: p.before,
      after: p.after,
      matchBy: '同名端口',
      conf: '中',
      lost: d.lost,
      added: d.added,
      lostCount: d.lost.length,
      addedCount: d.added.length,
      status: d.lost.length || d.added.length ? '有差异' : '一致'
    }
  })
  return {
    rows: rows.concat(descRows, sameRows),
    beforeOnly: pairs.beforeOnly,
    afterOnly: pairs.afterOnly,
    totalMatched: rows.length + descRows.length + sameRows.length
  }
}
