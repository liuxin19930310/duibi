<template>
  <div class="proto-panel">
    <div class="proto-header" @click="toggleModule">
      <div class="proto-left">
        <Icon class="proto-arrow" :class="{ collapsed: !showTable }" icon="mdi:chevron-down" />
        <span class="proto-name">接口信息</span>
        <span class="proto-desc">接口配置与状态对比</span>
        <div class="proto-badges">
          <span class="badge green" v-if="totalConsistent">● {{ totalConsistent }}</span>
          <span class="badge red" v-if="totalDiff">● {{ totalDiff }}</span>
          <span class="badge new" v-if="totalNew">✨ {{ totalNew }}</span>
          <span class="badge del" v-if="totalDeleted">🗑 {{ totalDeleted }}</span>
        </div>
      </div>
      <div class="proto-right" @click.stop>
        <div class="filter-tabs">
          <span :class="{ active: filterType === 'all' }" @click="filterType = 'all'">全部 {{ neighborList.value.length }}</span>
          <span :class="{ active: filterType === 'consistent' }" @click="filterType = 'consistent'">一致 {{ totalConsistent }}</span>
          <span :class="{ active: filterType === 'diff' }" @click="filterType = 'diff'">变更 {{ totalDiff }}</span>
          <span :class="{ active: filterType === 'new' }" @click="filterType = 'new'">新增 {{ totalNew }}</span>
          <span :class="{ active: filterType === 'deleted' }" @click="filterType = 'deleted'">已失效 {{ totalDeleted }}</span>
        </div>
        <div class="search-wrap">
          <el-input class="proto-search" v-model="localSearch" placeholder="搜索接口、IP、VRF..." size="small" clearable><template #prefix><Icon icon="mdi:magnify" /></template></el-input>
          <span v-if="isSearching" class="search-result">找到 {{ filteredList.length }} 条</span>
        </div>
        <button class="reset-col-btn" title="恢复默认列宽" @click="resetColumnWidths">↺ 列宽</button>
      </div>
    </div>

    <div class="proto-body" v-show="showTable">
      <div class="table-scroll">
        <el-table ref="tableRef" :data="filteredList" border stripe :row-class-name="rowClassName" @header-dragend="onHeaderDragend">
          <el-table-column label="设备名" prop="deviceName" :width="colWidths.deviceName" align="center">
            <template #default="{ row }">
              <div class="td-center">
                <span class="cell-mono">{{ row.deviceName || '-' }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="接口" prop="interfaceName" :width="colWidths.interfaceName" align="center">
            <template #default="{ row }">
              <div class="td-left">
                <div class="if-name">{{ row.interfaceName }}</div>
                <div v-if="row.description && row.description !== '-'" class="if-desc">{{ row.description }}</div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="聚合口" prop="ethTrunk" :width="colWidths.ethTrunk" align="center">
            <template #default="{ row }">
              <div class="td-center">
                <template v-if="getDiffInfo(row, 'ethTrunk')">
                  <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'ethTrunk').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'ethTrunk').beforeVal }}</div></div>
                </template>
                <span v-else class="cell-mono">{{ row.ethTrunk || '-' }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="物理状态" prop="portStatus" :width="colWidths.portStatus" align="center">
            <template #default="{ row }">
              <div class="td-center">
                <template v-if="getDiffInfo(row, 'portStatus')">
                  <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'portStatus').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'portStatus').beforeVal }}</div></div>
                </template>
                <span v-else :class="['tag', statusTagClass(row.portStatus)]">{{ row.portStatus || '-' }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="协议状态" prop="protoStatus" :width="colWidths.protoStatus" align="center">
            <template #default="{ row }">
              <div class="td-center">
                <template v-if="getDiffInfo(row, 'protoStatus')">
                  <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'protoStatus').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'protoStatus').beforeVal }}</div></div>
                </template>
                <el-tag v-else :type="protoTagType(row.protoStatus)" size="small">{{ row.protoStatus || '-' }}</el-tag>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="结果" :width="colWidths.result" align="center">
            <template #default="{ row }">
              <div class="td-center">
                <span v-if="row.isConsistent === null" class="tag tag-info">待比对</span>
                <span v-else-if="row.isConsistent" class="tag tag-ok">✓ 一致</span>
                <span v-else class="tag tag-fail">✗ 不一致</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="IP 地址">
            <el-table-column label="IPv4地址" prop="ipv4" :min-width="colWidths.ipv4" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'ipv4')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'ipv4').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'ipv4').beforeVal }}</div></div>
                  </template>
                  <span v-else class="cell-mono">{{ row.ipv4 || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="IPv6地址" prop="ipv6" :min-width="colWidths.ipv6" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'ipv6')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'ipv6').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'ipv6').beforeVal }}</div></div>
                  </template>
                  <span v-else class="cell-mono">{{ row.ipv6 || '-' }}</span>
                </div>
              </template>
            </el-table-column>
          </el-table-column>

          <el-table-column label="VRF" prop="vrf" :width="colWidths.vrf" align="center">
            <template #default="{ row }">
              <div class="td-center">
                <template v-if="getDiffInfo(row, 'vrf')">
                  <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'vrf').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'vrf').beforeVal }}</div></div>
                </template>
                <span v-else>{{ row.vrf || '-' }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="COST值" prop="isisCost" :width="colWidths.isisCost" align="center">
            <template #default="{ row }">
              <div class="td-center">
                <template v-if="getDiffInfo(row, 'isisCost')">
                  <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'isisCost').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'isisCost').beforeVal }}</div></div>
                </template>
                <span v-else>{{ row.isisCost || '-' }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="物理层">
            <el-table-column label="速率" prop="interfaceRate" :min-width="colWidths.interfaceRate" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'interfaceRate')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'interfaceRate').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'interfaceRate').beforeVal }}</div></div>
                  </template>
                  <span v-else>{{ row.interfaceRate || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="收光范围" prop="rxWarningRange" :min-width="colWidths.rxWarningRange" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'rxWarningRange')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'rxWarningRange').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'rxWarningRange').beforeVal }}</div></div>
                  </template>
                  <span v-else class="cell-mono">{{ row.rxWarningRange || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="发光范围" prop="txWarningRange" :min-width="colWidths.txWarningRange" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'txWarningRange')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'txWarningRange').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'txWarningRange').beforeVal }}</div></div>
                  </template>
                  <span v-else class="cell-mono">{{ row.txWarningRange || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="收光值" prop="rxPower" :min-width="colWidths.rxPower" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'rxPower')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'rxPower').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'rxPower').beforeVal }}</div></div>
                  </template>
                  <el-tag v-else :type="powerRangeTagType(row.rxPower, row.rxPowerOk)" size="small">{{ row.rxPower || '-' }}</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="发光值" prop="txPower" :min-width="colWidths.txPower" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'txPower')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'txPower').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'txPower').beforeVal }}</div></div>
                  </template>
                  <el-tag v-else :type="powerRangeTagType(row.txPower, row.txPowerOk)" size="small">{{ row.txPower || '-' }}</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="入向流量" prop="inUti" :min-width="colWidths.inUti" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'inUti')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'inUti').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'inUti').beforeVal }}</div></div>
                  </template>
                  <span v-else>{{ row.inUti || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="出向流量" prop="outUti" :min-width="colWidths.outUti" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'outUti')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'outUti').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'outUti').beforeVal }}</div></div>
                  </template>
                  <span v-else>{{ row.outUti || '-' }}</span>
                </div>
              </template>
            </el-table-column>
          </el-table-column>

          <el-table-column label="配置">
            <el-table-column label="MTU" prop="mtu" :min-width="colWidths.mtu" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'mtu')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'mtu').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'mtu').beforeVal }}</div></div>
                  </template>
                  <span v-else>{{ row.mtu || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="模块" prop="moduleType" :min-width="colWidths.moduleType" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'moduleType')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'moduleType').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'moduleType').beforeVal }}</div></div>
                  </template>
                  <span v-else>{{ row.moduleType || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="SRv6 SID" prop="srv6Sid" :min-width="colWidths.srv6Sid" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'srv6Sid')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'srv6Sid').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'srv6Sid').beforeVal }}</div></div>
                  </template>
                  <span v-else class="cell-mono">{{ row.srv6Sid || '-' }}</span>
                </div>
              </template>
            </el-table-column>
          </el-table-column>

          <el-table-column label="质量">
            <el-table-column label="CRC统计" prop="crc" :min-width="colWidths.crc" align="center">
              <template #default="{ row }">
                <div class="td-center">
                  <template v-if="getDiffInfo(row, 'crc')">
                    <div class="diff-cell"><div class="diff-new">{{ getDiffInfo(row, 'crc').afterVal }}</div><div class="diff-old">{{ getDiffInfo(row, 'crc').beforeVal }}</div></div>
                  </template>
                  <span v-else :class="{ 'val-warn': row.crc && row.crc !== '-' && row.crc !== '0' }">{{ row.crc || '-' }}</span>
                </div>
              </template>
            </el-table-column>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { collectScope } from '../utils/scope.js'

