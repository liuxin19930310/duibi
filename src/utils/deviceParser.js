/**
 * 设备配置解析器
 * 字段完全对齐 interfaceInfo.js 的 row 结构
 * 支持华为/华三 display current-configuration + display interface 混合导出文件
 */

// ===================== 通用工具 =====================

function netmaskToCidr(mask) {
  if (!mask) return ''
  const parts = mask.split('.')
  let cidr = 0
  for (const part of parts) {
    const n = parseInt(part, 10)
    for (let i = 7; i >= 0; i--) {
      if ((n >> i) & 1) cidr++
    }
  }
  return cidr
}

// ===================== 创建接口行 =====================

function createRow(interfaceName) {
  return {
    interfaceName,
    description: '-',
    ipv4: '-',
    ipv6: '-',
    vrf: '-',
    portStatus: '-',
    isisCost: '-',
    interfaceRate: '-',
    opticalPower: '-',
    bandwidthUtil: '-',
    mtuL1L2: '-',
    mtu: '-',
    moduleType: '-',
    moduleDistance: '-',
    srv6Sid: '-',
    packetLossRate: '-',
    crc: '-',
    ethTrunk: '-',
    configDiffFields: [],
    isConsistent: null,
  }
}

// ===================== 从 display current-configuration 中解析配置 =====================

