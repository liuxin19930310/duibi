// src/bgp.js
import { ref, reactive, nextTick } from 'vue'
// 轻量提示：autoParseAndUpdate / handleFileChange 为历史遗留导出（当前无调用方），
// 不再引用消息组件（避免把 element-plus 拉进 Web Worker 或撑大主包），仅保留控制台提示。
function showMessage(kind, message) {
  try {
    if (kind === 'error') console.error('[parse]', message)
    else console.warn('[parse]', message)
  } catch (e) { /* ignore */ }
}


export function useBgpModule() {
  const neighborList = ref([])
  const searchText = ref('')
  const showTable = ref(false)
  const benchmarkMap = reactive({})
  const dialogVisible = ref(false)
  const currentRow = ref(null)
  const importDialog = ref(false)
  const beforeTextVal = ref('')
  const afterTextVal = ref('')

  const getDiffDisplay = (row, field) => {
    if (!row || !row.configDiffFields) return null
    const diff = row.configDiffFields.find(d => d.field === field)
    if (diff) {
      return `${diff.beforeVal} → ${diff.afterVal}`
    }
    return null
  }

  const getDiffInfo = (row, field) => {
    if (!row || !row.configDiffFields) return null
    const diff = row.configDiffFields.find(d => d.field === field)
    return diff || null
  }

  const stateTagType = (state) => {
    if (!state) return 'info'
    const stateCore = state.trim().split(/\s+/)[0].toLowerCase()
    if (stateCore === 'established') return 'success'
    if (stateCore === 'idle') return 'info'
    if (['active', 'connect', 'opensent', 'openconfirm'].includes(stateCore)) return 'warning'
    return 'danger'
  }

  // ★ 核心：增加 minWidth 宽度控制
  const detailFields = [
    { key: 'sessionState', label: '会话状态', minWidth: 100 },
    { key: 'routesReceived', label: '路由接收数量', minWidth: 120 },
    { key: 'routesSent', label: '路由发送数量', minWidth: 120 },
    { key: 'remoteAs', label: '邻居AS', minWidth: 100 },
    { key: 'sessionDuration', label: '会话时长', minWidth: 110 },
    { key: 'group', label: '对等体组', minWidth: 120 },
    { key: 'addressFamily', label: '地址族', minWidth: 130 }
  ]

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file.raw)
    })
  }

  /**
   * 解析 display current-configuration 中的 `bgp <as>` 进程配置块
   * 提取每个 peer 的配置信息（IP、AS、所属 VRF/地址族、会话类型、timer、substitute-as、
   * 认证、ebgp-max-hop、路由策略、BFD 等），用于配置解析页面
   */
  const parseBgpConfigNeighbors = (configText) => {
    const neighborMap = {}
    if (!configText) return neighborMap

    const lines = configText.split('\n').map(l => l.trim()).filter(l => l)
    let currentVrf = 'default'
    let currentAddressFamily = 'IPv4'
    let inBgpSection = false
    const groupMap = {} // groupName -> { internal, connectInterface }

    const ensureNeighbor = (ip) => {
      const normIp = ip.toLowerCase()
      let n = neighborMap[normIp]
      if (!n) {
        n = {
          neighborIp: ip,
          remoteAs: '',
          description: '',
          group: '',
          addressFamily: [],
          addressType: ip.includes(':') ? 'IPv6' : 'IPv4',
          protocolFamily: currentAddressFamily,
          sessionType: '',
          keepalive: '',
          hold: '',
          substituteAs: false,
          auth: false,
          ebgpMaxHop: '',
          bfd: false,
          routePolicyImport: '',
          routePolicyExport: '',
          sessionState: '待采集',
          neighborState: '',
          sessionDuration: '',
          routesReceived: null,
          routesSent: null,
          localInterface: ''
        }
        neighborMap[normIp] = n
      }
      // 收集该邻居出现过的所有地址族视图标识（vpn-instance 名 / vpnv4 / vpnv6 / unicast），
      // 以支持 ipv4-family vpnv4 / vpn-instance / unicast 多块共存时不分裂、归属完整。
      // 注意：全局上下文 'default' 不计入（它只代表"在 bgp 进程下全局定义"，本身不是地址族）
      if (currentVrf !== 'default' && !n.addressFamily.includes(currentVrf)) n.addressFamily.push(currentVrf)
      return n
    }

    for (const line of lines) {
      if (/^display\s+/i.test(line)) continue

      // bgp 进程开始（如 bgp 24059）
      const bgpStart = line.match(/^bgp\s+(\d+)/i)
      if (bgpStart) {
        inBgpSection = true
        currentVrf = 'default'
        currentAddressFamily = 'IPv4'
        continue
      }
      // bgp 进程结束（遇到下一个顶层配置块，如 # 后跟非 bgp 的顶层命令）
      if (inBgpSection && /^(?:#\s*)?(?:isis|ospf|mpls|interface|ip\s|route-policy|vlan|stelnet|user-interface|aaa|snmp|ntp|sysname|return)\b/i.test(line)) {
        // 仅当不在任何 family 子块内时结束；这里简单处理：遇到 # 重置上下文
      }
      if (/^#\s*$/.test(line) && inBgpSection) {
        // 配置块分段，保持 inBgpSection（bgp 块内也有 # 分隔各 family）
      }

      // 地址族视图切换：ipv4-family / ipv6-family 后跟的视图决定 currentVrf 标识
      const famMatch = line.match(/^(?:ipv4-family|ipv6-family)\s+(.+)$/i)
      if (famMatch && inBgpSection) {
        const fam = famMatch[1].trim()
        const vInst = fam.match(/^vpn-instance\s+(\S+)/i)
        if (vInst) {
          currentVrf = vInst[1]
        } else if (/^vpnv4\b/i.test(fam)) {
          currentVrf = 'vpnv4'
        } else if (/^vpnv6\b/i.test(fam)) {
          currentVrf = 'vpnv6'
        } else if (/^unicast\b/i.test(fam)) {
          currentVrf = 'unicast'
        } else if (/^flow\b/i.test(fam)) {
          currentVrf = 'flow'
        } else {
          currentVrf = 'default'
        }
        currentAddressFamily = line.toLowerCase().startsWith('ipv6') ? 'IPv6' : 'IPv4'
        continue
      }

      // group 定义：group NAME internal / peer NAME connect-interface
      const groupDef = line.match(/^group\s+(\S+)\s+(internal|external)/i)
      if (groupDef && inBgpSection) {
        groupMap[groupDef[1]] = { type: groupDef[2].toLowerCase(), connectInterface: '' }
        continue
      }
      const groupConn = line.match(/^peer\s+(\S+)\s+connect-interface\s+(\S+)/i)
      if (groupConn && groupMap[groupConn[1]]) {
        groupMap[groupConn[1]].connectInterface = groupConn[2]
        continue
      }

      // peer ... as-number / remote-as
      const asMatch = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+(?:as-number|remote-as)\s+(\d+)/i)
      if (asMatch && inBgpSection) {
        const ip = asMatch[1]
        const n = ensureNeighbor(ip)
        n.remoteAs = parseInt(asMatch[2])
        continue
      }

      // peer ... group
      const groupMatch = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+group\s+(\S+)/i)
      if (groupMatch && inBgpSection) {
        const ip = groupMatch[1]
        const n = ensureNeighbor(ip)
        n.group = groupMatch[2]
        const g = groupMap[groupMatch[2]]
        if (g) n.sessionType = g.type === 'internal' ? 'IBGP' : 'EBGP'
        continue
      }

      // peer ... enable（激活邻居到当前地址族视图，确保地址族被收集；组名(非IP)不会误建）
      const enMatch = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+enable\b/i)
      if (enMatch && inBgpSection) {
        ensureNeighbor(enMatch[1])
        continue
      }

      // peer ... description
      const descMatch = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+description\s+(.+)/i)
      if (descMatch && inBgpSection) {
        const n = ensureNeighbor(descMatch[1])
        n.description = descMatch[2].trim()
        continue
      }

      // peer ... timer keepalive X hold Y
      const timerMatch = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+timer\s+keepalive\s+(\d+)\s+hold\s+(\d+)/i)
      if (timerMatch && inBgpSection) {
        const n = ensureNeighbor(timerMatch[1])
        n.keepalive = parseInt(timerMatch[2])
        n.hold = parseInt(timerMatch[3])
        continue
      }

      // peer ... substitute-as
      if (/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+substitute-as/.test(line) && inBgpSection) {
        const ip = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)/i)[1]
        ensureNeighbor(ip).substituteAs = true
        continue
      }

      // peer ... password cipher
      if (/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+password/.test(line) && inBgpSection) {
        const ip = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)/i)[1]
        ensureNeighbor(ip).auth = true
        continue
      }

      // peer ... ebgp-max-hop [<hop-count>]
      const ebgpMatch = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+ebgp-max-hop\s*(\d+)?/i)
      if (ebgpMatch && inBgpSection) {
        const n = ensureNeighbor(ebgpMatch[1])
        n.ebgpMaxHop = ebgpMatch[2] ? parseInt(ebgpMatch[2]) : '是'
        continue
      }

      // peer ... ip-prefix / ipv6-prefix / route-policy XXX import|export
      const rpMatch = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+(?:ip-prefix|ipv6-prefix|route-policy)\s+(\S+)\s+(import|export)/i)
      if (rpMatch && inBgpSection) {
        const n = ensureNeighbor(rpMatch[1])
        const name = rpMatch[2]
        const dir = rpMatch[3].toLowerCase()
        const field = dir === 'import' ? 'routePolicyImport' : 'routePolicyExport'
        if (!n[field].includes(name)) {
          n[field] = n[field] ? `${n[field]}; ${name}` : name
        }
        continue
      }

      // peer ... bfd enable / bfd min-tx-interval
      if (/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)\s+bfd/.test(line) && inBgpSection) {
        const ip = line.match(/^(?:peer|neighbor)\s+([\d.:a-fA-F]+)/i)[1]
        ensureNeighbor(ip).bfd = true
        continue
      }
    }

    // 补全会话类型：未在 group 中定义的 peer，根据 AS 与本地 AS 判断
    const localAsMatch = configText.match(/^bgp\s+(\d+)/im)
    const localAs = localAsMatch ? parseInt(localAsMatch[1]) : null
    Object.values(neighborMap).forEach(n => {
      // addressFamily 由数组收集转回展示字符串；若邻居从未在任何地址族视图内出现（仅全局定义），则显示 'default'
      n.addressFamily = n.addressFamily.length ? n.addressFamily.join('; ') : 'default'
      if (!n.sessionType) {
        if (n.remoteAs === '' || localAs === null) n.sessionType = ''
        else n.sessionType = (parseInt(n.remoteAs) === localAs) ? 'IBGP' : 'EBGP'
      }
    })

    return neighborMap
  }

  const parseBgpStatusLog = (logText) => {
    const statusMap = {}
    if (!logText) return statusMap

    const lines = logText.split('\n').map(l => l.trim()).filter(l => l)
    let headerFound = false
    // 地址族：display bgp all summary 用 "Address Family:Vpnv4 All" 分段；
    // vpnv4/vpnv6 all peer 无分段，靠命令行判断
    let currentAddressFamily = ''
    let currentCmdFamily = ''
    // 标记当前是否处于 "Peer of IPv4/IPv6-family for vpn instance" 子段内
    // 该子段之后的 VPN-Instance 对等体，类型取实例名而非 "Vpnv4 All"/"Vpnv6 All"
    let inVpnInstanceSection = false

    // 两种表头都支持：
    //   Peer  AS  MsgRcvd  MsgSent  OutQ  Up/Down  State  RtRcv  RtAdv   （display bgp all summary / 传统）
    //   Peer  V   AS  MsgRcvd  MsgSent  OutQ  Up/Down  State  PrefRcv    （display bgp vpnv4/vpnv6 all peer，多一列 V）
    // MsgRcvd/MsgSent 可能为 ********（设备隐藏超大计数值），故该列用 \S+ 而非 \d+
    const rowRegex9 = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)$/
    const rowRegex10 = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)$/
    // IPv6 邻居地址独占一行，参数在下一行（9列，无 IP）：V AS MsgRcvd MsgSent OutQ Up/Down State PrefRcv
    const rowRegexIpv6Data = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)$/
    // 纯 IPv6 地址行（仅含冒分十六进制，无其他 token）
    const ipv6AddrLine = /^([0-9A-Fa-f:]+:[0-9A-Fa-f:]+)$/

    let pendingIpv6 = ''

    for (const line of lines) {
      // 命令行：display bgp vpnv4/vpnv6 all peer（决定无分段时的地址族）
      // 兼容行首可能的 <hostname> / [hostname] 提示符前缀
      const cmdMatch = line.match(/^(?:<[^>]+>|\[[^\]]+\])?\s*display\s+bgp\s+(vpnv4|vpnv6)\s+all\s+peer\b/i)
      if (cmdMatch) {
        currentCmdFamily = cmdMatch[1].toLowerCase() === 'vpnv4' ? 'Vpnv4 All' : 'Vpnv6 All'
        currentAddressFamily = currentCmdFamily
        headerFound = false
        inVpnInstanceSection = false
        continue
      }
      if (/^(?:<[^>]+>|\[[^\]]+\])?\s*display\s+/i.test(line)) {
        // 其他 display 命令，重置上下文
        currentCmdFamily = ''
        headerFound = false
        pendingIpv6 = ''
        inVpnInstanceSection = false
        continue
      }

      // VPN-Instance 分段（display bgp vpnv4/vpnv6 all peer 的实例分组）
      // 注意：不重置 headerFound，表头在分组内仍然有效，后续 IPv6 续行数据需依赖 headerFound=true
      const vpnMatch = line.match(/^VPN-Instance\s+([^,:\s]+)/i)
      if (vpnMatch) {
        // 处于 "Peer of IPv4/IPv6-family for vpn instance" 子段内时，类型取实例名（如 ChinaMobile_BOSS）；
        // 否则沿用命令行地址族前缀（如 "Vpnv4 All ChinaMobile_BOSS"，属于默认 vpn 实例视图）
        currentAddressFamily = inVpnInstanceSection ? vpnMatch[1] : `${currentCmdFamily || ''} ${vpnMatch[1]}`.trim()
        pendingIpv6 = ''
        continue
      }

      // "Peer of IPv4/IPv6-family for vpn instance" 子段开始（display bgp vpnv4/vpnv6 all peer）
      // 标记后，其下的 VPN-Instance 对等体类型取实例名（case 2c）
      if (/^Peer\s+of\s+IPv[46]-family\s+for\s+vpn\s+instance/i.test(line)) {
        inVpnInstanceSection = true
        pendingIpv6 = ''
        continue
      }

      // Address Family 分段（display bgp all summary）
      const afMatch = line.match(/^Address\s+Family:\s*(.+)/i)
      if (afMatch) {
        currentAddressFamily = afMatch[1].trim()
        pendingIpv6 = ''
        continue
      }
      if (/^---+/.test(line)) continue

      // IPv6 地址行：暂存，等下一行参数合并（纯 IPv6 地址行，无空格，无需表头已找到）
      const addrMatch = line.match(ipv6AddrLine)
      if (addrMatch) {
        pendingIpv6 = addrMatch[1]
        continue
      }

      // 表头识别（两种列数都接受）
      if (!headerFound && /^(Peer\s+V\s+AS|Peer\s+AS)\b/.test(line) && line.includes('MsgRcvd')) {
        headerFound = true
        pendingIpv6 = ''
        continue
      }
      if (!headerFound) continue

      let ip, as, duration, state, rtRcv, rtAdv
      const m9 = line.match(rowRegex9)
      const m10 = line.match(rowRegex10)
      const m6 = pendingIpv6 ? line.match(rowRegexIpv6Data) : null
      if (m9) {
        // 9列：IP AS MsgRcvd MsgSent OutQ Up/Down State RtRcv RtAdv
        ip = m9[1]; as = m9[2]; duration = m9[6]; state = m9[7]; rtRcv = parseInt(m9[8]) || 0; rtAdv = parseInt(m9[9]) || 0
      } else if (m10) {
        // 10列：IP V AS MsgRcvd MsgSent OutQ Up/Down State PrefRcv
        ip = m10[1]; as = m10[3]; duration = m10[7]; state = m10[8]; rtRcv = parseInt(m10[9]) || 0; rtAdv = rtRcv
      } else if (m6 && pendingIpv6) {
        // IPv6 续行（9列，无 IP）：V AS MsgRcvd MsgSent OutQ Up/Down State PrefRcv
        ip = pendingIpv6; as = m6[2]; duration = m6[6]; state = m6[7]; rtRcv = parseInt(m6[8]) || 0; rtAdv = rtRcv
        pendingIpv6 = ''
      } else {
        pendingIpv6 = ''
        continue
      }

      const uniqueKey = `${ip}|${currentAddressFamily || currentCmdFamily}`
      statusMap[uniqueKey] = {
        neighborIp: ip,
        remoteAs: as,
        sessionDuration: duration,
        sessionState: state,
        routesReceived: rtRcv,
        routesSent: rtAdv,
        protocolFamily: currentAddressFamily || currentCmdFamily,
        addressFamily: currentAddressFamily || currentCmdFamily || ''
      }
    }
    return statusMap
  }

  /**
   * 解析 display bgp vpnv4 all peer / display bgp vpnv6 all peer 输出
   * 支持默认对等体和 VPN-Instance 分组对等体
   * 支持 IPv6 地址跨行（地址独占一行，数据在下一行）
   * 返回 statusMap，key 为 `neighborIp|protocolFamily|addressFamily`
   */
  const parseBgpVpnPeerLog = (logText) => {
    const statusMap = {}
    if (!logText) return statusMap

    const lines = logText.split('\n')
    let i = 0

    while (i < lines.length) {
      const trimmed = lines[i].trim()

      // 匹配命令行（跳过 verbose 变体）
      const cmdMatch = trimmed.match(/^(?:<[^>]+>|\[[^\]]+\])?\s*display\s+bgp\s+(vpnv4|vpnv6)\s+all\s+peer\s*$/i)
      if (!cmdMatch) { i++; continue }

      const afType = cmdMatch[1].toLowerCase()
      const addressType = afType === 'vpnv4' ? 'IPv4' : 'IPv6'
      const addressFamily = `${afType} all`

      i++
      let currentVrf = 'default'
      let headerFound = false
      let pendingIpv6Addr = null

      while (i < lines.length) {
        const currTrimmed = lines[i].trim()

        // 遇到下一条命令或 return 则结束当前段
        if (/^(?:<[^>]+>|\[[^\]]+\])?\s*display\s+/i.test(currTrimmed)) break
        if (/^return\s*$/i.test(currTrimmed)) break

        // VPN-Instance 分组行
        const vrfMatch = currTrimmed.match(/^VPN-Instance\s+(\S+)\s*,\s*Router\s+ID/i)
        if (vrfMatch) {
          currentVrf = vrfMatch[1]
          headerFound = true
          i++
          continue
        }

        // "Peer of IPv4/IPv6-family for vpn instance :" 分隔符
        if (/^Peer\s+of\s+IPv[46]-family\s+for\s+vpn\s+instance/i.test(currTrimmed)) {
          i++
          continue
        }

        // 列头: Peer V AS MsgRcvd MsgSent OutQ Up/Down State PrefRcv
        if (/^Peer\s+V\s+AS\s+MsgRcvd/i.test(currTrimmed)) {
          headerFound = true
          i++
          continue
        }

        // 跳过非数据行
        if (currTrimmed === '' || /^-{3,}/.test(currTrimmed) ||
            /^BGP\s+local\s+router\s+ID/i.test(currTrimmed) ||
            /^Local\s+AS\s+number/i.test(currTrimmed) ||
            /^Total\s+number\s+of\s+peers/i.test(currTrimmed)) {
          i++
          continue
        }

        if (!headerFound) { i++; continue }

        // 尝试匹配完整行: Peer V AS MsgRcvd MsgSent OutQ Up/Down State PrefRcv
        // MsgRcvd / MsgSent 可能是 ******** 所以用 \S+
        const combinedMatch = currTrimmed.match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)$/)
        if (combinedMatch) {
          const ip = combinedMatch[1]
          const state = combinedMatch[8]
          statusMap[`${ip}|${addressFamily}|${currentVrf}`] = {
            neighborIp: ip,
            remoteAs: combinedMatch[3],
            sessionDuration: combinedMatch[7],
            sessionState: state,
            neighborState: state,
            routesReceived: parseInt(combinedMatch[9]) || 0,
            routesSent: 0,
            addressType: ip.includes(':') ? 'IPv6' : 'IPv4',
            protocolFamily: addressFamily,
            addressFamily: currentVrf
          }
          pendingIpv6Addr = null
          i++
          continue
        }

        // 尝试匹配 IPv6 地址独占行（长 IPv6 地址换行显示）
        if (pendingIpv6Addr === null && /^[0-9a-fA-F:]+$/.test(currTrimmed) && currTrimmed.includes(':')) {
          pendingIpv6Addr = currTrimmed
          i++
          continue
        }

        // 尝试匹配数据续行（IPv6 地址的后续数据行）
        if (pendingIpv6Addr !== null) {
          const dataMatch = currTrimmed.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)$/)
          if (dataMatch) {
            const state = dataMatch[7]
            statusMap[`${pendingIpv6Addr}|${addressFamily}|${currentVrf}`] = {
              neighborIp: pendingIpv6Addr,
              remoteAs: dataMatch[2],
              sessionDuration: dataMatch[6],
              sessionState: state,
              neighborState: state,
              routesReceived: parseInt(dataMatch[8]) || 0,
              routesSent: 0,
              addressType: 'IPv6',
              protocolFamily: addressFamily,
              addressFamily: currentVrf
            }
            pendingIpv6Addr = null
            i++
            continue
          }
          pendingIpv6Addr = null
        }

        i++
      }
    }

    return statusMap
  }

  /**
   * 解析 display bgp vpnv4 all peer verbose / display bgp vpnv6 all peer verbose 输出
   * 提取每个 peer 的 Advertised total routes（路由发送）和 Received total routes（路由接收）
   * 返回 advertisedMap，key 为 `neighborIp|protocolFamily|addressFamily`
   */
  const parseBgpVpnPeerVerboseLog = (logText) => {
    const advertisedMap = {}
    if (!logText) return advertisedMap

    const lines = logText.split('\n')
    let i = 0

    while (i < lines.length) {
      const trimmed = lines[i].trim()

      // 匹配命令行: display bgp vpnv4/vpnv6 all peer verbose
      const cmdMatch = trimmed.match(/^(?:<[^>]+>|\[[^\]]+\])?\s*display\s+bgp\s+(vpnv4|vpnv6)\s+all\s+peer\s+verbose\s*$/i)
      if (!cmdMatch) { i++; continue }

      const afType = cmdMatch[1].toLowerCase()
      const addressFamily = `${afType} all`

      i++
      let currentVrf = 'default'
      let currentPeerIp = null
      let currentPeerAs = null

      while (i < lines.length) {
        const currTrimmed = lines[i].trim()

        // 遇到下一条命令或 return 则结束当前段
        if (/^(?:<[^>]+>|\[[^\]]+\])?\s*display\s+/i.test(currTrimmed)) break
        if (/^return\s*$/i.test(currTrimmed)) break

        // VPN instance 分隔行: IPv4-family for VPN instance: xxx 或 IPv6-family for VPN instance: xxx
        const vpnInstanceMatch = currTrimmed.match(/^(?:IPv4|IPv6)-family\s+for\s+VPN\s+instance\s*:\s*(\S+)/i)
        if (vpnInstanceMatch) {
          currentVrf = vpnInstanceMatch[1]
          currentPeerIp = null
          i++
          continue
        }

        // Peer 头: BGP Peer is <IP>,  remote AS <AS>
        const peerMatch = currTrimmed.match(/^BGP\s+Peer\s+is\s+(\S+)\s*,\s+remote\s+AS\s+(\d+)/i)
        if (peerMatch) {
          currentPeerIp = peerMatch[1]
          currentPeerAs = peerMatch[2]
          i++
          continue
        }

        // Advertised total routes: <数字>
        if (currentPeerIp) {
          const advMatch = currTrimmed.match(/^Advertised\s+total\s+routes\s*:\s*(\d+)/i)
          if (advMatch) {
            const key = `${currentPeerIp}|${addressFamily}|${currentVrf}`
            const routesSent = parseInt(advMatch[1]) || 0
            // 合入已有条目（可能已由 Received total routes 创建），而非覆盖
            if (advertisedMap[key]) {
              advertisedMap[key].routesSent = routesSent
            } else {
              advertisedMap[key] = {
                neighborIp: currentPeerIp,
                routesSent,
                protocolFamily: addressFamily,
                addressFamily: currentVrf
              }
            }
            i++
            continue
          }

          // Received total routes: <数字>
          const recvMatch = currTrimmed.match(/^Received\s+total\s+routes\s*:\s*(\d+)/i)
          if (recvMatch) {
            const key = `${currentPeerIp}|${addressFamily}|${currentVrf}`
            if (advertisedMap[key]) {
              advertisedMap[key].routesReceivedVerbose = parseInt(recvMatch[1]) || 0
            } else {
              advertisedMap[key] = {
                neighborIp: currentPeerIp,
                routesSent: 0,
                routesReceivedVerbose: parseInt(recvMatch[1]) || 0,
                protocolFamily: addressFamily,
                addressFamily: currentVrf
              }
            }
            i++
            continue
          }
        }

        i++
      }
    }

    return advertisedMap
  }

  /** 将 verbose 解析结果中的 routesSent（Advertised total routes）合并到表格 */
  const mergeVerboseToTable = (verboseMap) => {
    let updateCount = 0
    for (const key in verboseMap) {
      const verboseData = verboseMap[key]
      // 按 neighborIp + protocolFamily + addressFamily 匹配已有行
      const row = neighborList.value.find(r =>
        r.neighborIp === verboseData.neighborIp &&
        (r.addressFamily || '') === verboseData.addressFamily &&
        (r.addressFamily || 'default') === verboseData.addressFamily
      )
      if (row) {
        // verbose 中的 Advertised total routes 更有权威性，覆盖 routesSent
        row.routesSent = verboseData.routesSent
        // 如果 verbose 有 Received total routes 且当前 routesReceived 为 0，也补上
        if (verboseData.routesReceivedVerbose && (row.routesReceived === 0 || row.routesReceived === null)) {
          row.routesReceived = verboseData.routesReceivedVerbose
        }
        updateCount++
      }
    }
    return updateCount
  }

  const mergeConfigToTable = (configMap) => {
    const newRows = []
    for (const key in configMap) {
      const item = configMap[key]
      const existRow = neighborList.value.find(r => r.neighborIp === item.neighborIp && r.addressFamily === item.addressFamily)
      if (existRow) {
        existRow.remoteAs = item.remoteAs
        existRow.group = item.group
        existRow.description = item.description
        existRow.addressType = item.addressType
        existRow.addressFamily = item.addressFamily
      } else {
        newRows.push({
          ...item,
          routesSent: null,
          localInterface: '',
          addressFamily: '',
          configDiffFields: [],
          isConsistent: null
        })
      }
    }
    newRows.forEach(row => neighborList.value.push(row))
    return Object.keys(configMap).length
  }

  const mergeStatusToTable = (statusMap) => {
    let updateCount = 0
    for (const key in statusMap) {
      const status = statusMap[key]
      const row = neighborList.value.find(r => r.neighborIp === status.neighborIp && r.addressFamily === status.addressFamily)
      if (row) {
        row.sessionState = status.sessionState
        row.sessionDuration = status.sessionDuration
        row.routesReceived = status.routesReceived
        row.routesSent = status.routesSent
        row.addressFamily = status.addressFamily
        if (status.remoteAs && (!row.remoteAs || row.remoteAs === '')) {
          row.remoteAs = status.remoteAs
        }
        updateCount++
      } else {
        neighborList.value.push({
          neighborIp: status.neighborIp,
          remoteAs: status.remoteAs,
          sessionState: status.sessionState,
          sessionDuration: status.sessionDuration,
          routesReceived: status.routesReceived,
          routesSent: status.routesSent,
          addressType: status.neighborIp.includes(':') ? 'IPv6' : 'IPv4',
          addressFamily: status.addressFamily,
          group: '',
          addressFamily: 'default',
          configDiffFields: [],
          isConsistent: null
        })
        updateCount++
      }
    }
    return updateCount
  }

  /** 将 vpnv4/vpnv6 peer 解析结果合并到表格，按 neighborIp|addressFamily 匹配 */
  const mergeVpnPeerToTable = (vpnStatusMap) => {
    let updateCount = 0
    for (const key in vpnStatusMap) {
      const status = vpnStatusMap[key]
      const row = neighborList.value.find(r => r.neighborIp === status.neighborIp && (r.addressFamily || 'default') === status.addressFamily && r.addressFamily === status.addressFamily)
      if (row) {
        row.sessionState = status.sessionState
        row.sessionDuration = status.sessionDuration
        row.routesReceived = status.routesReceived
        row.routesSent = status.routesSent
        row.addressFamily = status.addressFamily
        row.addressFamily = status.addressFamily
        row.addressType = status.addressType
        if (status.remoteAs && (!row.remoteAs || row.remoteAs === '')) {
          row.remoteAs = status.remoteAs
        }
        updateCount++
      } else {
        neighborList.value.push({
          neighborIp: status.neighborIp,
          remoteAs: status.remoteAs,
          sessionState: status.sessionState,
          sessionDuration: status.sessionDuration,
          routesReceived: status.routesReceived,
          routesSent: status.routesSent,
          addressType: status.addressType,
          addressFamily: status.addressFamily,
          addressFamily: status.addressFamily,
          group: '',
          configDiffFields: [],
          isConsistent: null
        })
        updateCount++
      }
    }
    return updateCount
  }

  const updateTableWithDiff = (beforeConfig, afterConfig, beforeStatus, afterStatus, beforeVpnStatus, afterVpnStatus, beforeVerbose, afterVerbose) => {
    neighborList.value.forEach(row => {
      const ip = row.neighborIp
      const vrf = row.addressFamily || 'default'
      const af = row.addressFamily || ''
      const configKey = `${vrf}_${ip}`
      const statusKey = `${ip}|${af}`
      const vpnStatusKey = `${ip}|${af}|${vrf}`

      const bConfig = beforeConfig[configKey] || {}
      const aConfig = afterConfig[configKey] || {}
      // 优先用传统 status，其次用 vpn peer status
      const bStatus = beforeStatus[statusKey] || (beforeVpnStatus ? beforeVpnStatus[vpnStatusKey] : {}) || {}
      const aStatus = afterStatus[statusKey] || (afterVpnStatus ? afterVpnStatus[vpnStatusKey] : {}) || {}
      // verbose 数据（Advertised total routes）作为 routesSent 的权威来源
      const bVerbose = (beforeVerbose && beforeVerbose[vpnStatusKey]) || {}
      const aVerbose = (afterVerbose && afterVerbose[vpnStatusKey]) || {}

      const diffFields = []
      const configFields = ['remoteAs', 'group', 'addressFamily', 'addressType']
      configFields.forEach(field => {
        const bVal = bConfig[field] ?? ''
        const aVal = aConfig[field] ?? ''
        if (String(bVal) !== String(aVal)) {
          diffFields.push({
            field,
            beforeVal: String(bVal) || '-',
            afterVal: String(aVal) || '-'
          })
        }
      })
      const statusFields = ['sessionState', 'sessionDuration', 'routesReceived', 'routesSent']
      statusFields.forEach(field => {
        // 对于 routesSent，优先使用 verbose（Advertised total routes）数据
        let bVal = bStatus[field] ?? ''
        let aVal = aStatus[field] ?? ''
        if (field === 'routesSent') {
          if (bVerbose.routesSent !== undefined && bVerbose.routesSent !== 0) bVal = bVerbose.routesSent
          if (aVerbose.routesSent !== undefined && aVerbose.routesSent !== 0) aVal = aVerbose.routesSent
        }
        // 对于 routesReceived，如果 status 中为 0 但 verbose 中有值，使用 verbose
        if (field === 'routesReceived') {
          if ((bVal === 0 || bVal === '' || bVal === null) && bVerbose.routesReceivedVerbose !== undefined) bVal = bVerbose.routesReceivedVerbose
          if ((aVal === 0 || aVal === '' || aVal === null) && aVerbose.routesReceivedVerbose !== undefined) aVal = aVerbose.routesReceivedVerbose
        }
        if (String(bVal) !== String(aVal)) {
          diffFields.push({
            field,
            beforeVal: String(bVal) || '-',
            afterVal: String(aVal) || '-'
          })
        }
      })

      row.configDiffFields = diffFields
      if (Object.keys(bConfig).length === 0 && Object.keys(bStatus).length === 0) {
        row.isConsistent = false
      } else if (Object.keys(aConfig).length === 0 && Object.keys(aStatus).length === 0) {
        row.isConsistent = false
      } else if (diffFields.length > 0) {
        row.isConsistent = false
      } else {
        row.isConsistent = true
      }
    })
  }

  const updateNeighbors = (newData) => {
    neighborList.value = newData
  }

  const autoParseAndUpdate = (showMessage = true) => {
    const beforeText = beforeTextVal.value.trim()
    const afterText = afterTextVal.value.trim()

    if (!beforeText && !afterText) {
      if (showMessage) showMessage('warning', '请上传至少一个配置文件')
      return
    }

    neighborList.value = []

    const beforeConfig = parseBgpConfigNeighbors(beforeText)
    const afterConfig = parseBgpConfigNeighbors(afterText)
    const beforeStatus = parseBgpStatusLog(beforeText)
    const afterStatus = parseBgpStatusLog(afterText)
    const beforeVpnStatus = parseBgpVpnPeerLog(beforeText)
    const afterVpnStatus = parseBgpVpnPeerLog(afterText)
    const beforeVerbose = parseBgpVpnPeerVerboseLog(beforeText)
    const afterVerbose = parseBgpVpnPeerVerboseLog(afterText)

    let configCount = 0
    if (afterText) {
      configCount = mergeConfigToTable(afterConfig)
    } else if (beforeText) {
      configCount = mergeConfigToTable(beforeConfig)
    }

    let statusCount = 0
    if (afterText) {
      statusCount = mergeStatusToTable(afterStatus)
      statusCount += mergeVpnPeerToTable(afterVpnStatus)
      statusCount += mergeVerboseToTable(afterVerbose)
    } else if (beforeText) {
      statusCount = mergeStatusToTable(beforeStatus)
      statusCount += mergeVpnPeerToTable(beforeVpnStatus)
      statusCount += mergeVerboseToTable(beforeVerbose)
    }

    if (beforeText && afterText) {
      updateTableWithDiff(beforeConfig, afterConfig, beforeStatus, afterStatus, beforeVpnStatus, afterVpnStatus, beforeVerbose, afterVerbose)
    }

    const msgParts = []
    if (configCount > 0) msgParts.push(`${configCount} 条配置`)
    if (statusCount > 0) msgParts.push(`${statusCount} 条状态`)
    const msg = msgParts.length > 0
      ? `解析完成：${msgParts.join('，')}${(beforeText && afterText) ? '，差异已映射到表格' : ''}`
      : '解析到 0 条有效数据，请检查文件格式是否正确'

    if (showMessage) {
      showMessage(msgParts.length > 0 ? 'success' : 'warning', msg)
    } else {
      showMessage(msgParts.length > 0 ? 'success' : 'warning', msg)
    }
  }

  const handleFileChange = async (uploadFile, type) => {
    try {
      const content = await readFileContent(uploadFile)
      if (type === 'before') {
        beforeTextVal.value = content
      } else if (type === 'after') {
        afterTextVal.value = content
      }
      showMessage('success', '文件读取成功')
      await nextTick()
      autoParseAndUpdate(false)
    } catch {
      showMessage('error', '文件读取失败')
    }
  }

  return {
    searchText,
    showTable,
    neighborList,
    benchmarkMap,
    dialogVisible,
    currentRow,
    importDialog,
    beforeTextVal,
    afterTextVal,
    getDiffDisplay,
    getDiffInfo,
    stateTagType,
    detailFields,
    updateNeighbors,
    autoParseAndUpdate,
    handleFileChange,
    parseBgpConfigNeighbors,
    parseBgpVpnPeerLog,
    parseBgpVpnPeerVerboseLog,
    parseBgpStatusLog
  }
}