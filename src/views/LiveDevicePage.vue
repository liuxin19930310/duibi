<template>
  <div class="live-page">
    <!-- 控制栏 -->
    <div class="live-bar">
      <div class="live-bar-l">
        <el-select v-model="devId" placeholder="选择设备" size="default" style="width: 260px" :disabled="syncing">
          <el-option v-for="d in settings.deviceConnections" :key="d.id" :label="`${d.name}（${d.host}）`" :value="d.id" />
        </el-select>
        <el-button v-if="!syncing" type="primary" @click="start" :disabled="!devId">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          开始实时同步
        </el-button>
        <el-button v-else type="danger" @click="stop">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12"/></svg>
          停止同步
        </el-button>
        <el-select v-model="interval" size="default" style="width: 130px" @change="onIntervalChange">
          <el-option label="每 5 秒" :value="5000" />
          <el-option label="每 10 秒" :value="10000" />
          <el-option label="每 30 秒" :value="30000" />
        </el-select>
      </div>
      <div class="live-bar-r">
        <el-button :disabled="!liveText" @click="setBefore">存为割接前</el-button>
        <el-button type="success" :disabled="!liveText || comparing" @click="setAfterAndCompare">
          <svg v-if="!comparing" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          设为割接后并比对
        </el-button>
      </div>
    </div>

    <!-- 连接状态条 -->
    <div class="live-status" v-if="syncing">
      <span class="dot live"></span>
      <span>已连接：<b>{{ selectedDev?.name }}</b>（{{ selectedDev?.host }}）· 上次同步 {{ lastSyncText }} · 每 {{ interval / 1000 }} 秒刷新</span>
    </div>
    <div class="live-status err" v-else-if="error">
      <span class="dot bad"></span><span>{{ error }}</span>
    </div>

    <!-- 空状态 -->
    <div class="live-empty" v-if="!liveText">
      <div class="live-empty-icon"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5v14"/><circle cx="12" cy="12" r="9"/></svg></div>
      <div class="live-empty-title">尚未连接设备</div>
      <div class="live-empty-desc">选择设备后点击「开始实时同步」，系统将经 SSH 周期性拉取状态并实时刷新下方表格。</div>
    </div>

    <!-- 实时表格（deviceMode：仅展示当前状态，无前后对比列） -->
    <div class="live-grid" v-else>
      <ProtoPanel title="BGP 协议" desc="邻居会话状态" :list="bgpRows" :getDiffInfo="noDiff" deviceMode moduleName="bgp"
        keyField="neighborIp" keyLabel="邻居 IP" :keyWidth="180" stateField="sessionState" :resultWidth="100"
        :columns="bgpCols" @row-click="onRowClick" />
      <ProtoPanel title="ISIS 协议" desc="邻居邻接状态" :list="isisRows" :getDiffInfo="noDiff" deviceMode moduleName="isis"
        keyField="peerSystemId" keyLabel="邻居 ID" :keyWidth="240" stateField="state" :resultWidth="100"
        :columns="isisCols" @row-click="onRowClick" />
      <ProtoPanel title="接口信息" desc="接口状态" :list="ifaceRows" :getDiffInfo="noDiff" deviceMode moduleName="interface"
        keyField="interfaceName" keyLabel="接口" :keyWidth="290" stateField="portStatus" :resultWidth="120"
        :columns="ifaceCols" @row-click="onRowClick" />
      <ProtoPanel title="SRv6 TE Policy" desc="SRv6 隧道策略状态" :list="srv6Rows" :getDiffInfo="noDiff" deviceMode moduleName="srv6TePolicy"
        keyField="policyName" keyLabel="策略名称" :keyWidth="240" stateField="policyState" :resultWidth="130"
        :columns="srv6Cols" @row-click="onRowClick" />
      <ProtoPanel title="IPV4路由表" desc="IPV4路由表对比" :list="routingRows" :getDiffInfo="noDiff" deviceMode moduleName="routingStat"
        keyField="proto" keyLabel="协议类别" :keyWidth="200" stateField="proto" :resultWidth="100"
        :columns="routingCols" @row-click="onRowClick" />
    </div>

    <!-- 行详情抽屉：点表格任意一行查看该条目全部字段 + 对应协议原始回显 -->
    <el-drawer v-model="detailVisible" :title="detailTitle" direction="rtl" size="44%" :destroy-on-close="true">
      <div class="detail-wrap" v-if="detailRow">
        <div class="detail-sec">
          <div class="detail-sec-h">字段详情</div>
          <div class="detail-fields">
            <div class="detail-field" v-for="f in detailFields" :key="f.key">
              <div class="df-k">{{ f.label }}</div>
              <div class="df-v">
                <el-tag v-if="f.key === detailStateField" :type="tagType(detailRow[f.key])" size="small">{{ detailRow[f.key] || '待采集' }}</el-tag>
                <span v-else>{{ formatVal(detailRow[f.key]) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="detail-sec">
          <div class="detail-sec-h">
            <span>原始命令行回显</span>
            <code class="detail-raw-cmd">{{ detailRawCmd }}</code>
            <el-button size="small" type="primary" plain class="detail-copy" @click="copyRaw">复制</el-button>
          </div>
          <pre class="detail-raw">{{ detailRawBlock || '（暂无原始回显）' }}</pre>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
defineOptions({ name: 'LiveDevicePage' })

import { ref, computed, watch, onUnmounted } from 'vue'
import ProtoPanel from '../components/ProtoPanel.vue'
import { settings } from '../utils/settings.js'
import { connectDevice, disconnectDevice } from '../utils/api.js'
import { runCompare } from '../utils/compare.js'
import { runLiveParseInWorker } from '../utils/parseWorker.js'

const emit = defineEmits(['goto'])

// —— 列定义（与配置对比页一致，字段名对应解析器输出）——
const bgpCols = [
  { key: 'remoteAs', label: '邻居 AS', minWidth: 100 },
  { key: 'sessionState', label: '会话状态', minWidth: 120 },
  { key: 'sessionDuration', label: '会话时长', minWidth: 110 },
  { key: 'routesReceived', label: '路由接收', minWidth: 100 },
  { key: 'routesSent', label: '路由发送', minWidth: 100 },
  { key: 'group', label: '对等体组', minWidth: 200 },
  { key: 'addressFamily', label: '地址族', minWidth: 130 }
]
const isisCols = [
  { key: 'interface', label: '接口', minWidth: 120 },
  { key: 'state', label: '状态', minWidth: 100 },
  { key: 'type', label: '类型', minWidth: 90 },
  { key: 'adjProtocol', label: '协议', minWidth: 100 },
  { key: 'holdTime', label: 'Hold Time', minWidth: 100 },
  { key: 'uptime', label: 'UP Time', minWidth: 110 },
  { key: 'endXSid', label: 'End-X SID', minWidth: 210 }
]
const ifaceCols = [
  { key: 'ethTrunk', label: '归属聚合接口', minWidth: 110 },
  { key: 'portStatus', label: '端口状态', minWidth: 73 },
  { key: 'vrf', label: 'VRF', minWidth: 65 },
  { key: 'isisCost', label: 'ISIS Cost', minWidth: 80 },
  { key: 'ipv4', label: 'IPv4', minWidth: 115 },
  { key: 'ipv6', label: 'IPv6', minWidth: 190 },
  { key: 'bandwidthUtil', label: '入/出利用率', minWidth: 90 },
  { key: 'mtu', label: 'MTU', minWidth: 55 }
]
const srv6Cols = [
  { key: 'color', label: 'Color', minWidth: 90 },
  { key: 'endpoint', label: 'Endpoint', minWidth: 200 },
  { key: 'tunnelId', label: 'TunnelId', minWidth: 90 },
  { key: 'policyState', label: 'Policy State', minWidth: 130 },
  { key: 'stateChangeTime', label: 'State Change Time', minWidth: 160 },
  { key: 'bindingSid', label: 'Binding SID', minWidth: 110 },
  { key: 'candidatePathCount', label: 'Candidate-path Count', minWidth: 100 }
]
const routingCols = [
  { key: 'total', label: '路由条目数(Total)', minWidth: 130, tip: 'Total Routes：该协议路由表中路由条目总数。割接前后一致说明路由收敛正常。' },
  { key: 'active', label: '活跃路由(Active)', minWidth: 120 },
  { key: 'added', label: '新增(Added)', minWidth: 95 },
  { key: 'deleted', label: '删除(Deleted)', minWidth: 95 },
  { key: 'freed', label: '释放(Freed)', minWidth: 95 }
]

const noDiff = () => null

// —— 状态 ——
const devId = ref('')
const interval = ref(10000)
const syncing = ref(false)
const comparing = ref(false)
const error = ref('')
const lastSync = ref(null)
const liveText = ref('')
const liveBefore = ref('')
const sessionId = ref('')
let es = null

const selectedDev = computed(() => settings.deviceConnections.find(d => d.id === devId.value) || null)
const lastSyncText = computed(() => lastSync.value ? lastSync.value.toLocaleTimeString() : '—')

// 解析放到 Web Worker（parseLiveStatusPure），避免每次 SSE 数据到达阻塞主线程；
// 用序列号防止慢任务覆盖新结果（竞态保护）。
const parsed = ref({ bgp: [], isis: [], iface: [], srv6: [], routing: [] })
let parseSeq = 0
watch(liveText, async (t) => {
  const seq = ++parseSeq
  if (!t) {
    parsed.value = { bgp: [], isis: [], iface: [], srv6: [], routing: [] }
    return
  }
  try {
    const r = await runLiveParseInWorker(t)
    if (seq === parseSeq) parsed.value = r
  } catch (e) {
    console.warn('[live-parse]', e)
    if (seq === parseSeq) parsed.value = { bgp: [], isis: [], iface: [], srv6: [], routing: [] }
  }
}, { immediate: true })
const bgpRows = computed(() => parsed.value.bgp)
const isisRows = computed(() => parsed.value.isis)
const ifaceRows = computed(() => parsed.value.iface)
const srv6Rows = computed(() => parsed.value.srv6)
const routingRows = computed(() => parsed.value.routing)

function openStream() {
  closeStream()
  if (!sessionId.value) return
  es = new EventSource(`/api/device/stream/${sessionId.value}?interval=${interval.value}&token=${encodeURIComponent(localStorage.getItem('netops_token') || '')}`)
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data)
      if (data.type === 'error') {
        error.value = data.message || '采集失败'
        ElMessage.warning('采集异常：' + (data.message || '未知错误'))
        return
      }
      liveText.value = data.text
      lastSync.value = data.ts ? new Date(data.ts) : new Date()
      error.value = ''
    } catch (e) { /* ignore */ }
  }
  es.onerror = () => {
    // 连接断开（会话失效/后端重启）：停止同步避免反复重连
    error.value = '实时连接已断开，请重新点击「开始实时同步」'
    stop()
  }
}

