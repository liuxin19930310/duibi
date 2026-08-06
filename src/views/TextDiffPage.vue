<template>
  <div class="td-page">
    <div class="td-head">
      <h1 class="td-title">文本逐行对比</h1>
      <p class="td-sub">分别导入变更前 / 变更后的配置，自动生成逐行差异表，可一键导出。</p>
    </div>

    <!-- 导入区：配置解析同款 drop-zone 上传框（点击 / 拖拽导入 before / after） -->
    <div class="td-imp">
      <div class="drop-zone" :class="{ 'is-drag': dragSide === 'old', 'has': !!oldText }"
           @click="importFile('old')" @dragover.prevent="dragSide = 'old'" @dragleave.prevent="dragSide = ''" @drop.prevent="onDrop($event, 'old')">
        <div class="drop-icon">
          <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6v20M12 18l8 8 8-8" />
            <path d="M6 26v6a2 2 0 002 2h24a2 2 0 002-2v-6" />
          </svg>
        </div>
        <div class="drop-title">{{ oldText ? (oldName || '变更前（before）') : '导入变更前配置（before）' }}</div>
        <span class="drop-btn" @click.stop="importFile('old')">选择文件导入</span>
        <div class="drop-or">或</div>
        <span class="collect-btn" @click.stop="pasting.old = !pasting.old">粘贴文本</span>
        <div v-if="oldText" class="drop-foot" @click.stop>
          <span class="drop-meta">{{ oldLines }} 行</span>
          <button class="clear-btn" @click="clearSide('old')">清空</button>
        </div>
      </div>

      <div class="drop-zone" :class="{ 'is-drag': dragSide === 'new', 'has': !!newText }"
           @click="importFile('new')" @dragover.prevent="dragSide = 'new'" @dragleave.prevent="dragSide = ''" @drop.prevent="onDrop($event, 'new')">
        <div class="drop-icon">
          <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6v20M12 18l8 8 8-8" />
            <path d="M6 26v6a2 2 0 002 2h24a2 2 0 002-2v-6" />
          </svg>
        </div>
        <div class="drop-title">{{ newText ? (newName || '变更后（after）') : '导入变更后配置（after）' }}</div>
        <span class="drop-btn" @click.stop="importFile('new')">选择文件导入</span>
        <div class="drop-or">或</div>
        <span class="collect-btn" @click.stop="pasting.new = !pasting.new">粘贴文本</span>
        <div v-if="newText" class="drop-foot" @click.stop>
          <span class="drop-meta">{{ newLines }} 行</span>
          <button class="clear-btn" @click="clearSide('new')">清空</button>
        </div>
      </div>
    </div>

    <!-- 手动粘贴面板（按需展开） -->
    <div class="td-paste" v-if="pasting.old || pasting.new">
      <textarea v-if="pasting.old" class="td-ta" v-model="oldText" placeholder="在此粘贴变更前文本…" spellcheck="false"></textarea>
      <textarea v-if="pasting.new" class="td-ta" v-model="newText" placeholder="在此粘贴变更后文本…" spellcheck="false"></textarea>
    </div>

    <!-- 结果：差异结果面板（同款 proto-panel） -->
    <div class="proto-panel td-result-card" v-if="hasInput">
      <div class="proto-header td-res-h no-click">
        <div class="proto-left">
          <Icon class="proto-arrow" icon="mdi:chevron-down" />
          <span class="proto-name">差异结果</span>
          <span class="proto-desc">逐行对比</span>
          <span class="total-dot s-del">− {{ stats.removed }}</span>
          <span class="total-dot s-add">+ {{ stats.added }}</span>
          <span class="total-dot s-mod">~ {{ stats.modified }}</span>
        </div>
        <div class="proto-right td-res-ops" @click.stop>
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button label="split">左右</el-radio-button>
            <el-radio-button label="unified">统一</el-radio-button>
          </el-radio-group>
          <el-popover placement="bottom-start" :width="200" trigger="click">
            <template #reference>
              <el-button size="small">选项</el-button>
            </template>
            <div class="td-opt">
              <div class="td-opt-row"><span>只看变更</span><el-switch v-model="onlyChanges" /></div>
              <div class="td-opt-row"><span>忽略空白</span><el-switch v-model="ignoreWs" /></div>
              <div class="td-opt-row"><span>忽略大小写</span><el-switch v-model="ignoreCase" /></div>
              <div class="td-opt-row"><span>折叠未变更</span><el-switch v-model="foldSame" :disabled="viewMode !== 'split'" /></div>
            </div>
          </el-popover>
          <el-dropdown trigger="click" @command="onExport">
            <el-button size="small" type="primary" plain>导出 ▾</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="txt">导出为文本（.txt）</el-dropdown-item>
                <el-dropdown-item command="csv">导出为 CSV（.csv）</el-dropdown-item>
                <el-dropdown-item command="xlsx">导出为 Excel（.xlsx）</el-dropdown-item>
                <el-dropdown-item command="copy" divided>复制结果到剪贴板</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
      <div class="proto-body td-result-body">
        <div v-if="tooBig" class="td-warn">
          文件较大（共 {{ maxLines }} 行）。已启用虚拟滚动，仅渲染可视区域，不会卡顿；
          若想进一步聚焦，可打开「只看变更」并配合「折叠未变更」。
        </div>

        <!-- 左右并排 -->
        <template v-if="viewMode === 'split'">
          <div class="td-scroll" ref="scrollEl" @scroll="onScroll" :style="{ maxHeight: resultMaxH }">
            <div class="td-vp" :style="{ height: (splitTotal + HEAD_H) + 'px' }">
              <div class="td-grid td-grid-head">
                <div class="td-ln-h">行</div>
                <div class="td-tx-h">变更前（before）</div>
                <div class="td-ln-h">行</div>
                <div class="td-tx-h">变更后（after）</div>
              </div>
              <div class="td-win" :style="{ transform: 'translateY(' + splitOffset + 'px)' }">
                <template v-for="(r, i) in winSplit" :key="winStart + i">
                  <div v-if="r.fold" class="td-grid td-fold">··· {{ r.count }} 行未变更 ···</div>
                  <div v-else class="td-grid" :class="rowCls(r)">
                    <div class="td-ln">{{ r.left.num != null ? r.left.num : '' }}</div>
                    <div class="td-tx" :title="r.left.text">
                      <template v-if="r.left.type === 'mod'">
                        <span v-for="(s, k) in getInline(r.left.text, r.right.text)" v-show="s.kind !== 'add'" :key="k" :class="segCls(s, 'left')">{{ s.text }}</span>
                      </template>
                      <template v-else>{{ r.left.text }}</template>
                    </div>
                    <div class="td-ln">{{ r.right.num != null ? r.right.num : '' }}</div>
                    <div class="td-tx" :title="r.right.text">
                      <template v-if="r.right.type === 'mod'">
                        <span v-for="(s, k) in getInline(r.left.text, r.right.text)" v-show="s.kind !== 'del'" :key="k" :class="segCls(s, 'right')">{{ s.text }}</span>
                      </template>
                      <template v-else>{{ r.right.text }}</template>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>

        <!-- 统一视图 -->
        <template v-else>
          <div class="td-scroll" ref="scrollEl" @scroll="onScroll" :style="{ maxHeight: resultMaxH }">
            <div class="td-vp" :style="{ height: (uniTotal + HEAD_H) + 'px' }">
              <div class="td-u-head">统一视图（− 删除 · + 新增 · 空格 未变）</div>
              <div class="td-win" :style="{ transform: 'translateY(' + splitOffset + 'px)' }">
                <template v-for="(r, i) in winUnified" :key="winStart + i">
                  <div v-if="r.fold" class="td-u-fold">··· {{ r.count }} 行未变更 ···</div>
                  <div v-else class="td-u-row" :class="uCls(r)" :title="r.text">
                    <span class="td-u-sign">{{ r.sign }}</span>
                    <span class="td-u-ln">{{ r.num }}</span>
                    <span class="td-u-tx">{{ r.text }}</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div v-else class="td-empty">请在上方导入变更前 / 变更后的配置，导入后自动生成差异表</div>

    <input ref="fileRef" type="file" accept=".txt,.cfg,.conf,.log,.json,.xml,.ini,.bat,.sh,.yaml,.yml" style="display:none" @change="onFile" />
  </div>
