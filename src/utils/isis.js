// src/isis.js
import { ref, reactive, nextTick } from 'vue'
// 轻量提示：autoParseAndUpdate / handleFileChange 为历史遗留导出（当前无调用方），
// 不再引用消息组件（避免把 element-plus 拉进 Web Worker 或撑大主包），仅保留控制台提示。
function showMessage(kind, message) {
  try {
    if (kind === 'error') console.error('[parse]', message)
    else console.warn('[parse]', message)
  } catch (e) { /* ignore */ }
}


export function useIsisModule() {
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

  const isisStateTagType = (state) => {
    if (!state) return 'info'
    const stateCore = state.trim().toLowerCase()
    if (stateCore === 'up') return 'success'
    if (stateCore === 'init') return 'warning'
    if (stateCore === 'down') return 'danger'
    return 'info'
  }

  const detailFields = [
    { key: 'systemId', label: 'System Id', minWidth: 200 },
    { key: 'peerSystemId', label: 'Peer System Id', minWidth: 200 },
    { key: 'interface', label: 'Interface', minWidth: 100 },
    { key: 'state', label: 'State', minWidth: 70 },
    { key: 'holdTime', label: 'HoldTime', minWidth: 80 },
    { key: 'type', label: 'Type', minWidth: 70 },
    { key: 'uptime', label: 'Uptime', minWidth: 100 },
    { key: 'adjProtocol', label: 'Adj Protocol', minWidth: 100 },
    { key: 'endXSid', label: 'End.X Sid', minWidth: 200 },
    { key: 'circuitType', label: 'Circuit Type', minWidth: 90 },
    { key: 'circuitLevel', label: 'Circuit Level', minWidth: 90 },
    { key: 'auth', label: 'Auth', minWidth: 70 },
    { key: 'cost', label: 'Cost', minWidth: 70 }
  ]

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file.raw)
    })
  }

  const parseIsisStatusLog = (logText) => {
    const statusMap = {}
    if (!logText) return statusMap
    const lines = logText.split('\n')
    const interfaceRegex = /\b(?:400GE|100GE|GE|Eth-Trunk|Eth|XGE|GigabitEthernet)\d+(?:\/\d+)*(?:\d+)?/i
    // 判断一行是否是 systemId 独占行（不含接口名、不含冒号、不含分隔线等）
    const isSystemIdLine = (trimmed) => {
      if (!trimmed) return false
      if (trimmed.match(interfaceRegex)) return false
      if (/^---+$/.test(trimmed)) return false
      if (/Total\s+Peer/i.test(trimmed)) return false
      if (trimmed.includes(':')) return false
      if (trimmed.startsWith('<') || trimmed.startsWith('>')) return false
      if (/^display/i.test(trimmed)) return false
      // 纯字母/数字/点/星号组合（systemId 格式如 NXYC-AR2 或 2211.3020.8064*）
      if (/^[A-Za-z0-9.\-*]+$/.test(trimmed)) return true
      return false
    }

    // 接口名归一化：运行态常写缩写（GE5/0/0），配置块常写全称（GigabitEthernet5/0/0），
    // 两者需统一后才能按接口名关联 ISIS 接口参数
    const normIface = (name) => name
      .replace(/^GigabitEthernet/i, 'GE')
      .replace(/^XGigabitEthernet/i, 'XGE')
      .replace(/^TenGigE/i, 'XGE')
      .replace(/^10GE/i, 'XGE')
      .replace(/^100GE/i, '100GE')
      .replace(/^400GE/i, '400GE')
      .replace(/^Eth-Trunk/i, 'Eth-Trunk')

    // ---- 第零阶段：解析配置块里接口视图下的 ISIS 参数 ----
    // circuit-type / circuit-level / authentication-mode / cost 均位于 `interface X` 视图下
    const ifaceMap = {}
    let curIface = null
    for (const line of lines) {
      const ifaceDecl = line.match(/^\s*interface\s+(\S+)/)
      if (ifaceDecl) {
        curIface = normIface(ifaceDecl[1])
        ifaceMap[curIface] = { circuitType: '', circuitLevel: '', auth: false, cost: '' }
        continue
      }
      if (/^#$/.test(line.trim()) || /^\s*(quit|return)\b/.test(line)) curIface = null
      if (!curIface) continue
      const ct = line.match(/^\s*isis\s+circuit-type\s+(\S+)/)
      if (ct) { ifaceMap[curIface].circuitType = ct[1]; continue }
      const cl = line.match(/^\s*isis\s+circuit-level\s+(\S+)/)
      if (cl) { ifaceMap[curIface].circuitLevel = cl[1]; continue }
      if (/^\s*isis\s+authentication-mode\b/.test(line)) { ifaceMap[curIface].auth = true; continue }
      const co = line.match(/^\s*isis\s+cost\s+(\d+)/)
      if (co) { ifaceMap[curIface].cost = co[1]; continue }
    }

    // ---- 第一阶段：解析基础的 display isis peer（不带 verbose） ----
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.includes('display isis peer') || line.includes('verbose')) continue

      let idx = i + 1
      let headerFound = false
      while (idx < lines.length) {
        const trimmed = lines[idx].trim()
        if (trimmed.startsWith('<') || trimmed.startsWith('>')) break
        if (trimmed.includes('System Id') && trimmed.includes('Interface')) {
          headerFound = true
          idx++
          while (idx < lines.length && lines[idx].trim().includes('----')) idx++
          break
        }
        idx++
      }
      if (!headerFound) continue

      // 记录上一个 systemId 独占行，用于回看
      let pendingSystemIdLine = null

      while (idx < lines.length) {
        const rowLine = lines[idx].trim()
        if (rowLine.startsWith('<') || rowLine.startsWith('>') || rowLine.startsWith('display')) break

        // 先检查是否是 systemId 独占行（接口名在下一行）
        if (isSystemIdLine(rowLine)) {
          pendingSystemIdLine = rowLine.replace(/\*+$/, '')
          idx++
          continue
        }

        const interfaceMatch = rowLine.match(interfaceRegex)
        if (!interfaceMatch) { idx++; continue }

        const iface = interfaceMatch[0]
        // 从当前行截取 systemId（短名称在同一行的情况）
        let systemId = rowLine.substring(0, interfaceMatch.index).trim()

        // 如果当前行的 systemId 为空，回看上一个 systemId 独占行
        if (!systemId && pendingSystemIdLine) {
          systemId = pendingSystemIdLine
          pendingSystemIdLine = null
        }

        systemId = systemId.replace(/\*+$/, '')

        // 向后检查续行：仅当同行 systemId 看起来被截断时才做续行拼接
        // V800格式：systemId被截断到行宽边界，续行紧跟接口行之后
        //   如 "GSLZ-BB-IPNET-R GE15/1/12" → 下一行 "T01-NE40EX16C"
        // V600格式：systemId独占一行（完整），接口在下一行，无续行
        //   如 "NXYC-BC-IPNET-RT01-NE40EX16A" → "GE5/0/0"
        // 截断特征：systemId以 -R/-AR/-CR 结尾但没有后续型号部分
        //   完整名如 "NXYC-AR2" 不截断（不以 -R/-CR 的截断模式结尾）
        //   截断名如 "GSLZ-BB-IPNET-R" 以 -R 结尾（缺 T01-NE40EX16C）
        //   截断名如 "BJBJ-CR1-NE5000" 以 NE5000 结尾（缺 ECluster）
        const inlineSystemIdText = rowLine.substring(0, interfaceMatch.index).trim()
        const looksTruncated = inlineSystemIdText.length > 0 && (
          /-R$/.test(inlineSystemIdText) ||          // 如 GSLZ-BB-IPNET-R → 缺 T01-NE40EX16C
          /-NE\d+$/.test(inlineSystemIdText) ||      // 如 BJBJ-CR1-NE5000 → 缺 ECluster
          inlineSystemIdText.length > 4 && !/[A-Z]\d/.test(inlineSystemIdText.slice(-3))  // 其他截断模式
        )
        if (looksTruncated) {
          let lookAheadIdx = idx + 1
          while (lookAheadIdx < lines.length) {
            const nextTrimmed = lines[lookAheadIdx].trim()
            if (isSystemIdLine(nextTrimmed)) {
              systemId = systemId + nextTrimmed.replace(/\*+$/, '')
              lookAheadIdx++
              idx = lookAheadIdx - 1  // 跳过续行
              continue
            }
            break
          }
        }

        idx++

        const rest = rowLine.substring(interfaceMatch.index + iface.length).trim()
        const restParts = rest.split(/\s+/)

        const key = systemId + '|' + iface
        statusMap[key] = {
          systemId: systemId,
          interface: iface,
          state: restParts[1] || '',
          holdTime: restParts[3] || '',
          type: restParts[2] || '',
          uptime: '',
          adjProtocol: '',
          endXSid: '',
          peerSystemId: systemId,
          circuitType: '',
          circuitLevel: '',
          auth: false,
          cost: ''
        }
        pendingSystemIdLine = null
      }
      i = idx
    }

    // ---- 第二阶段：解析 display isis peer verbose ----
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.includes('display isis peer verbose')) continue

      let idx = i + 1
      let headerFound = false
      while (idx < lines.length) {
        const trimmed = lines[idx].trim()
        if (trimmed.startsWith('<') || trimmed.startsWith('>')) break
        if (trimmed.includes('System Id') && trimmed.includes('Interface')) {
          headerFound = true
          idx++
          while (idx < lines.length && lines[idx].trim().includes('----')) idx++
          break
        }
        idx++
      }
      if (!headerFound) continue

      let currentKey = null
      let pendingSystemIdLine = null

      while (idx < lines.length) {
        const rowLine = lines[idx].trim()
        if (rowLine.startsWith('<') || rowLine.startsWith('>') || rowLine.startsWith('display')) break

        // 检查是否是 systemId 独占行
        if (isSystemIdLine(rowLine)) {
          pendingSystemIdLine = rowLine.replace(/\*+$/, '')
          idx++
          continue
        }

        const interfaceMatch = rowLine.match(interfaceRegex)

        if (interfaceMatch) {
          const iface = interfaceMatch[0]
          let systemId = rowLine.substring(0, interfaceMatch.index).trim()

          // 如果当前行的 systemId 为空，回看上一个 systemId 独占行
          if (!systemId && pendingSystemIdLine) {
            systemId = pendingSystemIdLine
            pendingSystemIdLine = null
          }

          systemId = systemId.replace(/\*+$/, '')

          // 向后检查续行（仅当systemId看起来截断时，与第一阶段相同逻辑）
          const inlineSystemIdText = rowLine.substring(0, interfaceMatch.index).trim()
          const looksTruncated = inlineSystemIdText.length > 0 && (
            /-R$/.test(inlineSystemIdText) ||
            /-NE\d+$/.test(inlineSystemIdText) ||
            inlineSystemIdText.length > 4 && !/[A-Z]\d/.test(inlineSystemIdText.slice(-3))
          )
          if (looksTruncated) {
            let lookAheadIdx = idx + 1
            while (lookAheadIdx < lines.length) {
              const nextTrimmed = lines[lookAheadIdx].trim()
              if (isSystemIdLine(nextTrimmed)) {
                systemId = systemId + nextTrimmed.replace(/\*+$/, '')
                lookAheadIdx++
                idx = lookAheadIdx - 1
                continue
              }
              break
            }
          }

          currentKey = systemId + '|' + iface

          if (!statusMap[currentKey]) {
            statusMap[currentKey] = { systemId: systemId, interface: iface, state: '', holdTime: '', type: '', uptime: '', adjProtocol: '', endXSid: '', peerSystemId: '', circuitType: '', circuitLevel: '', auth: false, cost: '' }
          }

          const rest = rowLine.substring(interfaceMatch.index + iface.length).trim()
          const restParts = rest.split(/\s+/)
          statusMap[currentKey].state = restParts[1] || ''
          statusMap[currentKey].holdTime = restParts[2] || ''
          statusMap[currentKey].type = restParts[3] || ''

          idx++
          pendingSystemIdLine = null
          continue
        }

        if (currentKey && statusMap[currentKey]) {
          if (rowLine.includes('Uptime')) {
            const colonIdx = rowLine.indexOf(':')
            if (colonIdx !== -1) {
              statusMap[currentKey].uptime = rowLine.substring(colonIdx + 1).trim()
            }
          }
          if (rowLine.includes('Adj Protocol')) {
            const colonIdx = rowLine.indexOf(':')
            if (colonIdx !== -1) {
              statusMap[currentKey].adjProtocol = rowLine.substring(colonIdx + 1).trim()
            }
          }
          if (rowLine.includes('End.X Sid')) {
            const sidMatch = rowLine.match(/End\.X Sid\s*:\s*([^\s\(]+)/)
            if (sidMatch) {
              statusMap[currentKey].endXSid = sidMatch[1].trim()
            }
          }
          // 提取 Peer System Id（邻居 ID）
          // 注意：基础 display isis peer 的 System Id 列是主机名（更可读），
          // 而 verbose 的 Peer System Id 行是数字形式 System ID。
          // 优先保留主机名（第一阶段已写入），仅当为空时才用数字形式兜底。
          if (rowLine.includes('Peer System Id')) {
            const colonIdx = rowLine.indexOf(':')
            if (colonIdx !== -1) {
              const v = rowLine.substring(colonIdx + 1).trim()
              if (!statusMap[currentKey].peerSystemId) statusMap[currentKey].peerSystemId = v
            }
          }
        }
        idx++
      }
      i = idx
    }

    // ---- 将接口配置参数关联回邻接行（按归一化接口名） ----
    for (const key in statusMap) {
      const im = ifaceMap[normIface(statusMap[key].interface)]
      if (im) {
        statusMap[key].circuitType = im.circuitType
        statusMap[key].circuitLevel = im.circuitLevel
        statusMap[key].auth = im.auth
        statusMap[key].cost = im.cost
      }
    }

    return statusMap
  }

  const mergeIsisStatusToTable = (statusMap) => {
    const newRows = []
    for (const key in statusMap) {
      const status = statusMap[key]
      const uniqueKey = status.endXSid || `${status.systemId}|${status.interface}`
      newRows.push({
        _key: uniqueKey,
        systemId: status.systemId,
        interface: status.interface,
        state: status.state,
        holdTime: status.holdTime,
        type: status.type,
        uptime: status.uptime,
        adjProtocol: status.adjProtocol,
        endXSid: status.endXSid,
        peerSystemId: status.peerSystemId || '',
        circuitType: status.circuitType || '',
        circuitLevel: status.circuitLevel || '',
        auth: status.auth || false,
        cost: status.cost || '',
        configDiffFields: [],
        isConsistent: null
      })
    }
    return newRows
  }

  const updateIsisTableWithDiff = (beforeStatus, afterStatus) => {
    neighborList.value.forEach(row => {
      const key = row._key || row.endXSid || `${row.systemId}|${row.interface}`
      if (!key) {
        row.configDiffFields = []
        row.isConsistent = false
        return
      }
      const bStatus = beforeStatus[key] || {}
      const aStatus = afterStatus[key] || {}
      const diffFields = []
      const fields = ['interface', 'state', 'holdTime', 'type', 'uptime', 'adjProtocol', 'endXSid', 'circuitType', 'circuitLevel', 'auth', 'cost']
      fields.forEach(f => {
        const bVal = bStatus[f] ?? ''
        const aVal = aStatus[f] ?? ''
        if (String(bVal) !== String(aVal)) {
          diffFields.push({ field: f, beforeVal: String(bVal)||'-', afterVal: String(aVal)||'-' })
        }
      })
      row.configDiffFields = diffFields
      if (Object.keys(bStatus).length === 0) row.isConsistent = false
      else if (Object.keys(aStatus).length === 0) row.isConsistent = false
      else if (diffFields.length > 0) row.isConsistent = false
      else row.isConsistent = true
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
    const beforeStatus = parseIsisStatusLog(beforeText)
    const afterStatus = parseIsisStatusLog(afterText)

    let statusCount = 0
    if (afterText) {
      neighborList.value = mergeIsisStatusToTable(afterStatus)
      statusCount = Object.keys(afterStatus).length
    } else if (beforeText) {
      neighborList.value = mergeIsisStatusToTable(beforeStatus)
      statusCount = Object.keys(beforeStatus).length
    }

    if (beforeText && afterText && Object.keys(beforeStatus).length > 0 && Object.keys(afterStatus).length > 0) {
      updateIsisTableWithDiff(beforeStatus, afterStatus)
    }

    const msgParts = []
    if (statusCount > 0) msgParts.push(`${statusCount} 条 ISIS 邻居`)
    const msg = msgParts.length > 0
      ? `ISIS 解析完成：${msgParts.join('，')}${(beforeText && afterText) ? '，差异已映射到表格' : ''}`
      : 'ISIS 解析到 0 条有效数据，请检查文件中是否包含 display isis peer verbose'

    if (showMessage) {
      showMessage(statusCount > 0 ? 'success' : 'warning', msg)
    } else {
      showMessage(statusCount > 0 ? 'success' : 'warning', msg)
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
    stateTagType: isisStateTagType,
    detailFields,
    updateNeighbors,
    autoParseAndUpdate,
    handleFileChange,
    parseIsisStatusLog,
    mergeIsisStatusToTable
  }
}