function parseConfigInterfaces(text, vendor) {
  const rows = []
  const seen = new Set()
  const ifRegex = /^interface\s+(\S+)\s*$/gm
  let ifMatch
  while ((ifMatch = ifRegex.exec(text)) !== null) {
    const ifName = ifMatch[1]
    if (/^(NULL|LoopBack)/i.test(ifName) && !ifName.includes('0')) continue
    if (seen.has(ifName)) continue
    seen.add(ifName)

    const row = createRow(ifName)

    const startIdx = ifMatch.index + ifMatch[0].length
    const restText = text.slice(startIdx)
    const blockMatch = restText.match(/^(\s[\s\S]*?)(?=\n\S|\n#$)/)
    const block = blockMatch ? blockMatch[1] : ''

    const descMatch = block.match(/description\s+(.+)/i)
    if (descMatch) row.description = descMatch[1].trim()

    const ipv4Match = block.match(/ip address\s+(\S+)\s+(\S+)/i)
    if (ipv4Match && ipv4Match[1] !== 'unnumbered') row.ipv4 = ipv4Match[1] + '/' + netmaskToCidr(ipv4Match[2])

    let ipv6Addr = null
    const ipv6CidrMatch = block.match(/ipv6 address\s+([a-fA-F0-9:]+\/\d+)/i)
    if (ipv6CidrMatch) {
      ipv6Addr = ipv6CidrMatch[1]
    } else {
      const ipv6SpaceMatch = block.match(/ipv6 address\s+([a-fA-F0-9:]+)\s+(\d+)/i)
      if (ipv6SpaceMatch) {
        ipv6Addr = `${ipv6SpaceMatch[1]}/${ipv6SpaceMatch[2]}`
      }
    }
    if (ipv6Addr) row.ipv6 = ipv6Addr

    const vrfMatch = block.match(/ip vpn-instance\s+(\S+)/i) || block.match(/binding vpn-instance\s+(\S+)/i)
    if (vrfMatch) row.vrf = vrfMatch[1]

    row.portStatus = /^\s*shutdown\s*$/m.test(block) ? 'Down' : 'UP'

    const mtuMatch = block.match(/mtu\s+(\d+)/i)
    if (mtuMatch) row.mtu = mtuMatch[1]

    const rateMatch = block.match(/speed\s+(\S+)/i)
    if (rateMatch) row.interfaceRate = rateMatch[1]

    const isisMatch = block.match(/isis cost\s+(\d+)/i)
    if (isisMatch) row.isisCost = isisMatch[1]

    const srv6Match = block.match(/segment-routing ipv6\s+(\S+)/i)
    if (srv6Match) row.srv6Sid = srv6Match[1]

    const trunkMatch = block.match(/eth-trunk\s+(\d+)/i)
    if (trunkMatch) row.ethTrunk = `Eth-Trunk${trunkMatch[1]}`

    const linkMode = block.match(/port link-mode\s+(\S+)/i)
    if (linkMode) row.description = row.description !== '-' ? `${row.description} [${linkMode[1]}]` : `[${linkMode[1]}]`

    rows.push(row)
  }
  return rows
}

// ===================== 解析 display interface 回显 =====================

function parseInterfaceInfoLog(logText) {
  const statusMap = {}
  if (!logText) return statusMap
  const lines = logText.split('\n')
  let currentInterface = null
  let currentBlockLines = []

  const processBlock = (blockLines) => {
    if (!blockLines || blockLines.length === 0) return
    const blockText = blockLines.join('\n')
    const firstLineMatch = blockLines[0].match(/^(\S+)\s+current\s+state\s*:?\s*(.*)/i)
    if (!firstLineMatch) return

    let interfaceName = firstLineMatch[1]
    interfaceName = interfaceName.replace(/\s*\([^)]*\)\s*$/, '')
    let portStatus = firstLineMatch[2].trim() || '-'
    portStatus = portStatus.replace(/\s*\(ifindex:\s*\d+\)\s*$/, '')
    // 端口状态归一化：UP/up → UP；所有 down 变体（down / *down / Administratively down / DOWN）→ Down
    if (/up/i.test(portStatus)) portStatus = 'UP'
    else if (/down/i.test(portStatus)) portStatus = 'Down'

    const row = createRow(interfaceName)
    row.portStatus = portStatus

    const descMatch = blockText.match(/Description:\s*(.*)/i)
    if (descMatch) row.description = descMatch[1].trim()

    const trunkMatch = blockText.match(/eth-trunk\s+(\d+)/i)
    if (trunkMatch) row.ethTrunk = `Eth-Trunk${trunkMatch[1]}`

    // Tunnel 接口特殊处理：unnumbered 地址从 LoopBack 借用
    const unnumMatch = blockText.match(/Internet Address is unnumbered, using address of \S+\(([\d.]+)\/(\d+)\)/i)
    if (unnumMatch) row.ipv4 = unnumMatch[1] + '/' + unnumMatch[2]

    let rxVals = [], txVals = []
    let multiRxTxRegex = /Rx Power\[(\d+)\]:\s*([-.\d]+)dBm,\s*Tx\1 Power:\s*([-.\d]+)dBm/gi
    let match
    while ((match = multiRxTxRegex.exec(blockText)) !== null) {
      rxVals.push(match[2]); txVals.push(match[3])
    }
    if (rxVals.length === 0) {
      multiRxTxRegex = /Rx(\d+) Power:\s*([-.\d]+)dBm,\s*Tx\1 Power:\s*([-.\d]+)dBm/gi
      while ((match = multiRxTxRegex.exec(blockText)) !== null) {
        rxVals.push(match[2]); txVals.push(match[3])
      }
    }
    if (rxVals.length === 0) {
      const singleRxMatch = blockText.match(/(?:Rx Power(?::|\[\d+\]:))\s*([-.\d]+)dBm/i)
      const singleTxMatch = blockText.match(/(?:Tx Power(?::|\[\d+\]:))\s*([-.\d]+)dBm/i)
      if (singleRxMatch && singleTxMatch) {
        rxVals.push(singleRxMatch[1]); txVals.push(singleTxMatch[1])
      }
    }
    if (rxVals.length > 0) {
      // ★ -40.00 dBm 是华为默认占位值（无光模块/光纤未接），替换为 N/A
      const fmtVal = v => v === '-40.00' ? 'N/A' : v
      rxVals = rxVals.map(fmtVal)
      txVals = txVals.map(fmtVal)
      const allNA = rxVals.every(v => v === 'N/A') && txVals.every(v => v === 'N/A')
      row.opticalPower = allNA ? 'N/A' : `Rx:${rxVals.join('|')} Tx:${txVals.join('|')}`
    }

    const lanWanMatch = blockText.match(/\b(LAN|WAN)\s+full-duplex\s+mode/i)
    if (lanWanMatch) row.mtuL1L2 = lanWanMatch[1]

    const rateMatch = blockText.match(/Port BW:\s*([^\s,]+)/i)
    if (rateMatch) row.interfaceRate = rateMatch[1]

    const modeMatch = blockText.match(/Transceiver Mode:\s*(.+)/i)
    if (modeMatch) row.moduleType = modeMatch[1].trim()

    const distMatch = blockText.match(/Transmission Distance:\s*(\S+)/i)
    if (distMatch) row.moduleDistance = distMatch[1]

    const mtuMatch = blockText.match(/The Maximum Transmit Unit is (\d+)/i)
    if (mtuMatch) row.mtu = mtuMatch[1]

    const lossMatch = blockText.match(/Lost:\s*(\d+)\s+packets/i)
    if (lossMatch) row.packetLossRate = lossMatch[1]

    const crcMatch = blockText.match(/CRC:\s*(\d+)\s+packets/i)
    if (crcMatch) row.crc = crcMatch[1]

    statusMap[interfaceName] = row
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    if (/^[<>]/.test(trimmed) || /^display/.test(trimmed)) {
      if (currentInterface) { processBlock(currentBlockLines); currentInterface = null; currentBlockLines = [] }
      continue
    }
    const interfaceMatch = trimmed.match(/^([\w\/\-.]+)\s+current\s+state/i)
    if (interfaceMatch && /^(Eth-Trunk|Eth|GigabitEthernet|GE|XGE|100GE|25GE|40GE|50GE|LoopBack|Tunnel|Vlan|Vlanif|NULL|MEth|Aux|Virtual-Template)/i.test(interfaceMatch[1])) {
      if (currentInterface) processBlock(currentBlockLines)
      currentInterface = interfaceMatch[1]
      currentBlockLines = [trimmed]
    } else if (currentInterface) {
      currentBlockLines.push(trimmed)
    }
  }
  if (currentInterface) processBlock(currentBlockLines)
  return statusMap
}

// ===================== 解析 display interface brief 回显（带宽利用率） =====================

function parseInterfaceBrief(logText) {
  const utilMap = {}
  if (!logText) return utilMap
  const lines = logText.split('\n')
  let inBrief = false
  let headerIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    if (lines[i].includes('display interface brief') || /display\s+int(erface)?\s+brief/i.test(lines[i])) {
      inBrief = true
      headerIdx = -1
      continue
    }

    if (!inBrief) {
      if (/^[<>]/.test(trimmed) || /^display\s+(?!interface\s+brief)/i.test(trimmed)) continue
      continue
    }

    if (/^[<>]/.test(trimmed) || (/^display/i.test(trimmed) && !/interface\s+brief/i.test(trimmed))) {
      inBrief = false
      continue
    }

    if (trimmed.includes(':') && !trimmed.includes('%')) continue

    if (headerIdx < 0 && /\bInUti\b/.test(trimmed) && /\bOutUti\b/.test(trimmed)) {
      headerIdx = i
      continue
    }
    if (headerIdx < 0) continue

    if (!trimmed) continue
    // 跳过 Eth-Trunk 成员行（行首有空格缩进，不作为独立接口）
    if (lines[i] && lines[i].length > 0 && lines[i][0] === ' ') continue
    const parts = trimmed.split(/\s+/)
    if (/^---+$/.test(trimmed)) continue

    let inUtiIdx = -1, outUtiIdx = -1
    for (let j = 0; j < parts.length; j++) {
      if (parts[j].includes('%')) {
        if (inUtiIdx === -1) inUtiIdx = j
        else if (outUtiIdx === -1) outUtiIdx = j
      }
    }
    if (inUtiIdx >= 0 && outUtiIdx >= 0 && inUtiIdx !== outUtiIdx) {
      // 去掉速率后缀 (10G)/(40G)/(100G) 等，使接口名与配置中的 interface 名对齐
      // 去掉速率后缀 (10G)/(10GE)/(40GE)/(100GE)/(25GE)/...，使接口名与配置中的 interface 名对齐
      const ifName = parts[0].replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
      utilMap[ifName] = `${parts[inUtiIdx]}/${parts[outUtiIdx]}`
    }
  }
  return utilMap
}