function closeStream() {
  if (es) { es.close(); es = null }
}

async function start() {
  const dev = selectedDev.value
  if (!dev) { ElMessage.warning('请先选择设备'); return }
  syncing.value = true
  error.value = ''
  liveText.value = ''
  liveBefore.value = ''
  try {
    const conn = {
      host: dev.host, port: dev.port || 22, username: dev.username,
      password: dev.password, vendor: dev.vendor,
      authType: dev.authType || 'password',
      privateKey: dev.privateKey || undefined, passphrase: dev.passphrase || undefined
    }
    const res = await connectDevice(conn)
    sessionId.value = res.sessionId
    openStream()
  } catch (err) {
    syncing.value = false
    error.value = err && err.message ? err.message : '连接失败'
    ElMessage.error('连接失败：' + (err && err.message ? err.message : '未知错误'))
  }
}

function stop() {
  closeStream()
  if (sessionId.value) { disconnectDevice(sessionId.value); sessionId.value = '' }
  syncing.value = false
}

function onIntervalChange() {
  if (syncing.value && sessionId.value) openStream() // 重新建立流以应用新间隔
}

function setBefore() {
  if (!liveText.value) { ElMessage.warning('暂无可用的实时数据'); return }
  liveBefore.value = liveText.value
  ElMessage.success('已存为割接前基线（实时快照）')
}