const props = defineProps({
  activeModule: String,
  moduleName: String
})
const emit = defineEmits(['update:activeModule'])

const localSearch = ref('')
const filterType = ref('all')
const { showTable, neighborList, getDiffInfo, statusTagType } = collectScope.interface

const tableRef = ref(null)

// ==================== 列宽持久化 ====================

const STORAGE_KEY = 'ifinfo-cw-v3'

const DEFAULT_WIDTHS = {
  deviceName: 200,
  interfaceName: 400,
  ethTrunk: 110,
  portStatus: 80,
  protoStatus: 80,
  result: 90,
  ipv4: 140,
  ipv6: 160,
  vrf: 80,
  isisCost: 120,
  interfaceRate: 80,
  rxWarningRange: 135,
  txWarningRange: 135,
  rxPower: 150,
  txPower: 150,
  inUti: 90,
  outUti: 90,
  mtu: 70,
  moduleType: 80,
  srv6Sid: 130,
  crc: 70
}
const MIN_WIDTH = 25

function loadWidths() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) {
      const a = JSON.parse(s)
      if (Array.isArray(a) && a.length === Object.keys(DEFAULT_WIDTHS).length) {
        return Object.fromEntries(
          Object.keys(DEFAULT_WIDTHS).map((k, i) => {
            const v = a[i]
            return [k, typeof v === 'number' && v >= MIN_WIDTH ? v : DEFAULT_WIDTHS[k]]
          })
        )
      }
    }
  } catch (_) { /* ignore */ }
  return { ...DEFAULT_WIDTHS }
}