</template>

<script setup>
defineOptions({ name: 'TextDiffPage' })

import { ref, computed, watch, nextTick, reactive, onMounted } from 'vue'
import { diffLines, diffChars } from 'diff'
// XLSX 改为导出时动态导入（见 exportExcel），避免进入首屏主包
import { settings } from '../utils/settings.js'
import { diffStore } from '../utils/diffStore.js'

const oldText = ref('')
const newText = ref('')
const viewMode = ref('split') // split | unified
const onlyChanges = ref(false)
const ignoreWs = ref(settings.ignoreWhitespace)
const ignoreCase = ref(settings.ignoreCase)
const foldSame = ref(true) // 默认折叠，减少渲染行
const oldName = ref('') // 导入的文件名（用于展示）
const newName = ref('')
const dragSide = ref('') // 当前拖拽悬停的列 old|new
const pasting = reactive({ old: false, new: false }) // 手动粘贴面板

// 与主流程导入共享：挂载时若本地为空，则从共享 diffStore 载入（一次导入即可在模块化比对与逐行对比间切换）
onMounted(() => {
  if (!oldText.value && !newText.value && (diffStore.before || diffStore.after)) {
    oldText.value = diffStore.before || ''
    newText.value = diffStore.after || ''
    oldName.value = diffStore.beforeName || ''
    newName.value = diffStore.afterName || ''
  }
})

