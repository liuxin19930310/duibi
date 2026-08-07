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
    protoStatus: '-',
    isisCost: '-',
    interfaceRate: '-',
    opticalPower: '-',
    rxWarningRange: '-',
    txWarningRange: '-',
    rxPower: '-',
    txPower: '-',
    rxPowerOk: null,
    txPowerOk: null,
    inUti: '-',
    outUti: '-',
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
    // 忽略 LoopBack / NULL / Eth-Trunk 聚合口（成员口名为 GE/100GE，不受影响）
    if (/^(NULL|LoopBack)/i.test(ifName)) continue
    if (/^Eth-Trunk/i.test(ifName)) continue
    if (seen.has(ifName)) continue
    seen.add(ifName)

    const row = createRow(ifName)

    const startIdx = ifMatch.index + ifMatch[0].length
    const restText = text.slice(startIdx)
    const blockMatch = restText.match(/^(\s[\s\S]*?)(?=\n\S|\n#$)/)
    const block = blockMatch ? blockMatch[1] : ''

    const descMatch = block.match(/^\s*description[ \t]+(.+)$/im)
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

    const descMatch = blockText.match(/Description:[ \t]*([^\r\n]*)/i)
    if (descMatch && descMatch[1].trim()) row.description = descMatch[1].trim()

    const trunkMatch = blockText.match(/eth-trunk[ \t]+(\d+)/i)
    if (trunkMatch) row.ethTrunk = `Eth-Trunk${trunkMatch[1]}`

    // Tunnel 接口特殊处理：unnumbered 地址从 LoopBack 借用
    const unnumMatch = blockText.match(/Internet Address is unnumbered, using address of \S+\(([\d.]+)\/(\d+)\)/i)
    if (unnumMatch) row.ipv4 = unnumMatch[1] + '/' + unnumMatch[2]

    let rxVals = [], txVals = []
    let multiRxTxRegex = /Rx Power\[(\d+)\]:[ \t]*([-.\d]+)dBm,[ \t]*Tx\1 Power:[ \t]*([-.\d]+)dBm/gi
    let match
    while ((match = multiRxTxRegex.exec(blockText)) !== null) {
      rxVals.push(match[2]); txVals.push(match[3])
    }
    if (rxVals.length === 0) {
      multiRxTxRegex = /Rx(\d+) Power:[ \t]*([-.\d]+)dBm,[ \t]*Tx\1 Power:[ \t]*([-.\d]+)dBm/gi
      while ((match = multiRxTxRegex.exec(blockText)) !== null) {
        rxVals.push(match[2]); txVals.push(match[3])
      }
    }
    if (rxVals.length === 0) {
      const singleRxMatch = blockText.match(/(?:Rx Power(?::|\[\d+\]:))[ \t]*([-.\d]+)dBm/i)
      const singleTxMatch = blockText.match(/(?:Tx Power(?::|\[\d+\]:))[ \t]*([-.\d]+)dBm/i)
      if (singleRxMatch && singleTxMatch) {
        rxVals.push(singleRxMatch[1]); txVals.push(singleTxMatch[1])
      }
    }
    // 收光值/发光值：四路整合为 a|b|c|d，单路取单值；无光（-40.00 占位）也原样显示
    if (rxVals.length > 0) {
      row.rxPower = rxVals.join('|')
      row.txPower = txVals.join('|')
      // 兼容字段：光功率（Rx:.. Tx:.. 合成），供配置对比页 git 版「光功率」列
      row.opticalPower = `Rx:${rxVals.join('|')} Tx:${txVals.join('|')}`
    }

    // 收光/发光告警范围：兼容两种格式
    //   A（100GE 四通道）：Rx Warning range: [-10.604,  4.499]dBm, Tx Warning range: [-4.300,  4.499]dBm（Rx/Tx 同一行）
    //   B（GE/10GE 单通道）：Rx Power:  -4.32dBm, Warning range: [-14.400,  0.499]dBm（无 Rx Warning range 前缀，跟在 Power 后）
    const rxRangeMatch = blockText.match(/Rx[ \t]+Warning[ \t]+range:[ \t]*(\[[^\]]+\])/i)
      || blockText.match(/Rx[ \t]+Power:[^\r\n]*?Warning[ \t]+range:[ \t]*(\[[^\]]+\])/i)
    if (rxRangeMatch) row.rxWarningRange = rxRangeMatch[1]
    const txRangeMatch = blockText.match(/Tx[ \t]+Warning[ \t]+range:[ \t]*(\[[^\]]+\])/i)
      || blockText.match(/Tx[ \t]+Power:[^\r\n]*?Warning[ \t]+range:[ \t]*(\[[^\]]+\])/i)
    if (txRangeMatch) row.txWarningRange = txRangeMatch[1]

    // 收光值/发光值是否在告警范围内（true=全部在范围内→绿, false=有超范围→红, null=无数据/全N/A→不着色）
    const rangeVals = (s) => { const m = s && s.match(/\[(-?[\d.]+),\s*(-?[\d.]+)\]/); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null }
    const judgePower = (valsStr, rangeStr) => {
      const range = rangeVals(rangeStr)
      if (!range || !valsStr || valsStr === '-') return null
      // -40.00 = 无光占位值，不参与范围判定（无光口不着红绿）
      const nums = valsStr.split('|').filter(v => v !== '-40.00').map(Number)
      if (!nums.length) return null
      return nums.every(v => v >= range[0] && v <= range[1])
    }
    row.rxPowerOk = judgePower(row.rxPower, row.rxWarningRange)
    row.txPowerOk = judgePower(row.txPower, row.txWarningRange)

    const lanWanMatch = blockText.match(/\b(LAN|WAN)[ \t]+full-duplex[ \t]+mode/i)
    if (lanWanMatch) row.mtuL1L2 = lanWanMatch[1]

    const rateMatch = blockText.match(/Port BW:[ \t]*([^\s,]+)/i)
    if (rateMatch) row.interfaceRate = rateMatch[1]

    const modeMatch = blockText.match(/Transceiver Mode:[ \t]*([^\r\n]*)/i)
    if (modeMatch && modeMatch[1].trim()) row.moduleType = modeMatch[1].trim()

    const distMatch = blockText.match(/Transmission Distance:[ \t]*(\S+)/i)
    if (distMatch) row.moduleDistance = distMatch[1]

    const mtuMatch = blockText.match(/The Maximum Transmit Unit is (\d+)/i)
    if (mtuMatch) row.mtu = mtuMatch[1]

    const lossMatch = blockText.match(/Lost:[ \t]*(\d+)[ \t]+packets/i)
    if (lossMatch) row.packetLossRate = lossMatch[1]

    const crcMatch = blockText.match(/CRC:[ \t]*(\d+)[ \t]+packets/i)
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

