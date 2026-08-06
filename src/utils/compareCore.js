// 纯解析 + 比对核心：不依赖 Vue 响应式状态、不触碰 DOM，可在 Web Worker 中运行。
// compare.js 只负责：调度 Worker（或主线程回退）→ 把结果写回响应式 store。

// src/utils/compare.js
import { parseConfigForEthTrunkMembers } from './deviceParser.js'
import { useBgpModule } from './bgp.js'
import { useIsisModule } from './isis.js'
import { useLdpModule } from './ldp.js'
import { useLdpPeerModule } from './ldpPeer.js'
import { useSrv6SidModule } from './srv6Sid.js'
import { useSrv6TePolicyModule } from './srv6TePolicy.js'
import { useInterfaceModule } from './interfaceInfo.js'
import { buildOpticalPowerSubDiffs } from './interfaceInfo.js'
import { useRoutingStatModule } from './routingStat.js'
import { useLldpModule } from './lldp.js'
import { useOspfModule } from './ospf.js'
import { useArpModule } from './arp.js'
import { useIpv6NeighModule } from './ipv6neigh.js'
import { parseDeviceInfo } from './deviceParser.js'

// ===== 1. 创建对比侧独立的模块实例（与设备采集侧 DevicePage 各自独立、互不影响） =====

const bgpMod = useBgpModule()
const isisMod = useIsisModule()
const ldpMod = useLdpModule()
const ldpPeerMod = useLdpPeerModule()
const srv6Mod = useSrv6SidModule()
const srv6TePolicyMod = useSrv6TePolicyModule()
const ifaceMod = useInterfaceModule()
const routingStatMod = useRoutingStatModule()
const lldpMod = useLldpModule()
const ospfMod = useOspfModule()
const arpMod = useArpModule()
const ipv6neighMod = useIpv6NeighModule()

// 对比侧解析函数（取自对比侧实例）
const { parseBgpVpnPeerLog, parseBgpVpnPeerVerboseLog, parseBgpStatusLog, parseBgpConfigNeighbors } = bgpMod
const { parseIsisStatusLog, mergeIsisStatusToTable } = isisMod
const { parseLdpSessionLog, mergeLdpToTable } = ldpMod
const { parseLdpPeerLog, mergeLdpPeerToTable } = ldpPeerMod
const { parseSrv6SidLog, mergeSrv6SidToTable } = srv6Mod
const { parseSrv6TePolicyLog, mergeSrv6TePolicyToTable } = srv6TePolicyMod
const { parseInterfaceInfoLog, mergeInterfaceToTable, parseConfigForIsisCost, parseConfigForIpAddress, parseConfigForDescription, parseInterfaceBrief, parseConfigForVrf } = ifaceMod
const { parseRoutingStatLog, mergeRoutingStatToTable } = routingStatMod
const { parseLldpNeighborBrief } = lldpMod
const { parseOspfPeerLog, mergeOspfPeerToTable } = ospfMod
const { parseArpLog, mergeArpToTable } = arpMod
const { parseIpv6NeighLog, mergeIpv6NeighToTable } = ipv6neighMod


// ===== 2. 原始辅助解析函数 =====
const extractGroupFromConfig = (configText, targetIp) => {
  if (!configText) return '-'
  const escapedIp = targetIp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const reg = new RegExp(`^\\s*(?:peer|neighbor)\\s+${escapedIp}\\s+group\\s+(\\S+)`, 'im')
  const lines = configText.split('\n')
  for (const line of lines) { const match = line.match(reg); if (match) return match[1] }
  return '-'
}

