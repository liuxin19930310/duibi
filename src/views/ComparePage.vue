<template>
  <div class="compare-page">
    <!-- 华为 · 协议 -->
    <template v-if="page === 'hw-p'">
      <ProtoPanel
        title="BGP 协议" desc="邻居会话对比"
        :list="bgpList" :getDiffInfo="bgpGetDiff"
        keyField="neighborIp" keyLabel="邻居 IP" :keyWidth="180"
        stateField="sessionState" :resultWidth="100"
        :columns="MODULE_DEFS.bgp.columns"
        moduleName="bgp" v-model:activeModule="localActive" :filterFocus="filterFocusModule" @focusFilter="onFocus"
      />

      <ProtoPanel
        title="ISIS 协议" desc="邻居邻接对比"
        :list="isisList" :getDiffInfo="isisGetDiff"
        keyField="peerSystemId" keyLabel="邻居 ID" :keyWidth="240"
        stateField="state" :resultWidth="100"
        :columns="MODULE_DEFS.isis.columns"
        :boolFields="[]" moduleName="isis" v-model:activeModule="localActive" :filterFocus="filterFocusModule" @focusFilter="onFocus"
      />

      <ProtoPanel
        title="LDP 协议" desc="会话对比"
        :list="ldpList" :getDiffInfo="ldpGetDiff"
        keyField="peerId" keyLabel="Peer ID" :keyWidth="140"
        stateField="status" :resultWidth="100"
        :columns="MODULE_DEFS.ldp.columns"
        moduleName="ldp" v-model:activeModule="localActive" :filterFocus="filterFocusModule" @focusFilter="onFocus"
      />

      <ProtoPanel
        title="LDP Peer" desc="发现接口对比"
        :list="ldpPeerList" :getDiffInfo="ldpPeerGetDiff"
        keyField="peerId" keyLabel="Peer ID" :keyWidth="140"
        stateField="state" :resultWidth="100"
        :columns="MODULE_DEFS.ldpPeer.columns"
        moduleName="ldpPeer" v-model:activeModule="localActive" :filterFocus="filterFocusModule" @focusFilter="onFocus"
      />

      <ProtoPanel
        title="SRv6 SID" desc="SID 配置对比"
        :list="srv6List" :getDiffInfo="srv6GetDiff"
        keyField="sid" keyLabel="SID" :keyWidth="220"
        stateField="funcType" newIcon="🆕" :resultWidth="100"
        :columns="MODULE_DEFS.srv6.columns"
        moduleName="srv6" v-model:activeModule="localActive" :filterFocus="filterFocusModule" @focusFilter="onFocus"
      />

      <ProtoPanel
        title="SRv6 TE Policy" desc="SRv6 隧道策略对比"
        :list="srv6TePolicyList" :getDiffInfo="srv6TePolicyGetDiff"
        keyField="policyName" keyLabel="策略名称" :keyWidth="240"
        stateField="policyState" :resultWidth="130"
        :columns="MODULE_DEFS.srv6TePolicy.columns"
        moduleName="srv6TePolicy" v-model:activeModule="localActive" :filterFocus="filterFocusModule" @focusFilter="onFocus"
      />
    </template>

    <!-- 华为 · 接口 -->
    <template v-else-if="page === 'hw-i'">
      <ProtoPanel
        title="接口信息" desc="接口配置对比"
        :list="ifaceList" :getDiffInfo="ifaceGetDiff"
        keyField="interfaceName" keyLabel="接口" :keyWidth="290"
        stateField="portStatus" :resultWidth="120"
        :columns="MODULE_DEFS.interface.columns"
        moduleName="interface" v-model:activeModule="localActive" :filterFocus="filterFocusModule" @focusFilter="onFocus"
      />

      <ProtoPanel
        title="IPV4路由表" desc="IPV4路由表对比"
        :list="routingStatList" :getDiffInfo="routingStatGetDiff"
        keyField="proto" keyLabel="协议类别" :keyWidth="200"
        stateField="state" :resultWidth="100"
        :columns="MODULE_DEFS.routingStat.columns"
        moduleName="routingStat" v-model:activeModule="localActive" :filterFocus="filterFocusModule" @focusFilter="onFocus"
      />
    </template>

    <!-- 华三 · 协议 -->
    <div v-else class="placeholder">
      <div class="placeholder-icon"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></div>
      <div class="placeholder-title">华三模块开发中</div>
      <div class="placeholder-desc">敬请期待</div>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'ComparePage' })

