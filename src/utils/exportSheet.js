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

const titleFill = { rgb: 'F2F2F2' }
const titleFont = { bold: true, color: { rgb: '1F3864' } }
const headerFill = { rgb: 'DCE6F1' }
const headerFont = { bold: true, color: { rgb: '1F3864' } }
const baseFont = { color: { rgb: '1F3864' } }
const delFill = { rgb: 'FCEBEB' }
const okFill = { rgb: 'EAF3DE' }

// 单个模块 → 追加「标题行 + 表头行 + 数据行」到 aoa/meta
// withConsistent=true 时多一列「对比结果」（配置对比用，含红/绿底标注）；false 时用于配置解析（单设备、无对比）
function pushModuleRows(aoa, meta, m, { withConsistent }) {
  const allCols = [
    { key: m.keyField, label: m.keyLabel },
    ...m.columns,
    { key: 'description', label: '描述' }
  ]
  if (withConsistent) allCols.push({ key: 'isConsistent', label: '对比结果' })
  aoa.push([m.title])
  meta.push({ type: 'title' })
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
  for (let r = 0; r < aoa.length; r++) {
    const rowMeta = meta[r]
    if (rowMeta.type === 'title') {
      const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })]
      if (cell) cell.s = { fill: { patternType: 'solid', fgColor: titleFill }, font: titleFont, alignment: { horizontal: 'left', vertical: 'center' } }
      merges.push({ s: { r, c: 0 }, e: { r, c: Math.max(maxCols - 1, 0) } })
    } else if (rowMeta.type === 'header') {
      for (let c = 0; c < aoa[r].length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (cell) cell.s = { fill: { patternType: 'solid', fgColor: headerFill }, font: headerFont, alignment: { horizontal: 'left', vertical: 'center' } }
      }
    } else if (rowMeta.type === 'data') {
      // 配置解析（单设备）无对比，consistent 为 undefined → 不加红/绿底
      const fill = rowMeta.consistent === false ? delFill : rowMeta.consistent === true ? okFill : null
      for (let c = 0; c < aoa[r].length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (!cell) continue
        const style = { font: { ...baseFont }, alignment: { horizontal: 'left', vertical: 'center' } }
        if (fill) style.fill = { patternType: 'solid', fgColor: fill }
        if (typeof cell.v === 'string' && cell.v.includes('\n')) style.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }
        cell.s = style
      }
    }
  }
  if (merges.length) ws['!merges'] = merges
  ws['!cols'] = Array.from({ length: maxCols }, (_, i) => ({ wch: i === 0 ? 22 : 18 }))
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