// ===================== 从配置中提取 IP 地址 =====================

function parseConfigForIpAddress(configText) {
  const ipMap = {}
  if (!configText) return ipMap
  const lines = configText.split('\n')
  let currentInterface = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^[<>\[\]]/.test(trimmed) || /^display/.test(trimmed) || /^return/.test(trimmed) || /^quit/.test(trimmed)) { currentInterface = null; continue }
    if (/^[!#]/.test(trimmed) || trimmed === '') { currentInterface = null; continue }

    const ifMatch = trimmed.match(/^interface\s+(\S+)/i)
    if (ifMatch) { currentInterface = ifMatch[1]; ipMap[currentInterface] = ipMap[currentInterface] || { ipv4: '-', ipv6: '-' }; continue }

    if (currentInterface) {
      const ipv4Match = trimmed.match(/^ip\s+address\s+([\d.]+)\s+([\d.]+)/i)
      if (ipv4Match) { const cidr = netmaskToCidr(ipv4Match[2]); ipMap[currentInterface].ipv4 = `${ipv4Match[1]}/${cidr}`; continue }
      let ipv6Addr = null
      const ipv6CidrMatch = trimmed.match(/^ipv6\s+address\s+([a-fA-F0-9:]+\/\d+)/i)
      if (ipv6CidrMatch) {
        ipv6Addr = ipv6CidrMatch[1]
      } else {
        const ipv6SpaceMatch = trimmed.match(/^ipv6\s+address\s+([a-fA-F0-9:]+)\s+(\d+)/i)
        if (ipv6SpaceMatch) {
          ipv6Addr = `${ipv6SpaceMatch[1]}/${ipv6SpaceMatch[2]}`
        }
      }
      if (ipv6Addr) { ipMap[currentInterface].ipv6 = ipv6Addr; continue }
    }
  }
  return ipMap
}

