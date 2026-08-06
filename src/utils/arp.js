// src/utils/arp.js
// ARP 表项解析：从运行态 `display arp all` / `display arp` 提取 ARP 表，
// 并关联配置块里 `arp static` 静态表项；同一 IP 以运行态表为准，
// 仅在运行态缺失时补充静态配置项。供设备采集页面（华为路由协议）展示与导出。
//
// IP 拆分逻辑（本端 / 对端）：
//   - 对端IP地址 = ARP 表项里的 IP ADDRESS。ARP 解析的永远是“远端主机”的 MAC，
//     因此该 IP 必然是“对端”IP，是表项的稳定身份。
//   - 本端IP地址 = ARP 表项 INTERFACE 列所指向的“本端接口”上配置的 IPv4 地址，
//     反查来源（buildLocalIpMap）：
//       ① display ip interface brief 的 `Interface  IP/Mask  ...` 三列表（最常见场景）
//       ② display current-configuration 里 `interface X` 块下的 `ip address A.B.C.D [mask|/n]`
//       ③ display interface 行内 `Internet Address is A.B.C.D/M`（由上一行接口标题确定归属）
//     接口名经 normIfKey 归一化后跨三种来源统一匹配；仅取 IP 本身（去掉掩码），
//     如 10.1.64.65，符合“本端IP”直觉。
import { ref } from 'vue'

// 接口名归一化：去掉 * 前缀与 (10G)/(100GE) 等速率后缀，并把类型前缀统一为短标记，
// 使运行态（GE1/0/1）与配置态（GigabitEthernet1/0/1）能映射到同一键。
export const normIfKey = (name) => {
  if (!name || name === '-') return ''
  let s = String(name).trim().toLowerCase()
  s = s.replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
  const rules = [
    [/^(ten-?gigabitethernet|10ge|xge)/, 'xge'],
    [/^gigabitethernet/, 'ge'],
    [/^ge/, 'ge'],
    [/^eth-trunk|^ethtrunk/, 'trunk'],
    [/^ethernet/, 'eth'],
    [/^eth(?!-trunk)/, 'eth'],
    [/^vlanif|^vlan-interface/, 'vlanif'],
    [/^loopback|^loop/, 'loop'],
    [/^null/, 'null'],
    [/^meth/, 'meth']
  ]
  for (const [re, rep] of rules) {
    if (re.test(s)) { s = s.replace(re, rep); break }
  }
  return s
}

// IP / MAC 合法性校验（模块级复用）
const ipRe = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const macRe = /^([0-9a-f]{4}-){2}[0-9a-f]{4}$/i

// 单条 ARP 表项行解析：以接口名为锚点定位列，兼容 TYPE 含空格（如 "I -"）与同行 VLAN/CEVLAN。
const parseArpRow = (t) => {
  const parts = t.split(/\s+/)
  if (parts.length < 2) return null
  const ip = parts[0]
  if (!ipRe.test(ip)) return null
  const mac = parts[1]
  if (!macRe.test(mac) && mac !== 'Incomplete' && mac !== '-') return null
  // 定位 INTERFACE：首个含 “/” 或已知接口前缀、且非 IP 的字段
  let ii = -1
  for (let k = 2; k < parts.length; k++) {
    const p = parts[k]
    if (ipRe.test(p)) continue
    if (/[\/]/.test(p) || /^(ten-?gig|10ge|xge|ge|gigabiteth|eth(-trunk)?|vlanif|vlan-?if|loop|null|meth|eth-trunk)/i.test(p)) { ii = k; break }
  }
  const mid = ii >= 0 ? parts.slice(2, ii) : parts.slice(2)
  let expire = '-', type = '-'
  const numIdx = mid.findIndex(x => /^\d+$/.test(x))
  if (numIdx >= 0) {
    expire = mid[numIdx]
    type = mid.slice(0, numIdx).concat(mid.slice(numIdx + 1)).filter(Boolean).join(' ') || '-'
  } else if (mid.length) {
    type = mid.join(' ')
  }
  if (type === '-' && mid.length) type = mid[0]
  let iface = '-', vpn = '-', vlanInline = '-'
  if (ii >= 0) {
    iface = parts[ii]
    vpn = parts[ii + 1] || '-'
    vlanInline = parts[ii + 2] || '-'
  }
  return { ip, mac, expire, type, iface, vpn, vlanInline }
}