// ===================== 解析 display interface brief 回显（入/出向流量 InUti/OutUti） =====================

function parseInterfaceBrief(logText) {
  const utilMap = {}
  if (!logText) return utilMap
  const lines = logText.split('\n')
  let inBrief = false
  let headerIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    // 进入触发1：命令行回显（兼容老采集脚本）
    if (lines[i].includes('display interface brief') || /display\s+int(erface)?\s+brief/i.test(lines[i])) {
      inBrief = true
      headerIdx = -1
      continue
    }
    if (!inBrief) {
      // 进入触发2（双保险）：表头双列命中，抗「命令行被剥」场景
      if (/\bInUti\b/.test(trimmed) && /\bOutUti\b/.test(trimmed) && !/^display/i.test(trimmed)) {
        inBrief = true
        headerIdx = i
        continue
      }
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
    if (/^---+$/.test(trimmed)) continue

    const parts = trimmed.split(/\s+/)
    let inUtiIdx = -1, outUtiIdx = -1
    for (let j = 0; j < parts.length; j++) {
      if (parts[j].includes('%')) {
        if (inUtiIdx === -1) inUtiIdx = j
        else if (outUtiIdx === -1) outUtiIdx = j
      }
    }
    if (inUtiIdx >= 0 && outUtiIdx >= 0 && inUtiIdx !== outUtiIdx) {
      const ifName = parts[0].replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
      // 忽略规则：LoopBack / NULL / Eth-Trunk 聚合口忽略；成员口（缩进行）保留
      if (/^(LoopBack|NULL)/i.test(ifName)) continue
      const isMember = lines[i][0] === ' ' || lines[i][0] === '\t'
      if (/^Eth-Trunk/i.test(ifName) && !isMember) continue
      utilMap[ifName] = { inUti: parts[inUtiIdx], outUti: parts[outUtiIdx] }
    }
  }
  return utilMap
}

// ===================== 从 display interface brief 提取接口名清单（主数据源） =====================

