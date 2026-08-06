<template>
  <div class="proto-panel" v-show="visible" :style="{ minWidth: tableMinWidth + 'px' }">
    <div class="proto-header" :class="{ 'no-click': simpleMode }" @click="toggleModule" v-if="(!simpleMode || deviceMode) && !hideHeader">
      <div class="proto-left">
        <Icon class="proto-arrow" :class="{ collapsed: !showTable }" v-if="!simpleMode || deviceMode" icon="mdi:chevron-down" />
        <span class="proto-name">{{ title }}</span>
        <span class="proto-desc">{{ desc }}</span>
        <span class="total-dot" :title="statTip">● {{ totalCount }}</span>
        <div class="proto-badges" v-if="!simpleMode && !deviceMode">
          <span class="badge green" v-if="totalConsistent">● {{ totalConsistent }}</span>
          <span class="badge red" v-if="totalDiff">● {{ totalDiff }}</span>
          <span class="badge new" v-if="totalNew">{{ newIcon }} {{ totalNew }}</span>
          <span class="badge del" v-if="totalDeleted">🗑 {{ totalDeleted }}</span>
        </div>
      </div>
      <div class="proto-right" @click.stop v-if="(!simpleMode && !externalFilterType) || deviceMode">
        <div class="filter-tabs" v-if="!simpleMode && !deviceMode">
          <span :class="{ active: filterType === 'all' }" @click="onFilter('all')">全部 {{ filteredList.length }}</span>
          <span :class="{ active: filterType === 'consistent' }" @click="onFilter('consistent')">一致 {{ totalConsistent }}</span>
          <span :class="{ active: filterType === 'diff' }" @click="onFilter('diff')">变更 {{ totalDiff }}</span>
          <span :class="{ active: filterType === 'new' }" @click="onFilter('new')">新增 {{ totalNew }}</span>
          <span :class="{ active: filterType === 'deleted' }" @click="onFilter('deleted')">已失效 {{ totalDeleted }}</span>
        </div>
        <div class="search-wrap" v-if="showTable">
          <el-input class="proto-search" v-model="localSearch" placeholder="搜索接口、IP、VRF..." size="small" clearable @clear="localSearch = ''"><template #prefix><Icon icon="mdi:magnify" /></template></el-input>
          <span v-if="isSearching" class="search-result">找到 {{ filteredList.length }} 条</span>
        </div>
        <button class="export-csv-btn export-primary" title="导出 Excel" @click="exportExcel" v-if="showTable">
          <svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor"><path d="M540.444444 678.874074h-65.422222V362.192593h-0.948148l-84.385185 95.762963h-0.948148v-0.948149c-13.688415-8.489719-23.391763-22.676859-36.02963-32.237037-4.144356-3.135526-10.396444-6.207526-12.325926-11.377777 3.897837-3.034074 6.46637-7.386074 9.481482-11.377778 8.79123-11.641363 20.416474-21.296356 29.392592-33.185185 4.144356-5.489778 11.02317-9.682489 15.170371-15.170371 16.164978-21.389274 35.991704-39.28557 52.148148-60.681481 13.358459-17.6896 31.032889-32.331852 44.562963-50.251852 4.790044-6.343111 12.245333-10.60883 16.118518-18.014815h1.896297c8.984652 13.718756 23.392711 24.014696 33.185185 36.977778 26.682785 35.323259 59.618607 65.165274 86.281481 100.503704 10.003911 13.258904 23.006815 24.434726 33.185185 37.925926 3.861807 5.12 10.891378 8.633837 13.274074 15.17037-6.532741 2.327704-10.075022 9.426489-15.17037 13.274074-8.594015 6.490074-16.054044 13.425778-24.651852 19.911111-4.148148 3.128889-4.93037 7.252385-11.377778 8.533333-3.244563-9.1648-14.357807-15.405511-19.911111-22.755555-12.821807-16.971852-27.961837-31.383704-40.77037-48.355556-6.191407-8.205274-15.8976-14.260148-20.859259-23.703703h-0.948148v44.562963c-2.479407 4.015407-0.948148 15.003496-0.948149 20.859259v251.259259zM216.177778 522.42963h65.422222v219.97037h452.266667V522.42963h65.422222v286.34074H216.177778V522.42963z" fill="currentColor"/></svg>
          导出 Excel
        </button>
      </div>
    </div>
    <!-- 简单模式工具栏：搜索 + 导出 -->
    <div class="simple-toolbar" v-if="simpleMode && !deviceMode">
      <div class="search-wrap">
        <el-input class="proto-search" v-model="localSearch" placeholder="搜索接口、IP、VRF..." :prefix-icon="Search" size="small" clearable @clear="localSearch = ''" />
        <span v-if="isSearching" class="search-result">找到 {{ filteredList.length }} 条</span>
      </div>
      <button class="export-csv-btn export-primary" title="导出 Excel" @click="exportExcel">
        <svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor"><path d="M540.444444 678.874074h-65.422222V362.192593h-0.948148l-84.385185 95.762963h-0.948148v-0.948149c-13.688415-8.489719-23.391763-22.676859-36.02963-32.237037-4.144356-3.135526-10.396444-6.207526-12.325926-11.377777 3.897837-3.034074 6.46637-7.386074 9.481482-11.377778 8.79123-11.641363 20.416474-21.296356 29.392592-33.185185 4.144356-5.489778 11.02317-9.682489 15.170371-15.170371 16.164978-21.389274 35.991704-39.28557 52.148148-60.681481 13.358459-17.6896 31.032889-32.331852 44.562963-50.251852 4.790044-6.343111 12.245333-10.60883 16.118518-18.014815h1.896297c8.984652 13.718756 23.392711 24.014696 33.185185 36.977778 26.682785 35.323259 59.618607 65.165274 86.281481 100.503704 10.003911 13.258904 23.006815 24.434726 33.185185 37.925926 3.861807 5.12 10.891378 8.633837 13.274074 15.17037-6.532741 2.327704-10.075022 9.426489-15.17037 13.274074-8.594015 6.490074-16.054044 13.425778-24.651852 19.911111-4.148148 3.128889-4.93037 7.252385-11.377778 8.533333-3.244563-9.1648-14.357807-15.405511-19.911111-22.755555-12.821807-16.971852-27.961837-31.383704-40.77037-48.355556-6.191407-8.205274-15.8976-14.260148-20.859259-23.703703h-0.948148v44.562963c-2.479407 4.015407-0.948148 15.003496-0.948149 20.859259v251.259259zM216.177778 522.42963h65.422222v219.97037h452.266667V522.42963h65.422222v286.34074H216.177778V522.42963z" fill="currentColor"/></svg>
        导出 Excel
      </button>
    </div>

    <div class="proto-body" v-show="showTable">
      <el-table :data="pagedList" border :row-class-name="rowClassName" :max-height="effectiveMaxHeight" @row-click="onRowClick">
          <!-- 前导列（渲染在 key 列之前，如「设备名」） -->
          <el-table-column v-for="col in leadColumns" :key="'lead-' + col.key" :prop="col.key" :min-width="col.minWidth || 80" align="left">
            <template #header>
              <span class="col-header">
                <span>{{ col.label }}</span>
                <el-tooltip v-if="col.tip" :content="col.tip" placement="top" effect="dark" raw-content>
                  <span class="col-tip-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <template #default="{ row }">
              <span>{{ formatVal(row[col.key]) }}</span>
            </template>
          </el-table-column>
          <!-- 主键列（按用户之前要求保持纯文本，不渲染差异；端口搬迁的旧端口可在行详情抽屉查看） -->
          <el-table-column :prop="keyField" :label="keyLabel" :width="keyWidth || 140" align="left" />
          <!-- 动态字段列 -->
          <el-table-column v-for="col in columns" :key="col.key" :prop="col.key" :min-width="col.minWidth || 80" align="left">
            <template #header>
              <span class="col-header">
                <span>{{ col.label }}</span>
                <el-tooltip v-if="col.tip" :content="col.tip" placement="top" effect="dark" raw-content>
                  <span class="col-tip-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <template #default="{ row }">
              <template v-if="getDiffInfo(row, col.key)">
                <div class="diff-cell">
                  <div class="diff-new" v-if="getDiffInfo(row, col.key).afterVal && getDiffInfo(row, col.key).afterVal !== '-'">{{ getDiffInfo(row, col.key).afterVal }} (新)</div>
                  <div class="diff-old" v-if="getDiffInfo(row, col.key).beforeVal && getDiffInfo(row, col.key).beforeVal !== '-'">{{ getDiffInfo(row, col.key).beforeVal }} (旧)</div>
                </div>
              </template>
              <template v-else>
                <el-tag v-if="stateField === col.key" :type="tagType(row[stateField])" size="small">{{ row[stateField] || '待采集' }}</el-tag>
                <el-tag v-else-if="col.key === 'protoStatus'" :type="tagType(row.protoStatus)" size="small">{{ row.protoStatus || '-' }}</el-tag>
                <el-tag v-else-if="col.key === 'trunkStatus'" :type="trunkStatusTagType(row.trunkStatus)" size="small">{{ row.trunkStatus || '-' }}</el-tag>
                <el-tag v-else-if="col.key === 'rxPower' || col.key === 'txPower'" :type="powerRangeTagType(row, col.key)" size="small">{{ row[col.key] || '-' }}</el-tag>
                <el-tag v-else-if="props.boolFields.includes(col.key)" :type="row[col.key] ? 'success' : 'info'" size="small">{{ row[col.key] ? '是' : '否' }}</el-tag>
                <span v-else-if="col.key === 'ebgpMaxHop'">{{ row[col.key] === '' || row[col.key] == null ? 'N/A' : row[col.key] }}</span>
                <span v-else>{{ formatVal(row[col.key]) }}</span>
              </template>
            </template>
          </el-table-column>
          <!-- 对比结果列 -->
          <el-table-column label="对比结果" :min-width="resultWidth" align="left" v-if="!simpleMode && !deviceMode">
            <template #default="{ row }">
              <el-tag v-if="row.isConsistent === null" type="info" size="small">待比对</el-tag>
              <el-tag v-else :type="row.isConsistent ? 'success' : 'danger'" size="small">
                <Icon v-if="row.isConsistent" icon="mdi:check" style="margin-right:4px" />
                <Icon v-else icon="mdi:close" style="margin-right:4px" />
                {{ row.isConsistent ? '一致' : '不一致' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      <div class="proto-pager" v-if="filteredList.length > pageSize">
        <el-pagination
          layout="total, sizes, prev, pager, next"
          :total="filteredList.length"
          :page-size="pageSize"
          :current-page="currentPage"
          :page-sizes="[20, 50, 100, 200]"
          @current-change="(p) => currentPage = p"
          @size-change="(s) => pageSize = s"
          small
          background
        />
      </div>
    </div>
  </div>

  <el-drawer v-model="drawerVisible" :title="drawerTitle" size="440px" direction="rtl" :append-to-body="true">
    <div v-if="activeRow" class="diff-drawer">
      <div class="drawer-overview">
        <span class="ov-key">{{ props.keyLabel }}：</span>
        <span class="ov-val">{{ formatVal(activeRow[props.keyField]) }}</span>
        <el-tag v-if="activeRow.state" :type="tagType(activeRow.state)" size="small" class="ov-tag">{{ activeRow.state }}</el-tag>
        <el-tag v-if="activeRow.isConsistent !== null && activeRow.isConsistent !== undefined" :type="activeRow.isConsistent ? 'success' : 'danger'" size="small" class="ov-tag">{{ activeRow.isConsistent ? '一致' : '不一致' }}</el-tag>
      </div>
      <div v-for="col in drawerFields" :key="col.key" class="diff-row">
        <div class="diff-label">{{ col.label }}</div>
        <template v-if="diffOf(col.key)">
          <div class="diff-before" v-if="diffOf(col.key).beforeVal && diffOf(col.key).beforeVal !== '-'">变更前：{{ diffOf(col.key).beforeVal }}</div>
          <div class="diff-after" v-if="diffOf(col.key).afterVal && diffOf(col.key).afterVal !== '-'">变更后：<span class="hl">{{ diffOf(col.key).afterVal }}</span></div>
        </template>
        <div v-else class="diff-same">{{ formatVal(activeRow[col.key]) }}</div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
// XLSX 改为导出时动态导入（见 exportExcel），避免这个重库进入首屏主包

const props = defineProps({
  title: { type: String, required: true },
  desc: { type: String, default: '' },
  list: { type: Array, required: true },
  getDiffInfo: { type: Function, required: true },
  keyField: { type: String, required: true },
  keyLabel: { type: String, required: true },
  keyWidth: { type: Number, default: 160 },
  columns: { type: Array, required: true },
  leadColumns: { type: Array, default: () => [] }, // 渲染在 key 列「之前」的前导列（如接口表的「设备名」）
  resultWidth: { type: Number, default: 100 },
  stateField: { type: String, default: 'sessionState' },
  newIcon: { type: String, default: '✨' },
  activeModule: { type: String, default: '' },
  moduleName: { type: String, required: true },
  filterFocus: { type: String, default: '' },
  boolFields: { type: Array, default: () => [] },
  simpleMode: { type: Boolean, default: false },
  deviceMode: { type: Boolean, default: false },
  externalSearch: { type: String, default: '' },
  externalFilterType: { type: String, default: '' },
  hideHeader: { type: Boolean, default: false },
  stat: { type: Object, default: null }, // { total, vpnv4, vpnv6, dualStack } 设备模式总计数明细
  exportName: { type: String, default: '' }, // 导入文件名（去扩展名）；导出时与面板标题组合为「文件名_标题」，为空则仅用标题
  tableMaxHeight: { type: Number, default: null } // 表格最大高度（超出滚动，固定表头）；null/0 表示按视口自适应
})

const emit = defineEmits(['update:activeModule', 'focusFilter', 'rowClick'])

const localSearch = ref('')
const filterType = ref('all')
const showTable = ref(false)

// 动态表格高度：未显式指定 tableMaxHeight 时，按视口剩余空间自适应，避免大屏下表格下方出现大片空白
const viewportH = ref(typeof window !== 'undefined' ? window.innerHeight : 900)
const onResize = () => { viewportH.value = window.innerHeight }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
const effectiveMaxHeight = computed(() => {
  if (props.tableMaxHeight && props.tableMaxHeight > 0) return props.tableMaxHeight
  // 预留：顶部 Header ~56、.bd padding ~64、面板头 ~50、proto-body padding ~24、分页 ~44、安全边距 ~20
  return Math.max(320, viewportH.value - 220)
})

// simpleMode 下默认展开
if (props.simpleMode && !props.deviceMode) showTable.value = true

// ---- 表格最小宽度（所有列宽之和，强制横向溢出） ----
const tableMinWidth = computed(() => {
  const keyW = props.keyWidth || 140
  const leadW = (props.leadColumns || []).reduce((sum, col) => sum + (col.minWidth || 80), 0)
  const colsW = props.columns.reduce((sum, col) => sum + (col.minWidth || 80), 0)
  // 设备模式/简单模式不显示"对比结果"列，不计入宽度
  const showResultCol = !props.simpleMode && !props.deviceMode
  const resultW = showResultCol ? (props.resultWidth || 100) : 0
  return keyW + leadW + colsW + resultW
})

// ---- 可见性 ----
const visible = computed(() => {
  if (!props.filterFocus) return true
  return props.filterFocus === props.moduleName
})

// ---- 统计 ----
// 全量邻居总数（不受筛选影响，始终显示标题旁提示）
const totalCount = computed(() => props.list.length)
// 设备模式：总计数 tooltip 明细（按 stat 结构区分 BGP / OSPF 口径）
const statTip = computed(() => {
  const s = props.stat
  if (!s) return '总数'
  // OSPF 口径：{ total, v2, v3 }
  if (s.v2 != null || s.v3 != null) {
    const parts = [`OSPF 邻接总数：${s.total}`]
    if (s.v2 != null) parts.push(`OSPFv2 邻接：${s.v2}`)
    if (s.v3 != null) parts.push(`OSPFv3 邻接：${s.v3}`)
    return parts.join('\n')
  }
  // BGP 口径：{ total, vpnv4, vpnv6, dualStack }
  const parts = [`邻居总数（按 IP 去重）：${s.total}`]
  if (s.vpnv4 != null) parts.push(`vpnv4 会话：${s.vpnv4}`)
  if (s.vpnv6 != null) parts.push(`vpnv6 会话：${s.vpnv6}`)
  if (s.dualStack != null && s.dualStack > 0) parts.push(`含 ${s.dualStack} 个双栈邻居（同一 IP 同时建 vpnv4+vpnv6，仅算 1 个）`)
  parts.push('注：vpnv4+vpnv6 会话数之和减去去重邻居数 = 双栈数')
  return parts.join('\n')
})
const totalConsistent = computed(() => props.list.filter(i => i.isConsistent === true).length)
const totalDiff = computed(() => props.list.filter(i => i.isConsistent === false && !(i[props.stateField] || '').match(/已失效|已删除|新增/)).length)
const totalNew = computed(() => props.list.filter(i => (i[props.stateField] || '').includes('新增')).length)
const totalDeleted = computed(() => props.list.filter(i => (i[props.stateField] || '').match(/已失效|已删除/)).length)

// ---- 搜索 ----
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

// ---- 过滤 ----
const effectiveFilterType = computed(() => props.externalFilterType || filterType.value)

const filteredList = computed(() => {
  let list = props.list
  if (props.externalSearch) {
    const kw = props.externalSearch.toLowerCase()
    list = list.filter(item => matchSearch(item, kw))
  }
  if (localSearch.value) {
    const kw = localSearch.value.toLowerCase()
    list = list.filter(item => matchSearch(item, kw))
  }
  const f = effectiveFilterType.value
  if (f === 'consistent') return list.filter(i => i.isConsistent === true)
  if (f === 'diff') return list.filter(i => i.isConsistent === false && !(i[props.stateField] || '').match(/已失效|已删除|新增/))
  if (f === 'new') return list.filter(i => (i[props.stateField] || '').includes('新增'))
  if (f === 'deleted') return list.filter(i => (i[props.stateField] || '').match(/已失效|已删除/))
  return list
})

// ---- 分页（大数据量时只渲染当前页，减少 DOM 节点，提升滚动/交互性能） ----
const currentPage = ref(1)
const pageSize = ref(50)
const pagedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})
// 筛选 / 搜索条件变化后回到第一页
watch(filteredList, () => { currentPage.value = 1 })

