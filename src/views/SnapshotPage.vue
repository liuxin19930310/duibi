<template>
  <div class="sp-page">
    <div class="sp-head">
      <h1 class="sp-title">配置快照</h1>
      <p class="sp-sub">把当前导入的配置按时间点保存，可对任意两个版本做逐行对比、查看变更时间线（借鉴 Oxidized 的版本化思路，数据存在本机浏览器）。</p>
    </div>

    <!-- 保存当前导入为快照 -->
    <div class="sp-save card">
      <div class="sp-save-row">
        <div class="sp-field">
          <label>快照名称</label>
          <el-input v-model="name" size="default" placeholder="留空则按类型+时间自动命名" style="width:220px" />
        </div>
        <div class="sp-field">
          <label>设备 / 厂商</label>
          <el-input v-model="device" size="default" placeholder="如 核心交换机 / 华为" style="width:200px" />
        </div>
        <div class="sp-save-acts">
          <el-button :disabled="!diffStore.before" @click="saveBefore">存为快照（变更前）</el-button>
          <el-button :disabled="!diffStore.after" @click="saveAfter">存为快照（变更后）</el-button>
          <el-button type="primary" :disabled="!diffStore.before && !diffStore.after" @click="saveBoth">存本次割接（前后各一份）</el-button>
        </div>
      </div>
      <div class="sp-save-state">
        当前导入：
        <span class="sp-tag b">变更前 {{ diffStore.before ? diffStore.before.split('\n').length + ' 行' : '（空）' }}</span>
        <span class="sp-tag a">变更后 {{ diffStore.after ? diffStore.after.split('\n').length + ' 行' : '（空）' }}</span>
        <span v-if="!diffStore.before && !diffStore.after" class="sp-hint">请先在首页 / 侧栏「导入配置」拖入配置文件，或从采集弹窗导入。</span>
      </div>
    </div>

    <!-- 快照列表 -->
    <div class="sp-list card">
      <div class="sp-list-bar">
        <div class="sp-list-title">已保存快照（{{ snapshots.length }}）</div>
        <div class="sp-list-acts">
          <el-button size="small" :disabled="selectedIds.length !== 2" type="primary" @click="compareTwo">对比所选（{{ selectedIds.length }}/2）</el-button>
          <el-button size="small" :disabled="!selectedIds.length" @click="removeSelected">删除所选</el-button>
          <el-button size="small" :disabled="!snapshots.length" @click="clearAll">清空全部</el-button>
        </div>
      </div>

      <div v-if="!snapshots.length" class="sp-empty">暂无快照。导入配置后点上方按钮即可保存第一个版本。</div>

      <el-table
        v-else
        ref="tableRef"
        :data="rows"
        border
        size="small"
        row-key="id"
        class="sp-table"
        :row-class-name="snapshotRowClass"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="42" />
        <el-table-column label="名称" min-width="180" show-overflow-tooltip>
          <template #default="{ row }"><span class="sp-name">{{ row.name }}</span></template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }"><span class="sp-role" :class="row.role">{{ roleLabel(row.role) }}</span></template>
        </el-table-column>
        <el-table-column label="设备 / 厂商" min-width="140">
          <template #default="{ row }"><span class="sp-dev">{{ row.device || '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="lines" label="行数" width="70" align="right" />
        <el-table-column prop="timeLabel" label="保存时间" width="170" />
        <el-table-column label="对比上一版" width="130">
          <template #default="{ row, $index }">
            <span v-if="$index === 0" class="sp-same">首个版本</span>
            <span v-else :class="row.hash === rows[$index - 1].hash ? 'sp-same' : 'sp-diff'">
              {{ row.hash === rows[$index - 1].hash ? '无变化' : (row.lines - rows[$index - 1].lines >= 0 ? '+' : '') + (row.lines - rows[$index - 1].lines) + ' 行' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row, $index }">
            <span class="sp-link" :class="{ dis: $index === 0 }" @click="$index === 0 ? null : compareWithPrev(row, rows[$index - 1])">与上一版</span>
            <span class="sp-link danger" @click="removeOne(row.id)">删除</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'SnapshotPage' })

import { ref, computed, nextTick } from 'vue'
import { diffStore, hasDiffPair } from '../utils/diffStore.js'
import { listSnapshots, saveSnapshot, removeSnapshot, clearSnapshots } from '../utils/snapshots.js'

const emit = defineEmits(['goto'])

const name = ref('')
const device = ref('')
const selectedIds = ref([])

const snapshots = computed(() => listSnapshots())
const rows = computed(() => snapshots.value)

function roleLabel (r) {
  return r === 'before' ? '变更前' : r === 'after' ? '变更后' : '手动'
}

const tableRef = ref(null)