const parseBgpSummary = (text) => {
  const peers = []; const cleanText = text.replace(/^﻿/, ''); const lines = cleanText.split('\n')
  const rowRegex = /^\s*(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s*$/
  let parseStarted = false; let currentAddressFamily = 'IPv4 Unicast'
  for (const line of lines) {
    const afMatch = line.match(/^\s*Address\s+Family:\s*(.+)/i)
    if (afMatch) { currentAddressFamily = afMatch[1].trim(); parseStarted = false; continue }
    if (/^[\s-]+$/.test(line)) continue
    if (/^Total\s+number/i.test(line)) continue
    if (line.includes('Peer') && line.includes('RtRcv')) { parseStarted = true; continue }
    if (!parseStarted || line.trim() === '') continue
    const match = line.match(rowRegex)
    if (match) {
      peers.push({ neighborIp: match[1].trim(), remoteAs: match[2].trim(), sessionState: match[7].trim(), neighborState: match[7].trim(), routesReceived: parseInt(match[8]) || 0, routesSent: parseInt(match[9]) || 0, addressType: match[1].includes(':') ? 'IPv6' : 'IPv4', group: '-', protocolFamily: currentAddressFamily, sessionDuration: match[6].trim(), addressFamily: currentAddressFamily })
    }
  }
  return peers
}

/** 解析 display bgp vpnv4/vpnv6 all peer 输出，返回对等体数组 */
const parseBgpVpnPeerSummary = (text) => {
  const statusMap = parseBgpVpnPeerLog(text)
  return Object.values(statusMap).map(item => ({ ...item, group: '-' }))
}

/** 合并传统 summary 和 vpnv4/vpnv6 peer 结果，同 IP+地址类型去重（优先 vpn 格式） */
const mergeBgpPeers = (oldPeers, vpnPeers) => {
  const vpnKeys = new Set(vpnPeers.map(p => `${p.neighborIp}|${p.addressType}`))
  return [...oldPeers.filter(p => !vpnKeys.has(`${p.neighborIp}|${p.addressType}`)), ...vpnPeers]
}

const parseIsisSummary = (text) => { const statusMap = parseIsisStatusLog(text); return mergeIsisStatusToTable(statusMap) }
const parseLdpSummary = (text) => { const statusMap = parseLdpSessionLog(text); return mergeLdpToTable(statusMap) }
const parseLdpPeerSummary = (text) => { const statusMap = parseLdpPeerLog(text); return mergeLdpPeerToTable(statusMap) }
const parseSrv6SidSummary = (text) => { const statusMap = parseSrv6SidLog(text); return mergeSrv6SidToTable(statusMap) }
const parseSrv6TePolicySummary = (text) => { const entries = parseSrv6TePolicyLog(text); return mergeSrv6TePolicyToTable(entries) }
const parseRoutingStatSummary = (text) => { const entries = parseRoutingStatLog(text); return mergeRoutingStatToTable(entries) }

/** 从配置中扫描所有 interface xxx 块，提取接口名和 shutdown 状态 */
function parseConfigIfBlocks(text) {
  const ifMap = {}
  const ifRegex = /^interface\s+(\S+)\s*$/gm
  let ifMatch
  while ((ifMatch = ifRegex.exec(text)) !== null) {
    const ifName = ifMatch[1]
    const startIdx = ifMatch.index + ifMatch[0].length
    const restText = text.slice(startIdx)
    const blockMatch = restText.match(/^(\s[\s\S]*?)(?=\n\S|\n#$)/)
    const block = blockMatch ? blockMatch[1] : ''
    if (ifMap[ifName]) continue
    ifMap[ifName] = /^\s*shutdown\s*$/m.test(block) ? 'Down' : 'UP'
  }
  return ifMap
}

function parseInterfaceSummary(text) {
  const statusMap = parseInterfaceInfoLog(text)
  const rows = mergeInterfaceToTable(statusMap)
  // 补充 display interface 中未覆盖但从配置中解析到的接口
  const ifConfigMap = parseConfigIfBlocks(text)
  for (const [ifName, portStatus] of Object.entries(ifConfigMap)) {
    if (!rows.find(r => r.interfaceName === ifName)) {
      rows.push({ interfaceName: ifName, vrf: '-', isisCost: '-', ipv4: '-', ipv6: '-', opticalPower: '-', bandwidthUtil: '-', mtuL1L2: '-', interfaceRate: '-', moduleType: '-', moduleDistance: '-', mtu: '-', srv6Sid: '-', packetLossRate: '-', crc: '-', portStatus, description: '-', ethTrunk: '-' })
    }
  }
  return rows
}


// ===== 3. 各协议需要对比的字段定义 =====
const bgpCompareFields = ['sessionState', 'sessionDuration', 'routesReceived', 'routesSent', 'remoteAs', 'group', 'addressFamily']
const ldpCompareFields = ['status', 'lam', 'ssnRole', 'ssnAge']
const ldpPeerCompareFields = ['transportAddress', 'discoveryInterfaces']
const interfaceCompareFields = ['interfaceName','vrf','isisCost','ipv4','ipv6','opticalPower','bandwidthUtil','mtuL1L2','interfaceRate','moduleType','moduleDistance','mtu','srv6Sid','packetLossRate','crc','portStatus','ethTrunk']
// LLDP 邻居对比：以本端接口为基准；超时秒数（Exptime）为动态值不参与差异判定，仅比对"对端设备/对端接口"是否变化
const lldpCompareFields = ['neighborDev', 'neighborIntf']


// ===== 4. 核心对比方法（暴露出去） =====
export function runComparePure(beforeText, afterText, options = {}) {
  // 比对忽略规则：比较前对字段值做归一化（展示仍用原值）
  const toStr = (v) => Array.isArray(v) ? v.join('<br>') : (v == null ? '' : String(v))
  // 展示用：数组字段用逗号分隔（与 formatVal 一致），避免屏幕/导出出现 <br> 字面符号
  const dispStr = (v) => Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v))
  const normVal = (v) => {
    let s = toStr(v)
    if (options.ignoreWhitespace) s = s.replace(/\s+/g, ' ').trim()
    if (options.ignoreCase) s = s.toLowerCase()
    if (options.ignoreOrder) s = s.split(/[,\s;|]+/).filter(Boolean).sort().join(',')
    return s
  }

  // ---- 1. BGP ----
  const bgpBefore = mergeBgpPeers(parseBgpSummary(beforeText), parseBgpVpnPeerSummary(beforeText))
  const bgpAfter = mergeBgpPeers(parseBgpSummary(afterText), parseBgpVpnPeerSummary(afterText))
  // verbose 数据用于补充 routesSent（Advertised total routes）
  const beforeVerbose = parseBgpVpnPeerVerboseLog(beforeText)
  const afterVerbose = parseBgpVpnPeerVerboseLog(afterText)
  // 将 verbose 的 routesSent 合入 peer 列表（优先用 Advertised total routes）
  const mergeVerboseIntoPeers = (peers, verboseMap) => {
    peers.forEach(p => {
      const vKey = `${p.neighborIp}|${p.protocolFamily}|${p.addressFamily || '-'}`
      const vData = verboseMap[vKey]
      if (vData) {
        if (vData.routesSent !== undefined && vData.routesSent !== 0) {
          p.routesSent = vData.routesSent
        }
        if (vData.routesReceivedVerbose !== undefined && (p.routesReceived === 0 || p.routesReceived === null)) {
          p.routesReceived = vData.routesReceivedVerbose
        }
      }
    })
  }
  mergeVerboseIntoPeers(bgpBefore, beforeVerbose)
  mergeVerboseIntoPeers(bgpAfter, afterVerbose)
  const bgpFinal = []
  const bgpAfterMap = new Map(); bgpAfter.forEach(item => { bgpAfterMap.set(`${item.neighborIp}|${item.protocolFamily}|${item.addressFamily || '-'}`, item) })
  for (const beforeItem of bgpBefore) {
    const uniqueKey = `${beforeItem.neighborIp}|${beforeItem.protocolFamily}|${beforeItem.addressFamily || '-'}`; const afterItem = bgpAfterMap.get(uniqueKey)
    if (afterItem) {
      const bg = extractGroupFromConfig(beforeText, beforeItem.neighborIp); if (bg !== '-') beforeItem.group = bg
      const ag = extractGroupFromConfig(afterText, afterItem.neighborIp); if (ag !== '-') afterItem.group = ag
      const diffFields = []; bgpCompareFields.forEach(f => { if (normVal(beforeItem[f]) !== normVal(afterItem[f])) diffFields.push({ field: f, beforeVal: beforeItem[f] != null ? String(beforeItem[f]) : '-', afterVal: afterItem[f] != null ? String(afterItem[f]) : '-' }) })
      bgpFinal.push({ ...afterItem, isConsistent: diffFields.length === 0, configDiffFields: diffFields }); bgpAfterMap.delete(uniqueKey)
    } else {
      const bg = extractGroupFromConfig(beforeText, beforeItem.neighborIp); if (bg !== '-') beforeItem.group = bg
      const diffFields = []; bgpCompareFields.forEach(f => { const bVal = beforeItem[f]; if (bVal != null && String(bVal) !== '') diffFields.push({ field: f, beforeVal: String(bVal), afterVal: '-' }) })
      bgpFinal.push({ ...beforeItem, sessionState: '已失效', isConsistent: false, configDiffFields: diffFields })
    }
  }
  for (const [, afterItem] of bgpAfterMap) {
    const ag = extractGroupFromConfig(afterText, afterItem.neighborIp); if (ag !== '-') afterItem.group = ag
    const diffFields = []; bgpCompareFields.forEach(f => { const aVal = afterItem[f]; if (aVal != null && String(aVal) !== '') diffFields.push({ field: f, beforeVal: '-', afterVal: String(aVal) }) })
    bgpFinal.push({ ...afterItem, sessionState: '新增邻居', isConsistent: false, configDiffFields: diffFields })
  }

  // ---- 2. ISIS ----
  const isisBefore = parseIsisSummary(beforeText); const isisAfter = parseIsisSummary(afterText); const isisFinal = []
  // 先用 endXSid 建索引
  const isisAfterMap = new Map()
  const isisAfterByName = new Map()
  isisAfter.forEach(item => {
    if (item.endXSid && item.endXSid !== '') isisAfterMap.set(item.endXSid, item)
    // 同时用 systemId|interface 作为 fallback
    const nameKey = `${item.systemId}|${item.interface}`
    isisAfterByName.set(nameKey, item)
  })
  const isisCompareFields = ['interface','state','holdTime','type','uptime','adjProtocol','endXSid']
  for (const beforeItem of isisBefore) {
    let afterItem = isisAfterMap.get(beforeItem.endXSid)
    if (!afterItem) {
      const nameKey = `${beforeItem.systemId}|${beforeItem.interface}`
      afterItem = isisAfterByName.get(nameKey)
    }
    if (afterItem) { const diffFields = []; isisCompareFields.forEach(f => { if (normVal(beforeItem[f]) !== normVal(afterItem[f])) diffFields.push({ field: f, beforeVal: String(beforeItem[f]||'-'), afterVal: String(afterItem[f]||'-') }) }); isisFinal.push({ ...afterItem, isConsistent: diffFields.length === 0, configDiffFields: diffFields }); isisAfterMap.delete(afterItem.endXSid); isisAfterByName.delete(`${afterItem.systemId}|${afterItem.interface}`) }
    else { const diffFields = []; isisCompareFields.forEach(f => { diffFields.push({ field: f, beforeVal: String(beforeItem[f]||'-'), afterVal: '已失效' }) }); isisFinal.push({ ...beforeItem, state: '已失效', isConsistent: false, configDiffFields: diffFields }) }
  }
  for (const [, afterItem] of isisAfterMap) { const diffFields = []; isisCompareFields.forEach(f => { diffFields.push({ field: f, beforeVal: '-', afterVal: String(afterItem[f]||'-') }) }); isisFinal.push({ ...afterItem, state: '新增邻居', isConsistent: false, configDiffFields: diffFields }) }

  // ---- 3. LDP ----
  const ldpBefore = parseLdpSummary(beforeText); const ldpAfter = parseLdpSummary(afterText); const ldpFinal = []
  const ldpAfterMap = new Map(ldpAfter.map(item => [item.peerId, item]))
  for (const beforeItem of ldpBefore) {
    const afterItem = ldpAfterMap.get(beforeItem.peerId)
    if (afterItem) { const diffFields = []; ldpCompareFields.forEach(f => { if (normVal(beforeItem[f]) !== normVal(afterItem[f])) diffFields.push({ field: f, beforeVal: String(beforeItem[f]||'-'), afterVal: String(afterItem[f]||'-') }) }); ldpFinal.push({ ...afterItem, isConsistent: diffFields.length === 0, configDiffFields: diffFields }); ldpAfterMap.delete(beforeItem.peerId) }
    else { ldpFinal.push({ ...beforeItem, status: '已失效', isConsistent: false, configDiffFields: [{ field: 'status', beforeVal: String(beforeItem.status||'-'), afterVal: '已失效' }] }) }
  }
  for (const [, afterItem] of ldpAfterMap) ldpFinal.push({ ...afterItem, status: '新增邻居', isConsistent: false, configDiffFields: [{ field: 'status', beforeVal: '-', afterVal: String(afterItem.status||'-') }] })

  // ---- 4. LDP Peer ----
  const ldpPeerBefore = parseLdpPeerSummary(beforeText); const ldpPeerAfter = parseLdpPeerSummary(afterText); const ldpPeerFinal = []
  const ldpPeerAfterMap = new Map(ldpPeerAfter.map(item => [item.peerId, item]))
  for (const beforeItem of ldpPeerBefore) {
    const afterItem = ldpPeerAfterMap.get(beforeItem.peerId)
    if (afterItem) { const diffFields = []; ldpPeerCompareFields.forEach(f => { const bStr=normVal(beforeItem[f]),aStr=normVal(afterItem[f]); if(bStr!==aStr)diffFields.push({field:f,beforeVal:dispStr(beforeItem[f])||'-',afterVal:dispStr(afterItem[f])||'-'}) }); ldpPeerFinal.push({ ...afterItem, state: diffFields.length ? '变更' : '正常', isConsistent: diffFields.length === 0, configDiffFields: diffFields }); ldpPeerAfterMap.delete(beforeItem.peerId) }
    else { ldpPeerFinal.push({ ...beforeItem, state: '已失效', isConsistent: false, configDiffFields: [{ field: 'transportAddress', beforeVal: String(beforeItem.transportAddress||'-'), afterVal: '已失效' }] }) }
  }
  for (const [, afterItem] of ldpPeerAfterMap) ldpPeerFinal.push({ ...afterItem, state: '新增邻居', isConsistent: false, configDiffFields: [{ field: 'transportAddress', beforeVal: '-', afterVal: String(afterItem.transportAddress||'-') }] })

  // ---- 4.5 LLDP 邻居 ----
  // 多级匹配，解决割接中端口重编号导致的误判：
  //   1) 主匹配键 (neighborDev|neighborIntf)：对端身份(设备+对端端口)未变 → 变更/正常(本端端口可能搬迁)
  //   2) 次匹配键 (neighborDev|localIntf)：仅对端端口变、本端端口未变
  //   3) 三级(横联双端变更)：同一对端设备下，本端端口与对端端口都重编号 →
  //      按本端端口排序位置配对，整体判为"变更(端口整体重编号)"，避免误报 已失效+新增
  const lldpBefore = parseLldpNeighborBrief(beforeText)
  const lldpAfter = parseLldpNeighborBrief(afterText)
  const lldpFinal = []

  const devOf = (i) => String(i.neighborDev || '').trim().toLowerCase()
  const rk = (i) => `${devOf(i)}|${String(i.neighborIntf || '').trim().toLowerCase()}`
  const lk = (i) => `${devOf(i)}|${String(i.localIntf || '').trim().toLowerCase()}`
  const afterByRemote = new Map(lldpAfter.map(item => [rk(item), item]))
  const afterByLocal = new Map(lldpAfter.map(item => [lk(item), item]))
  const usedAfter = new Set()

  const makeLldpPair = (b, a) => {
    const oldIntf = String(b.localIntf || '-')
    const newIntf = String(a.localIntf || '-')
    const diffFields = []
    // 本端/对端端口任一重编号都记为差异(端口搬迁)；对端设备是匹配锚点，必然一致
    if (normVal(oldIntf) !== normVal(newIntf)) diffFields.push({ field: 'localIntf', beforeVal: oldIntf, afterVal: newIntf })
    if (normVal(b.neighborIntf) !== normVal(a.neighborIntf)) diffFields.push({ field: 'neighborIntf', beforeVal: String(b.neighborIntf || '-'), afterVal: String(a.neighborIntf || '-') })
    const state = diffFields.length ? '变更' : '正常'
    // localIntf 列显示"原接口"(变更前本端端口)，newLocalIntf 列显示"新接口"(变更后本端端口)
    return { ...a, localIntf: oldIntf, newLocalIntf: newIntf, state, isConsistent: diffFields.length === 0, configDiffFields: diffFields }
  }

  // 1) 主匹配：对端设备 + 对端接口
  for (const b of lldpBefore) {
    const a = afterByRemote.get(rk(b))
    if (a && !usedAfter.has(a)) { lldpFinal.push(makeLldpPair(b, a)); usedAfter.add(a) }
  }
  // 2) 次匹配：仅对端端口变(本端端口未变)
  for (const b of lldpBefore) {
    const a = afterByLocal.get(lk(b))
    if (a && !usedAfter.has(a) && normVal(b.neighborIntf) !== normVal(a.neighborIntf)) { lldpFinal.push(makeLldpPair(b, a)); usedAfter.add(a) }
  }
  // 3) 三级：本端 & 对端端口都变(横联双端变更) → 同对端设备下按本端端口排序配对
  const restB = lldpBefore.filter(b => { const a1 = afterByRemote.get(rk(b)); const a2 = afterByLocal.get(lk(b)); return !(a1 && usedAfter.has(a1)) && !(a2 && usedAfter.has(a2)) })
  const restA = lldpAfter.filter(a => !usedAfter.has(a))
  const gb = {}, ga = {}
  for (const b of restB) (gb[devOf(b)] ||= []).push(b)
  for (const a of restA) (ga[devOf(a)] ||= []).push(a)
  for (const dev of new Set([...Object.keys(gb), ...Object.keys(ga)])) {
    const bList = (gb[dev] || []).slice().sort((x, y) => String(x.localIntf).localeCompare(String(y.localIntf)))
    const aList = (ga[dev] || []).slice().sort((x, y) => String(x.localIntf).localeCompare(String(y.localIntf)))
    const n = Math.min(bList.length, aList.length)
    for (let i = 0; i < n; i++) lldpFinal.push(makeLldpPair(bList[i], aList[i]))
    for (let i = n; i < bList.length; i++) lldpFinal.push({ ...bList[i], newLocalIntf: '-', state: '已失效', isConsistent: false, configDiffFields: [{ field: 'neighborDev', beforeVal: String(bList[i].neighborDev || '-'), afterVal: '已失效' }] })
    for (let i = n; i < aList.length; i++) lldpFinal.push({ ...aList[i], localIntf: '-', newLocalIntf: String(aList[i].localIntf || '-'), state: '新增邻居', isConsistent: false, configDiffFields: [{ field: 'neighborDev', beforeVal: '-', afterVal: String(aList[i].neighborDev || '-') }] })
  }

  // ---- 5. SRv6 SID ----
  const srv6Before = parseSrv6SidSummary(beforeText); const srv6After = parseSrv6SidSummary(afterText); const srv6Final = []
  const srv6AfterMap = new Map(srv6After.map(item => [item.sid, item]))
  for (const beforeItem of srv6Before) {
    const afterItem = srv6AfterMap.get(beforeItem.sid)
    if (afterItem) { const diffFields = []; ['funcType','locatorName','locatorId'].forEach(f => { if(normVal(beforeItem[f])!==normVal(afterItem[f]))diffFields.push({field:f,beforeVal:String(beforeItem[f]||'-'),afterVal:String(afterItem[f]||'-')}) }); srv6Final.push({ ...afterItem, isConsistent: diffFields.length === 0, configDiffFields: diffFields }); srv6AfterMap.delete(beforeItem.sid) }
    else { srv6Final.push({ ...beforeItem, funcType: '已失效', isConsistent: false, configDiffFields: [{ field: 'funcType', beforeVal: String(beforeItem.funcType||'-'), afterVal: '已失效' }] }) }
  }
  for (const [, afterItem] of srv6AfterMap) srv6Final.push({ ...afterItem, funcType: '新增SID', isConsistent: false, configDiffFields: [{ field: 'funcType', beforeVal: '-', afterVal: String(afterItem.funcType||'-') }] })

  // ---- 5.5 SRv6 TE Policy ----
  const teBefore = parseSrv6TePolicySummary(beforeText); const teAfter = parseSrv6TePolicySummary(afterText); const teFinal = []
  const teAfterMap = new Map(teAfter.map(item => [item.policyName, item]))
  const teCompareFields = ['color','endpoint','tunnelId','policyState','stateChangeTime','bindingSid','candidatePathCount']
  for (const beforeItem of teBefore) {
    const afterItem = teAfterMap.get(beforeItem.policyName)
    if (afterItem) {
      const diffFields = []
      teCompareFields.forEach(f => { if (normVal(beforeItem[f]) !== normVal(afterItem[f])) diffFields.push({ field: f, beforeVal: String(beforeItem[f]||'-'), afterVal: String(afterItem[f]||'-') }) })
      teFinal.push({ ...afterItem, isConsistent: diffFields.length === 0, configDiffFields: diffFields })
      teAfterMap.delete(beforeItem.policyName)
    } else {
      teFinal.push({ ...beforeItem, policyState: '已失效', isConsistent: false, configDiffFields: [{ field: 'policyState', beforeVal: String(beforeItem.policyState||'-'), afterVal: '已失效' }] })
    }
  }
  for (const [, afterItem] of teAfterMap) teFinal.push({ ...afterItem, policyState: '新增策略', isConsistent: false, configDiffFields: [{ field: 'policyState', beforeVal: '-', afterVal: String(afterItem.policyState||'-') }] })

  // ---- 5.6 IPV4路由表 ----
  const routingStatBefore = parseRoutingStatSummary(beforeText); const routingStatAfter = parseRoutingStatSummary(afterText); const routingStatFinal = []
  const rsAfterMap = new Map(routingStatAfter.map(item => [item.proto, item]))
  for (const beforeItem of routingStatBefore) {
    const afterItem = rsAfterMap.get(beforeItem.proto)
    if (afterItem) {
      const diffFields = []
      // 仅对比 total / active；added/deleted/freed 为累计增量，割接后必然很大，不参与判定
      const compareField = (f) => {
        if (normVal(beforeItem[f]) !== normVal(afterItem[f])) {
          diffFields.push({ field: f, beforeVal: String(beforeItem[f] || '-'), afterVal: String(afterItem[f] || '-') })
        }
      }
      compareField('total')
      compareField('active')
      const state = diffFields.length === 0 ? '正常' : '变更'
      routingStatFinal.push({ ...afterItem, state, isConsistent: diffFields.length === 0, configDiffFields: diffFields })
      rsAfterMap.delete(beforeItem.proto)
    } else {
      routingStatFinal.push({ ...beforeItem, state: '已失效', isConsistent: false, configDiffFields: [{ field: 'total', beforeVal: String(beforeItem.total || '-'), afterVal: '已失效' }] })
    }
  }
  for (const [, afterItem] of rsAfterMap) routingStatFinal.push({ ...afterItem, state: '新增协议', isConsistent: false, configDiffFields: [{ field: 'total', beforeVal: '-', afterVal: String(afterItem.total || '-') }] })

  // ---- 6. Interface ----
  const interfaceBefore = parseInterfaceSummary(beforeText); const interfaceAfter = parseInterfaceSummary(afterText)
  const beforeCostMap = parseConfigForIsisCost(beforeText), afterCostMap = parseConfigForIsisCost(afterText)
  const beforeIpMap = parseConfigForIpAddress(beforeText), afterIpMap = parseConfigForIpAddress(afterText)
  const beforeDescMap = parseConfigForDescription(beforeText), afterDescMap = parseConfigForDescription(afterText)
  const beforeBriefMap = parseInterfaceBrief(beforeText), afterBriefMap = parseInterfaceBrief(afterText)
  const normIf = n => n.replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
  const beforeVrfMap = parseConfigForVrf(beforeText), afterVrfMap = parseConfigForVrf(afterText)
  interfaceAfter.forEach(item => { item.ipv4 = (afterIpMap[item.interfaceName]?.ipv4)||'-'; item.ipv6 = (afterIpMap[item.interfaceName]?.ipv6)||'-'; if (afterDescMap[item.interfaceName]) item.description = afterDescMap[item.interfaceName]; const ab = afterBriefMap[item.interfaceName] ? item.interfaceName : (afterBriefMap[normIf(item.interfaceName)] ? normIf(item.interfaceName) : null); if (ab) item.bandwidthUtil = afterBriefMap[ab]; if (afterVrfMap[item.interfaceName]) item.vrf = afterVrfMap[item.interfaceName] })
  interfaceBefore.forEach(item => { item.ipv4 = (beforeIpMap[item.interfaceName]?.ipv4)||'-'; item.ipv6 = (beforeIpMap[item.interfaceName]?.ipv6)||'-'; if (beforeDescMap[item.interfaceName]) item.description = beforeDescMap[item.interfaceName]; const bb = beforeBriefMap[item.interfaceName] ? item.interfaceName : (beforeBriefMap[normIf(item.interfaceName)] ? normIf(item.interfaceName) : null); if (bb) item.bandwidthUtil = beforeBriefMap[bb]; if (beforeVrfMap[item.interfaceName]) item.vrf = beforeVrfMap[item.interfaceName] })

  // 归属聚合接口(ethTrunk)：配置态 trunk 成员映射反查回填（覆盖 name/ip/desc 所有配对分支及未配对端口）
  const beforeTrunkMap = parseConfigForEthTrunkMembers(beforeText)
  const afterTrunkMap = parseConfigForEthTrunkMembers(afterText)
  const fillEthTrunk = (item, trunkMap) => {
    if (!item || (item.ethTrunk && item.ethTrunk !== '-')) return
    for (const [t, members] of Object.entries(trunkMap)) {
      if (Array.isArray(members) && members.includes(item.interfaceName)) { item.ethTrunk = t; return }
    }
  }
  interfaceBefore.forEach(item => fillEthTrunk(item, beforeTrunkMap))
  interfaceAfter.forEach(item => fillEthTrunk(item, afterTrunkMap))
  // ===== 接口名规范化 =====
  const normalizeIfName = (name) => {
    if (!name) return ''
    const clean = name.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const prefixMap = {
      'gigabitethernet': 'GE', 'ge': 'GE', 'gi': 'GE',
      'xgigabitethernet': 'XGE', 'xge': 'XGE', 'te': 'XGE',
      '40gigabitethernet': '40GE', '40ge': '40GE',
      '100gigabitethernet': '100GE', '100ge': '100GE',
      'eth-trunk': 'Eth-Trunk', 'eth_trunk': 'Eth-Trunk',
      'loopback': 'LoopBack', 'lo': 'LoopBack',
      'null': 'NULL',
      'vlanif': 'Vlanif',
      'tunnel': 'Tunnel',
      'serial': 'Serial',
      'pos': 'POS',
      'atm': 'ATM',
    }
    const m = clean.match(/^([a-zA-Z\-_]+)(\d+.*)$/)
    if (m) {
      const rawPrefix = m[1].toLowerCase()
      const normalized = prefixMap[rawPrefix] || m[1]
      return `${normalized}${m[2]}`
    }
    return clean
  }

  const getIfType = (name) => {
    const norm = normalizeIfName(name)
    // 剥离前导速率数字（100GE / 40GE / 25GE / 10GE / 50GE），仅保留类型字母部分；
    // 数字开头时原正则 ^[a-zA-Z\-_]+ 无法匹配，会误把完整接口名当作类型导致比较失败
    const m = norm.match(/^(\d+)?([a-zA-Z\-_]+)/)
    return m ? m[2] : norm
  }

  const interfaceFinal = [], afterMapByIp = new Map(), afterMapByDesc = new Map(), afterMapByName = new Map()
  interfaceAfter.forEach(item => {
    const cleanName = item.interfaceName.replace(/\s*\([^)]*\)\s*$/, '')
    const normName = normalizeIfName(cleanName)
    // afterMapByIp 改为多值索引：同一 IP 可能对应多个端口（如旧口 shutdown 但保留 IP + 新口 active 同 IP）。
    const pushIp = (ip) => {
      if (!ip || ip === '-') return
      if (!afterMapByIp.has(ip)) afterMapByIp.set(ip, [])
      afterMapByIp.get(ip).push(item)
    }
    pushIp(item.ipv4)
    pushIp(item.ipv6)
    // 注意：不再排除带 IP 的端口。真实网络中 EBGP 等端口往往「既有 IP 又有 description」，
    // 若只把无 IP 端口放入 desc 索引，则按描述找活跃接替口时会漏掉这些端口，导致旧 shutdown 口被误配。
    if (item.description && item.description !== '-') {
      if (!afterMapByDesc.has(item.description)) afterMapByDesc.set(item.description, [])
      afterMapByDesc.get(item.description).push(item)
    }
    afterMapByName.set(normName, item)
  })

  // 提取子接口 VLAN ID（如 Eth-Trunk4.814 的 dotId = "814"）
  const getDotId = (name) => {
    const m = name.match(/\.\d+$/)
    return m ? m[0].slice(1) : null
  }

  // 端口是否处于 UP 状态（仅 'up' 视为在用，*Down / down 视为未使用）
  const isUp = (item) => {
    const s = (item && item.portStatus || '').toString().trim().toLowerCase()
    return s === 'up'
  }

  // 按 IP 在变更后端口中寻找最佳配对
  // afterMapByIp 是多值索引（IP -> 端口数组），因此需遍历所有同 IP 候选。
  // 当变更后存在多个同 IP 端口（如旧口 shutdown 但保留 IP + 新口 active 同 IP）时，
  // 优先选择 UP 端口（仅当变更前端口本身为 UP 时优先）。
  // exclude：当存在「同名 shutdown 旧口」(nameFallback) 时传入，避免 IP 配对把已关停的旧口当成结果，
  // 从而让后续 desc/trunk 配对有机会找到真正的活跃接替口。
  const findIpMatch = (beforeItem, exclude) => {
    const preferUp = isUp(beforeItem)
    const consider = (ipVal) => {
      if (!ipVal || ipVal === '-') return null
      const base = ipVal.split('/')[0]
      const beforeDotId = getDotId(beforeItem.interfaceName)
      let best = null, bestUp = null
      const check = (v) => {
        if (matchedAfterKeys.has(v.interfaceName)) return
        if (exclude && v.interfaceName === exclude.interfaceName) return
        if (getIfType(v.interfaceName) !== getIfType(beforeItem.interfaceName)) return
        if (beforeDotId !== null && getDotId(v.interfaceName) !== beforeDotId) return
        if (!best) best = v
        if (isUp(v) && !bestUp) bestUp = v
      }
      const exactList = afterMapByIp.get(ipVal) || []
      exactList.forEach(check)
      for (const [k, arr] of afterMapByIp.entries()) {
        if (k.split('/')[0] === base) arr.forEach(check)
      }
      return preferUp ? (bestUp || best) : best
    }
    return consider(beforeItem.ipv4) || consider(beforeItem.ipv6)
  }

  const matchedAfterKeys = new Set()
  const usedBeforeNames = new Set()
  const ifPriority = (options.interfaceMatchPriority && options.interfaceMatchPriority.length)
    ? options.interfaceMatchPriority
    : ['name', 'ip', 'desc']

  for (const beforeItem of interfaceBefore) {
    const normBefore = normalizeIfName(beforeItem.interfaceName.replace(/\s*\([^)]*\)\s*$/, ''))
    let afterItem = null

    let nameFallback = null // 同名 shutdown 旧口，作为最后回退
    if (!afterItem) for (const strat of ifPriority) {
      if (strat === 'name') {
        const nameCandidate = afterMapByName.get(normBefore)
        if (nameCandidate && !matchedAfterKeys.has(nameCandidate.interfaceName)) {
          // ★ 修复：变更前端口为 UP，但按名称匹配到的变更后端口被 shutdown(*Down / down)，
          // 不把 name 当最终结果，而是作为 fallback 继续尝试 ip/desc 找活跃口。
          // 这样可避免「shutdown 旧口误配 + 活跃新口被当新增」。
          if (isUp(beforeItem) && !isUp(nameCandidate)) {
            nameFallback = nameCandidate
          } else {
            afterItem = nameCandidate
            break
          }
        }
      } else if (strat === 'ip') {
        const ipCandidate = findIpMatch(beforeItem, nameFallback)
        if (ipCandidate) { afterItem = ipCandidate; break }
      } else if (strat === 'desc') {
        // 允许「同名口是 shutdown 旧口(nameFallback 存在)」时继续按描述找活跃口
        if ((nameFallback || !afterMapByName.has(normBefore)) && beforeItem.description && beforeItem.description !== '-') {
          const candidates = afterMapByDesc.get(beforeItem.description) || []
          for (const candidate of candidates) {
            if (nameFallback && candidate.interfaceName === nameFallback.interfaceName) continue
            if (!matchedAfterKeys.has(candidate.interfaceName) && getIfType(candidate.interfaceName) === getIfType(beforeItem.interfaceName)) {
              // 若同名旧口已被 shutdown（nameFallback 存在），按描述找候选时应跳过其它非活跃口，优先保留 UP 活跃口
              if (nameFallback && !isUp(candidate)) continue
              afterItem = candidate
              break
            }
          }
          if (afterItem) break
        }
      }
    }

    // 按 Eth-Trunk 迁移兜底：当变更前端口属于某个 Trunk，
    // 且 name/ip/desc 找到的对应口不再属于该 Trunk（或没有找到对应口）时，
    // 尝试在变更后同 Trunk 中找同类型、UP 的端口作为迁移目标。
    // 覆盖「同一 Trunk 业务从成员口 A 换到成员口 B」的场景，避免显示成两个同名口属性变化。
    if (!afterItem || afterItem.ethTrunk !== beforeItem.ethTrunk) {
      if (beforeItem.ethTrunk && beforeItem.ethTrunk !== '-') {
        const trunkCands = interfaceAfter.filter(a =>
          a.ethTrunk === beforeItem.ethTrunk &&
          getIfType(a.interfaceName) === getIfType(beforeItem.interfaceName) &&
          (!nameFallback || a.interfaceName !== nameFallback.interfaceName) &&
          !matchedAfterKeys.has(a.interfaceName)
        )
        const upCand = trunkCands.find(c => isUp(c))
        if (upCand) {
          afterItem = upCand
        } else if (trunkCands.length && !afterItem) {
          afterItem = trunkCands[0]
        }
      }
    }

    // 没找到更合适的活跃口，回退到 shutdown 同名口
    if (!afterItem && nameFallback) {
      afterItem = nameFallback
    }

    if (afterItem) {
      matchedAfterKeys.add(afterItem.interfaceName)
      usedBeforeNames.add(beforeItem.interfaceName)
      // 若用 ip/desc 找到了活跃口，同时标记 shutdown 同名旧口已处理，避免后续生成「已关停」行
      if (nameFallback && afterItem.interfaceName !== nameFallback.interfaceName) {
        matchedAfterKeys.add(nameFallback.interfaceName)
      }
      beforeItem.isisCost = beforeCostMap[beforeItem.interfaceName] || '-'
      afterItem.isisCost = afterCostMap[afterItem.interfaceName] || '-'
      const diffFields = []
      interfaceCompareFields.forEach(f => {
        if (normVal(beforeItem[f]) !== normVal(afterItem[f])) {
          const diffObj = { field: f, beforeVal: String(beforeItem[f] || '-'), afterVal: String(afterItem[f] || '-') }
          if (f === 'opticalPower') diffObj.subDiffs = buildOpticalPowerSubDiffs(String(beforeItem[f] || '-'), String(afterItem[f] || '-'))
          diffFields.push(diffObj)
        }
      })
      interfaceFinal.push({ ...afterItem, beforeInterfaceName: beforeItem.interfaceName, afterInterfaceName: afterItem.interfaceName, interfaceName: `${beforeItem.interfaceName} vs ${afterItem.interfaceName}`, isConsistent: diffFields.length === 0, configDiffFields: diffFields })
    } else {
      // 隐藏「已删除」中变更前本身就是非活跃端口（down / *Down 等）的条目，避免过度告警
      if (!isUp(beforeItem)) continue
      beforeItem.isisCost = beforeCostMap[beforeItem.interfaceName] || '-'
      interfaceFinal.push({ ...beforeItem, beforeInterfaceName: beforeItem.interfaceName, afterInterfaceName: '已删除', interfaceName: `${beforeItem.interfaceName} vs 已删除`, portStatus: '已失效', isConsistent: false, configDiffFields: [{ field: 'portStatus', beforeVal: String(beforeItem.portStatus || '-'), afterVal: '已失效' }] })
    }
  }
  for (const [normName, afterItem] of afterMapByName) {
    if (!matchedAfterKeys.has(afterItem.interfaceName)) {
      // 如果 after 端口的名称在 before 中已存在（说明变更前该名称已按 IP 配对到其它活跃端口）
      if (interfaceBefore.some(b => b.interfaceName === afterItem.interfaceName)) {
        // ★ 修复：若当前变更后端口为 shutdown / down（被关停的旧口），单独标记为「已关停」，
        // 而不是静默丢弃或误判为新增端口
        // 全部隐藏「已关停」行（用户偏好）：变更后同名口被 shutdown 且无明确活跃接替口时不单独显示
        matchedAfterKeys.add(afterItem.interfaceName)
        continue
      }
      // 新增端口：端口状态为 shutdown / down 的非活跃口隐藏，UP 口正常显示
      if (!isUp(afterItem)) {
        matchedAfterKeys.add(afterItem.interfaceName)
        continue
      }
      matchedAfterKeys.add(afterItem.interfaceName)
      afterItem.isisCost = afterCostMap[afterItem.interfaceName] || '-'
      interfaceFinal.push({ ...afterItem, beforeInterfaceName: '新增端口', afterInterfaceName: afterItem.interfaceName, interfaceName: `新增端口 vs ${afterItem.interfaceName}`, portStatus: '新增端口', isConsistent: false, configDiffFields: [{ field: 'portStatus', beforeVal: '-', afterVal: String(afterItem.portStatus || '-') }] })
    }
  }

  // ---- 7. 返回纯结果（由调用方写回响应式 store） ----
  return {
    bgp: bgpFinal,
    isis: isisFinal,
    ldp: ldpFinal,
    ldpPeer: ldpPeerFinal,
    srv6: srv6Final,
    srv6TePolicy: teFinal,
    interface: interfaceFinal,
    routingStat: routingStatFinal,
    lldp: lldpFinal,
    counts: {
      bgpCount: bgpFinal.length,
      isisCount: isisFinal.length,
      ldpCount: ldpFinal.length,
      ldpPeerCount: ldpPeerFinal.length,
      srv6Count: srv6Final.length,
      srv6TePolicyCount: teFinal.length,
      interfaceCount: interfaceFinal.length,
      routingStatCount: routingStatFinal.length,
      lldpCount: lldpFinal.length
    }
  }
}