import { computed, ref, watch, onMounted, onActivated, onDeactivated, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import ProtoPanel from '../components/ProtoPanel.vue'
import { compareState } from '../utils/compare.js'
import { useExportAll } from '../composables/useExportAll.js'
import { buildCompareWorkbook } from '../utils/exportSheet.js'

const props = defineProps({
  page: { type: String, required: true },
  activeModule: { type: String, default: '' },
  filterFocusModule: { type: String, default: '' }
})

const emit = defineEmits(['update:activeModule', 'focusFilter'])

const bgpList = compareState.bgp.list
const bgpGetDiff = compareState.bgp.getDiffInfo
const isisList = compareState.isis.list
const isisGetDiff = compareState.isis.getDiffInfo
const ldpList = compareState.ldp.list
const ldpGetDiff = compareState.ldp.getDiffInfo
const ldpPeerList = compareState.ldpPeer.list
const ldpPeerGetDiff = compareState.ldpPeer.getDiffInfo
const srv6List = compareState.srv6.list
const srv6GetDiff = compareState.srv6.getDiffInfo
const srv6TePolicyList = compareState.srv6TePolicy.list
const srv6TePolicyGetDiff = compareState.srv6TePolicy.getDiffInfo
const routingStatList = compareState.routingStat.list
const routingStatGetDiff = compareState.routingStat.getDiffInfo
const ifaceList = compareState.interface.list
const ifaceGetDiff = compareState.interface.getDiffInfo

// ---- 模块列定义（模板与一键导出共用单一数据源） ----
const MODULE_DEFS = {
  bgp: {
    title: 'BGP 协议', keyField: 'neighborIp', keyLabel: '邻居 IP', boolFields: [],
    columns: [
      { key: 'remoteAs', label: '邻居 AS', minWidth: 100 },
      { key: 'sessionState', label: '会话状态', minWidth: 120 },
      { key: 'sessionDuration', label: '会话时长', minWidth: 110 },
      { key: 'routesReceived', label: '路由接收', minWidth: 100 },
      { key: 'routesSent', label: '路由发送', minWidth: 100 },
      { key: 'group', label: '对等体组', minWidth: 200 },
      { key: 'addressFamily', label: '地址族', minWidth: 130 }
    ]
  },
  isis: {
    title: 'ISIS 协议', keyField: 'peerSystemId', keyLabel: '邻居 ID', boolFields: [],
    columns: [
      { key: 'interface', label: '接口', minWidth: 120 },
      { key: 'state', label: '状态', minWidth: 100 },
      { key: 'type', label: '类型', minWidth: 90 },
      { key: 'adjProtocol', label: '协议', minWidth: 100 },
      { key: 'holdTime', label: 'Hold Time', minWidth: 100 },
      { key: 'uptime', label: 'UP Time', minWidth: 110 },
      { key: 'endXSid', label: 'End-X SID', minWidth: 210 }
    ]
  },
  ldp: {
    title: 'LDP 协议', keyField: 'peerId', keyLabel: 'Peer ID', boolFields: [],
    columns: [
      { key: 'status', label: '状态', minWidth: 120 },
      { key: 'lam', label: 'LAM', minWidth: 80, tip: 'LAM（标签发布模式）：DU=下游自主模式（主动发布标签）；DOD=下游按需模式（收到请求才发布）。' },
      { key: 'ssnRole', label: '会话角色', minWidth: 100 },
      { key: 'ssnAge', label: '会话时长', minWidth: 110 }
    ]
  },
  ldpPeer: {
    title: 'LDP Peer', keyField: 'peerId', keyLabel: 'Peer ID', boolFields: [],
    columns: [
      { key: 'state', label: '状态', minWidth: 90 },
      { key: 'transportAddress', label: '传输地址', minWidth: 140 },
      { key: 'discoveryInterfaces', label: '发现接口', minWidth: 220 }
    ]
  },
  srv6: {
    title: 'SRv6 SID', keyField: 'sid', keyLabel: 'SID', boolFields: [],
    columns: [
      { key: 'funcType', label: '功能类型', minWidth: 120 },
      { key: 'locatorName', label: 'Locator', minWidth: 140 },
      { key: 'locatorId', label: 'Locator ID', minWidth: 100 }
    ]
  },
  srv6TePolicy: {
    title: 'SRv6 TE Policy', keyField: 'policyName', keyLabel: '策略名称', boolFields: [],
    columns: [
      { key: 'color', label: 'Color', minWidth: 90 },
      { key: 'endpoint', label: 'Endpoint', minWidth: 200 },
      { key: 'tunnelId', label: 'TunnelId', minWidth: 90 },
      { key: 'policyState', label: 'Policy State', minWidth: 130 },
      { key: 'stateChangeTime', label: 'State Change Time', minWidth: 160 },
      { key: 'bindingSid', label: 'Binding SID', minWidth: 110 },
      { key: 'candidatePathCount', label: 'Candidate-path Count', minWidth: 100 }
    ]
  },
  interface: {
    title: '接口信息', keyField: 'interfaceName', keyLabel: '接口', boolFields: [],
    columns: [
      { key: 'ethTrunk', label: '归属聚合接口', minWidth: 110 },
      { key: 'portStatus', label: '端口状态', minWidth: 73 },
      { key: 'vrf', label: 'VRF', minWidth: 65 },
      { key: 'isisCost', label: 'ISIS Cost', minWidth: 80 },
      { key: 'ipv4', label: 'IPv4', minWidth: 115 },
      { key: 'ipv6', label: 'IPv6', minWidth: 190 },
      { key: 'opticalPower', label: '光功率', minWidth: 172 },
      { key: 'bandwidthUtil', label: '入/出利用率', minWidth: 90 },
      { key: 'mtuL1L2', label: 'LAN/WAN', minWidth: 82 },
      { key: 'interfaceRate', label: '速率', minWidth: 70 },
      { key: 'moduleType', label: '模块类型', minWidth: 90 },
      { key: 'moduleDistance', label: '模块距离', minWidth: 73 },
      { key: 'mtu', label: 'MTU', minWidth: 55 },
      { key: 'packetLossRate', label: '丢包率', minWidth: 62 },
      { key: 'crc', label: 'CRC', minWidth: 60 }
    ]
  },
  routingStat: {
    title: 'IPV4路由表', keyField: 'proto', keyLabel: '协议类别', boolFields: [],
    columns: [
      { key: 'state', label: '状态', minWidth: 90 },
      { key: 'total', label: '路由条目数(Total)', minWidth: 130, tip: 'Total Routes：该协议路由表中路由条目总数。割接前后一致说明路由收敛正常，是割接验证的核心硬指标。' },
      { key: 'active', label: '活跃路由(Active)', minWidth: 120 },
      { key: 'added', label: '新增(Added)', minWidth: 95, tip: 'Added/Deleted/Freed 为设备启动以来的累计增量，割接后必然很大，仅作参考不参与差异判定。' },
      { key: 'deleted', label: '删除(Deleted)', minWidth: 95 },
      { key: 'freed', label: '释放(Freed)', minWidth: 95 }
    ]
  }
}

// ---- 一键导出全部：华为配置对比「路由协议 + 接口信息」合并到同一张表 ----
const { registerExportAll, setExportHasData, unregisterExportAll } = useExportAll()

const huaweiCompareModules = [
  { def: MODULE_DEFS.bgp, list: bgpList, getDiffInfo: bgpGetDiff },
  { def: MODULE_DEFS.isis, list: isisList, getDiffInfo: isisGetDiff },
  { def: MODULE_DEFS.ldp, list: ldpList, getDiffInfo: ldpGetDiff },
  { def: MODULE_DEFS.ldpPeer, list: ldpPeerList, getDiffInfo: ldpPeerGetDiff },
  { def: MODULE_DEFS.srv6, list: srv6List, getDiffInfo: srv6GetDiff },
  { def: MODULE_DEFS.srv6TePolicy, list: srv6TePolicyList, getDiffInfo: srv6TePolicyGetDiff },
  { def: MODULE_DEFS.interface, list: ifaceList, getDiffInfo: ifaceGetDiff },
  { def: MODULE_DEFS.routingStat, list: routingStatList, getDiffInfo: routingStatGetDiff }
]

// 仅华为配置对比做合并导出；华三为占位页（无数据）
// 注意：store 中的 list 是 ref，需要 unwrap 成数组后再使用
const compareModulesForExport = computed(() => {
  if (props.page !== 'hw-p' && props.page !== 'hw-i') return []
  return huaweiCompareModules.map(m => ({
    title: m.def.title,
    list: m.list.value,
    getDiffInfo: m.getDiffInfo,
    keyField: m.def.keyField,
    keyLabel: m.def.keyLabel,
    columns: m.def.columns,
    boolFields: m.def.boolFields
  }))
})

const pageHasData = computed(() => compareModulesForExport.value.some(m => m.list && m.list.length))

const exportPageAll = async () => {
  const modules = compareModulesForExport.value
  if (!modules.some(m => m.list && m.list.length)) {
    ElMessage.warning('当前没有可导出的对比数据')
    return
  }
  const wb = await buildCompareWorkbook(modules)
  if (!wb) { ElMessage.warning('当前没有可导出的对比数据'); return }
  const XLSX = (await import('xlsx-js-style')).default
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `华为配置对比_${date}.xlsx`, { bookType: 'xlsx', cellStyles: true })
  ElMessage.success('已导出对比结果（每个协议/接口各占一个 sheet，汇总在单个文件）')
}

const registerExport = () => {
  registerExportAll(props.page, exportPageAll)
  setExportHasData(pageHasData.value)
}
onMounted(registerExport)
onActivated(registerExport)
watch(pageHasData, (v) => setExportHasData(v))
onDeactivated(() => unregisterExportAll(props.page))
onUnmounted(() => unregisterExportAll(props.page))

const localActive = computed({
  get: () => props.activeModule,
  set: (val) => emit('update:activeModule', val)
})

const onFocus = (name) => {
  emit('focusFilter', name)
}

</script>

<style scoped>
.placeholder { padding: 56px 24px; text-align: center; color: var(--t3) }
.placeholder-icon { width: 56px; height: 56px; margin: 0 auto 14px; color: var(--t4) }
.placeholder-title { font-size: 15px; font-weight: 600; color: var(--t2); margin-bottom: 6px }
.placeholder-desc { font-size: 13px; color: var(--t3) }
/* 割接汇总区样式已迁移至 src/views/CutoverSummary.vue */
</style>