// ===================== 从配置中提取 ISIS Cost =====================

function parseConfigForIsisCost(configText) {
  const costMap = {}
  if (!configText) return costMap
  const lines = configText.split('\n')
  let currentInterface = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^[<>\[\]]/.test(trimmed) || /^display/.test(trimmed) || /^return/.test(trimmed) || /^quit/.test(trimmed)) { currentInterface = null; continue }
    if (/^[!#]/.test(trimmed) || trimmed === '') { currentInterface = null; continue }

    const ifMatch = trimmed.match(/^interface\s+(\S+)/i)
    if (ifMatch) { currentInterface = ifMatch[1]; continue }

    if (currentInterface) {
      const costMatch = trimmed.match(/^isis\s+cost\s+(\d+)/i)
      if (costMatch && !trimmed.includes('ipv6')) costMap[currentInterface] = costMatch[1]
    }
  }
  return costMap
}

// ===================== 从配置中提取描述 =====================

function parseConfigForDescription(configText) {
  const descMap = {}
  if (!configText) return descMap
  const lines = configText.split('\n')
  let currentInterface = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^[<>\[\]]/.test(trimmed) || /^display/.test(trimmed) || /^return/.test(trimmed) || /^quit/.test(trimmed)) { currentInterface = null; continue }
    if (/^[!#]/.test(trimmed) || trimmed === '') { currentInterface = null; continue }

    const ifMatch = trimmed.match(/^interface\s+(\S+)/i)
    if (ifMatch) { currentInterface = ifMatch[1]; continue }

    if (currentInterface) {
      const descMatch = trimmed.match(/^description\s+(.*)/i)
      if (descMatch) descMap[currentInterface] = descMatch[1].trim()
    }
  }
  return descMap
}