// ---- 搜索自动展开 ----
watch(isSearching, (val) => {
  if (val) showTable.value = true
})

// ---- 折叠/展开 ----
watch(() => props.activeModule, (val) => {
  showTable.value = (val === props.moduleName)
}, { immediate: true })

// ---- 筛选点击 ----
const onFilter = (type) => {
  filterType.value = type
  showTable.value = true
  emit('update:activeModule', props.moduleName)
  if (type === 'all') {
    emit('focusFilter', '')
  } else {
    emit('focusFilter', props.moduleName)
  }
}

// ---- 手动折叠/展开 ----
const toggleModule = () => {
  if (props.activeModule === props.moduleName) {
    emit('update:activeModule', '')
    emit('focusFilter', '')
  } else {
    emit('update:activeModule', props.moduleName)
    emit('focusFilter', props.moduleName)
  }
}

// ---- Tag ----
const tagType = (val) => {
  if (!val) return 'info'
  const raw = val.trim()
  // 逗号分隔的多状态（如聚合口物理口状态 "up,up"）：全部正常→绿，任一 down→红，其余→黄
  if (raw.includes(',')) {
    const parts = raw.split(',').map(s => s.trim().toLowerCase())
    if (parts.length && parts.every(s => ['up', 'up(s)', 'operational', 'established', '正常'].includes(s))) return 'success'
    if (parts.some(s => ['down', '*down', 'administratively down'].includes(s))) return 'danger'
    return 'warning'
  }
  const v = raw.split(/\s+/)[0].toLowerCase()
  // LLDP 等状态：正常=绿；变更/新增邻居=黄；已失效=红(默认)
  if (v === '正常') return 'success'
  if (v === '变更' || v === '新增邻居' || v === '新增协议') return 'warning'
  // OSPF 邻接状态：Full=完全邻接(绿)；2-Way=广播网 DROther 终态(黄)；其余均为异常(红)
  if (['full', '2-way', '2way', 'init', 'down', 'attempt', 'exstart', 'exchange', 'loading'].includes(v)) {
    if (v === 'full') return 'success'
    if (v === '2-way' || v === '2way') return 'warning'
    return 'danger'
  }
  if (v === 'established' || v === 'up' || v === 'operational') return 'success'
  if (v === 'idle' || v === 'down') return 'warning'
  if (['active', 'connect', 'opensent', 'openconfirm'].includes(v)) return 'warning'
  // ARP 类型：S=静态(绿) / I=接口ARP(黄) / D*/动态(中性)
  if (['s', 'static'].includes(v)) return 'success'
  if (['i', 'interface'].includes(v)) return 'warning'
  if (v === 'd' || v === 'dynamic' || v.startsWith('d-')) return 'info'
  // IPv6 邻居状态：REACH=可达(绿)；STALE/DELAY/PROBE/INCOMPLETE=正常老化过程(黄)；其余异常(红)
  if (['reach', 'reachable'].includes(v)) return 'success'
  if (['stale', 'delay', 'probe', 'incomplete', 'incmp'].includes(v)) return 'warning'
  return 'danger'
}