const colWidths = ref(loadWidths())

function saveWidths() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.values(colWidths.value)))
  } catch (_) { /* ignore */ }
}

function onHeaderDragend({ column, newWidth }) {
  const key = column.property
  if (key && DEFAULT_WIDTHS.hasOwnProperty(key)) {
    colWidths.value[key] = newWidth
    nextTick(() => saveWidths())
  }
}

function resetColumnWidths() {
  colWidths.value = { ...DEFAULT_WIDTHS }
  nextTick(() => {
    tableRef.value?.doLayout()
    saveWidths()
  })
}

// ==================== 原有逻辑 ====================

const statusTagClass = (val) => {
  if (!val) return 'tag-info'
  const v = val.trim().split(/\s+/)[0].toLowerCase()
  if (v === 'up' || v === 'up(s)' || v === 'established' || v === 'operational') return 'tag-ok'
  if (v === 'down' || v === '*down' || v === 'idle') return 'tag-warn'
  if (v.includes('新增')) return 'tag-new'
  if (v.includes('已失效') || v.includes('已删除')) return 'tag-del'
  return 'tag-info'
}

const protoTagType = (val) => {
  if (!val) return 'info'
  const v = val.trim().split(/\s+/)[0].toLowerCase()
  if (v === 'up' || v === 'up(s)') return 'success'
  if (v === 'down') return 'danger'
  return 'info'
}

// 收光值/发光值着色：全部在告警范围内→绿(success)，任一超范围→红(danger)，无数据/无范围→灰(info)
const powerRangeTagType = (val, ok) => {
  if (ok === true) return 'success'
  if (ok === false) return 'danger'
  return 'info'
}