/** 单文件导入：只解析提取数据到表格，不做对比 */

/** 单文件导入：只解析提取数据到表格，不做对比 */
export function loadSinglePure(text) {
  const bgp = mergeBgpPeers(parseBgpSummary(text), parseBgpVpnPeerSummary(text)).map(i => ({ ...i, configDiffFields: [], isConsistent: null }))
  // 将 verbose 的 routesSent（Advertised total routes）合入
  const verboseMap = parseBgpVpnPeerVerboseLog(text)
  bgp.forEach(p => {
    const vKey = `${p.neighborIp}|${p.protocolFamily}|${p.addressFamily || '-'}`
    const vData = verboseMap[vKey]
    if (vData) {
      if (vData.routesSent !== undefined && vData.routesSent !== 0) p.routesSent = vData.routesSent
      if (vData.routesReceivedVerbose !== undefined && (p.routesReceived === 0 || p.routesReceived === null)) p.routesReceived = vData.routesReceivedVerbose
    }
  })
  const isis = parseIsisSummary(text).map(i => ({ ...i, configDiffFields: [], isConsistent: null }))
  const ldp = parseLdpSummary(text).map(i => ({ ...i, configDiffFields: [], isConsistent: null }))
  const ldpPeer = parseLdpPeerSummary(text).map(i => ({ ...i, configDiffFields: [], isConsistent: null }))
  const srv6 = parseSrv6SidSummary(text).map(i => ({ ...i, configDiffFields: [], isConsistent: null }))
  const srv6TePolicy = parseSrv6TePolicySummary(text).map(i => ({ ...i, configDiffFields: [], isConsistent: null }))
  const iface = parseInterfaceSummary(text).map(i => ({ ...i, configDiffFields: [], isConsistent: null }))
  const routingStat = parseRoutingStatSummary(text).map(i => ({ ...i, configDiffFields: [], isConsistent: null }))
  const lldp = parseLldpNeighborBrief(text).map(i => ({ ...i, configDiffFields: [], isConsistent: null }))
  const ifaceBrief = parseInterfaceBrief(text)
  const normIfLocal = n => n.replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
  iface.forEach(i => { const bk = ifaceBrief[i.interfaceName] ? i.interfaceName : (ifaceBrief[normIfLocal(i.interfaceName)] ? normIfLocal(i.interfaceName) : null); if (bk) i.bandwidthUtil = ifaceBrief[bk] })

  return {
    bgp,
    isis,
    ldp,
    ldpPeer,
    srv6,
    srv6TePolicy,
    interface: iface,
    routingStat,
    lldp,
    counts: {
      bgpCount: bgp.length,
      isisCount: isis.length,
      ldpCount: ldp.length,
      ldpPeerCount: ldpPeer.length,
      srv6Count: srv6.length,
      srv6TePolicyCount: srv6TePolicy.length,
      interfaceCount: iface.length,
      routingStatCount: routingStat.length,
      lldpCount: lldp.length
    }
  }
}