// 聚合口状态着色：up→绿(success)，down/*down→红(danger)，其余→灰(info)
const trunkStatusTagType = (val) => {
  const v = val ? val.trim().toLowerCase() : ''
  if (v === 'up' || v === 'up(s)') return 'success'
  if (v === 'down' || v === '*down') return 'danger'
  return 'info'
}

// 收光值/发光值着色：全部在告警范围内→绿(success)，任一超范围→红(danger)，无数据/无范围→灰(info)
const powerRangeTagType = (row, key) => {
  const ok = key === 'rxPower' ? row.rxPowerOk : row.txPowerOk
  if (ok === true) return 'success'
  if (ok === false) return 'danger'
  return 'info'
}

const formatVal = (val) => {
  if (Array.isArray(val)) return val.join(', ')
  return val ?? '-'
}

const rowClassName = ({ row }) => {
  return row.isConsistent === false ? 'row-diff' : ''
}

// 行点击：向上抛出「模块名 + 该行数据」，供父级（在线设备页）钻取查看详情；同时打开本地面板内详情抽屉
const onRowClick = (row) => {
  activeRow.value = row
  drawerVisible.value = true
  emit('rowClick', { module: props.moduleName, row })
}

// ---- 行详情抽屉（点击行弹出，一次性列出该条目所有字段的前/后对比） ----
const drawerVisible = ref(false)
const activeRow = ref(null)
const drawerFields = computed(() => [
  ...(props.leadColumns || []).map(c => ({ key: c.key, label: c.label })),
  { key: props.keyField, label: props.keyLabel },
  ...props.columns
])
const drawerTitle = computed(() => `${props.title} · 条目详情`)
const diffOf = (key) => {
  if (!activeRow.value || !props.getDiffInfo) return null
  try { return props.getDiffInfo(activeRow.value, key) || null } catch (e) { return null }
}