async function setAfterAndCompare() {
  if (!liveText.value) { ElMessage.warning('暂无可用的实时数据'); return }
  if (!liveBefore.value) { ElMessage.warning('请先点击「存为割接前」再比对'); return }
  comparing.value = true
  try {
    await runCompare(liveBefore.value, liveText.value, {
      ignoreCase: settings.ignoreCase,
      ignoreWhitespace: settings.ignoreWhitespace,
      ignoreOrder: settings.ignoreOrder,
      interfaceMatchPriority: settings.interfaceMatchPriority
    })
    ElMessage.success('比对完成，已生成割接汇总结论')
    emit('goto', 'cutover-summary')
  } catch (err) {
    console.error('[live-compare]', err)
    ElMessage.error('比对失败：' + (err && err.message ? err.message : '请确认采集内容正确'))
  }
  comparing.value = false
}

// ============ 行详情抽屉（点表格任意一行查看字段 + 原始回显） ============
const detailVisible = ref(false)
const detailModule = ref('')
const detailRow = ref(null)

// 各模块字段定义（主键 + 表格列），用于在抽屉中以可读 label 展示
const fieldDefsByModule = {
  bgp: [{ key: 'neighborIp', label: '邻居 IP' }, ...bgpCols],
  isis: [{ key: 'peerSystemId', label: '邻居 ID' }, ...isisCols],
  interface: [{ key: 'interfaceName', label: '接口' }, ...ifaceCols],
  srv6TePolicy: [{ key: 'policyName', label: '策略名称' }, ...srv6Cols],
  routingStat: [{ key: 'proto', label: '协议类别' }, ...routingCols]
}
const moduleStateField = {
  bgp: 'sessionState', isis: 'state', interface: 'portStatus', srv6TePolicy: 'policyState', routingStat: ''
}
const moduleTitle = {
  bgp: 'BGP 协议', isis: 'ISIS 协议', interface: '接口信息', srv6TePolicy: 'SRv6 TE Policy', routingStat: 'IPV4路由表'
}
const moduleBlockKey = {
  bgp: 'bgp', isis: 'isis', interface: 'interface', srv6TePolicy: 'srv6', routingStat: 'routing'
}
function moduleRawCmd(vendor) {
  const isH3c = vendor === 'h3c'
  return {
    bgp: 'display bgp peer',
    isis: 'display isis peer',
    interface: 'display ip interface brief',
    routingStat: 'display ip routing-table statistics',
    srv6TePolicy: isH3c ? 'display segment-routing ipv6 te policy' : 'display srv6-te policy brief'
  }
}