// 返回 brief 中的接口名清单（含实测 PHY/Protocol 状态），已应用忽略规则。
// 用途：作为「接口」列表头的主数据源，与配置段并集（配置段补缺），成员口进表。
function parseBriefInterfaces(logText) {
  const result = []
  if (!logText) return result
  const lines = logText.split('\n')
  let inBrief = false
  let headerIdx = -1
  const seen = new Set()
  let currentTrunk = null

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    if (lines[i].includes('display interface brief') || /display\s+int(erface)?\s+brief/i.test(lines[i])) {
      inBrief = true
      headerIdx = -1
      continue
    }
    if (!inBrief) {
      if (/\bInUti\b/.test(trimmed) && /\bOutUti\b/.test(trimmed) && !/^display/i.test(trimmed)) {
        inBrief = true
        headerIdx = i
        continue
      }
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
    if (/^---+$/.test(trimmed)) continue

    const parts = trimmed.split(/\s+/)
    let inUtiIdx = -1, outUtiIdx = -1
    for (let j = 0; j < parts.length; j++) {
      if (parts[j].includes('%')) {
        if (inUtiIdx === -1) inUtiIdx = j
        else if (outUtiIdx === -1) outUtiIdx = j
      }
    }
    if (inUtiIdx < 0 || outUtiIdx < 0 || inUtiIdx === outUtiIdx) continue

    const ifName = parts[0].replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
    if (/^(LoopBack|NULL)/i.test(ifName)) continue
    const isMember = lines[i][0] === ' ' || lines[i][0] === '\t'

    // 记录聚合口归属：遇到 Eth-Trunk 聚合逻辑口（顶格）时更新 currentTrunk，
    // 其后缩进的成员行即可归属到该聚合口；遇到普通顶格接口时清空，避免误继承。
    if (/^Eth-Trunk/i.test(ifName)) {
      if (!isMember) { currentTrunk = ifName; continue } // 聚合口本身忽略，仅记录归属
    } else if (!isMember) {
      currentTrunk = null
    }

    if (seen.has(ifName)) continue
    seen.add(ifName)
    result.push({ name: ifName, phy: parts[1] || '-', proto: parts[2] || '-', ethTrunk: isMember ? (currentTrunk || '-') : '-' })
  }
  return result
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

// ===================== 从配置中提取 COST值（IPv4 + IPv6 双采集） =====================

// 返回: { 接口名: { v4: '20000'|null, v6: '20000'|null } }
//   v4 来自 `isis cost N [level-x]`，v6 来自 `isis ipv6 cost N [level-x]`（两者互斥，正则天然区分）
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
      const v4Match = trimmed.match(/^isis\s+cost\s+(\d+)/i)
      if (v4Match) {
        const e = costMap[currentInterface] || (costMap[currentInterface] = { v4: null, v6: null })
        e.v4 = v4Match[1]
        continue
      }
      const v6Match = trimmed.match(/^isis\s+ipv6\s+cost\s+(\d+)/i)
      if (v6Match) {
        const e = costMap[currentInterface] || (costMap[currentInterface] = { v4: null, v6: null })
        e.v6 = v6Match[1]
      }
    }
  }
  return costMap
}

