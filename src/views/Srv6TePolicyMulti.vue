<template>
  <div class="te-multi">
    <div class="te-head">
      <div class="te-title">SRv6 TE Policy</div>
      <div class="te-actions">
        <el-button :disabled="beforeFiles.length === 0 && afterFiles.length === 0" @click="clearAll">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          清空重新对比
        </el-button>
        <el-button type="primary" :disabled="pairedDevices.length === 0" @click="exportAllExcel">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          导出全部（Excel）
        </el-button>
      </div>
    </div>

    <div class="te-tip">
      左侧导入「割接前」各设备日志（可多选 / 拖拽），右侧导入「割接后」各设备日志，系统按设备名自动配对，逐台展示 SRv6 TE Policy 的前后差异（变更 / 新增 / 已失效）。
    </div>

    <!-- 导入区：割接前 / 割接后 -->
    <div class="te-zones">
      <div class="zone" :class="{ drag: dragBefore }"
           @dragover.prevent="dragBefore = true" @dragleave="dragBefore = false"
           @drop.prevent="onDrop($event, 'before')">
        <div class="zone-h">
          <span class="zone-tag before">割接前</span>
          <span class="zone-count">{{ beforeFiles.length }} 个文件</span>
          <span v-if="beforeFiles.length" class="zone-clear" @click="clearSide('before')">清空</span>
        </div>
        <label class="zone-btn">
          <input type="file" accept=".txt,.conf,.cfg,.log" multiple hidden @change="onPick($event, 'before')">
          + 选择 / 拖拽文件
        </label>
        <ul class="zone-list">
          <li v-for="f in beforeFiles" :key="f.id">
            <span class="fi-name" :title="f.fileName">{{ f.fileName }}</span>
            <span class="fi-dev">@{{ f.device }}</span>
            <span class="fi-cnt" :class="{ zero: f.policyCount === 0 }" :title="f.policyCount === 0 ? '该日志中 display srv6-te policy 输出为空（设备未配置策略或未采集）' : ''">{{ f.policyCount }} 条策略</span>
            <span class="fi-del" @click="removeFile('before', f.id)">×</span>
          </li>
          <li v-if="beforeFiles.length === 0" class="fi-empty">尚未导入</li>
        </ul>
      </div>

      <div class="zone" :class="{ drag: dragAfter }"
           @dragover.prevent="dragAfter = true" @dragleave="dragAfter = false"
           @drop.prevent="onDrop($event, 'after')">
        <div class="zone-h">
          <span class="zone-tag after">割接后</span>
          <span class="zone-count">{{ afterFiles.length }} 个文件</span>
          <span v-if="afterFiles.length" class="zone-clear" @click="clearSide('after')">清空</span>
        </div>
        <label class="zone-btn">
          <input type="file" accept=".txt,.conf,.cfg,.log" multiple hidden @change="onPick($event, 'after')">
          + 选择 / 拖拽文件
        </label>
        <ul class="zone-list">
          <li v-for="f in afterFiles" :key="f.id">
            <span class="fi-name" :title="f.fileName">{{ f.fileName }}</span>
            <span class="fi-dev">@{{ f.device }}</span>
            <span class="fi-cnt" :class="{ zero: f.policyCount === 0 }" :title="f.policyCount === 0 ? '该日志中 display srv6-te policy 输出为空（设备未配置策略或未采集）' : ''">{{ f.policyCount }} 条策略</span>
            <span class="fi-del" @click="removeFile('after', f.id)">×</span>
          </li>
          <li v-if="afterFiles.length === 0" class="fi-empty">尚未导入</li>
        </ul>
      </div>
    </div>

    <div v-if="comparison.devices.length === 0" class="te-empty">
      请先导入「割接前」与「割接后」的设备日志，系统会自动按设备名配对。
    </div>

    <template v-else>
      <div class="te-summary">
        <span>共配对 <b>{{ comparison.devices.length }}</b> 台设备</span>
        <span class="s-diff">有差异 <b>{{ devicesWithDiff.length }}</b> 台</span>
        <span class="s-ok">完全一致 <b>{{ devicesNoDiff.length }}</b> 台</span>
        <span v-if="devicesNoData.length" class="s-warn">无策略数据 <b>{{ devicesNoData.length }}</b> 台</span>
        <span v-if="comparison.onlyBefore.length" class="s-warn">仅割接前有 <b>{{ comparison.onlyBefore.length }}</b> 台</span>
        <span v-if="comparison.onlyAfter.length" class="s-warn">仅割接后有 <b>{{ comparison.onlyAfter.length }}</b> 台</span>
      </div>

      <div v-if="devicesNoData.length" class="te-warn">
        ⚠ 以下设备日志中 <b>display srv6-te policy</b> 输出为空（设备未配置 SRv6 TE Policy，或采集时无回显），表格中无数据属正常：
        <span v-for="d in devicesNoData" :key="d.key" class="warn-chip">{{ d.name }}</span>
      </div>

      <el-tabs v-model="selected" type="card" class="te-tabs">
        <el-tab-pane v-for="d in comparison.devices" :key="d.key" :name="d.key">
          <template #label>
            <span class="tab-label">
              {{ d.name }}
              <span v-if="d.stats.changed || d.stats.added || d.stats.removed" class="tab-badge diff">
                变{{ d.stats.changed }} / 新{{ d.stats.added }} / 失{{ d.stats.removed }}
              </span>
              <span v-else-if="d.rows.length === 0" class="tab-badge nodata">无数据</span>
              <span v-else class="tab-badge ok">一致</span>
            </span>
          </template>

          <div class="dev-panel">
            <div class="dev-bar">
              <div class="dev-meta">
                <span><i class="m-k">前</i>{{ d.beforeFile }}</span>
                <span><i class="m-k after">后</i>{{ d.afterFile }}</span>
              </div>
              <div class="dev-tools">
                <el-input v-model="d.search" size="small" placeholder="搜索策略名 / IP / SID..." clearable style="width:240px" />
                <el-button size="small" type="primary" @click="exportDeviceExcel(d)">导出本设备 Excel</el-button>
              </div>
            </div>

            <el-table :data="filteredRows(d)" border :row-class-name="rowCls" class="te-table"
              :empty-text="d.rows.length === 0 ? '该设备日志中 display srv6-te policy 输出为空（未配置策略或未采集到），无可对比数据' : '无匹配结果'">
              <el-table-column label="对比结果" min-width="90" align="left" fixed>
                <template #default="{ row }">
                  <el-tag v-if="row.isConsistent === null" type="info" size="small">待比对</el-tag>
                  <el-tag v-else :type="row.isConsistent ? 'success' : 'danger'" size="small">
                    {{ row.isConsistent ? '一致' : (row.policyState === '新增策略' ? '新增' : row.policyState === '已失效' ? '已失效' : '不一致') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="割接前_策略名称" width="280" align="left">
                <template #default="{ row }">
                  <span>{{ row.policyState === '新增策略' ? '-' : (row.policyName || '-') }}</span>
                </template>
              </el-table-column>
              <el-table-column label="割接后_策略名称" width="280" align="left">
                <template #default="{ row }">
                  <span>{{ row.policyState === '已失效' ? '-' : (row.policyName || '-') }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="color" label="Color" min-width="90" align="left">
                <template #default="{ row }"><Cell :row="row" field="color" /></template>
              </el-table-column>
              <el-table-column prop="endpoint" label="Endpoint" min-width="210" align="left">
                <template #default="{ row }"><Cell :row="row" field="endpoint" /></template>
              </el-table-column>
              <el-table-column prop="tunnelId" label="TunnelId" min-width="100" align="left">
                <template #default="{ row }"><Cell :row="row" field="tunnelId" /></template>
              </el-table-column>
              <el-table-column prop="policyState" label="Policy State" min-width="140" align="left">
                <template #default="{ row }">
                  <el-tag :type="tagType(row.policyState)" size="small">{{ row.policyState || '-' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="stateChangeTime" label="State Change Time" min-width="170" align="left">
                <template #default="{ row }"><Cell :row="row" field="stateChangeTime" /></template>
              </el-table-column>
              <el-table-column prop="bindingSid" label="Binding SID" min-width="140" align="left">
                <template #default="{ row }"><Cell :row="row" field="bindingSid" /></template>
              </el-table-column>
              <el-table-column prop="candidatePathCount" label="Candidate-path Count" min-width="130" align="left">
                <template #default="{ row }"><Cell :row="row" field="candidatePathCount" /></template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div v-if="comparison.onlyBefore.length || comparison.onlyAfter.length" class="te-warn">
        <div v-if="comparison.onlyBefore.length">
          ⚠ 以下设备仅有「割接前」日志，无法对比：
          <span v-for="f in comparison.onlyBefore" :key="f.id" class="warn-chip">{{ f.device }}</span>
        </div>
        <div v-if="comparison.onlyAfter.length">
          ⚠ 以下设备仅有「割接后」日志，无法对比：
          <span v-for="f in comparison.onlyAfter" :key="f.id" class="warn-chip">{{ f.device }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
defineOptions({ name: 'Srv6TePolicyMulti' })

import { ref, reactive, computed, watch, h } from 'vue'
// XLSX 改为导出时动态导入（见 exportDeviceExcel / exportAllExcel），避免进入首屏主包
import { extractDeviceName, diffDevicePolicies, buildDevicePairs } from '../utils/srv6TePolicyMulti.js'
import { useSrv6TePolicyModule } from '../utils/srv6TePolicy.js'

const { parseSrv6TePolicyLog } = useSrv6TePolicyModule()

// ---- 文件状态 ----
let uid = 0
const beforeFiles = ref([])
const afterFiles = ref([])
const dragBefore = ref(false)
const dragAfter = ref(false)
const selected = ref('')

// ---- 读取文件为文本并登记 ----
// 同一设备（或同名文件）重复导入时自动替换旧记录，避免旧文件残留导致配对混乱
const readFiles = async (fileList, bucket) => {
  for (const file of fileList) {
    try {
      const text = await file.text()
      const device = extractDeviceName(text, file.name)
      const policyCount = parseSrv6TePolicyLog(text).length
      const entry = reactive({ id: ++uid, device, fileName: file.name, text, policyCount })
      const dupIdx = bucket.findIndex(f => f.device === device || f.fileName === file.name)
      if (dupIdx >= 0) {
        bucket.splice(dupIdx, 1, entry)
        ElMessage({
          type: 'info',
          message: `${device}：已用新文件替换之前导入的同设备日志`,
          customClass: 'file-step-msg',
          duration: 3000
        })
      } else {
        bucket.push(entry)
      }
      if (policyCount === 0) {
        ElMessage.warning(`${file.name}（${device}）：未解析到 SRv6 TE Policy（该日志中命令输出为空）`)
      }
    } catch (e) {
      ElMessage.error(`读取失败：${file.name}`)
    }
  }
}

// ---- 清空重新对比 ----
const clearSide = (side) => {
  if (side === 'before') beforeFiles.value = []
  else afterFiles.value = []
}
const clearAll = () => {
  beforeFiles.value = []
  afterFiles.value = []
  selected.value = ''
  ElMessage.success('已清空，可重新导入文件进行对比')
}

const onPick = (e, side) => {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  readFiles(files, side === 'before' ? beforeFiles.value : afterFiles.value)
}
const onDrop = (e, side) => {
  if (side === 'before') dragBefore.value = false
  else dragAfter.value = false
  const files = Array.from(e.dataTransfer.files || [])
  readFiles(files, side === 'before' ? beforeFiles.value : afterFiles.value)
}
const removeFile = (side, id) => {
  const arr = side === 'before' ? beforeFiles.value : afterFiles.value
  const idx = arr.findIndex(f => f.id === id)
  if (idx >= 0) arr.splice(idx, 1)
}

// ---- 配对 + 逐设备差异 ----
const comparison = computed(() => {
  const { pairs, onlyBefore, onlyAfter } = buildDevicePairs(beforeFiles.value, afterFiles.value)
  const devices = pairs.map(p => {
    const { rows, stats } = diffDevicePolicies(p.before.text, p.after.text)
    return {
      key: p.device,
      name: p.device,
      beforeFile: p.before.fileName,
      afterFile: p.after.fileName,
      rows,
      stats,
      search: ''
    }
  })
  return { devices, onlyBefore, onlyAfter }
})

const pairedDevices = computed(() => comparison.value.devices)
const devicesWithDiff = computed(() => comparison.value.devices.filter(d => d.stats.changed || d.stats.added || d.stats.removed))
const devicesNoDiff = computed(() => comparison.value.devices.filter(d => d.rows.length > 0 && !d.stats.changed && !d.stats.added && !d.stats.removed))
const devicesNoData = computed(() => comparison.value.devices.filter(d => d.rows.length === 0))

watch(pairedDevices, (list) => {
  if (!selected.value || !list.find(d => d.key === selected.value)) {
    selected.value = list.length ? list[0].key : ''
  }
}, { immediate: true })

const filteredRows = (d) => {
  const kw = (d.search || '').toLowerCase().trim()
  if (!kw) return d.rows
  return d.rows.filter(r => Object.values(r).some(v => v != null && String(v).toLowerCase().includes(kw)))
}

const getDiff = (row, field) => (row.configDiffFields || []).find(d => d.field === field) || null

// 单元格：有差异时显示 新/旧
const Cell = (props) => {
  const diff = getDiff(props.row, props.field)
  if (diff) {
    const parts = []
    if (diff.afterVal && diff.afterVal !== '-') parts.push(h('div', { class: 'diff-new' }, diff.afterVal + ' (新)'))
    if (diff.beforeVal && diff.beforeVal !== '-') parts.push(h('div', { class: 'diff-old' }, diff.beforeVal + ' (旧)'))
    return h('div', { class: 'diff-cell' }, parts)
  }
  return h('span', {}, props.row[props.field] == null ? '-' : props.row[props.field])
}
Cell.props = ['row', 'field']

const rowCls = ({ row }) => (row.isConsistent === false ? 'row-diff' : '')

const tagType = (val) => {
  if (!val) return 'info'
  const v = val.trim().split(/\s+/)[0].toLowerCase()
  if (v === 'up' || v === 'established' || v === 'operational' || v === 'reach' || v === 'reachable') return 'success'
  if (v === '新增策略') return 'warning'
  if (v === '已失效') return 'danger'
  if (v === 'down' || v === 'idle' || v === 'init') return 'warning'
  return 'danger'
}

// ---- 导出 ----
const FIELDS = [
  { key: 'policyName', label: '策略名称' },
  { key: 'color', label: 'Color' },
  { key: 'endpoint', label: 'Endpoint' },
  { key: 'tunnelId', label: 'TunnelId' },
  { key: 'policyState', label: 'Policy State' },
  { key: 'stateChangeTime', label: 'State Change Time' },
  { key: 'bindingSid', label: 'Binding SID' },
  { key: 'candidatePathCount', label: 'Candidate-path Count' },
  { key: 'isConsistent', label: '对比结果' }
]

// 仅「状态」与「Candidate-path Count」参与对比，其余字段只展示
const COMPARE_FIELDS = [
  { key: 'policyState', label: '状态' },
  { key: 'candidatePathCount', label: 'Candidate-path Count' }
]

const rowToAoa = (row) => FIELDS.map(c => {
  if (c.key === 'isConsistent') return row.isConsistent === true ? '一致' : row.isConsistent === false ? (row.policyState === '新增策略' ? '新增' : row.policyState === '已失效' ? '已失效' : '不一致') : '待比对'
  const v = row[c.key]
  return v == null ? '-' : v
})

const statusText = (row) => {
  if (row.isConsistent === true) return '一致'
  if (row.policyState === '新增策略') return '新增'
  if (row.policyState === '已失效') return '已失效'
  return '不一致'
}

const buildStyledSheet = (rows, XLSX) => {
  const aoa = [FIELDS.map(c => c.label), ...rows.map(rowToAoa)]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const headerFill = { rgb: 'DCE6F1' }
  const headerFont = { bold: true, color: { rgb: '1F3864' } }
  const delFill = { rgb: 'FCEBEB' }
  const okFill = { rgb: 'EAF3DE' }
  for (let c = 0; c < FIELDS.length; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = { fill: { patternType: 'solid', fgColor: headerFill }, font: headerFont, alignment: { vertical: 'center' } }
  }
  for (let r = 1; r < aoa.length; r++) {
    const row = rows[r - 1]
    let fill = null
    if (row.isConsistent === false) fill = delFill
    else if (row.isConsistent === true) fill = okFill
    if (fill) {
      for (let c = 0; c < FIELDS.length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (cell) cell.s = { fill: { patternType: 'solid', fgColor: fill }, font: { color: { rgb: '1F3864' } } }
      }
    }
  }
  ws['!cols'] = FIELDS.map(() => ({ wch: 20 }))
  return ws
}

// 单 sheet 平铺：每台设备每个策略一行，按用户指定格式输出
const buildFlatSheet = (devices, XLSX) => {
  const headers = ['割接前_设备名', '割接前_策略名称', '割接前_状态', '割接前_Candidate-path Count', '对比状态', '差异字段', '割接后_设备名', '割接后_策略名称', '割接后_状态', '割接后_Candidate-path Count']
  const aoa = [headers]
  const dataRows = []
  for (const d of devices) {
    for (const row of d.rows) {
      const diffMap = new Map((row.configDiffFields || []).map(df => [df.field, df]))
      const diffLabels = []
      for (const f of COMPARE_FIELDS) {
        if (diffMap.get(f.key)) diffLabels.push(f.label)
      }
      const beforeState = diffMap.get('policyState') ? diffMap.get('policyState').beforeVal : (row.policyState == null ? '-' : row.policyState)
      const afterState = diffMap.get('policyState') ? diffMap.get('policyState').afterVal : (row.policyState == null ? '-' : row.policyState)
      const beforeCp = diffMap.get('candidatePathCount') ? diffMap.get('candidatePathCount').beforeVal : (row.candidatePathCount == null ? '-' : row.candidatePathCount)
      const afterCp = diffMap.get('candidatePathCount') ? diffMap.get('candidatePathCount').afterVal : (row.candidatePathCount == null ? '-' : row.candidatePathCount)
      const beforePolicyName = row.policyState === '新增策略' ? '-' : (row.policyName || '-')
      const afterPolicyName = row.policyState === '已失效' ? '-' : (row.policyName || '-')
      aoa.push([
        d.name,
        beforePolicyName,
        beforeState,
        beforeCp,
        statusText(row),
        diffLabels.length ? diffLabels.join('、') : '无',
        d.name,
        afterPolicyName,
        afterState,
        afterCp
      ])
      dataRows.push(row)
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const headerFill = { rgb: 'DCE6F1' }
  const beforeFill = { rgb: 'FDF2E9' }
  const afterFill = { rgb: 'E8F8F5' }
  const headerFont = { bold: true, color: { rgb: '1F3864' } }
  const okFill = { rgb: 'EAF3DE' }
  const diffFill = { rgb: 'FCEBEB' }
  const addFill = { rgb: 'E8F6F3' }
  const remFill = { rgb: 'FCF3CF' }
  const colCount = headers.length
  for (let c = 0; c < colCount; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (!cell) continue
    let fill = headerFill
    // 割接前 4 列（设备名、策略名称、状态、Candidate-path Count）
    if (c >= 0 && c <= 3) fill = beforeFill
    // 割接后 4 列（设备名、策略名称、状态、Candidate-path Count）
    if (c >= 6 && c <= 9) fill = afterFill
    cell.s = { fill: { patternType: 'solid', fgColor: fill }, font: headerFont, alignment: { horizontal: 'center', vertical: 'center' } }
  }
  for (let r = 1; r < aoa.length; r++) {
    const row = dataRows[r - 1]
    let fill = null
    if (row.isConsistent === true) fill = okFill
    else if (row.policyState === '新增策略') fill = addFill
    else if (row.policyState === '已失效') fill = remFill
    else fill = diffFill
    for (let c = 0; c < colCount; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell) cell.s = { fill: { patternType: 'solid', fgColor: fill }, font: { color: { rgb: '1F3864' } }, alignment: { vertical: 'center' } }
    }
  }
  ws['!cols'] = [
    { wch: 26 }, { wch: 34 }, { wch: 16 }, { wch: 22 },
    { wch: 12 }, { wch: 26 },
    { wch: 26 }, { wch: 34 }, { wch: 16 }, { wch: 22 }
  ]
  return ws
}

const exportDeviceExcel = async (d) => {
  const XLSX = (await import('xlsx-js-style')).default
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildStyledSheet(d.rows, XLSX), 'SRv6 TE Policy')
  XLSX.writeFile(wb, `${d.name}_SRv6TEPolicy.xlsx`, { bookType: 'xlsx', cellStyles: true })
  ElMessage.success(`已导出 ${d.name} 的 SRv6 TE Policy 差异表`)
}

const exportAllExcel = async () => {
  const devices = comparison.value.devices
  if (!devices.length) return
  const XLSX = (await import('xlsx-js-style')).default
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildFlatSheet(devices, XLSX), '多设备割接对比')
  XLSX.writeFile(wb, 'SRv6_TE_Policy_多设备割接对比.xlsx', { bookType: 'xlsx', cellStyles: true })
  ElMessage.success(`已导出 ${devices.length} 台设备的 SRv6 TE Policy 差异表（单 sheet）`)
}
</script>

<style scoped>
.te-multi { padding: 4px 2px 40px; }
.te-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.te-title { font-size: 18px; font-weight: 700; color: var(--t1); }
.te-actions { display: flex; gap: 10px; }
.te-tip { font-size: 13px; color: var(--t3); line-height: 1.6; background: var(--sidebar-h); padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; }

.te-zones { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.zone { border: 1.5px dashed var(--border); border-radius: 10px; padding: 14px; background: var(--bg2); transition: all .15s; min-height: 140px; display: flex; flex-direction: column; }
.zone.drag { border-color: var(--blue); background: var(--blue-l); }
.zone-h { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.zone-tag { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 20px; color: #fff; }
.zone-tag.before { background: #f59e0b; }
.zone-tag.after { background: #22c55e; }
.zone-count { font-size: 12px; color: var(--t3); }
.zone-clear { margin-left: auto; font-size: 12px; color: #e11d48; cursor: pointer; user-select: none; }
.zone-clear:hover { text-decoration: underline; }
.zone-btn { display: inline-block; text-align: center; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg3); color: var(--t2); font-size: 13px; cursor: pointer; transition: all .15s; }
.zone-btn:hover { color: var(--blue); border-color: var(--blue-b); }
.zone-list { list-style: none; margin: 10px 0 0; padding: 0; flex: 1; overflow-y: auto; max-height: 160px; }
.zone-list li { display: flex; align-items: center; gap: 8px; padding: 5px 8px; font-size: 12px; border-radius: 5px; }
.zone-list li:nth-child(odd) { background: var(--bg3); }
.fi-name { flex: 1; color: var(--t1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fi-dev { color: var(--blue); font-size: 11px; flex-shrink: 0; }
.fi-cnt { flex-shrink: 0; font-size: 11px; padding: 0 6px; border-radius: 10px; background: rgba(34,197,94,.12); color: #16a34a; }
.fi-cnt.zero { background: rgba(239,68,68,.12); color: #dc2626; font-weight: 600; }
.fi-del { color: var(--t4); cursor: pointer; font-size: 15px; line-height: 1; flex-shrink: 0; }
.fi-del:hover { color: var(--red); }
.fi-empty { color: var(--t4); justify-content: center; }

.te-empty { padding: 50px; text-align: center; color: var(--t3); background: var(--bg2); border-radius: 10px; }
.te-summary { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; padding: 10px 14px; background: var(--bg2); border-radius: 8px; margin-bottom: 12px; font-size: 13px; color: var(--t2); }
.te-summary b { color: var(--t1); font-size: 15px; }
.s-diff b { color: #f59e0b; }
.s-ok b { color: #22c55e; }
.s-warn b { color: var(--red); }

.te-tabs { margin-top: 4px; }
.tab-label { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; overflow: hidden; }
.tab-badge { font-size: 10px; padding: 1px 6px; border-radius: 10px; white-space: nowrap; }
.tab-badge.diff { background: rgba(245,158,11,.15); color: #d97706; }
.tab-badge.ok { background: rgba(34,197,94,.15); color: #16a34a; }
.tab-badge.nodata { background: rgba(148,163,184,.2); color: #64748b; }

.dev-panel { padding: 4px 0 8px; }
.dev-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.dev-meta { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--t3); }
.dev-meta .m-k { display: inline-block; width: 22px; text-align: center; font-style: normal; font-size: 10px; font-weight: 700; color: #fff; background: #f59e0b; border-radius: 4px; margin-right: 6px; }
.dev-meta .m-k.after { background: #22c55e; }
.dev-tools { display: flex; align-items: center; gap: 10px; }

.te-table { font-size: 13px; }
:deep(.el-table .row-diff) { background-color: rgba(239, 68, 68, 0.045) !important; }
:deep(.el-table .row-diff:hover > td) { background-color: rgba(239, 68, 68, 0.07) !important; }
.diff-cell { line-height: 1.5; }
.diff-new { color: #16a34a; font-weight: 600; }
.diff-old { color: var(--t3); }

.te-warn { margin-top: 14px; padding: 10px 14px; background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.3); border-radius: 8px; font-size: 13px; color: #b45309; line-height: 2; }
.warn-chip { display: inline-block; margin: 0 6px; padding: 1px 8px; background: #fff; border: 1px solid rgba(245,158,11,.4); border-radius: 12px; color: #b45309; }
</style>
