// 配置对比 / 配置解析「一键导出全部」共享逻辑：单元格取值 + 多模块合并到同一张带样式工作表
// 与 ProtoPanel 的导出渲染保持一致（差异行红/绿底、光功率多路分行）。

const formatVal = (val) => {
  if (Array.isArray(val)) return val.join(', ')
  return val ?? '-'
}

// 与屏幕渲染完全一致的单元格取值
export function screenCellVal(row, key, { getDiffInfo, keyField }) {
  if (key === keyField) return row[key] ?? '-'
  const diff = getDiffInfo ? getDiffInfo(row, key) : null
  if (diff) {
    // 光功率多路（如4路）差异：按 Rx/Tx 完整值分行显示，新值在上、旧值在下
    if (key === 'opticalPower' && Array.isArray(diff.subDiffs) && diff.subDiffs.length >= 2) {
      const rx = diff.subDiffs.find(s => s.label === 'Rx') || diff.subDiffs[0]
      const tx = diff.subDiffs.find(s => s.label === 'Tx') || diff.subDiffs[1]
      const fmt = (s) => (s == null ? '-' : String(s))
      const newLine = `Rx:${fmt(rx.after)} Tx:${fmt(tx.after)} (新)`
      const oldLine = `Rx:${fmt(rx.before)} Tx:${fmt(tx.before)} (旧)`
      return [newLine, oldLine].join('\n')
    }
    const parts = []
    if (diff.afterVal && diff.afterVal !== '-') parts.push(`${diff.afterVal} (新)`)
    if (diff.beforeVal && diff.beforeVal !== '-') parts.push(`${diff.beforeVal} (旧)`)
    if (parts.length) return parts.join('\n')
  }
  return formatVal(row[key])
}

// 导出样式（参考用户提供的 222.xlsx 参考样式：表头微软雅黑11加粗白字+深蓝4472C4底+细灰边框居中；数据微软雅黑10黑字+细灰边框）
const headerFill = { rgb: '4472C4' }
const headerFont = { name: 'Microsoft YaHei', sz: 11, bold: true, color: { rgb: 'FFFFFF' } }
const baseFont = { name: 'Microsoft YaHei', sz: 10, color: { rgb: '000000' } }
const delFill = { rgb: 'FCEBEB' }
const okFill = { rgb: 'EAF3DE' }
const cellBorder = {
  top: { style: 'thin', color: { rgb: '808080' } },
  bottom: { style: 'thin', color: { rgb: '808080' } },
  left: { style: 'thin', color: { rgb: '808080' } },
  right: { style: 'thin', color: { rgb: '808080' } }
}
const upColor = { rgb: '00AA00' }
const downColor = { rgb: 'FF0000' }
// 状态值判定（参考样式：up 绿 / down 红；兼容聚合口"up,up"逗号串）
const isUpVal = (v) => {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s || s === '-') return false
  if (s.includes(',')) return s.split(',').every(x => ['up', 'up(s)', 'operational', 'established'].includes(x.trim()))
  return ['up', 'up(s)', 'operational', 'established'].includes(s)
}
const isDownVal = (v) => {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s || s === '-') return false
  if (s.includes(',')) return s.split(',').some(x => ['down', '*down', '^down', 'idle'].includes(x.trim()))
  return ['down', '*down', '^down', 'idle'].includes(s)
}

// 单个模块 → 追加「标题行 + 表头行 + 数据行」到 aoa/meta
// withConsistent=true 时多一列「对比结果」（配置对比用，含红/绿底标注）；false 时用于配置解析（单设备、无对比）
function pushModuleRows(aoa, meta, m, { withConsistent }) {
  const hasKeyInCols = (m.columns || []).some(c => c.key === m.keyField)
  const allCols = [
    ...m.columns,
    ...(hasKeyInCols ? [] : [{ key: m.keyField, label: m.keyLabel }]),
    { key: 'description', label: '描述' }
  ]
  if (withConsistent) allCols.push({ key: 'isConsistent', label: '对比结果' })
  aoa.push(allCols.map(c => c.label))
  meta.push({ type: 'header' })
  ;(m.list || []).forEach(row => {
    const vals = allCols.map(c => {
      if (withConsistent && c.key === 'isConsistent') {
        return row.isConsistent === true ? '一致' : row.isConsistent === false ? '不一致' : '待比对'
      }
      if (c.key === 'description') return row.description ?? '-'
      if ((m.boolFields || []).includes(c.key)) return row[c.key] ? '是' : '否'
      const v = screenCellVal(row, c.key, { getDiffInfo: m.getDiffInfo, keyField: m.keyField })
      if (Array.isArray(v)) return v.join(', ')
      return v == null ? '-' : v
    })
    aoa.push(vals)
    meta.push({ type: 'data', consistent: withConsistent ? row.isConsistent : undefined })
  })
}