// ===================== 从配置中提取 Eth-Trunk 成员 =====================

function parseConfigForEthTrunkMembers(configText) {
  const trunkMemberMap = {}
  if (!configText) return trunkMemberMap
  const lines = configText.split('\n')
  let currentInterface = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^[<>\[\]]/.test(trimmed) || /^display/.test(trimmed) || /^return/.test(trimmed) || /^quit/.test(trimmed)) { currentInterface = null; continue }
    if (/^[!#]/.test(trimmed) || trimmed === '') { currentInterface = null; continue }

    const ifMatch = trimmed.match(/^interface\s+(\S+)/i)
    if (ifMatch) { currentInterface = ifMatch[1]; continue }

    if (currentInterface) {
      const ethMatch = trimmed.match(/^eth-trunk\s+(\d+)/i)
      if (ethMatch) {
        const trunkName = `Eth-Trunk${ethMatch[1]}`
        if (!trunkMemberMap[trunkName]) trunkMemberMap[trunkName] = []
        if (!trunkMemberMap[trunkName].includes(currentInterface)) trunkMemberMap[trunkName].push(currentInterface)
      }
    }
  }
  return trunkMemberMap
}

// ===================== 合并接口状态到 rows =====================

function mergeDisplayInterfaceToRows(rows, statusMap, briefMap, ipMap, costMap) {
  const normIf = n => n.replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
  rows.forEach(row => {
    const key = row.interfaceName
    // 利用率匹配：精确优先，回落到去速率后缀的归一化匹配（兼容 brief 输出带 (10G) 的情况）
    const bKey = briefMap[key] ? key : (briefMap[normIf(key)] ? normIf(key) : null)
    if (bKey) row.bandwidthUtil = briefMap[bKey]
    const status = statusMap[key]
    if (status) {
      // 优先用 display interface 中的字段覆盖
      if (status.portStatus !== '-') row.portStatus = status.portStatus
      if (status.opticalPower !== '-') row.opticalPower = status.opticalPower
      if (status.mtuL1L2 !== '-') row.mtuL1L2 = status.mtuL1L2
      if (status.interfaceRate !== '-') row.interfaceRate = status.interfaceRate
      if (status.moduleType !== '-') row.moduleType = status.moduleType
      if (status.moduleDistance !== '-') row.moduleDistance = status.moduleDistance
      if (status.packetLossRate !== '-') row.packetLossRate = status.packetLossRate
      if (status.crc !== '-') row.crc = status.crc
      if (status.description !== '-' && row.description === '-') row.description = status.description
      if (status.ethTrunk !== '-' && row.ethTrunk === '-') row.ethTrunk = status.ethTrunk
      // 用 display interface 中解析到的 IP 覆盖 config 中的值（如 Tunnel unnumbered）
      if (status.ipv4 !== '-') row.ipv4 = status.ipv4
    }
    if (ipMap[key]) {
      if (ipMap[key].ipv4 !== '-') row.ipv4 = ipMap[key].ipv4
      if (ipMap[key].ipv6 !== '-') row.ipv6 = ipMap[key].ipv6
    }
    if (costMap[key]) row.isisCost = costMap[key]
  })
}

// ===================== 主解析入口 =====================