const oldLines = computed(() => (oldText.value ? oldText.value.split('\n').length : 0))
const newLines = computed(() => (newText.value ? newText.value.split('\n').length : 0))
const hasInput = computed(() => oldText.value.trim() !== '' || newText.value.trim() !== '')
const maxLines = computed(() => Math.max(oldLines.value, newLines.value))
const tooBig = computed(() => maxLines.value > 30000)
// 结果区高度：导入区常驻；粘贴面板展开时再多留空间
const resultMaxH = computed(() => (pasting.old || pasting.new)
  ? 'max(200px, calc(100vh - 520px))'
  : 'calc(100vh - 340px)')

// ===== 比对核心 =====
function toLines(value) {
  const arr = value.split('\n')
  if (arr.length && arr[arr.length - 1] === '') arr.pop()
  return arr
}

function buildSplit(parts) {
  const rows = []
  let ln = 1, rn = 1, i = 0
  while (i < parts.length) {
    const p = parts[i]
    if (!p.added && !p.removed) {
      for (const t of toLines(p.value)) {
        rows.push({ left: { num: ln++, text: t, type: 'same' }, right: { num: rn++, text: t, type: 'same' } })
      }
      i++
    } else if (p.removed && i + 1 < parts.length && parts[i + 1].added) {
      const rem = toLines(p.value), add = toLines(parts[i + 1].value)
      const max = Math.max(rem.length, add.length)
      for (let k = 0; k < max; k++) {
        const l = rem[k], r = add[k]
        if (l !== undefined && r !== undefined) {
          rows.push({ left: { num: ln++, text: l, type: 'mod' }, right: { num: rn++, text: r, type: 'mod' } })
        } else if (l !== undefined) {
          rows.push({ left: { num: ln++, text: l, type: 'del' }, right: { num: null, text: '', type: 'empty' } })
        } else {
          rows.push({ left: { num: null, text: '', type: 'empty' }, right: { num: rn++, text: r, type: 'add' } })
        }
      }
      i += 2
    } else if (p.removed) {
      for (const t of toLines(p.value)) rows.push({ left: { num: ln++, text: t, type: 'del' }, right: { num: null, text: '', type: 'empty' } })
      i++
    } else {
      for (const t of toLines(p.value)) rows.push({ left: { num: null, text: '', type: 'empty' }, right: { num: rn++, text: t, type: 'add' } })
      i++
    }
  }
  return rows
}

function buildUnified(parts) {
  const rows = []
  let num = 1
  for (const p of parts) {
    const lines = toLines(p.value)
    if (!p.added && !p.removed) {
      for (const t of lines) rows.push({ sign: ' ', num: num++, text: t, type: 'same' })
    } else if (p.removed) {
      for (const t of lines) rows.push({ sign: '-', num: '', text: t, type: 'del' })
    } else {
      for (const t of lines) rows.push({ sign: '+', num: '', text: t, type: 'add' })
    }
  }
  return rows
}

function collapseSame(rows, isSame) {
  const out = []
  let i = 0
  while (i < rows.length) {
    const r = rows[i]
    if (isSame(r)) {
      let j = i
      while (j < rows.length && isSame(rows[j])) j++
      const len = j - i
      if (len > 4) out.push({ fold: true, count: len })
      else for (; i < j; i++) out.push(rows[i])
      i = j
    } else {
      out.push(r)
      i++
    }
  }
  return out
}