function applySheetStyles(ws, aoa, meta, XLSX) {
  const maxCols = Math.max(...aoa.map(r => r.length))
  const merges = []
  const rows = []
  for (let r = 0; r < aoa.length; r++) {
    const rowMeta = meta[r]
    if (rowMeta.type === 'header') {
      for (let c = 0; c < aoa[r].length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (cell) cell.s = { fill: { patternType: 'solid', fgColor: headerFill }, font: headerFont, alignment: { horizontal: 'center', vertical: 'center' }, border: cellBorder }
      }
      rows.push({ hpt: 16.5 })
    } else if (rowMeta.type === 'data') {
      // 配置解析（单设备）无对比，consistent 为 undefined → 不加红/绿底
      const fill = rowMeta.consistent === false ? delFill : rowMeta.consistent === true ? okFill : null
      for (let c = 0; c < aoa[r].length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (!cell) continue
        const font = { ...baseFont }
        // 状态类值着色（up 绿 / down 红，参考样式）
        if (isUpVal(cell.v)) font.color = upColor
        else if (isDownVal(cell.v)) font.color = downColor
        const style = { font, alignment: { horizontal: 'left', vertical: 'center' }, border: cellBorder }
        if (fill) style.fill = { patternType: 'solid', fgColor: fill }
        if (typeof cell.v === 'string' && cell.v.includes('\n')) style.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }
        cell.s = style
      }
      rows.push({ hpt: 14.5 })
    }
  }
  if (merges.length) ws['!merges'] = merges
  if (rows.length) ws['!rows'] = rows
  // 列宽：设备名/描述列按内容加宽，其余自适应默认
  const headerLabels = aoa[0] || []
  ws['!cols'] = headerLabels.map(label => ({ wch: label === '描述' ? 60 : label === '设备名' ? 32 : 18 }))
}

// 配置对比：多模块合并到同一张表（含「对比结果」列与红/绿底）
// modules: [{ title, list, getDiffInfo, keyField, keyLabel, columns, boolFields }]
export async function buildCombinedCompareSheet(modules) {
  const XLSX = (await import('xlsx-js-style')).default
  const aoa = []
  const meta = []
  const valid = (modules || []).filter(m => m.list && m.list.length)
  if (!valid.length) return null
  valid.forEach(m => pushModuleRows(aoa, meta, m, { withConsistent: true }))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applySheetStyles(ws, aoa, meta, XLSX)
  return ws
}

// 配置解析：多模块合并到同一张表（单设备、无前后对比，无「对比结果」列、无红/绿底）
// modules: [{ title, list, getDiffInfo, keyField, keyLabel, columns, boolFields }]
export async function buildCombinedParseSheet(modules) {
  const XLSX = (await import('xlsx-js-style')).default
  const aoa = []
  const meta = []
  const valid = (modules || []).filter(m => m.list && m.list.length)
  if (!valid.length) return null
  valid.forEach(m => pushModuleRows(aoa, meta, m, { withConsistent: false }))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applySheetStyles(ws, aoa, meta, XLSX)
  return ws
}

// ===================== 多 sheet 导出：每个模块一张独立 sheet，全部写入同一个工作簿 =====================

// Excel sheet 名称限制：最长 31 字符，且不能包含 \ / : * ? [ ]
function sanitizeSheetName(name, used) {
  let n = (name || 'Sheet').replace(/[\\/:*?\[\]]/g, ' ').trim()
  if (n.length > 31) n = n.slice(0, 31).trim()
  if (!n) n = 'Sheet'
  // 同名兜底：追加序号避免 xlsx 库报错
  if (used && used.has(n)) {
    let i = 2
    while (used.has(`${n}_${i}`)) i++
    n = `${n}_${i}`
  }
  return n
}

// 单个模块 → 一张独立工作表
function buildSheetForModule(XLSX, m, { withConsistent }) {
  const aoa = []
  const meta = []
  pushModuleRows(aoa, meta, m, { withConsistent })
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applySheetStyles(ws, aoa, meta, XLSX)
  return ws
}

// 配置对比：每个模块（BGP/ISIS/LDP/.../接口信息/IPV4路由表）各占一个 sheet，汇总到同一工作簿
// 返回 workbook（含多 sheet）；无数据时返回 null
export async function buildCompareWorkbook(modules) {
  const XLSX = (await import('xlsx-js-style')).default
  const valid = (modules || []).filter(m => m.list && m.list.length)
  if (!valid.length) return null
  const wb = XLSX.utils.book_new()
  const used = new Set()
  valid.forEach(m => {
    const ws = buildSheetForModule(XLSX, m, { withConsistent: true })
    const sname = sanitizeSheetName(m.title, used)
    used.add(sname)
    XLSX.utils.book_append_sheet(wb, ws, sname)
  })
  return wb
}

// 配置解析：每个模块各占一个 sheet，汇总到同一工作簿（单设备、无「对比结果」列、无红/绿底）
export async function buildParseWorkbook(modules) {
  const XLSX = (await import('xlsx-js-style')).default
  const valid = (modules || []).filter(m => m.list && m.list.length)
  if (!valid.length) return null
  const wb = XLSX.utils.book_new()
  const used = new Set()
  valid.forEach(m => {
    const ws = buildSheetForModule(XLSX, m, { withConsistent: false })
    const sname = sanitizeSheetName(m.title, used)
    used.add(sname)
    XLSX.utils.book_append_sheet(wb, ws, sname)
  })
  return wb
}