function parseDeviceInfo(text, vendor) {
  const info = {
    hostname: '',
    model: '',
    version: '',
    uptime: '',
    mgmtIp: '',
    role: '',
    interfaces: [],
    ifUp: 0,
    ifDown: 0,
    bgpCount: 0,
    isisCount: 0,
    ldpCount: 0,
    ldpPeerCount: 0,
    srv6Count: 0,
    vlanCount: 0,
    vlans: [],
    staticRoutes: [],
  }

  // 主机名
  const hostnameMatch = text.match(/sysname\s+(\S+)/)
  if (hostnameMatch) info.hostname = hostnameMatch[1]

  // 设备型号
  if (vendor === 'h3c') {
    const m = text.match(/H3C\s+([\w\-]+)/i)
    if (m) info.model = m[1]
  } else {
    const m = text.match(/HUAWEI\s+([\w\-]+)/i)
    if (m) info.model = m[1]
  }

  // 版本
  if (vendor === 'h3c') {
    const m = text.match(/Comware.*?Version\s+(\S+)/i) || text.match(/Version\s+(\S+)/i)
    if (m) info.version = m[1]
  } else {
    const m = text.match(/Version\s+(\S+)/i)
    if (m) info.version = m[1]
  }

  // 运行时间
  const uptimeMatch = text.match(/uptime is\s+(.+)/i)
  if (uptimeMatch) info.uptime = uptimeMatch[1].trim()

  // 管理IP
  if (vendor === 'h3c') {
    const m = text.match(/interface\s+(M-Eth|MEth|Vlan-interface\d+)[\s\S]*?ip address\s+(\S+)/i)
    if (m) info.mgmtIp = m[2]
  } else {
    const m = text.match(/interface\s+(MEth|Management|Vlanif\d+)[\s\S]*?ip address\s+(\S+)/i)
    if (m) info.mgmtIp = m[2]
  }

  // ===== 接口解析（分两步：配置 + display interface 回显） =====

  // 第一步：从配置解析基础信息
  info.interfaces = parseConfigInterfaces(text, vendor)

  // 第二步：从 display interface 回显解析状态/物理字段
  const statusMap = parseInterfaceInfoLog(text)
  const briefMap = parseInterfaceBrief(text)
  const ipMap = parseConfigForIpAddress(text)
  const costMap = parseConfigForIsisCost(text)

  // 合并
  mergeDisplayInterfaceToRows(info.interfaces, statusMap, briefMap, ipMap, costMap)

  info.ifUp = info.interfaces.filter(r => r.portStatus === 'UP').length
  info.ifDown = info.interfaces.filter(r => r.portStatus === 'Down').length

  // 设备名：抓取 sysname 之后的值（即 info.hostname），写入每个接口行，供接口表「设备名」列展示
  for (const r of info.interfaces) r.deviceName = info.hostname || ''

  // BGP
  if (vendor === 'h3c') {
    if (text.match(/bgp\s+(\d+)/)) {
      const re = /peer\s+(\S+)\s+as-number\s+(\d+)/g
      let m; while ((m = re.exec(text)) !== null) info.bgpCount++
    }
  } else {
    if (text.match(/router bgp\s+(\d+)/)) {
      let re = /neighbor\s+(\S+)\s+remote-as\s+(\d+)/g
      let m; while ((m = re.exec(text)) !== null) info.bgpCount++
      if (info.bgpCount === 0) {
        re = /peer\s+(\S+)\s+as-number\s+(\d+)/g
        while ((m = re.exec(text)) !== null) info.bgpCount++
      }
    }
  }

  // ISIS
  const isisSet = new Set()
  const isisRe = /isis\s+(\S*)/g
  let isisM; while ((isisM = isisRe.exec(text)) !== null) isisSet.add(isisM[1] || '1')
  info.isisCount = isisSet.size

  // LDP
  const ldpM = text.match(/mpls ldp\s*$/gm)
  info.ldpCount = ldpM ? ldpM.length : 0
  const ldpPeerRe = /mpls ldp peer\s+(\S+)/g
  let lp; while ((lp = ldpPeerRe.exec(text)) !== null) info.ldpPeerCount++

  // SRv6
  const srv6M = text.match(/segment-routing\s+ipv6/gi)
  info.srv6Count = srv6M ? srv6M.length : 0
  const locRe = /locator\s+(\S+)/g
  let sl; while ((sl = locRe.exec(text)) !== null) info.srv6Count++

  // VLAN
  if (vendor === 'h3c') {
    const vlanRe = /^vlan\s+(\S+)(?:\s+to\s+(\S+))?\s*$/gm
    let vm
    while ((vm = vlanRe.exec(text)) !== null) {
      const start = parseInt(vm[1])
      const end = vm[2] ? parseInt(vm[2]) : start
      for (let i = start; i <= end; i++) {
        info.vlans.push({ id: i, name: '', ports: [] })
      }
    }
  } else {
    const vlanRe = /^vlan\s+(\S+)\s*$/gm
    let vm
    while ((vm = vlanRe.exec(text)) !== null) {
      const vlanId = vm[1]
      if (vlanId.includes('-')) {
        const parts = vlanId.split('-')
        if (parts.length === 2) {
          for (let i = parseInt(parts[0]); i <= parseInt(parts[1]); i++) {
            info.vlans.push({ id: i, name: '', ports: [] })
          }
        }
      } else {
        const vid = parseInt(vlanId)
        if (!isNaN(vid)) {
          const vStart = vm.index + vm[0].length
          const vRest = text.slice(vStart)
          const vBlock = vRest.match(/^(\s[\s\S]*?)(?=\nvlan\s|\n\S)/)
          const vb = vBlock ? vBlock[1] : ''
          const nameM = vb.match(/name\s+(.+)/)
          info.vlans.push({ id: vid, name: nameM ? nameM[1].trim() : '', ports: [] })
        }
      }
    }
  }
  info.vlanCount = info.vlans.length

  // 静态路由
  const srRe = /ip route-static\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(\S+))?/g
  let srM
  while ((srM = srRe.exec(text)) !== null) {
    const dest = srM[1] + '/' + netmaskToCidr(srM[2])
    const nhOrIf = srM[3]
    const maybeIf = srM[4]
    if (nhOrIf.includes('.')) {
      info.staticRoutes.push({ dest, nexthop: nhOrIf, interface: maybeIf || '' })
    } else {
      info.staticRoutes.push({ dest, nexthop: maybeIf || '', interface: nhOrIf })
    }
  }

  // 设备角色推断
  if (info.hostname) {
    const h = info.hostname.toLowerCase()
    if (h.includes('core') || h.includes('cr-')) info.role = '核心'
    else if (h.includes('agg') || h.includes('ar-')) info.role = '汇聚'
    else if (h.includes('acc') || h.includes('as-')) info.role = '接入'
    else if (h.includes('pe-') || h.includes('p-')) info.role = 'PE/P'
    else if (h.includes('ce-')) info.role = 'CE'
  }

  return info
}

// ===================== 从配置中提取 VRF =====================

function parseConfigForVrf(configText) {
  const vrfMap = {}
  if (!configText) return vrfMap
  const lines = configText.split('\n')
  let currentInterface = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^[<>\[\]]/.test(trimmed) || /^display/.test(trimmed) || /^return/.test(trimmed) || /^quit/.test(trimmed)) { currentInterface = null; continue }
    if (/^[!#]/.test(trimmed) || trimmed === '') { currentInterface = null; continue }
    const ifMatch = trimmed.match(/^interface\s+(\S+)/i)
    if (ifMatch) { currentInterface = ifMatch[1]; continue }
    if (currentInterface) {
      const vrfMatch = trimmed.match(/^ip\s+(?:binding\s+)?vpn-instance\s+(\S+)/i)
      if (vrfMatch) vrfMap[currentInterface] = vrfMatch[1]
    }
  }
  return vrfMap
}

// ===================== 导出 =====================

export {
  parseDeviceInfo,
  parseInterfaceInfoLog,
  parseInterfaceBrief,
  parseConfigForIpAddress,
  parseConfigForIsisCost,
  parseConfigForDescription,
  parseConfigForEthTrunkMembers,
  parseConfigForVrf,
}
