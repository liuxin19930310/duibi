// src/interfaceInfo.js
import { ref, reactive, nextTick } from 'vue'
// 轻量提示：autoParseAndUpdate / handleFileChange 为历史遗留导出（当前无调用方），
// 不再引用消息组件（避免把 element-plus 拉进 Web Worker 或撑大主包），仅保留控制台提示。
function showMessage(kind, message) {
  try {
    if (kind === 'error') console.error('[parse]', message)
    else console.warn('[parse]', message)
  } catch (e) { /* ignore */ }
}

// 纯解析函数统一收敛在 deviceParser.js，这里只做界面/对比状态层
import { parseInterfaceInfoLog, parseInterfaceBrief, parseConfigForIpAddress, parseConfigForIsisCost, isisCostDisplay, parseConfigForDescription, parseConfigForEthTrunkMembers, parseConfigForVrf } from './deviceParser.js'

export function useInterfaceModule() {
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
    if (diff) return `${diff.beforeVal} → ${diff.afterVal}`
    return null
  }

  const getDiffInfo = (row, field) => {
    if (!row || !row.configDiffFields) return null
    const diff = row.configDiffFields.find(d => d.field === field)
    return diff || null
  }

  const statusTagType = (state) => {
    if (!state) return 'info'
    const stateCore = state.trim().toLowerCase()
    if (stateCore === 'up') return 'success'
    if (stateCore === 'down' || stateCore === 'a down') return 'danger'
    return 'info'
  }

  // ★ 表格列定义：这里已移除了 ipv6Mtu 列
  const detailFields = [
    { key: 'vrf', label: 'VRF', minWidth: 40 },
    { key: 'isisCost', label: 'COST值', minWidth: 120 },
    { key: 'ipv4', label: '接口IP', minWidth: 120 },
    { key: 'ipv6', label: '接口IPv6', minWidth: 190 },
    { key: 'rxWarningRange', label: '收光范围', minWidth: 130 },
    { key: 'txWarningRange', label: '发光范围', minWidth: 130 },
    { key: 'rxPower', label: '收光值', minWidth: 150 },
    { key: 'txPower', label: '发光值', minWidth: 150 },
    { key: 'inUti', label: '入向流量', minWidth: 90 },
    { key: 'outUti', label: '出向流量', minWidth: 90 },
    { key: 'mtuL1L2', label: '传输模式', minWidth: 70 },
    { key: 'interfaceRate', label: '接口速率', minWidth: 70 },
    { key: 'moduleType', label: '模块类型', minWidth: 90 },
    { key: 'moduleDistance', label: '传输距离', minWidth: 60 },
    { key: 'mtu', label: 'MTU', minWidth: 50 },
    { key: 'crc', label: 'CRC统计', minWidth: 50 },
    { key: 'portStatus', label: '物理状态', minWidth: 80 },
    { key: 'protoStatus', label: '协议状态', minWidth: 80 }
  ]

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file.raw)
    })
  }

  const mergeInterfaceToTable = (statusMap) => {
    const newRows = []
    for (const key in statusMap) {
      const item = statusMap[key]
      newRows.push({ _key: key, ...item, configDiffFields: [], isConsistent: null })
    }
    return newRows
  }

  // ★ 对比字段中也移除了 ipv6Mtu，只保留关键的 mtu
  const updateInterfaceTableWithDiff = (beforeStatus, afterStatus, beforeCostMap, afterCostMap, beforeIpMap, afterIpMap) => {
    const compareFields = ['vrf', 'isisCost', 'ipv4', 'ipv6', 'rxWarningRange', 'txWarningRange', 'rxPower', 'txPower', 'inUti', 'outUti', 'mtuL1L2', 'interfaceRate', 'moduleType', 'moduleDistance', 'mtu', 'srv6Sid', 'packetLossRate', 'crc', 'portStatus', 'protoStatus', 'ethTrunk']
    neighborList.value.forEach(row => {
      const key = row._key || row.interfaceName
      const bStatus = beforeStatus[key] || {}
      const aStatus = afterStatus[key] || {}
      const diffFields = []
      compareFields.forEach(f => {
        let bVal = bStatus[f] ?? ''
        let aVal = aStatus[f] ?? ''
        if (f === 'isisCost') { const bC = isisCostDisplay(beforeCostMap[key]); if (bC !== '-') bVal = bC; const aC = isisCostDisplay(afterCostMap[key]); if (aC !== '-') aVal = aC }
        if (f === 'ipv4' || f === 'ipv6') { bVal = (beforeIpMap[key] && beforeIpMap[key][f]) || bVal; aVal = (afterIpMap[key] && afterIpMap[key][f]) || aVal }
        if (String(bVal) !== String(aVal)) {
          const diffObj = { field: f, beforeVal: String(bVal)||'-', afterVal: String(aVal)||'-' }
          if (f === 'opticalPower') diffObj.subDiffs = _buildOpticalPowerSubDiffs(String(bVal)||'-', String(aVal)||'-')
          diffFields.push(diffObj)
        }
      })
      row.configDiffFields = diffFields
      if (Object.keys(bStatus).length === 0) row.isConsistent = false
      else if (Object.keys(aStatus).length === 0) row.isConsistent = false
      else if (diffFields.length > 0) row.isConsistent = false
      else row.isConsistent = true
    })
  }

  const updateNeighbors = (newData) => { neighborList.value = newData }
  const getCostByInterface = (interfaceName) => { const row = neighborList.value.find(item => item.interfaceName === interfaceName); return row ? row.isisCost : '-' }
  const getIpByInterface = (interfaceName) => { const row = neighborList.value.find(item => item.interfaceName === interfaceName); return row ? { ipv4: row.ipv4, ipv6: row.ipv6 } : { ipv4: '-', ipv6: '-' } }

  const autoParseAndUpdate = (showMessage = true) => {
    const beforeText = beforeTextVal.value.trim()
    const afterText = afterTextVal.value.trim()
    if (!beforeText && !afterText) {
      if (showMessage) showMessage('warning', '请上传至少一个配置文件')
      return
    }
    neighborList.value = []
    const beforeStatus = parseInterfaceInfoLog(beforeText)
    const afterStatus = parseInterfaceInfoLog(afterText)
    const beforeCostMap = parseConfigForIsisCost(beforeText)
    const afterCostMap = parseConfigForIsisCost(afterText)
    const beforeIpMap = parseConfigForIpAddress(beforeText)
    const afterIpMap = parseConfigForIpAddress(afterText)
    // 解析 display interface brief 的 InUti/OutUti
    const beforeBriefMap = parseInterfaceBrief(beforeText)
    const afterBriefMap = parseInterfaceBrief(afterText)
    const beforeVrfMap = parseConfigForVrf(beforeText)
    const afterVrfMap = parseConfigForVrf(afterText)

    const normIf = n => n.replace(/^\*+/, '').replace(/\s*\([^)]*\)\s*$/i, '')
    let statusCount = 0
    if (afterText) {
      neighborList.value = mergeInterfaceToTable(afterStatus)
      statusCount = Object.keys(afterStatus).length
      neighborList.value.forEach(row => {
        const aCostDisp = isisCostDisplay(afterCostMap[row.interfaceName]); if (aCostDisp !== '-') row.isisCost = aCostDisp
        if (afterIpMap[row.interfaceName]) {
          row.ipv4 = afterIpMap[row.interfaceName].ipv4 || '-'
          row.ipv6 = afterIpMap[row.interfaceName].ipv6 || '-'
        }
        // 利用率匹配：精确优先，回落到去速率后缀的归一化匹配（兼容 brief 输出带 (10G) 的情况）
        const afterBKey = afterBriefMap[row.interfaceName] ? row.interfaceName : (afterBriefMap[normIf(row.interfaceName)] ? normIf(row.interfaceName) : null)
        if (afterBKey) { const av = afterBriefMap[afterBKey]; if (av) { row.inUti = av.inUti || '-'; row.outUti = av.outUti || '-' } }
        if (afterVrfMap[row.interfaceName]) row.vrf = afterVrfMap[row.interfaceName]
      })
    } else if (beforeText) {
      neighborList.value = mergeInterfaceToTable(beforeStatus)
      statusCount = Object.keys(beforeStatus).length
      neighborList.value.forEach(row => {
        const bCostDisp = isisCostDisplay(beforeCostMap[row.interfaceName]); if (bCostDisp !== '-') row.isisCost = bCostDisp
        if (beforeIpMap[row.interfaceName]) {
          row.ipv4 = beforeIpMap[row.interfaceName].ipv4 || '-'
          row.ipv6 = beforeIpMap[row.interfaceName].ipv6 || '-'
        }
        // 利用率匹配：精确优先，回落到去速率后缀的归一化匹配（兼容 brief 输出带 (10G) 的情况）
        const beforeBKey = beforeBriefMap[row.interfaceName] ? row.interfaceName : (beforeBriefMap[normIf(row.interfaceName)] ? normIf(row.interfaceName) : null)
        if (beforeBKey) { const bv = beforeBriefMap[beforeBKey]; if (bv) { row.inUti = bv.inUti || '-'; row.outUti = bv.outUti || '-' } }
        if (beforeVrfMap[row.interfaceName]) row.vrf = beforeVrfMap[row.interfaceName]
      })
    }
    if (beforeText && afterText && Object.keys(beforeStatus).length > 0 && Object.keys(afterStatus).length > 0) {
      updateInterfaceTableWithDiff(beforeStatus, afterStatus, beforeCostMap, afterCostMap, beforeIpMap, afterIpMap)
    }

    const msgParts = statusCount > 0 ? [`${statusCount} 个接口`] : []
    const msg = msgParts.length > 0 ? `接口信息解析完成：${msgParts.join('，')}${(beforeText && afterText) ? '，差异已映射到表格' : ''}` : '接口信息解析到 0 条有效数据，请检查混合文件中是否包含 display interface 命令回显'
    if (showMessage) showMessage(statusCount > 0 ? 'success' : 'warning', msg)
    else showMessage(statusCount > 0 ? 'success' : 'warning', msg)
  }

  const handleFileChange = async (uploadFile, type) => {
    try {
      const content = await readFileContent(uploadFile)
      if (type === 'before') beforeTextVal.value = content
      else if (type === 'after') afterTextVal.value = content
      showMessage('success', '文件读取成功')
      await nextTick()
      autoParseAndUpdate(false)
    } catch { showMessage('error', '文件读取失败') }
  }

  // ★ 光功率智能对比辅助函数（内部使用）
  const parseOpticalPowerComponents = (str) => {
    if (!str || str === '-') return { rx: ['-'], tx: ['-'] }
    if (str === 'N/A') return { rx: ['N/A'], tx: ['N/A'] }
    const rxMatch = str.match(/Rx:([^\s]+)/)
    const txMatch = str.match(/Tx:([^\s]+)/)
    if (!rxMatch || !txMatch) return { rx: ['-'], tx: ['-'] }
    return { rx: rxMatch[1].split('|'), tx: txMatch[1].split('|') }
  }

  /** 构建光功率子字段对比（Rx/Tx 分别对比） */
  const _buildOpticalPowerSubDiffs = (beforeStr, afterStr) => {
    const before = parseOpticalPowerComponents(beforeStr)
    const after = parseOpticalPowerComponents(afterStr)
    const subDiffs = []
    const rxBefore = before.rx.join('|')
    const rxAfter = after.rx.join('|')
    subDiffs.push({ label: 'Rx', before: rxBefore, after: rxAfter, changed: rxBefore !== rxAfter })
    const txBefore = before.tx.join('|')
    const txAfter = after.tx.join('|')
    subDiffs.push({ label: 'Tx', before: txBefore, after: txAfter, changed: txBefore !== txAfter })
    return subDiffs
  }

  return {
    searchText, showTable, neighborList, benchmarkMap, dialogVisible, currentRow, importDialog,
    beforeTextVal, afterTextVal, getDiffDisplay, getDiffInfo, statusTagType, detailFields,
    updateNeighbors, autoParseAndUpdate, handleFileChange, parseInterfaceInfoLog, mergeInterfaceToTable,
    getCostByInterface, getIpByInterface,
    parseConfigForIsisCost, isisCostDisplay, parseConfigForIpAddress,
    parseConfigForDescription, parseConfigForEthTrunkMembers,
    parseConfigForVrf,
    parseInterfaceBrief
  }
}