const parts = computed(() => diffLines(oldText.value, newText.value, { ignoreWhitespace: ignoreWs.value, ignoreCase: ignoreCase.value }))
const splitRows = computed(() => buildSplit(parts.value))
const unifiedRows = computed(() => buildUnified(parts.value))

const stats = computed(() => {
  let removed = 0, added = 0, modified = 0
  for (const r of splitRows.value) {
    if (r.left.type === 'del') removed++
    else if (r.right.type === 'add') added++
    else if (r.left.type === 'mod') modified++
  }
  return { removed, added, modified }
})

const displayRows = computed(() => {
  let out = splitRows.value
  if (foldSame.value) out = collapseSame(out, r => r.left.type === 'same' && r.right.type === 'same')
  if (onlyChanges.value) out = out.filter(r => !r.fold && !(r.left.type === 'same' && r.right.type === 'same'))
  return out
})

const displayRowsU = computed(() => {
  let out = unifiedRows.value
  if (foldSame.value) out = collapseSame(out, r => r.type === 'same')
  if (onlyChanges.value) out = out.filter(r => r.type !== 'same')
  return out
})

function rowCls(r) {
  if (r.left.type === 'del') return 'td-row-del'
  if (r.right.type === 'add') return 'td-row-add'
  if (r.left.type === 'mod') return 'td-row-mod'
  if (r.left.type === 'empty') return 'td-row-empty'
  return 'td-row-same'
}
function segCls(s, side) {
  if (side === 'left') return s.kind === 'del' ? 'seg-del' : ''
  return s.kind === 'add' ? 'seg-add' : ''
}
function uCls(r) {
  return r.type === 'del' ? 'del' : r.type === 'add' ? 'add' : ''
}

// ===== 虚拟滚动（只渲染可视窗口，避免大文件 DOM 爆炸）=====
const scrollEl = ref(null)
const scrollTop = ref(0)
const ROW_H = 26
const HEAD_H = 26
const BUFFER = 8
const VISIBLE = 40
function onScroll(e) {
  scrollTop.value = e.target.scrollTop
}
const winStart = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_H) - BUFFER))
const winCount = VISIBLE + BUFFER * 2
const winSplit = computed(() => displayRows.value.slice(winStart.value, winStart.value + winCount))
const winUnified = computed(() => displayRowsU.value.slice(winStart.value, winStart.value + winCount))
const splitTotal = computed(() => displayRows.value.length * ROW_H)
const uniTotal = computed(() => displayRowsU.value.length * ROW_H)
const splitOffset = computed(() => winStart.value * ROW_H)

watch(viewMode, () => {
  scrollTop.value = 0
  nextTick(() => { if (scrollEl.value) scrollEl.value.scrollTop = 0 })
})
watch([displayRows, displayRowsU], () => {
  if (scrollEl.value && scrollTop.value > (viewMode.value === 'split' ? splitTotal.value : uniTotal.value)) {
    scrollTop.value = 0
    scrollEl.value.scrollTop = 0
  }
})

// 行内高亮降级：仅短行做字符级 diff，且带缓存（只在可视窗口内计算）
const inlineCache = new Map()
const MAX_INLINE = 200
function getInline(l, r) {
  if (l === r) return null
  if (l.length > MAX_INLINE || r.length > MAX_INLINE) return null
  const key = l + '\u0000' + r
  if (inlineCache.has(key)) return inlineCache.get(key)
  const segs = diffChars(l, r).map(s => ({ text: s.value, kind: s.added ? 'add' : s.removed ? 'del' : 'same' }))
  if (inlineCache.size > 20000) inlineCache.clear()
  inlineCache.set(key, segs)
  return segs
}

// ===== 文件导入（点击 / 拖拽）=====
const fileRef = ref(null)
const importSide = ref('old')
const importFile = (side) => {
  importSide.value = side
  fileRef.value && fileRef.value.click()
}
function readFile(f, side) {
  const reader = new FileReader()
  reader.onload = () => {
    const txt = String(reader.result || '')
    if (side === 'old') { oldText.value = txt; oldName.value = f.name }
    else { newText.value = txt; newName.value = f.name }
  }
  reader.onerror = () => ElMessage.error('文件读取失败')
  reader.readAsText(f)
}
const onFile = (e) => {
  const f = e.target.files && e.target && e.target.files[0]
  e.target.value = ''
  if (!f) return
  readFile(f, importSide.value)
}
function onDrop(e, side) {
  dragSide.value = ''
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
  if (!f) { ElMessage.warning('请拖入文件'); return }
  readFile(f, side)
}
function clearSide(side) {
  if (side === 'old') { oldText.value = ''; oldName.value = ''; pasting.old = false }
  else { newText.value = ''; newName.value = ''; pasting.new = false }
}