// 展示值："v4|v6"（如 20000|20000），缺侧用 '-'；两侧全缺返回 '-'（不显示 '-|-')
function isisCostDisplay(entry) {
  if (!entry) return '-'
  const v4 = entry.v4 || '-'
  const v6 = entry.v6 || '-'
  if (v4 === '-' && v6 === '-') return '-'
  return `${v4}|${v6}`
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

// ===================== 解析 Eth-Trunk 聚合口（配置解析·聚合口面板） =====================

// 返回聚合口行数组：interfaceName/deviceName/description/mtu/ipv4/ipv6/isisCost(v4|v6)/
//   trunkStatus(聚合口自身 brief PHY)/portStatus(成员物理口状态汇总)/protoStatus/inUti/outUti/members
function parseEthTrunks(text) {
  const result = []
  if (!text) return result
  const sysname = (text.match(/\bsysname\s+(\S+)/i) || [])[1] || ''
  const seen = new Set()
  const blockRegex = /^interface\s+(Eth-Trunk\d+(?:\.\d+)?)\s*$/gim
  let m
  while ((m = blockRegex.exec(text)) !== null) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    const rest = text.slice(m.index + m[0].length)
    const bm = rest.match(/^(\s[\s\S]*?)(?=\n\S|\n#$)/) || rest.match(/^(\s[\s\S]*)$/)
    const block = bm ? bm[1] : ''
    const row = { interfaceName: name, deviceName: sysname, description: '-', mtu: '-', ipv4: '-', ipv6: '-', vrf: '-', isisCost: '-', trunkStatus: '-', portStatus: '-', protoStatus: '-', inUti: '-', outUti: '-', members: '-' }
    const desc = block.match(/description\s+(.+)/i)
    if (desc) row.description = desc[1].trim()
    const mtu = block.match(/^\s*mtu\s+(\d+)\s*$/im)
    if (mtu) row.mtu = mtu[1]
    const ip4 = block.match(/ip\s+address\s+(\S+)\s+(\S+)/i)
    if (ip4 && ip4[1] !== 'unnumbered') row.ipv4 = ip4[1] + '/' + netmaskToCidr(ip4[2])
    const ip6 = block.match(/ipv6\s+address\s+(\S+)/i)
    if (ip6) row.ipv6 = ip6[1]
    const vrf = block.match(/ip\s+binding\s+vpn-instance\s+(\S+)/i) || block.match(/binding\s+vpn-instance\s+(\S+)/i)
    if (vrf) row.vrf = vrf[1]
    const isisV4 = block.match(/^\s*isis\s+cost\s+(\d+)/im)
    const isisV6 = block.match(/^\s*isis\s+ipv6\s+cost\s+(\d+)/im)
    if (isisV4 || isisV6) row.isisCost = isisCostDisplay({ v4: isisV4 ? isisV4[1] : null, v6: isisV6 ? isisV6[1] : null })
    result.push(row)
  }
  if (!result.length) return result

  // brief：Eth-Trunk 顶格行取聚合口自身状态（trunkStatus/Proto/InUti/OutUti），
  // 缩进成员行与普通顶格行记录 PHY 供「物理口状态」列汇总
  const lines = text.split('\n')
  let inBrief = false
  let headerIdx = -1
  const briefPhy = {}
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (lines[i].includes('display interface brief') || /display\s+int(erface)?\s+brief/i.test(lines[i])) { inBrief = true; headerIdx = -1; continue }
    if (!inBrief) {
      if (/\bInUti\b/.test(trimmed) && /\bOutUti\b/.test(trimmed) && !/^display/i.test(trimmed)) { inBrief = true; headerIdx = i; continue }
      continue
    }
    if (/^[<>]/.test(trimmed) || (/^display/i.test(trimmed) && !/interface\s+brief/i.test(trimmed))) { inBrief = false; continue }
    if (trimmed.includes(':') && !trimmed.includes('%')) continue
    if (headerIdx < 0 && /\bInUti\b/.test(trimmed) && /\bOutUti\b/.test(trimmed)) { headerIdx = i; continue }
    if (headerIdx < 0) continue
    if (!trimmed || /^---+$/.test(trimmed)) continue
    // 只处理：顶格 Eth-Trunk 行 + 缩进成员行（行首空格需看原始行 lines[i]，trimmed 已丢失缩进）
    const isIndent = lines[i][0] === ' ' || lines[i][0] === '\t'
    if (!/^Eth-Trunk/i.test(trimmed) && !isIndent) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 3) continue
    const rawName = parts[0]
    const phy = parts[1]
    const proto = parts[2]
    if (!isIndent && /^Eth-Trunk/i.test(rawName)) {
      const name = rawName.replace(/^\*+/, '')
      const row = result.find(r => r.interfaceName === name)
      if (!row) continue
      row.trunkStatus = phy
      row.protoStatus = proto
      let inUtiIdx = -1, outUtiIdx = -1
      for (let j = 0; j < parts.length; j++) {
        if (parts[j].includes('%')) { if (inUtiIdx === -1) inUtiIdx = j; else if (outUtiIdx === -1) outUtiIdx = j }
      }
      if (inUtiIdx >= 0 && outUtiIdx >= 0 && inUtiIdx !== outUtiIdx) { row.inUti = parts[inUtiIdx]; row.outUti = parts[outUtiIdx] }
    } else {
      // 成员行/普通顶格行：记录 PHY（成员口可能带 (10G) 速率后缀，归一化）
      const ifName = rawName.replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
      briefPhy[ifName] = phy
    }
  }

  // display interface 回显补充（仅当 brief 未覆盖聚合口自身状态）
  const statusMap = parseInterfaceInfoLog(text)
  for (const row of result) {
    const st = statusMap[row.interfaceName]
    if (st) {
      if (row.trunkStatus === '-' && st.portStatus !== '-') row.trunkStatus = st.portStatus
      if (row.protoStatus === '-' && st.protoStatus !== '-') row.protoStatus = st.protoStatus
    }
  }

  // 成员口：列表 + 物理口状态汇总（取自 brief PHY）
  const trunkMap = parseConfigForEthTrunkMembers(text)
  for (const row of result) {
    const members = trunkMap[row.interfaceName]
    if (Array.isArray(members) && members.length) {
      row.members = members.join(', ')
      const sts = members.map(n => briefPhy[n]).filter(v => v)
      if (sts.length) row.portStatus = sts.join(',')
    }
  }
  return result
}