// ★ 顶层 export：光功率智能对比辅助函数
/** 解析光功率字符串为 Rx/Tx 组件数组 */
const _parseOpticalPowerComponents = (str) => {
  if (!str || str === '-') return { rx: ['-'], tx: ['-'] }
  if (str === 'N/A') return { rx: ['N/A'], tx: ['N/A'] }
  const rxMatch = str.match(/Rx:([^\s]+)/)
  const txMatch = str.match(/Tx:([^\s]+)/)
  if (!rxMatch || !txMatch) return { rx: ['-'], tx: ['-'] }
  return { rx: rxMatch[1].split('|'), tx: txMatch[1].split('|') }
}

/** 构建光功率子字段对比（Rx/Tx 分别对比），供 compare.js 使用 */
export const buildOpticalPowerSubDiffs = (beforeStr, afterStr) => {
  const before = _parseOpticalPowerComponents(beforeStr)
  const after = _parseOpticalPowerComponents(afterStr)
  const subDiffs = []
  const rxBefore = before.rx.join('|')
  const rxAfter = after.rx.join('|')
  subDiffs.push({ label: 'Rx', before: rxBefore, after: rxAfter, changed: rxBefore !== rxAfter })
  const txBefore = before.tx.join('|')
  const txAfter = after.tx.join('|')
  subDiffs.push({ label: 'Tx', before: txBefore, after: txAfter, changed: txBefore !== txAfter })
  return subDiffs
}