const totalConsistent = computed(() => neighborList.value.filter(i => i.isConsistent === true).length)
const totalDiff = computed(() => neighborList.value.filter(i => i.isConsistent === false).length)
const totalNew = computed(() => neighborList.value.filter(i => i.portStatus === '新增端口' || i.beforeInterfaceName === '新增端口').length)
const totalDeleted = computed(() => neighborList.value.filter(i => i.portStatus === '已失效' || i.afterInterfaceName === '已删除').length)

const isSearching = computed(() => !!localSearch.value)

const matchSearch = (item, kw) => {
  const searchIn = (val) => {
    if (val == null) return false
    if (typeof val === 'string' || typeof val === 'number') return String(val).toLowerCase().includes(kw)
    if (Array.isArray(val)) return val.some(v => searchIn(v))
    if (typeof val === 'object') return Object.values(val).some(v => searchIn(v))
    return false
  }
  return searchIn(item)
}

const filteredList = computed(() => {
  let list = neighborList.value.filter(item => {
    if (item.interfaceName && (item.interfaceName.includes('NULL0') || item.interfaceName.includes('新增端口'))) return false
    return true
  })


  if (localSearch.value) {
    const kw = localSearch.value.toLowerCase()
    list = list.filter(item => matchSearch(item, kw))
  }

  const f = filterType.value
  if (f === 'consistent') return list.filter(i => i.isConsistent === true)
  if (f === 'diff') return list.filter(i => i.isConsistent === false)
  if (f === 'new') return list.filter(i => i.portStatus === '新增端口' || i.beforeInterfaceName === '新增端口')
  if (f === 'deleted') return list.filter(i => i.portStatus === '已失效' || i.afterInterfaceName === '已删除')
  return list
})

watch(isSearching, (val) => { if (val) showTable.value = true })

watch(() => props.activeModule, (val) => {
  showTable.value = (val === props.moduleName)
}, { immediate: true })

const toggleModule = () => {
  emit('update:activeModule', props.activeModule === props.moduleName ? '' : props.moduleName)
}

// ==================== 一键导出 ====================

const safeSheetName = (name) => {
  let s = (name || 'Sheet').replace(/[\\/:*?"<>|]/g, '_').trim()
  if (s.length > 31) s = s.slice(0, 31)
  return s || 'Sheet'
}

const ifExportCols = [
  { key: 'deviceName', label: '设备名' },
  { key: 'interfaceName', label: '接口' },
  { key: 'ethTrunk', label: '聚合口' },
  { key: 'portStatus', label: '物理状态' },
  { key: 'protoStatus', label: '协议状态' },
  { key: 'result', label: '结果' },
  { key: 'ipv4', label: 'IPv4地址' },
  { key: 'ipv6', label: 'IPv6地址' },
  { key: 'vrf', label: 'VRF' },
  { key: 'isisCost', label: 'COST值' },
  { key: 'interfaceRate', label: '速率' },
  { key: 'rxWarningRange', label: '收光范围' },
  { key: 'txWarningRange', label: '发光范围' },
  { key: 'rxPower', label: '收光值' },
  { key: 'txPower', label: '发光值' },
  { key: 'inUti', label: '入向流量' },
  { key: 'outUti', label: '出向流量' },
  { key: 'mtu', label: 'MTU' },
  { key: 'moduleType', label: '模块' },
  { key: 'srv6Sid', label: 'SRv6 SID' },
  { key: 'crc', label: 'CRC统计' }
]

const ifCellVal = (row, key) => {
  const diff = getDiffInfo(row, key)
  if (diff) {
    if (key === 'opticalPower' && Array.isArray(diff.subDiffs) && diff.subDiffs.length >= 2) {
      const rx = diff.subDiffs.find(s => s.label === 'Rx') || diff.subDiffs[0]
      const tx = diff.subDiffs.find(s => s.label === 'Tx') || diff.subDiffs[1]
      const fmt = (s) => (s == null ? '-' : String(s))
      return `Rx:${fmt(rx.after)} Tx:${fmt(tx.after)} (新)\nRx:${fmt(rx.before)} Tx:${fmt(tx.before)} (旧)`
    }
    const parts = []
    if (diff.afterVal && diff.afterVal !== '-') parts.push(`${diff.afterVal} (新)`)
    if (diff.beforeVal && diff.beforeVal !== '-') parts.push(`${diff.beforeVal} (旧)`)
    if (parts.length) return parts.join('\n')
  }
  return row[key] == null ? '-' : row[key]
}

const buildExportSheet = async () => {
  const list = filteredList.value
  if (!list.length) return null
  const XLSX = (await import('xlsx-js-style')).default
  const aoa = [ifExportCols.map(c => c.label)]
  list.forEach(row => {
    const vals = ifExportCols.map(c => {
      if (c.key === 'interfaceName') {
        const d = (row.description && row.description !== '-') ? '\n' + row.description : ''
        return (row.interfaceName || '-') + d
      }
      if (c.key === 'result') {
        return row.isConsistent === true ? '一致' : row.isConsistent === false ? '不一致' : '待比对'
      }
      return ifCellVal(row, c.key)
    })
    aoa.push(vals)
  })
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const headerFill = { rgb: 'DCE6F1' }
  const headerFont = { bold: true, color: { rgb: '1F3864' } }
  for (let c = 0; c < ifExportCols.length; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = { fill: { patternType: 'solid', fgColor: headerFill }, font: headerFont, alignment: { horizontal: 'left', vertical: 'center' } }
  }
  for (let r = 1; r < aoa.length; r++) {
    for (let c = 0; c < ifExportCols.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell) continue
      const style = { font: { color: { rgb: '1F3864' } }, alignment: { horizontal: 'left', vertical: 'center' } }
      if (typeof cell.v === 'string' && cell.v.includes('\n')) style.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }
      cell.s = style
    }
  }
  ws['!cols'] = ifExportCols.map(c => ({ wch: (c.key === 'rxPower' || c.key === 'txPower') ? 40 : (c.key === 'rxWarningRange' || c.key === 'txWarningRange') ? 26 : c.key === 'interfaceName' ? 40 : 16 }))
  return { name: safeSheetName('接口信息'), ws }
}