function buildDetailFields(module, row) {
  const defs = fieldDefsByModule[module] || []
  const seen = new Set(defs.map(d => d.key))
  const fields = defs.map(d => ({ ...d }))
  for (const k of Object.keys(row)) {
    if (k === 'isConsistent' || k.startsWith('_')) continue
    if (!seen.has(k)) { seen.add(k); fields.push({ key: k, label: k }) }
  }
  return fields
}

// 按协议命令把实时回显切成块（SSE 推送的 text 保留命令回显行，可据此切分）
function splitLiveBlocks(text, vendor) {
  const isH3c = vendor === 'h3c'
  const cmds = [
    { key: 'bgp', re: /display\s+bgp\s+peer/ },
    { key: 'isis', re: /display\s+isis\s+peer/ },
    { key: 'interface', re: /display\s+ip\s+interface\s+brief/ },
    { key: 'routing', re: /display\s+ip\s+routing-table\s+statistics/ },
    { key: 'srv6', re: isH3c ? /display\s+segment-routing\s+ipv6\s+te\s+policy/ : /display\s+srv6-te\s+policy\s+brief/ }
  ]
  const lines = (text || '').split('\n')
  const blocks = {}
  let current = null
  let buf = []
  for (const line of lines) {
    const hit = cmds.find(c => c.re.test(line))
    if (hit) {
      if (current) blocks[current] = buf.join('\n').trim()
      current = hit.key
      buf = []
    } else if (current) {
      buf.push(line)
    }
  }
  if (current) blocks[current] = buf.join('\n').trim()
  return blocks
}

