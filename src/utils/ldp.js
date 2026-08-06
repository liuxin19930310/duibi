// src/ldp.js
import { ref, reactive, nextTick } from 'vue'
// 轻量提示：autoParseAndUpdate / handleFileChange 为历史遗留导出（当前无调用方），
// 不再引用消息组件（避免把 element-plus 拉进 Web Worker 或撑大主包），仅保留控制台提示。
function showMessage(kind, message) {
  try {
    if (kind === 'error') console.error('[parse]', message)
    else console.warn('[parse]', message)
  } catch (e) { /* ignore */ }
}


export function useLdpModule() {
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
    { key: 'peerId', label: 'PeerID', minWidth: 60 },
    { key: 'status', label: '会话状态', minWidth: 60 },
    { key: 'lam', label: 'LAM', minWidth: 60 },
    { key: 'ssnRole', label: '会话角色', minWidth: 60 },
    { key: 'ssnAge', label: '会话时长', minWidth: 50 }
  ]

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file.raw)
    })
  }

  const parseLdpSessionLog = (logText) => {
    const statusMap = {}
    if (!logText) return statusMap

    const lines = logText.split('\n')
    let parseStarted = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.includes('LDP Session(s)')) {
        parseStarted = true
        continue
      }

      if (!parseStarted) continue

      if (/^----+$/.test(trimmed)) continue
      if (/^[<>]/.test(trimmed) || /^display/.test(trimmed)) break
      if (trimmed.includes('PeerID') || trimmed.includes('KASent')) continue
      if (!trimmed) continue

      if (trimmed.includes('Codes:') || trimmed.includes('asterisk')) continue

      const parts = trimmed.split(/\s+/)
      
      if (parts.length >= 6 && parts[0].includes(':')) {
        const peerId = parts[0]
        statusMap[peerId] = {
          peerId: peerId,
          status: parts[1] || '',
          lam: parts[2] || '',
          ssnRole: parts[3] || '',
          ssnAge: parts[4] || ''
        }
      }
    }

    return statusMap
  }

  const mergeLdpToTable = (statusMap) => {
    const newRows = []
    for (const key in statusMap) {
      const status = statusMap[key]
      newRows.push({
        _key: key,
        peerId: status.peerId,
        status: status.status,
        lam: status.lam,
        ssnRole: status.ssnRole,
        ssnAge: status.ssnAge,
        configDiffFields: [],
        isConsistent: null
      })
    }
    return newRows
  }

  const updateLdpTableWithDiff = (beforeStatus, afterStatus) => {
    neighborList.value.forEach(row => {
      const key = row._key || row.peerId
      const bStatus = beforeStatus[key] || {}
      const aStatus = afterStatus[key] || {}
      const diffFields = []
      const fields = ['status', 'lam', 'ssnRole', 'ssnAge']
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
    const beforeStatus = parseLdpSessionLog(beforeText)
    const afterStatus = parseLdpSessionLog(afterText)

    let statusCount = 0
    if (afterText) {
      neighborList.value = mergeLdpToTable(afterStatus)
      statusCount = Object.keys(afterStatus).length
    } else if (beforeText) {
      neighborList.value = mergeLdpToTable(beforeStatus)
      statusCount = Object.keys(beforeStatus).length
    }

    if (beforeText && afterText && Object.keys(beforeStatus).length > 0 && Object.keys(afterStatus).length > 0) {
      updateLdpTableWithDiff(beforeStatus, afterStatus)
    }

    const msgParts = []
    if (statusCount > 0) msgParts.push(`${statusCount} 条 LDP 会话`)
    const msg = msgParts.length > 0
      ? `LDP 解析完成：${msgParts.join('，')}${(beforeText && afterText) ? '，差异已映射到表格' : ''}`
      : 'LDP 解析到 0 条有效数据，请检查文件中是否包含 display mpls ldp session'

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
    parseLdpSessionLog,
    mergeLdpToTable
  }
}