const rowClassName = ({ row }) => row.isConsistent === false ? 'row-diff' : ''

defineExpose({ buildExportSheet })
</script>

<style scoped>
.search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.search-result {
  font-size: 11px;
  color: var(--blue);
  font-weight: 500;
  white-space: nowrap;
  background: var(--blue-l);
  padding: 2px 8px;
  border-radius: 10px;
}
.reset-col-btn {
  font-size: 11px;
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg2);
  color: var(--t2);
  cursor: pointer;
  white-space: nowrap;
  transition: background .15s;
}
.reset-col-btn:hover {
  background: var(--bg3);
  color: var(--t1);
}
.if-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--t1);
  font-family: var(--mono);
  line-height: 1.3;
}
.if-desc {
  font-size: 10px;
  color: var(--t3);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-mono {
  font-family: var(--mono);
  font-size: 11px;
}
.val-warn {
  color: var(--orange);
  font-weight: 600;
  font-family: var(--mono);
  font-size: 11px;
}
.diff-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  font-size: 12px;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
}
.diff-new {
  color: var(--green);
  font-weight: 600;
}
.diff-old {
  color: var(--t3);
  font-size: 11px;
}
.op-inline {
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}
.op-changed { display: inline; }
.op-same { display: inline; color: var(--t3); }
.op-old { color: var(--t3); font-weight: 500; }
.op-arrow { color: var(--t3); margin: 0 1px; }
.op-new { color: var(--green); font-weight: 600; }

:deep(.el-table .cell) {
  padding: 8px 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.el-table .row-diff) {
  background: var(--red-bg) !important;
}
</style>

<style>
.table-scroll {
  overflow-x: auto;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}
.tag-ok { background: var(--green-bg); color: var(--green); }
.tag-warn { background: var(--orange-bg); color: var(--orange); }
.tag-fail { background: var(--red-bg); color: var(--red); }
.tag-info { background: var(--bg3); color: var(--t3); }
.tag-new { background: var(--blue-l); color: var(--blue); }
.tag-del { background: var(--bg4); color: var(--t4); }
</style>