// 从设备全文反查 接口 → 本端IPv4 映射。支持三类来源：
//   ① display current-configuration：interface X 块内的 `ip address A.B.C.D [mask|/n]`
//   ② display ip interface brief 表：`Interface  IP/Mask  Physical  Protocol` 三列表
//   ③ display interface：行内 `Internet Address is A.B.C.D/M`（接口上下文由标题行确定）
// 仅保留 IP 地址本身（去掉掩码），与用户对“本端IP”的直觉一致。
const buildLocalIpMap = (text) => {
  const map = {}
  if (!text) return map
  const lines = text.split('\n')
  let cur = null        // 来源①：配置态当前接口
  let lastIf = null     // 来源③：运行态当前接口（display interface 标题行）
  const setCur = (raw) => { const k = normIfKey(raw); if (k) map[k] = map[k] || '-'; return k }
  const knownPrefix = /^(ge|xge|ten|gigabit|eth|vlanif|vlan|loop|null|meth|trunk)/i
  for (const line of lines) {
    const t = line.trim()
    // 来源①：配置态 interface 块
    if (/^[<>[\]]/.test(t) || /^display/i.test(t) || /^return/i.test(t) || /^quit/i.test(t)) { cur = null; continue }
    if (/^[!#]/.test(t) || t === '') { cur = null; continue }
    const ifm = t.match(/^interface\s+(\S+)/i)
    if (ifm) { cur = setCur(ifm[1]); continue }
    if (cur) {
      const m = t.match(/^ip\s+address\s+([\d.]+)(?:\s+[\d.]+|\/(\d+))?/i)
      if (m) { map[cur] = m[1]; continue }
    }
    // 来源③：display interface 接口标题行（如 `GE15/1/18 current state : up` / `Interface GE15/1/18`）
    const titleM = t.match(/^(?:Interface\s+)?(\*?[\w/.-]+)\s+current state/i) || t.match(/^Interface\s+(\*?[\w/.-]+)/i)
    if (titleM) { lastIf = normIfKey(titleM[1]); continue }
    const inetM = t.match(/Internet Address is\s+((?:\d{1,3}\.){3}\d{1,3})(?:\/(\d+))?/i)
    if (inetM && lastIf) { map[lastIf] = inetM[1]; lastIf = null; continue }
    // 来源②：display ip interface brief 三列表
    const briefM = t.match(/^(\*?[\w/.-]+)\s+((?:\d{1,3}\.){3}\d{1,3})(?:\/(\d+))?/)
    if (briefM) {
      const ifName = briefM[1]
      // 过滤非接口行：接口名须含 “/” 或以已知类型前缀开头（排除 BGP/Peer/Interface 等表头等）
      if (!/[\/]/.test(ifName) && !knownPrefix.test(ifName)) continue
      map[normIfKey(ifName)] = briefM[2]
    }
  }
  return map
}

export function useArpModule() {
  const neighborList = ref([])

  const getDiffInfo = (row, field) => {
    if (!row || !row.configDiffFields) return null
    const diff = row.configDiffFields.find(d => d.field === field)
    return diff || null
  }

  const parseArpLog = (text) => {
    const entries = []
    if (!text) return entries
    const lines = text.split('\n')

    // 1) 解析 display arp / display arp all 运行态表
    let inTable = false
    for (const line of lines) {
      const t = line.trim()
      // 命中表头（IP ADDRESS + MAC ADDRESS）即进入表体；续表头行（VLAN/CEVLAN ...）跳过
      if (/^IP ADDRESS/.test(t) && /MAC ADDRESS/.test(t)) { inTable = true; continue }
      if (/^VLAN\/CEVLAN/i.test(t)) continue
      if (!inTable) continue
      if (/^----+/.test(t)) continue
      if (/^(Total|Display|^<)/i.test(t)) { inTable = false; continue }
      if (!t) continue
      // 续行：VLAN/CEVLAN 值（如 813/-、100/200），回填给最近同子接口的表项
      const vlanM = t.match(/^(\d+)\s*\/\s*(\S+)$/)
      if (vlanM) {
        if (entries.length) {
          const v = vlanM[1]
          const last = entries[entries.length - 1]
          if (!last.vlan || last.vlan === '-') last.vlan = v
          for (let k = entries.length - 2; k >= 0; k--) {
            const e = entries[k]
            if (e.vlan && e.vlan !== '-') break
            if (normIfKey(e.interface) === normIfKey(last.interface)) e.vlan = v
            else break
          }
        }
        continue
      }
      const row = parseArpRow(t)
      if (!row) continue
      entries.push({
        peerIp: row.ip,
        ipAddress: row.ip, // 兼容别名
        macAddress: row.mac,
        expire: row.expire,
        arpType: row.type,
        interface: row.iface,
        vpnInstance: row.vpn,
        vlan: row.vlanInline !== '-' ? row.vlanInline : '-',
        localIp: '-',
        configSource: 'running'
      })
    }

    // 2) 解析 arp static 配置块（display current-configuration 内），
    //    仅补充运行态表中缺失的静态表项
    const haveIp = new Set(entries.map(e => e.peerIp))
    let curVpn = '-'
    for (const line of lines) {
      const vpnM = line.match(/^ip vpn-instance\s+(\S+)/)
      if (vpnM) { curVpn = vpnM[1]; continue }
      if (/^#$/.test(line.trim())) { curVpn = '-'; continue }
      const sm = line.match(/^\s*arp\s+static\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\S+)(?:\s+(\d+)\s+(\S+))?/i)
      if (sm) {
        const ip = sm[1]
        if (haveIp.has(ip)) continue // 运行态已有，跳过
        entries.push({
          peerIp: ip,
          ipAddress: ip,
          macAddress: sm[2],
          expire: '-',
          arpType: 'S',
          interface: sm[4] || '-',
          vpnInstance: curVpn,
          vlan: '-',
          localIp: '-',
          configSource: 'static-config'
        })
      }
    }

    return entries
  }

  // entries: 解析出的 ARP 表项；text: 设备全文（用于反查本端接口 IP）
  const mergeArpToTable = (entries, text) => {
    const localIpMap = buildLocalIpMap(text)
    return entries.map(e => {
      // 兜底：若 VLAN 仍为空且接口是子接口（如 GE4/0/2.813），取子接口号作为 VLAN
      const dotM = e.interface && e.interface.match(/\.(\d+)$/)
      const vlan = (!e.vlan || e.vlan === '-') && dotM ? dotM[1] : (e.vlan || '-')
      return {
        _key: e.peerIp,
        ...e,
        vlan,
        localIp: (e.interface && e.interface !== '-' && localIpMap[normIfKey(e.interface)]) || '-',
        configDiffFields: [],
        isConsistent: null
      }
    })
  }

  const updateNeighbors = (newData) => {
    neighborList.value = newData
  }

  return {
    neighborList,
    getDiffInfo,
    updateNeighbors,
    parseArpLog,
    mergeArpToTable
  }
}
