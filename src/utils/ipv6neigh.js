// src/utils/ipv6neigh.js
// IPv6 邻居表解析：从运行态 `display ipv6 neighbors` 提取邻居表项
// （IPv6 地址 / MAC / 状态 / 接口 / 老化 / VLAN / VPN 等），并尝试反查
// 本端接口的 IPv6 地址（buildLocalIpv6Map），供设备采集页面（华为路由协议）
// 展示与导出。整体结构与 arp.js 对齐：本端IP地址 | 对端IP地址 | MAC | 状态 …
//
// 本端IPv6地址反查（buildLocalIpv6Map）支持三类来源，接口名经 normIfKey 归一化后匹配：
//   ① display current-configuration：interface X 块内的 `ipv6 address <addr>/<prefix>`（跳过 auto link-local）
//   ② display ipv6 interface 详细：标题接口行 + 行内 `IPv6 Address : <addr>/<prefix>`
//   ③ display ipv6 interface brief：接口状态行(前) + `[IPv6 Address] <addr>`(后) 交替
// 优先保存全球单播地址；若接口仅有链路本地 FE80:: 则保存之。
import { ref } from 'vue'
import { normIfKey } from './arp.js'

const buildLocalIpv6Map = (text) => {
  const map = {}
  if (!text) return map
  const lines = text.split('\n')
  let cur = null       // 配置态当前接口
  let lastIf = null    // 运行态 display ipv6 interface 标题接口
  let briefIf = null   // display ipv6 interface brief 的当前接口（接口行在前，地址行在后）
  const setMap = (k, addr) => {
    if (!k) return
    // 空位(-) 或 新地址非链路本地时写入；已有全球单播则不被 FE80 覆盖
    if (map[k] === '-' || !/^fe80:/i.test(addr)) map[k] = addr
  }
  const knownPrefix = /^(ge|xge|ten|gigabit|eth|vlanif|vlan|loop|null|meth|trunk)/i
  for (const line of lines) {
    const t = line.trim()
    // 配置态/命令边界：清空运行态与配置态上下文
    if (/^[<>[\]]/.test(t) || /^display/i.test(t) || /^return/i.test(t) || /^quit/i.test(t)) { cur = null; lastIf = null; briefIf = null; continue }
    if (/^[!#]/.test(t) || t === '') { cur = null; continue }
    const ifm = t.match(/^interface\s+(\S+)/i)
    if (ifm) { cur = normIfKey(ifm[1]); continue }
    if (cur) {
      const m = t.match(/^ipv6\s+address\s+([0-9A-Fa-f:]+)(?:\/(\d+))?/i)
      if (m && !/auto\s+link-local/i.test(t)) { setMap(cur, m[1]); continue }
    }
    // 来源②：display ipv6 interface 详细：接口标题行 + 行内 IPv6 Address
    const titleM = t.match(/^(?:Interface\s+)?(\*?[\w/.-]+)\s+current state/i) || t.match(/^Interface\s+(\*?[\w/.-]+)/i)
    if (titleM) { lastIf = normIfKey(titleM[1]); continue }
    const inetM = t.match(/IPv6 Address\s*:\s*([0-9A-Fa-f:]+)(?:\/(\d+))?/i)
    if (inetM && lastIf) { setMap(lastIf, inetM[1]); lastIf = null; continue }
    // 来源③：display ipv6 interface brief：`[IPv6 Address] <addr>` 在接口状态行之后
    const bM = t.match(/^\[IPv6 Address\]\s*([0-9A-Fa-f:]+)/i)
    if (bM) { if (briefIf) setMap(briefIf, bM[1]); continue }
    // 来源③前置：brief 接口状态行（接口名 物理态 协议态），置为当前接口
    const parts = t.split(/\s+/)
    if (parts.length >= 2 && (/^[\*]?(up|down)/i.test(parts[1]) || /down$/i.test(parts[1]))) {
      if (/[\/]/.test(parts[0]) || knownPrefix.test(parts[0])) {
        const k = normIfKey(parts[0])
        if (k) { map[k] = map[k] || '-'; briefIf = k }
        continue
      }
    }
  }
  return map
}

export function useIpv6NeighModule() {
  const neighborList = ref([])

  const getDiffInfo = (row, field) => {
    if (!row || !row.configDiffFields) return null
    const diff = row.configDiffFields.find(d => d.field === field)
    return diff || null
  }

  // 解析 display ipv6 neighbors 分段格式：
  //   IPv6 Address : <addr>
  //   Link-layer   : <mac>   State : <state>
  //   Interface    : <iface>  Age   : <age>
  //   VLAN         : <vlan>   CEVLAN: <cevlan>
  //   VPN name     : <vpn>    Is Router: <bool>
  //   Secure FLAG  : <flag>
  const parseIpv6NeighLog = (text) => {
    const entries = []
    if (!text) return entries
    const lines = text.split('\n')
    let started = false
    let cur = null
    for (const raw of lines) {
      const t = raw.trim()
      // 进入 display ipv6 neighbors 区域（注意排除 `display ipv6 neighbors brief` 等子命令，避免误重置）
      if (/^<.*>display ipv6 neighbors\s*$/i.test(t)) { started = true; cur = null; continue }
      if (!started) continue
      if (/^total\s*:/i.test(t)) { started = false; continue } // 结束（Total: 47 ...）
      if (/^--+/.test(t)) continue                              // 分隔线
      if (!t) continue
      const addrM = t.match(/^IPv6 Address\s*:\s*(\S+)/i)
      if (addrM) {
        const addr = addrM[1]
        if (!addr.includes(':')) continue // 非 IPv6 地址（如误匹配），跳过
        if (cur) entries.push(cur)
        cur = {
          ipv6Address: addr,
          macAddress: '-',
          state: '-',
          interface: '-',
          age: '-',
          vlan: '-',
          cevlan: '-',
          vpn: '-',
          isRouter: '-',
          secureFlag: '-'
        }
        continue
      }
      if (!cur) continue
      let m
      if ((m = t.match(/^Link-layer\s*:\s*([0-9a-fA-F-]+)\s+State\s*:\s*(\S+)/i))) { cur.macAddress = m[1]; cur.state = m[2]; continue }
      if ((m = t.match(/^Interface\s*:\s*(\S+)\s+Age\s*:\s*(\S+)/i))) { cur.interface = m[1]; cur.age = m[2]; continue }
      if ((m = t.match(/^VLAN\s*:\s*(\S+)\s+CEVLAN\s*:\s*(\S+)/i))) { cur.vlan = m[1]; cur.cevlan = m[2]; continue }
      if ((m = t.match(/^VPN name\s*:\s*(\S+)\s+Is Router\s*:\s*(\S+)/i))) { cur.vpn = m[1]; cur.isRouter = m[2]; continue }
      if ((m = t.match(/^Secure FLAG\s*:\s*(\S+)/i))) { cur.secureFlag = m[1]; continue }
    }
    if (cur) entries.push(cur)
    return entries
  }

  // entries: 解析出的 IPv6 邻居表项；text: 设备全文（用于反查本端接口 IPv6 地址）
  const mergeIpv6NeighToTable = (entries, text) => {
    const localMap = buildLocalIpv6Map(text)
    return entries.map(e => ({
      // 主键：IPv6 地址 + 接口（链路本地 FE80:: 会在多接口重复，需接口区分）
      _key: e.ipv6Address + '|' + e.interface,
      ...e,
      localIpv6: (e.interface && e.interface !== '-' && localMap[normIfKey(e.interface)]) || '-',
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
    parseIpv6NeighLog,
    mergeIpv6NeighToTable
  }
}