// ===== 导出 / 复制 =====
function ts() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
// 统一差异文本（完整、不折叠，尊重忽略空白/大小写设置）
function unifiedText() {
  return unifiedRows.value.map(r => {
    if (r.type === 'del') return '- ' + r.text
    if (r.type === 'add') return '+ ' + r.text
    return '  ' + r.text
  }).join('\n')
}
function exportTxt() {
  const stat = `--- 文本逐行对比 ---\n- 删除 ${stats.removed} 行\n+ 新增 ${stats.added} 行\n~ 修改 ${stats.modified} 行\n\n`
  download(`diff-${ts()}.txt`, stat + unifiedText())
  ElMessage.success('已导出文本文件')
}
function exportCsv() {
  const esc = s => '"' + String(s).replace(/"/g, '""') + '"'
  const header = '差异类型,变更前行号,变更前内容,变更后行号,变更后内容\n'
  const lines = splitRows.value.map(r => {
    const type = calcRowType(r)
    return [TYPE_LABEL[type], r.left.num ?? '', r.left.text, r.right.num ?? '', r.right.text].map(esc).join(',')
  })
  // 加 BOM 让 Excel 正确识别中文
  download(`diff-${ts()}.csv`, '\uFEFF' + header + lines.join('\n'), 'text/csv;charset=utf-8')
  ElMessage.success('已导出 CSV 文件')
}
// 行差异类型判定与展示
function calcRowType(r) {
  return r.left.type === 'del' ? 'del'
    : r.right.type === 'add' ? 'add'
    : r.left.type === 'mod' ? 'mod'
    : (r.left.type === 'empty' || r.right.type === 'empty') ? 'empty'
    : 'same'
}
const TYPE_LABEL = { del: '删除', add: '新增', mod: '修改', empty: '—', same: '未变更' }
const TYPE_COLOR = { del: 'C0392B', add: '1E8449', mod: '854F0B', empty: '999999', same: '555555' }

// Excel 导出（xlsx-js-style，支持单元格填充色）：首列为差异类型，差异行整行底色标注
async function exportExcel() {
  const XLSX = (await import('xlsx-js-style')).default
  if (!hasInput.value) { ElMessage.warning('请先粘贴或导入文本'); return }
  const header = ['差异类型', '变更前行号', '变更前内容', '变更后行号', '变更后内容']
  const aoa = [header]
  for (const r of splitRows.value) {
    const type = calcRowType(r)
    aoa.push([TYPE_LABEL[type], r.left.num ?? '', r.left.text, r.right.num ?? '', r.right.text])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 60 }, { wch: 10 }, { wch: 60 }]
  const headerFill = { fgColor: { rgb: 'DCE6F1' } }
  for (let c = 0; c < 5; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[addr]) ws[addr].s = { fill: headerFill, font: { bold: true }, alignment: { vertical: 'center' } }
  }
  const fills = {
    del: { fgColor: { rgb: 'FCEBEB' } },   // 删除：浅红
    add: { fgColor: { rgb: 'EAF3DE' } },   // 新增：浅绿
    mod: { fgColor: { rgb: 'FBF1E0' } },   // 修改：浅橙
    empty: { fgColor: { rgb: 'F2F2F2' } } // 空占位：浅灰
  }
  for (let i = 1; i < aoa.length; i++) {
    const r = splitRows.value[i - 1]
    const type = calcRowType(r)
    const fill = fills[type]
    // 首列"差异类型"：底色 + 深色文字 + 粗体 + 居中
    const tAddr = XLSX.utils.encode_cell({ r: i, c: 0 })
    if (ws[tAddr]) {
      ws[tAddr].s = fill
        ? { fill, font: { bold: true, color: { rgb: TYPE_COLOR[type] } }, alignment: { horizontal: 'center', vertical: 'center' } }
        : { font: { color: { rgb: TYPE_COLOR[type] } }, alignment: { horizontal: 'center', vertical: 'center' } }
    }
    if (!fill) continue
    for (let c = 1; c < 5; c++) {
      const addr = XLSX.utils.encode_cell({ r: i, c })
      if (ws[addr]) ws[addr].s = { fill }
    }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '差异明细')
  XLSX.writeFile(wb, `diff-${ts()}.xlsx`, { bookType: 'xlsx', cellStyles: true })
  ElMessage.success('已导出 Excel 文件（差异行已标注颜色）')
}
function copyText(txt) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(txt).then(() => ElMessage.success('已复制到剪贴板'), () => fallbackCopy(txt))
  } else fallbackCopy(txt)
}
function fallbackCopy(txt) {
  const ta = document.createElement('textarea')
  ta.value = txt
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy'); ElMessage.success('已复制到剪贴板') }
  catch (e) { ElMessage.error('复制失败，请手动选择') }
  document.body.removeChild(ta)
}
function copyResult() {
  if (!hasInput.value) { ElMessage.warning('请先粘贴或导入文本'); return }
  copyText(unifiedText())
}
function onExport(cmd) {
  if (cmd === 'txt') exportTxt()
  else if (cmd === 'csv') exportCsv()
  else if (cmd === 'xlsx') exportExcel()
  else if (cmd === 'copy') copyResult()
}
</script>