// el-table 选择变化：最多保留两份快照（超出时保留表格中靠后的两份）
function onSelectionChange (rows) {
  if (rows.length > 2) {
    const keep = rows.slice(-2).map(r => r.id)
    selectedIds.value = keep
    nextTick(() => {
      rows.forEach(r => {
        if (!keep.includes(r.id)) tableRef.value?.toggleRowSelection(r, false)
      })
    })
  } else {
    selectedIds.value = rows.map(r => r.id)
  }
}

function snapshotRowClass ({ row }) {
  return selectedIds.value.includes(row.id) ? 'selected-row' : ''
}

async function saveBefore () {
  try {
    await saveSnapshot({ name: name.value || '', role: 'before', device: device.value, text: diffStore.before })
    ElMessage.success('已保存「变更前」快照')
    name.value = ''
  } catch (e) { ElMessage.error(e.message || '保存失败') }
}
async function saveAfter () {
  try {
    await saveSnapshot({ name: name.value || '', role: 'after', device: device.value, text: diffStore.after })
    ElMessage.success('已保存「变更后」快照')
    name.value = ''
  } catch (e) { ElMessage.error(e.message || '保存失败') }
}
async function saveBoth () {
  try {
    if (diffStore.before) await saveSnapshot({ name: name.value || '', role: 'before', device: device.value, text: diffStore.before })
    if (diffStore.after) await saveSnapshot({ name: name.value || '', role: 'after', device: device.value, text: diffStore.after })
    ElMessage.success('已保存本次割接的变更前 / 变更后两份快照')
    name.value = ''
  } catch (e) { ElMessage.error(e.message || '保存失败') }
}

async function removeOne (id) {
  await removeSnapshot(id)
  selectedIds.value = selectedIds.value.filter(x => x !== id)
  ElMessage.success('已删除快照')
}
async function removeSelected () {
  for (const id of selectedIds.value) await removeSnapshot(id)
  selectedIds.value = []
  ElMessage.success('已删除所选快照')
}
function clearAll () {
  ElMessageBox.confirm('确定清空全部快照？此操作不可恢复。', '清空确认', { type: 'warning' })
    .then(async () => { await clearSnapshots(); selectedIds.value = []; ElMessage.success('已清空全部快照') })
    .catch(() => {})
}

// 选两份 → 按时间先后设为变更前/后，跳转文本逐行对比
function compareTwo () {
  if (selectedIds.value.length !== 2) { ElMessage.warning('请先勾选两份快照'); return }
  const sel = snapshots.value.filter(s => selectedIds.value.includes(s.id))
  sel.sort((a, b) => a.createdAt - b.createdAt)
  diffStore.before = sel[0].text
  diffStore.after = sel[1].text
  diffStore.beforeName = sel[0].name
  diffStore.afterName = sel[1].name
  emit('goto', 'text-diff')
}
function compareWithPrev (cur, prev) {
  diffStore.before = prev.text
  diffStore.after = cur.text
  diffStore.beforeName = prev.name
  diffStore.afterName = cur.name
  emit('goto', 'text-diff')
}
</script>

<style scoped>
.sp-page { max-width: 1080px }
.sp-head { margin-bottom: 14px }
.sp-title { font-size: 18px; font-weight: 600; color: var(--t1); margin: 0 0 4px }
.sp-sub { font-size: 12px; color: var(--t3); margin: 0 }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px }
.sp-save-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px }
.sp-field { display: flex; flex-direction: column; gap: 5px }
.sp-field label { font-size: 12px; color: var(--t3) }
.sp-save-acts { display: flex; gap: 8px; margin-left: auto }
.sp-save-state { margin-top: 12px; font-size: 12px; color: var(--t2); display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.sp-tag { padding: 2px 8px; border-radius: 6px; font-size: 12px }
.sp-tag.b { background: var(--blue-l); color: var(--blue) }
.sp-tag.a { background: #EAF3DE; color: #3B6D11 }
.sp-hint { color: var(--t3) }

.sp-list-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px }
.sp-list-title { font-size: 14px; font-weight: 600; color: var(--t1) }
.sp-empty { padding: 36px; text-align: center; color: var(--t3); font-size: 13px }
.sp-table { width: 100%; font-size: 13px; color: var(--t1) }
.sp-table .selected-row td.el-table__cell { background: var(--blue-l) }
.sp-name { font-weight: 500 }
.sp-dev { color: var(--t2) }
.sp-time { color: var(--t3); font-size: 12px; white-space: nowrap }
.sp-role { padding: 2px 8px; border-radius: 6px; font-size: 12px }
.sp-role.before { background: var(--blue-l); color: var(--blue) }
.sp-role.after { background: #EAF3DE; color: #3B6D11 }
.sp-role.manual { background: var(--bg3); color: var(--t2) }
.sp-same { color: var(--t3) }
.sp-diff { color: #B5530D; font-weight: 500 }
.sp-link { color: var(--blue); cursor: pointer }
.sp-link:hover { text-decoration: underline }
.sp-link.danger { color: #C0392B }
.sp-link.dis { color: var(--t4); cursor: not-allowed; pointer-events: none }
</style>