/**
 * 解析设备全局配置（非接口部分）：系统信息 + 管理服务 + 协议/资源统计。
 * 返回 [{ item, value }]，item 为中文标签，value 为解析值（未配置/未解析用 —）。
 */
export function parseGlobalConfig (text, vendor = '') {
  const rows = []
  const add = (item, value) => rows.push({ item, value })
  const t = String(text || '')
  let m

  // ===== 系统信息 =====
  const sys = t.match(/sysname\s+(\S+)/i)
  add('系统名称', sys ? sys[1] : '—')
  const model = vendor === 'h3c' ? t.match(/H3C\s+([\w\-]+)/i) : t.match(/HUAWEI\s+([\w\-]+)/i)
  add('设备型号', model ? model[1] : '—')
  const ver = t.match(/Version\s+(\S+)/i)
  add('软件版本', ver ? ver[1] : '—')
  const tz = t.match(/clock\s+timezone\s+(\S+)(?:\s+(.+))?/i)
  add('时区', tz ? (tz[1] + (tz[2] ? ' ' + tz[2] : '')) : '—')
  const domain = t.match(/^\s*dns\s+domain\s+(\S+)/im) || t.match(/^\s*domain\s+name\s+(\S+)/im)
  add('域名', domain ? domain[1] : '—')

  // ===== 管理服务 =====
  const ntpServers = []
  const ntpRe = /ntp-service\s+server\s+(\S+)/gi
  while ((m = ntpRe.exec(t)) !== null) ntpServers.push(m[1])
  if (!ntpServers.length) {
    const ntpRe2 = /^\s*ntp\s+server\s+(\S+)/gim
    while ((m = ntpRe2.exec(t)) !== null) ntpServers.push(m[1])
  }
  add('NTP 服务器', ntpServers.length ? ntpServers.join('、') : '未配置')

  const snmp = /^\s*snmp-agent\b/im.test(t)
  const snmpComm = []
  const commRe = /snmp-agent\s+community\s+(?:read|write)\s+(\S+)/gi
  while ((m = commRe.exec(t)) !== null) snmpComm.push(m[1])
  add('SNMP', snmp ? '已启用' + (snmpComm.length ? '（团体名 ' + snmpComm.join('、') + '）' : '') : '未配置')

  const ssh = /^\s*ssh\s+server\s+(?:enable|permit)/im.test(t)
  add('SSH 服务', ssh ? '已启用' : '未启用')
  const telnet = /^\s*telnet\s+server\s+enable/im.test(t)
  add('Telnet 服务', telnet ? '已启用' : '未启用')

  const dnsServers = []
  const dnsRe = /^\s*dns\s+server\s+(\S+)/gim
  while ((m = dnsRe.exec(t)) !== null) dnsServers.push(m[1])
  add('DNS 服务器', dnsServers.length ? dnsServers.join('、') : '未配置')

  add('日志中心', /^\s*info-center\s+enable/im.test(t) ? '已启用' : '未配置')

  // ===== 协议 / 资源统计 =====
  const vlanIds = new Set()
  const vlanRe = /^vlan\s+(\d+)/gm
  while ((m = vlanRe.exec(t)) !== null) vlanIds.add(parseInt(m[1], 10))
  add('VLAN 数量', vlanIds.size ? String(vlanIds.size) : '—')
  const srCount = (t.match(/^\s*ip\s+route-static\b/gim) || []).length
  add('静态路由数', srCount ? String(srCount) : '—')
  const asn = t.match(/^\s*bgp\s+(\d+)/im) || t.match(/^\s*router\s+bgp\s+(\d+)/im)
  add('BGP AS 号', asn ? asn[1] : '—')
  const isisProcs = new Set()
  const isisRe = /^\s*isis\s+(\d+)/gm
  while ((m = isisRe.exec(t)) !== null) isisProcs.add(m[1])
  add('ISIS 进程数', isisProcs.size ? String(isisProcs.size) : '—')
  const locCount = (t.match(/^\s*locator\s+(\S+)/gim) || []).length
  add('SRv6 Locator', locCount ? String(locCount) : '—')
  const aclCount = (t.match(/^\s*acl\s+(?:number\s+)?(\d+)/gim) || []).length
  add('ACL 数量', aclCount ? String(aclCount) : '—')

  return rows
}