// ===================== 合并接口状态到 rows =====================

function mergeDisplayInterfaceToRows(rows, statusMap, briefMap, ipMap, costMap) {
  const normIf = n => n.replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
  rows.forEach(row => {
    const key = row.interfaceName
    // 利用率匹配：精确优先，回落到去速率后缀的归一化匹配（兼容 brief 输出带 (10G) 的情况）
    const bKey = briefMap[key] ? key : (briefMap[normIf(key)] ? normIf(key) : null)
    if (bKey) {
      const bv = briefMap[bKey]
      if (bv) {
        row.inUti = bv.inUti || '-'
        row.outUti = bv.outUti || '-'
        // 兼容字段：入/出利用率（in/out 合成），供配置对比页 git 版「入/出利用率」列
        row.bandwidthUtil = `${bv.inUti}/${bv.outUti}`
      }
    }
    const status = statusMap[key]
    if (status) {
      // 物理状态以 display interface brief 的 PHY 为准，display interface 回显不再覆盖 portStatus（协议状态同理仅来自 brief Protocol）
      // if (status.portStatus !== '-') row.portStatus = status.portStatus
      if (status.opticalPower !== '-') row.opticalPower = status.opticalPower
      if (status.rxWarningRange !== '-') row.rxWarningRange = status.rxWarningRange
      if (status.txWarningRange !== '-') row.txWarningRange = status.txWarningRange
      if (status.rxPower !== '-') row.rxPower = status.rxPower
      if (status.txPower !== '-') row.txPower = status.txPower
      if (status.rxPowerOk !== undefined) row.rxPowerOk = status.rxPowerOk
      if (status.txPowerOk !== undefined) row.txPowerOk = status.txPowerOk
      if (status.mtuL1L2 !== '-') row.mtuL1L2 = status.mtuL1L2
      // 补缺：配置段无 mtu 时用 display interface 的 The Maximum Transmit Unit 值
      if (row.mtu === '-' && status.mtu !== '-') row.mtu = status.mtu
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
    const costDisp = isisCostDisplay(costMap[key])
    if (costDisp !== '-') row.isisCost = costDisp
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

  // ===== 接口解析 =====
  // 第一步：从配置解析基础信息（已忽略 LoopBack / NULL / Eth-Trunk 聚合口）
  const cfgRows = parseConfigInterfaces(text, vendor)

  // 第二步：以 display interface brief 为「接口」列主数据源，与配置段并集（配置段补缺）
  // brief 提供实测 PHY/Protocol 状态，修正配置段默认全 UP 的偏差（display interface 回显之后会优先覆盖）
  const briefIfs = parseBriefInterfaces(text)
  const cfgNameSet = new Set(cfgRows.map(r => r.interfaceName))
  briefIfs.forEach(b => {
    if (cfgNameSet.has(b.name)) {
      const row = cfgRows.find(r => r.interfaceName === b.name)
      if (row) {
        if (b.phy) row.portStatus = b.phy
        if (b.proto) row.protoStatus = b.proto
      }
    } else {
      const row = createRow(b.name)
      row.portStatus = b.phy || '-'
      row.protoStatus = b.proto || '-'
      if (b.ethTrunk && b.ethTrunk !== '-') row.ethTrunk = b.ethTrunk
      cfgRows.push(row)
    }
  })
  info.interfaces = cfgRows

  // 第三步：display interface 回显 + brief 利用率 + 配置 IP/COST 合并
  const statusMap = parseInterfaceInfoLog(text)
  const briefMap = parseInterfaceBrief(text)
  const ipMap = parseConfigForIpAddress(text)
  const costMap = parseConfigForIsisCost(text)

  // 合并
  mergeDisplayInterfaceToRows(info.interfaces, statusMap, briefMap, ipMap, costMap)

  info.ifUp = info.interfaces.filter(r => /^up$/i.test(r.portStatus)).length
  info.ifDown = info.interfaces.filter(r => /down/i.test(r.portStatus)).length

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

// ===================== 解析 VRF 实例 =====================

/**
 * 从配置文本中解析所有 ip vpn-instance 实例，返回 [{ vrfName, rd, exportTargets, importTargets, interfaces }]。
 * 同时扫描接口下的 binding vpn-instance 补充 interfaces 关联。
 */
function parseVrfInstances(configText) {
  const rows = []
  if (!configText) return rows
  const lines = configText.split('\n')
  const vrfMap = {} // vrfName -> { rd, exportTargets, importTargets, interfaces: Set }

  let inVrfBlock = false
  let currentVrf = null

  for (const line of lines) {
    const trimmed = line.trim()

    // 进入 vpn-instance 块
    const vrfStart = trimmed.match(/^ip\s+vpn-instance\s+(\S+)/i)
    if (vrfStart) {
      currentVrf = vrfStart[1]
      inVrfBlock = true
      if (!vrfMap[currentVrf]) vrfMap[currentVrf] = { rd: '', exportTargets: [], importTargets: [], interfaces: new Set() }
      continue
    }

    // 块结束标记
    if (inVrfBlock && (/^#/.test(trimmed) || /^interface\s+/i.test(trimmed) || /^return/i.test(trimmed))) {
      inVrfBlock = false
      currentVrf = null
      continue
    }

    // 块内字段
    if (inVrfBlock && currentVrf) {
      const rdMatch = trimmed.match(/^route-distinguisher\s+(\S+)/i)
      if (rdMatch) { vrfMap[currentVrf].rd = rdMatch[1]; continue }
      const rtExport = trimmed.match(/^vpn-target\s+(\S+)\s+export-extcommunity/i)
      if (rtExport) { vrfMap[currentVrf].exportTargets.push(rtExport[1]); continue }
      const rtImport = trimmed.match(/^vpn-target\s+(\S+)\s+import-extcommunity/i)
      if (rtImport) { vrfMap[currentVrf].importTargets.push(rtImport[1]); continue }
      // 兼容 vpn-target x:x both（同时 import+export）
      const rtBoth = trimmed.match(/^vpn-target\s+(\S+)\s+(both|extcommunity)/i)
      if (rtBoth) {
        vrfMap[currentVrf].exportTargets.push(rtBoth[1])
        vrfMap[currentVrf].importTargets.push(rtBoth[1])
        continue
      }
    }

    // 接口绑定 VRF（补充 interfaces）
    const bindMatch = trimmed.match(/^(?:ip\s+)?binding\s+vpn-instance\s+(\S+)/i)
    if (bindMatch) {
      const vrfName = bindMatch[1]
      if (!vrfMap[vrfName]) vrfMap[vrfName] = { rd: '', exportTargets: [], importTargets: [], interfaces: new Set() }
      // 需要追踪当前接口名——这里用简化方式：后续 merge 阶段从接口表补
    }
  }

  // 从接口级 VRF 绑定补充 interfaces（复用 parseConfigForVrf 的反向映射）
  const ifaceVrfMap = parseConfigForVrf(configText) // { interfaceName: vrfName }
  for (const [ifaceName, vrfName] of Object.entries(ifaceVrfMap)) {
    if (!vrfMap[vrfName]) vrfMap[vrfName] = { rd: '', exportTargets: [], importTargets: [], interfaces: new Set() }
    vrfMap[vrfName].interfaces.add(ifaceName)
  }

  // 转为数组
  for (const [vrfName, info] of Object.entries(vrfMap)) {
    rows.push({
      vrfName,
      rd: info.rd || '—',
      exportTargets: info.exportTargets.length ? info.exportTargets.join(', ') : '—',
      importTargets: info.importTargets.length ? info.importTargets.join(', ') : '—',
      interfaces: info.interfaces.size ? [...info.interfaces].join(', ') : '—'
    })
  }

  return rows
}

// ===================== 导出 =====================

export {
  parseDeviceInfo,
  parseInterfaceInfoLog,
  parseInterfaceBrief,
  parseBriefInterfaces,
  parseConfigForIpAddress,
  parseConfigForIsisCost,
  isisCostDisplay,
  parseConfigForDescription,
  parseConfigForEthTrunkMembers,
  parseEthTrunks,
  parseConfigForVrf,
  parseVrfInstances,
}