const detailStateField = computed(() => moduleStateField[detailModule.value] || '')
const detailTitle = computed(() => {
  if (!detailModule.value) return '条目详情'
  const t = moduleTitle[detailModule.value] || detailModule.value
  const defs = fieldDefsByModule[detailModule.value] || []
  const firstKey = defs[0] ? defs[0].key : ''
  const val = detailRow.value ? detailRow.value[firstKey] : ''
  return val ? `${t} · ${val}` : t
})
const detailFields = computed(() => {
  if (!detailModule.value || !detailRow.value) return []
  return buildDetailFields(detailModule.value, detailRow.value)
})
const detailRawCmd = computed(() => {
  if (!detailModule.value) return ''
  return moduleRawCmd(selectedDev.value?.vendor)[detailModule.value] || ''
})
const detailRawBlock = computed(() => {
  if (!detailModule.value) return ''
  const blocks = splitLiveBlocks(liveText.value, selectedDev.value?.vendor)
  return blocks[moduleBlockKey[detailModule.value]] || ''
})

const formatVal = (val) => {
  if (Array.isArray(val)) return val.join(', ')
  if (val == null || val === '') return '-'
  return val
}

// 状态着色（与 ProtoPanel 一致）
const tagType = (val) => {
  if (!val) return 'info'
  const v = String(val).trim().split(/\s+/)[0].toLowerCase()
  if (['full', '2-way', '2way', 'init', 'down', 'attempt', 'exstart', 'exchange', 'loading'].includes(v)) {
    if (v === 'full') return 'success'
    if (v === '2-way' || v === '2way') return 'warning'
    return 'danger'
  }
  if (v === 'established' || v === 'up' || v === 'operational') return 'success'
  if (v === 'idle' || v === 'down') return 'warning'
  if (['active', 'connect', 'opensent', 'openconfirm'].includes(v)) return 'warning'
  if (['s', 'static'].includes(v)) return 'success'
  if (['i', 'interface'].includes(v)) return 'warning'
  if (v === 'd' || v === 'dynamic' || v.startsWith('d-')) return 'info'
  if (['reach', 'reachable'].includes(v)) return 'success'
  if (['stale', 'delay', 'probe', 'incomplete', 'incmp'].includes(v)) return 'warning'
  return 'danger'
}

function copyRaw() {
  const t = detailRawBlock.value
  if (!t) { ElMessage.warning('暂无可复制的原始回显'); return }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => ElMessage.success('已复制原始回显')).catch(() => ElMessage.warning('复制失败，请手动选择'))
  } else {
    ElMessage.warning('当前环境不支持自动复制')
  }
}

function onRowClick({ module, row }) {
  detailModule.value = module
  detailRow.value = row
  detailVisible.value = true
}

onUnmounted(stop)
</script>

<style scoped>
.live-page { padding: 16px 24px 40px; }
.live-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.live-bar-l, .live-bar-r { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.live-status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--t2); background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; margin-bottom: 14px; }
.live-status.err { color: #dc2626; border-color: rgba(239,68,68,.4); background: rgba(239,68,68,.06); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.live { background: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,.2); animation: blink 1.4s infinite; }
.dot.bad { background: #dc2626; }
@keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.live-empty { text-align: center; padding: 60px 20px; color: var(--t3); }
.live-empty-icon { width: 56px; height: 56px; margin: 0 auto 14px; color: var(--blue); opacity: .7; }
.live-empty-title { font-size: 15px; font-weight: 600; color: var(--t2); margin-bottom: 6px; }
.live-empty-desc { font-size: 13px; max-width: 460px; margin: 0 auto; line-height: 1.6; }
.live-grid { display: flex; flex-direction: column; gap: 12px; }

.detail-wrap { display: flex; flex-direction: column; gap: 18px; }
.detail-sec-h { font-size: 13px; font-weight: 600; color: var(--t2); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.detail-fields { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.detail-field { display: flex; border-bottom: 1px solid var(--border); }
.detail-field:last-child { border-bottom: none; }
.df-k { width: 150px; flex: none; padding: 8px 12px; background: var(--bg2); color: var(--t2); font-size: 13px; font-weight: 500; }
.df-v { flex: 1; padding: 8px 12px; font-size: 13px; color: var(--t2); word-break: break-all; display: flex; align-items: center; }
.detail-raw-cmd { font-family: monospace; background: var(--bg3); padding: 2px 8px; border-radius: 4px; font-size: 12px; color: var(--blue); }
.detail-copy { margin-left: auto; }
.detail-raw { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 14px; font-family: monospace; font-size: 12.5px; line-height: 1.6; color: var(--t2); white-space: pre-wrap; word-break: break-all; max-height: 46vh; overflow: auto; margin: 0; }
</style>