export function parseDeviceProtocolsPure(text, vendor, subtype) {
  const deviceInfo = parseDeviceInfo(text, vendor)

  // ---- BGP ----（原 DevicePage.loadDeviceProtocols 逻辑）
  let bgp = []
  if (/^bgp\s+\d+/im.test(text)) {
    const configMap = parseBgpConfigNeighbors(text)
    const statusMap = parseBgpStatusLog(text)
    const statusByIp = {}
    for (const k in statusMap) {
      const ip = k.split('|')[0]
      if (!statusByIp[ip]) statusByIp[ip] = statusMap[k]
    }
    bgp = Object.values(configMap).map(item => {
      const status = statusMap[`${item.neighborIp}|${item.addressFamily}`] || statusByIp[item.neighborIp]
      return {
        ...item,
        neighborState: status ? status.sessionState : '',
        sessionDuration: status ? status.sessionDuration : '',
        routesReceived: status ? status.routesReceived : null,
        routesSent: status ? status.routesSent : null,
        configDiffFields: [],
        isConsistent: null
      }
    })
  } else {
    const vpnPeers = Object.values(parseBgpVpnPeerLog(text)).map(item => ({ ...item, group: '-', neighborState: item.sessionState || '' }))
    bgp = mergeBgpPeers(parseBgpSummary(text), vpnPeers).map(i => ({ ...i, neighborState: i.neighborState || i.sessionState || '', configDiffFields: [], isConsistent: null }))
    const verboseMap = parseBgpVpnPeerVerboseLog(text)
    bgp.forEach(p => {
      const vKey = `${p.neighborIp}|${p.protocolFamily}|${p.addressFamily || '-'}`
      const vData = verboseMap[vKey]
      if (vData) {
        if (vData.routesSent !== undefined && vData.routesSent !== 0) p.routesSent = vData.routesSent
        if (vData.routesReceivedVerbose !== undefined && (p.routesReceived === 0 || p.routesReceived === null)) p.routesReceived = vData.routesReceivedVerbose
      }
    })
  }

  const ospf = mergeOspfPeerToTable(parseOspfPeerLog(text))
  const ospfStat = {
    total: ospf.length,
    v2: ospf.filter(p => p.addressFamily === 'OSPFv2').length,
    v3: ospf.filter(p => p.addressFamily === 'OSPFv3').length
  }
  const isis = mergeIsisStatusToTable(parseIsisStatusLog(text))
  const ldp = mergeLdpToTable(parseLdpSessionLog(text))
  const ldpPeer = mergeLdpPeerToTable(parseLdpPeerLog(text))
  const lldp = parseLldpNeighborBrief(text)
  const srv6 = mergeSrv6SidToTable(parseSrv6SidLog(text))
  const arp = mergeArpToTable(parseArpLog(text), text)
  const ipv6neigh = mergeIpv6NeighToTable(parseIpv6NeighLog(text), text)
  const srv6TePolicy = mergeSrv6TePolicyToTable(parseSrv6TePolicyLog(text))

  // BGP 邻居统计（按运行态 Total number 口径）
  const grabTotal = () => {
    const m = text.match(new RegExp('display\\s+bgp\\s+vpnv4\\s+all\\s+peer[\\s\\S]*?Total\\s+number\\s+of\\s+peers\\s*:\\s*(\\d+)', 'i'))
    const m6 = text.match(new RegExp('display\\s+bgp\\s+vpnv6\\s+all\\s+peer[\\s\\S]*?Total\\s+number\\s+of\\s+peers\\s*:\\s*(\\d+)', 'i'))
    return { vpnv4: m ? parseInt(m[1]) : null, vpnv6: m6 ? parseInt(m6[1]) : null }
  }
  const totals = grabTotal()
  const v4 = totals.vpnv4
  const v6 = totals.vpnv6
  const dualStack = (v4 != null && v6 != null) ? Math.max(0, v4 + v6 - bgp.length) : null
  const bgpStat = { total: bgp.length, vpnv4: v4, vpnv6: v6, dualStack }

  const routing = mergeRoutingStatToTable(parseRoutingStatLog(text))
  const globalConfig = parseGlobalConfig(text, vendor)

  return {
    deviceInfo,
    interfaces: deviceInfo.interfaces,
    bgp,
    ospf,
    isis,
    ldp,
    ldpPeer,
    lldp,
    srv6,
    arp,
    ipv6neigh,
    srv6TePolicy,
    routing,
    globalConfig,
    bgpStat,
    ospfStat
  }
}

export function parseLiveStatusPure(text) {
  if (!text) return { bgp: [], isis: [], iface: [], srv6: [], routing: [] }
  return {
    bgp: Object.values(bgpMod.parseBgpStatusLog(text)),
    isis: Object.values(isisMod.parseIsisStatusLog(text)),
    // 修正：先 parse 再 merge（此前把原始文本直接传给 merge，产生垃圾行）
    iface: ifaceMod.mergeInterfaceToTable(ifaceMod.parseInterfaceInfoLog(text)),
    srv6: srv6TePolicyMod.mergeSrv6TePolicyToTable(srv6TePolicyMod.parseSrv6TePolicyLog(text)),
    routing: routingStatMod.mergeRoutingStatToTable(routingStatMod.parseRoutingStatLog(text))
  }
}
export { parseBgpSummary }