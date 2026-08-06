// src/srv6Sid.js
import { ref, reactive, nextTick } from 'vue'
// 轻量提示：autoParseAndUpdate / handleFileChange 为历史遗留导出（当前无调用方），
// 不再引用消息组件（避免把 element-plus 拉进 Web Worker 或撑大主包），仅保留控制台提示。
function showMessage(kind, message) {
  try {
    if (kind === 'error') console.error('[parse]', message)
    else console.warn('[parse]', message)
  } catch (e) { /* ignore */ }
}


export function useSrv6SidModule() {
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
    return 'info'
  }

  const detailFields = [
    { key: 'sid', label: 'SID', minWidth: 260 },
    { key: 'funcType', label: 'SID类型', minWidth: 100 },
    { key: 'locatorName', label: 'Locator名称', minWidth: 150 },
    { key: 'locatorId', label: 'Locator ID', minWidth: 100 }
  ]

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file.raw)
    })
  }

  const parseSrv6SidLog = (logText) => {
    const statusMap = {}
    if (!logText) return statusMap

    const blocks = logText.split(/\n\s*\n/).filter(b => b.trim())

    for (const block of blocks) {
      if (block.includes('My Local-SID Forwarding Table')) continue
      if (block.includes('---')) continue

      const sidMatch = block.match(/SID\s*:\s*(\S+)/)
      const funcMatch = block.match(/FuncType\s*:\s*(\S+)/)
      const locNameMatch = block.match(/LocatorName\s*:\s*(\S+)/)
      const locIdMatch = block.match(/LocatorID\s*:\s*(\d+)/)

      if (sidMatch && funcMatch && locNameMatch && locIdMatch) {
        const sid = sidMatch[1]
        statusMap[sid] = {
          sid: sid,
          funcType: funcMatch[1],
          locatorName: locNameMatch[1],
          locatorId: locIdMatch[1]
        }
      }
    }

    return statusMap
  }

  const mergeSrv6SidToTable = (statusMap) => {
    const newRows = []
    for (const key in statusMap) {
      const item = statusMap[key]
      newRows.push({
        _key: key,
        sid: item.sid,
        funcType: item.funcType,
        locatorName: item.locatorName,
        locatorId: item.locatorId,
        configDiffFields: [],
        isConsistent: null
      })
    }
    return newRows
  }

  const updateSrv6SidTableWithDiff = (beforeStatus, afterStatus) => {
    neighborList.value.forEach(row => {
      const key = row._key || row.sid
      const bStatus = beforeStatus[key] || {}
      const aStatus = afterStatus[key] || {}
      const diffFields = []
      const fields = ['funcType', 'locatorName', 'locatorId']

      fields.forEach(f => {
        const bVal = bStatus[f] ?? ''
        const aVal = aStatus[f] ?? ''
        if (String(bVal) !== String(aVal)) {
          diffFields.push({
            field: f,
            beforeVal: String(bVal) || '-',
            afterVal: String(aVal) || '-'
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
    const beforeStatus = parseSrv6SidLog(beforeText)
    const afterStatus = parseSrv6SidLog(afterText)

    let statusCount = 0
    if (afterText) {
      neighborList.value = mergeSrv6SidToTable(afterStatus)
      statusCount = Object.keys(afterStatus).length
    } else if (beforeText) {
      neighborList.value = mergeSrv6SidToTable(beforeStatus)
      statusCount = Object.keys(beforeStatus).length
    }

    if (beforeText && afterText && Object.keys(beforeStatus).length > 0 && Object.keys(afterStatus).length > 0) {
      updateSrv6SidTableWithDiff(beforeStatus, afterStatus)
    }

    const msgParts = []
    if (statusCount > 0) msgParts.push(`${statusCount} 条 SRv6 SID`)
    const msg = msgParts.length > 0
      ? `SRv6 SID 解析完成：${msgParts.join('，')}${(beforeText && afterText) ? '，差异已映射到表格' : ''}`
      : 'SRv6 SID 解析到 0 条有效数据，请检查混合文件中是否包含 display segment-routing ipv6 local-sid forwarding'

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
    stateTagType,
    detailFields,
    updateNeighbors,
    autoParseAndUpdate,
    handleFileChange,
    parseSrv6SidLog,
    mergeSrv6SidToTable
  }
}