// ---- 导出文件名（导入文件名 + 面板标题；无导入文件时回退标题） ----
const exportBaseName = () => {
  const file = (props.exportName || '').trim()
  const title = (props.title || 'export').trim()
  const raw = file ? `${file}_${title}` : title
  return raw.replace(/\.[^./\\]+$/, '') // 去掉可能的扩展名，后面统一加 .xlsx/.csv
}

// 导出单元格取值：与屏幕渲染完全一致
// - 主键列（接口）：屏幕直接渲染 row[keyField]（"before vs after" 标签），导出同此
// - 其它列：有差异则显示「新值 (新) / 旧值 (旧)」（与屏幕 diff-cell 一致），否则显示 formatVal(row[key])
const screenCellVal = (row, key) => {
  if (key === props.keyField) return row[key] ?? '-'
  const diff = props.getDiffInfo ? props.getDiffInfo(row, key) : null
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

// ---- 导出 CSV ----
const exportCSV = () => {
  // 所有列 + 额外补上描述列（前导列排在 key 列之前）
  const allCols = [
    ...(props.leadColumns || []).map(c => ({ key: c.key, label: c.label })),
    { key: props.keyField, label: props.keyLabel },
    ...props.columns,
    { key: 'description', label: '描述' },
    { key: 'isConsistent', label: '对比结果' }
  ]
  const headers = allCols.map(c => c.label)
  const escape = (v) => {
    if (v == null || v === '-') return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = filteredList.value.map(row => {
    const vals = allCols.map(c => {
      if (c.key === 'isConsistent') return row.isConsistent === true ? '一致' : row.isConsistent === false ? '不一致' : '待比对'
      if (props.boolFields.includes(c.key)) return row[c.key] ? '是' : '否'
      return escape(screenCellVal(row, c.key))
    })
    return vals.join(',')
  })
  const csv = `﻿${[headers.join(','), ...rows].join('\n')}`

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${exportBaseName()}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}

// 生成带样式的 Excel 工作表（表头蓝底加粗、差异行红/绿底），供「导出 Excel」与「一键导出全部」复用
const safeSheetName = (name) => {
  let s = (name || 'Sheet').replace(/[\\/:*?"<>|]/g, '_').trim()
  if (s.length > 31) s = s.slice(0, 31)
  return s || 'Sheet'
}

const buildStyledSheet = async () => {
  const XLSX = (await import('xlsx-js-style')).default
  const allCols = [
    ...(props.leadColumns || []).map(c => ({ key: c.key, label: c.label })),
    { key: props.keyField, label: props.keyLabel },
    ...props.columns,
    { key: 'description', label: '描述' },
    { key: 'isConsistent', label: '对比结果' }
  ]
  const aoa = [allCols.map(c => c.label)]
  filteredList.value.forEach(row => {
    const vals = allCols.map(c => {
      if (c.key === 'isConsistent') return row.isConsistent === true ? '一致' : row.isConsistent === false ? '不一致' : '待比对'
      if (props.boolFields.includes(c.key)) return row[c.key] ? '是' : '否'
      const v = screenCellVal(row, c.key)
      if (Array.isArray(v)) return v.join(', ')
      return v == null ? '-' : v
    })
    aoa.push(vals)
  })

  const headerFill = { rgb: '4472C4' }
  const headerFont = { name: 'Microsoft YaHei', sz: 11, bold: true, color: { rgb: 'FFFFFF' } }
  const delFill = { rgb: 'FCEBEB' }
  const okFill = { rgb: 'EAF3DE' }
  const cellBorder = {
    top: { style: 'thin', color: { rgb: '808080' } },
    bottom: { style: 'thin', color: { rgb: '808080' } },
    left: { style: 'thin', color: { rgb: '808080' } },
    right: { style: 'thin', color: { rgb: '808080' } }
  }
  const baseFont = { name: 'Microsoft YaHei', sz: 10, color: { rgb: '000000' } }
  const upColor = { rgb: '00AA00' }
  const downColor = { rgb: 'FF0000' }
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

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // 表头：深蓝底白字加粗居中（参考样式）
  for (let c = 0; c < allCols.length; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = { fill: { patternType: 'solid', fgColor: headerFill }, font: headerFont, alignment: { horizontal: 'center', vertical: 'center' }, border: cellBorder }
  }
  // 数据行：不一致红底 / 一致绿底；up 绿字 / down 红字；含换行单元格启用自动换行
  for (let r = 1; r < aoa.length; r++) {
    const row = filteredList.value[r - 1]
    let fill = null
    if (row.isConsistent === false) fill = delFill
    else if (row.isConsistent === true) fill = okFill
    for (let c = 0; c < allCols.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell) continue
      const font = { ...baseFont }
      if (isUpVal(cell.v)) font.color = upColor
      else if (isDownVal(cell.v)) font.color = downColor
      const style = { font, alignment: { horizontal: 'left', vertical: 'center' }, border: cellBorder }
      if (fill) style.fill = { patternType: 'solid', fgColor: fill }
      if (typeof cell.v === 'string' && cell.v.includes('\n')) {
        style.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }
      }
      cell.s = style
    }
  }
  // 列宽：光功率列加宽以容纳多路值，描述列加宽
  ws['!cols'] = allCols.map(c => ({ wch: c.key === 'opticalPower' ? 48 : c.key === 'description' ? 60 : 16 }))
  // 行高：表头 16.5、数据 14.5（参考样式）
  ws['!rows'] = [{ hpt: 16.5 }, ...aoa.slice(1).map(() => ({ hpt: 14.5 }))]
  return { ws, name: safeSheetName(props.title) }
}

// ---- 导出 Excel（默认格式，xlsx-js-style 支持单元格填充色） ----
const exportExcel = async () => {
  const { ws, name } = await buildStyledSheet()
  const XLSX = (await import('xlsx-js-style')).default
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, name)
  XLSX.writeFile(wb, `${exportBaseName()}.xlsx`, { bookType: 'xlsx', cellStyles: true })
  ElMessage.success('已导出 Excel 文件（差异行已标注颜色）')
}

// 供「一键导出全部」调用：返回单个已排版工作表（无数据时返回 null，由父级跳过）
const buildExportSheet = async () => {
  if (!filteredList.value.length) return null
  const { ws, name } = await buildStyledSheet()
  return { name, ws }
}

defineExpose({ exportCSV, exportExcel, filteredList, buildExportSheet })
</script>

<style scoped>
@import '../styles/proto-panel.css';

.export-csv-btn {
  display:inline-flex; align-items:center; gap:4px;
  font-size:11px; padding:3px 8px;
  border:1px solid var(--border); border-radius:4px;
  background:var(--bg2); color:var(--t2);
  cursor:pointer; white-space:nowrap; transition:all .15s;
}
.export-csv-btn:hover {
  background:var(--bg3); color:var(--blue); border-color:var(--blue-b);
}
/* 导出按钮（默认 Excel） */
.export-primary {
  background:var(--blue);
  color:#fff;
  border-color:var(--blue);
}
.export-primary:hover {
  background:var(--blue-d, #1d4ed8);
  color:#fff;
  border-color:var(--blue-d, #1d4ed8);
}
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

/* 表格底部分页条 */
.proto-pager {
  padding: 8px 14px;
  display: flex;
  justify-content: flex-end;
  background: var(--bg2);
  border-top: 1px solid var(--border);
}

/* 简单模式工具栏 */
.simple-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
}
.simple-toolbar .search-wrap {
  flex: 1;
}

/* 标题栏右侧搜索+导出推到最右边（设备模式和对比模式通用） */
.proto-header .proto-right {
  margin-left: auto;
}
.proto-header .proto-search {
  width: 220px;
}

/* 有差异的行标红背景 */
:deep(.el-table .row-diff) {
  background-color: rgba(239, 68, 68, 0.045) !important;
}
:deep(.el-table .row-diff:hover > td) {
  background-color: rgba(239, 68, 68, 0.07) !important;
}
:deep(.el-table--striped .el-table__body tr.row-diff.el-table__row--striped td) {
  background-color: rgba(239, 68, 68, 0.045) !important;
}

/* 列头带问号图标的解释提示 */
.col-header {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.col-tip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 3px;
  border-radius: 50%;
  background: var(--el-color-info-light-3, #c0c4cc);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  cursor: help;
}

</style>

<style>
/* 让 el-table 允许横向溢出 */
.proto-panel .el-table {
  max-width: none !important;
}

.proto-panel .el-table__body-wrapper {
  overflow-x: auto !important;
  overflow-y: auto !important;
}

/* 原生滚动条样式 - 只针对 body-wrapper */
.proto-panel .el-table .el-table__body-wrapper::-webkit-scrollbar {
  width: 6px !important;
  height: 6px !important;
}

.proto-panel .el-table .el-table__body-wrapper::-webkit-scrollbar-track {
  background: var(--bg3, #f1f1f1);
  border-radius: 3px;
}

.proto-panel .el-table .el-table__body-wrapper::-webkit-scrollbar-thumb {
  background: #b0b0b0;
  border-radius: 3px;
}

.proto-panel .el-table .el-table__body-wrapper::-webkit-scrollbar-thumb:hover {
  background: #888;
}

.proto-panel .el-table .el-table__body-wrapper::-webkit-scrollbar-corner {
  background: var(--bg3, #f1f1f1);
}

/* el-scrollbar 组件样式覆盖 */
.proto-panel .el-scrollbar .el-scrollbar__bar.is-vertical {
  width: 6px !important;
}

.proto-panel .el-scrollbar .el-scrollbar__bar.is-horizontal {
  height: 6px !important;
}

.proto-panel .el-scrollbar .el-scrollbar__thumb {
  background-color: #b0b0b0 !important;
  border-radius: 3px;
}

.proto-panel .el-scrollbar .el-scrollbar__thumb:hover {
  background-color: #888 !important;
}

.proto-panel .el-scrollbar .el-scrollbar__track {
  background-color: var(--bg3, #f1f1f1) !important;
  border-radius: 3px;
}

/* 行详情抽屉（el-drawer 使用 append-to-body，内容在 body 下，故需非 scoped 全局样式） */
.diff-drawer { font-size: 13px; color: var(--text, #303133); }
.diff-drawer .drawer-overview {
  display: flex; align-items: center; flex-wrap: wrap;
  padding: 10px 12px; margin-bottom: 14px;
  background: var(--bg3, #f5f7fa); border-radius: 6px;
}
.diff-drawer .ov-key { color: #909399; }
.diff-drawer .ov-val { font-weight: 600; margin-right: 8px; word-break: break-all; }
.diff-drawer .ov-tag { margin-left: 8px; }
.diff-drawer .diff-row {
  padding: 10px 12px; border-bottom: 1px solid var(--border, #ebeef5);
}
.diff-drawer .diff-label { font-weight: 600; color: #606266; margin-bottom: 6px; }
.diff-drawer .diff-before,
.diff-drawer .diff-after {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px; line-height: 1.6; word-break: break-all;
}
.diff-drawer .diff-before { color: #909399; }
.diff-drawer .diff-after { color: #303133; margin-top: 2px; }
.diff-drawer .diff-after .hl {
  color: #f56c6c; font-weight: 700; background: #fef0f0;
  padding: 0 4px; border-radius: 3px;
}
.diff-drawer .diff-same {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px; color: #303133; word-break: break-all;
}
</style>