// src/ldpPeer.js
import { ref, reactive, nextTick } from 'vue'
// 轻量提示：autoParseAndUpdate / handleFileChange 为历史遗留导出（当前无调用方），
// 不再引用消息组件（避免把 element-plus 拉进 Web Worker 或撑大主包），仅保留控制台提示。
function showMessage(kind, message) {
  try {
    if (kind === 'error') console.error('[parse]', message)
    else console.warn('[parse]', message)
  } catch (e) { /* ignore */ }
}


export function useLdpPeerModule() {
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

  const ldpStateTagType = (state) => {
    if (!state) return 'info'
    const stateCore = state.trim().toLowerCase()
    if (stateCore === 'operational') return 'success'
    if (stateCore === 'non-operational') return 'danger'
    return 'info'
  }

  const detailFields = [
    { key: 'peerId', label: 'PeerID', minWidth: 160 },
    { key: 'transportAddress', label: '传输地址', minWidth: 130 },
    { key: 'discoveryInterfaces', label: '发现接口', minWidth: 180 }
  ]

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file.raw)
    })
  }

  const parseLdpPeerLog = (logText) => {
    const statusMap = {}
    if (!logText) return statusMap

    const lines = logText.split('\n')
    let parseStarted = false
    let currentPeerId = null

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.includes('LDP Peer Information')) {
        parseStarted = true
        continue
      }

      if (!parseStarted) continue

      if (/^----+$/.test(trimmed)) continue
      if (/^[<>]/.test(trimmed) || /^display/.test(trimmed)) break
      if (trimmed.includes('PeerID') || trimmed.includes('TransportAddress')) continue
      if (trimmed.includes('asterisk')) continue
      if (!trimmed) continue

      if (trimmed.startsWith('TOTAL:')) continue

      if (trimmed.includes(':0')) {
        const parts = trimmed.split(/\s+/)
        let peerId = parts[0]
        let transportAddress = parts[1] || ''
        let interfaceList = parts.slice(2).join(' ') ? [parts.slice(2).join(' ')] : []

        currentPeerId = peerId
        if (!statusMap[peerId]) {
          statusMap[peerId] = {
            peerId: peerId,
            transportAddress: transportAddress,
            discoveryInterfaces: interfaceList
          }
        }
      } else {
        if (currentPeerId && statusMap[currentPeerId]) {
          const iface = trimmed
          if (iface && !statusMap[currentPeerId].discoveryInterfaces.includes(iface)) {
            statusMap[currentPeerId].discoveryInterfaces.push(iface)
          }
        }
      }
    }

    // 对每个邻居的发现接口按字母+数字自然排序（Eth-Trunk2 < Eth-Trunk10）
    const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true })
    for (const key in statusMap) {
      statusMap[key].discoveryInterfaces.sort(naturalSort)
    }

    return statusMap
  }

  const mergeLdpPeerToTable = (statusMap) => {
    const newRows = []
    for (const key in statusMap) {
      const status = statusMap[key]
      newRows.push({
        _key: key,
        peerId: status.peerId,
        transportAddress: status.transportAddress,
        discoveryInterfaces: status.discoveryInterfaces,
        state: '正常',
        configDiffFields: [],
        isConsistent: null
      })
    }
    return newRows
  }

  const updateLdpPeerTableWithDiff = (beforeStatus, afterStatus) => {
    neighborList.value.forEach(row => {
      const key = row._key || row.peerId
      const bStatus = beforeStatus[key] || {}
      const aStatus = afterStatus[key] || {}
      const diffFields = []
      const fields = ['transportAddress', 'discoveryInterfaces']

      fields.forEach(f => {
        const bVal = bStatus[f] ?? []
        const aVal = aStatus[f] ?? []
        const bStr = Array.isArray(bVal) ? bVal.join(', ') : String(bVal)
        const aStr = Array.isArray(aVal) ? aVal.join(', ') : String(aVal)
        if (bStr !== aStr) {
          diffFields.push({
            field: f,
            beforeVal: bStr || '-',
            afterVal: aStr || '-'
          })
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
    const beforeStatus = parseLdpPeerLog(beforeText)
    const afterStatus = parseLdpPeerLog(afterText)

    let statusCount = 0
    if (afterText) {
      neighborList.value = mergeLdpPeerToTable(afterStatus)
      statusCount = Object.keys(afterStatus).length
    } else if (beforeText) {
      neighborList.value = mergeLdpPeerToTable(beforeStatus)
      statusCount = Object.keys(beforeStatus).length
    }

    if (beforeText && afterText && Object.keys(beforeStatus).length > 0 && Object.keys(afterStatus).length > 0) {
      updateLdpPeerTableWithDiff(beforeStatus, afterStatus)
    }

    const msgParts = []
    if (statusCount > 0) msgParts.push(`${statusCount} 条 LDP 邻居`)
    const msg = msgParts.length > 0
      ? `LDP 邻居解析完成：${msgParts.join('，')}${(beforeText && afterText) ? '，差异已映射到表格' : ''}`
      : 'LDP 邻居解析到 0 条有效数据，请检查文件中是否包含 display mpls ldp peer'

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
    stateTagType: ldpStateTagType,
    detailFields,
    updateNeighbors,
    autoParseAndUpdate,
    handleFileChange,
    parseLdpPeerLog,
    mergeLdpPeerToTable
  }
}