<style scoped>
@import '../styles/proto-panel.css';
.td-page { max-width: 1080px; }
.td-head { margin-bottom: 14px }
.td-title { font-size: 18px; font-weight: 600; color: var(--t1); margin: 0 0 4px }
.td-sub { font-size: 12px; color: var(--t3); margin: 0 }

/* 与配置解析 proto-panel 同款：导入卡 / 结果卡 复用 .proto-panel 等全局类 */
.td-opt { display: flex; flex-direction: column; gap: 10px }
.td-opt-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--t1) }

/* 右侧操作按钮（同 ProtoPanel 的导出按钮样式） */
.export-csv-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; padding: 4px 10px;
  border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg2); color: var(--t2);
  cursor: pointer; white-space: nowrap; transition: all .15s;
}
.export-csv-btn:hover { background: var(--bg3); color: var(--blue); border-color: var(--blue-b); }

/* 结果头部统计点配色 */
.total-dot.s-del { color: #A32D2D }
.total-dot.s-add { color: #3B6D11 }
.total-dot.s-mod { color: #854F0B }

/* 导入区：配置解析同款 drop-zone 上传框 */
.td-imp { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px }

.drop-zone {
  padding: 36px 24px;
  border: 2px dashed var(--border);
  border-radius: 16px;
  cursor: pointer;
  transition: all .3s;
  background: var(--bg2);
  text-align: center;
}
.td-imp .drop-zone { margin: 0; max-width: none }
.drop-zone:hover {
  border-color: var(--blue);
  background: var(--blue-l);
  box-shadow: 0 8px 30px rgba(74,158,255,.12);
}
.drop-zone.is-drag {
  border-color: var(--blue);
  background: var(--blue-l);
}
.drop-zone.has {
  border-style: solid;
  border-color: var(--blue-b, var(--blue));
}
.drop-zone .drop-icon {
  color: var(--t4);
  margin-bottom: 12px;
  transition: color .3s;
}
.drop-zone:hover .drop-icon,
.drop-zone.is-drag .drop-icon { color: var(--blue); }
.drop-zone .drop-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--t2);
  margin-bottom: 16px;
  transition: color .3s;
  word-break: break-all;
}
.drop-zone:hover .drop-title,
.drop-zone.is-drag .drop-title { color: var(--t1); }
.drop-zone .drop-btn {
  display: inline-block;
  padding: 7px 22px;
  border-radius: 8px;
  background: var(--blue);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  transition: all .2s;
  cursor: pointer;
}
.drop-zone:hover .drop-btn {
  opacity: .9;
  box-shadow: 0 4px 12px rgba(74,158,255,.3);
}
.drop-zone .drop-or {
  font-size: 12px;
  color: var(--t4);
  margin: 12px 0 10px;
}
.drop-zone .collect-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 18px;
  border-radius: 8px;
  border: 1px solid var(--blue);
  color: var(--blue);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all .2s;
}
.drop-zone .collect-btn:hover {
  background: var(--blue);
  color: #fff;
  box-shadow: 0 4px 12px rgba(74,158,255,.3);
}
.drop-zone .drop-foot {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.drop-zone .drop-meta { font-size: 12px; color: var(--t3) }
.drop-zone .clear-btn {
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg3);
  color: var(--t2);
  cursor: pointer;
  transition: all .15s;
}
.drop-zone .clear-btn:hover { color: var(--red, #d33); border-color: var(--red, #d33) }

/* 结果卡片 */
.td-result-card { margin-bottom: 16px }
.td-result-body { padding: 0 }
.td-result-body .td-warn { border-top: 1px solid var(--div); border-bottom: none }

.td-paste { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px }
.td-ta { width: 100%; height: 130px; border: 1px solid var(--border); border-radius: var(--r); resize: vertical; padding: 10px 12px; font-family: var(--font-mono, monospace); font-size: 13px; color: var(--t1); background: var(--card); box-sizing: border-box; outline: none; line-height: 1.6 }

.td-empty { padding: 48px; text-align: center; color: var(--t3); font-size: 13px }
.td-warn { padding: 8px 12px; font-size: 12px; color: #854F0B; background: #FBF1E0; border-bottom: 1px solid var(--div) }

/* 滚动容器：固定视口高度，竖向滚动；内容不横向溢出（超长行截断） */
.td-scroll { overflow: auto; position: relative; background: var(--card) }
.td-vp { position: relative; width: 100% }

.td-grid { display: grid; grid-template-columns: 52px 1fr 52px 1fr; font-family: var(--font-mono, monospace); font-size: 13px; line-height: 26px; height: 26px; box-sizing: border-box; border-bottom: 1px solid var(--div) }
.td-grid-head { position: sticky; top: 0; z-index: 5; background: var(--bg2); font-family: var(--font-sans); font-size: 12px; color: var(--t2); font-weight: 600; line-height: 26px; height: 26px; box-shadow: 0 1px 0 var(--div) }
.td-grid-head > div { padding: 0 12px }
.td-ln-h, .td-tx-h { border-right: 1px solid var(--div) }
.td-ln { padding: 0 6px; text-align: right; color: var(--t3); background: var(--bg2); user-select: none; border-right: 1px solid var(--div); white-space: nowrap; overflow: hidden; min-width: 0 }
.td-tx { padding: 0 12px; color: var(--t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0 }
.td-win { position: absolute; top: 26px; left: 0; right: 0; will-change: transform }

.td-row-del .td-tx { background: #FCEBEB } .td-row-del .td-ln { background: #F6D6D6 }
.td-row-add .td-tx { background: #EAF3DE } .td-row-add .td-ln { background: #D6E8BE }
.td-row-mod .td-tx { background: #FBF1E0 } .td-row-mod .td-ln { background: #F3E6CC }
.td-row-same .td-tx { background: var(--card) }
.td-row-empty .td-tx { background: var(--bg2) }
.seg-del { background: #F7C1C1; color: #A32D2D; border-radius: 2px }
.seg-add { background: #C0DD97; color: #3B6D11; border-radius: 2px }
.td-fold { grid-column: 1 / -1; text-align: center; color: var(--t3); font-size: 12px; background: var(--bg2); font-family: var(--font-sans); line-height: 26px; height: 26px }

.td-u-head { position: sticky; top: 0; z-index: 5; padding: 0 12px; background: var(--bg2); font-size: 12px; color: var(--t2); font-weight: 600; border-bottom: 1px solid var(--div); line-height: 26px; height: 26px; box-shadow: 0 1px 0 var(--div) }
.td-u-row { display: grid; grid-template-columns: 24px 56px 1fr; font-family: var(--font-mono, monospace); font-size: 13px; line-height: 26px; height: 26px; box-sizing: border-box; border-bottom: 1px solid var(--div) }
.td-u-sign { text-align: center; color: var(--t3) }
.td-u-ln { text-align: right; color: var(--t3); padding-right: 8px; user-select: none }
.td-u-tx { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px; color: var(--t1); min-width: 0 }
.td-u-row.del { background: #FCEBEB } .td-u-row.del .td-u-sign { color: #A32D2D }
.td-u-row.add { background: #EAF3DE } .td-u-row.add .td-u-sign { color: #3B6D11 }
.td-u-fold { text-align: center; color: var(--t3); font-size: 12px; background: var(--bg2); font-family: var(--font-sans); line-height: 26px; height: 26px }

@media (max-width: 760px) {
  .td-imp { grid-template-columns: 1fr }
  .td-paste { grid-template-columns: 1fr }
  .td-res-h { flex-direction: column; align-items: flex-start }
  .td-res-h .proto-right { margin-left: 0; flex-wrap: wrap }
 }
</style>
