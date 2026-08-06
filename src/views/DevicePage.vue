<template>
  <div class="device-page">
    <!-- 华为 · 协议 -->
    <template v-if="page === 'device-huawei'">
      <DevicePanel
        title="点击上传或拖拽配置文件到此处"
        :info="deviceInfoHW"
        :importing="deviceImporting"
        @upload="onDeviceImport('huawei')"
        @drop="onDeviceDrop($event, 'huawei')"
      >
        <ProtoPanel
          ref="bgpRef"
          title="BGP 协议" desc="邻居配置信息"
          :list="bgpList" :getDiffInfo="bgpGetDiff"
          keyField="neighborIp" keyLabel="邻居 IP" :keyWidth="180"
          stateField="neighborState" :resultWidth="100"
          :columns="[
            { key: 'remoteAs', label: '邻居 AS', minWidth: 100 },
            { key: 'neighborState', label: '邻居状态', minWidth: 100 },
            { key: 'description', label: '描述', minWidth: 160 },
            { key: 'addressFamily', label: '地址族', minWidth: 180 },
            { key: 'group', label: '对等体组', minWidth: 120 },
            { key: 'keepalive', label: 'Keepalive', minWidth: 100 },
            { key: 'hold', label: 'Hold', minWidth: 80 },
            { key: 'substituteAs', label: 'Substitute-AS', minWidth: 110 },
            { key: 'auth', label: '认证', minWidth: 70 },
            { key: 'ebgpMaxHop', label: 'EBGP跳数', minWidth: 90 },
            { key: 'bfd', label: 'BFD', minWidth: 70 },
            { key: 'routePolicyImport', label: 'Import策略', minWidth: 220 },
            { key: 'routePolicyExport', label: 'Export策略', minWidth: 220 }
          ]"
          :deviceMode="true" moduleName="bgp" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :boolFields="['substituteAs', 'auth', 'bfd']" :stat="bgpStat" :export-name="importedFileName" @focusFilter="onFocus"
        />

        <ProtoPanel
          ref="ospfRef"
          title="OSPF 协议" desc="邻接状态信息"
          :list="ospfList" :getDiffInfo="ospfGetDiff"
          keyField="interface" keyLabel="接口" :keyWidth="150"
          stateField="neighborState" :resultWidth="100"
          :columns="[
            { key: 'addressFamily', label: '协议版本', minWidth: 90 },
            { key: 'processId', label: '进程', minWidth: 80 },
            { key: 'vpnInstance', label: 'VPN实例', minWidth: 180 },
            { key: 'areaId', label: '区域', minWidth: 110 },
            { key: 'neighborId', label: '邻居 Router ID', minWidth: 160 },
            { key: 'neighborState', label: '状态', minWidth: 90 },
            { key: 'routerId', label: '本端 Router ID', minWidth: 150 },
            { key: 'cost', label: 'OSPF Cost', minWidth: 90 },
            { key: 'auth', label: 'OSPF认证', minWidth: 90 },
            { key: 'networkType', label: 'OSPF网络类型', minWidth: 120 },
            { key: 'hello', label: 'Hello间隔', minWidth: 90 }
          ]"
          :deviceMode="true" moduleName="ospf" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :stat="ospfStat" :boolFields="['auth']" :export-name="importedFileName" @focusFilter="onFocus"
        />

        <ProtoPanel
          ref="isisRef"
          title="ISIS 协议" desc="邻居邻接信息"
          :list="isisList" :getDiffInfo="isisGetDiff"
          keyField="peerSystemId" keyLabel="邻居 ID" :keyWidth="240"
          stateField="state" :resultWidth="100"
          :columns="[
            { key: 'interface', label: '接口', minWidth: 120 },
            { key: 'state', label: '状态', minWidth: 100 },
            { key: 'type', label: '类型', minWidth: 90 },
            { key: 'adjProtocol', label: '协议', minWidth: 100 },
            { key: 'circuitType', label: '网络类型', minWidth: 90 },
            { key: 'circuitLevel', label: '链路类型', minWidth: 90 },
            { key: 'auth', label: '认证', minWidth: 80 },
            { key: 'cost', label: 'Cost', minWidth: 70 },
            { key: 'holdTime', label: 'Hold Time', minWidth: 100 },
            { key: 'uptime', label: 'UP Time', minWidth: 110 },
            { key: 'endXSid', label: 'End-X SID', minWidth: 210 }
          ]"
          :boolFields="['auth']" :deviceMode="true" moduleName="isis" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />

        <ProtoPanel
          ref="ldpRef"
          title="LDP 协议" desc="会话信息"
          :list="ldpList" :getDiffInfo="ldpGetDiff"
          keyField="peerId" keyLabel="Peer ID" :keyWidth="140"
          stateField="status" :resultWidth="100"
          :columns="[
            { key: 'status', label: '状态', minWidth: 120 },
            { key: 'lam', label: 'LAM', minWidth: 80, tip: 'LAM（标签发布模式）：DU=下游自主模式（主动发布标签）；DOD=下游按需模式（收到请求才发布）。' },
            { key: 'ssnRole', label: '会话角色', minWidth: 100 },
            { key: 'ssnAge', label: '会话时长', minWidth: 110 }
          ]"
          :deviceMode="true" moduleName="ldp" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />

        <ProtoPanel
          ref="ldpPeerRef"
          title="LDP Peer" desc="发现接口信息"
          :list="ldpPeerList" :getDiffInfo="ldpPeerGetDiff"
          keyField="peerId" keyLabel="Peer ID" :keyWidth="140"
          stateField="state" :resultWidth="100"
          :columns="[
            { key: 'state', label: '状态', minWidth: 90 },
            { key: 'transportAddress', label: '传输地址', minWidth: 140 },
            { key: 'discoveryInterfaces', label: '发现接口', minWidth: 220 }
          ]"
          :deviceMode="true" moduleName="ldpPeer" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />

        <ProtoPanel
          ref="lldpRef"
          title="LLDP 邻居" desc="邻居发现信息"
          :list="lldpList" :getDiffInfo="lldpGetDiff"
          keyField="localIntf" keyLabel="本端接口" :keyWidth="200"
          stateField="state" :resultWidth="100"
          :columns="[
            { key: 'state', label: '状态', minWidth: 80 },
            { key: 'neighborDev', label: '对端设备', minWidth: 200 },
            { key: 'neighborIntf', label: '对端接口', minWidth: 200 },
            { key: 'exptime', label: '剩余超时(秒)', minWidth: 110 }
          ]"
          :deviceMode="true" moduleName="lldp" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />

        <ProtoPanel
          ref="srv6Ref"
          title="SRv6 SID" desc="SID 配置信息"
          :list="srv6List" :getDiffInfo="srv6GetDiff"
          keyField="sid" keyLabel="SID" :keyWidth="220"
          stateField="funcType" newIcon="🆕" :resultWidth="100"
          :columns="[
            { key: 'funcType', label: '功能类型', minWidth: 120 },
            { key: 'locatorName', label: 'Locator', minWidth: 140 },
            { key: 'locatorId', label: 'Locator ID', minWidth: 100 }
          ]"
          :deviceMode="true" moduleName="srv6" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />

        <ProtoPanel
          ref="srv6TePolicyRef"
          title="SRv6 TE Policy" desc="SRv6 隧道策略"
          :list="srv6TePolicyList" :getDiffInfo="srv6TePolicyGetDiff"
          keyField="policyName" keyLabel="策略名称" :keyWidth="240"
          stateField="policyState" :resultWidth="130"
          :columns="[
            { key: 'color', label: 'Color', minWidth: 90 },
            { key: 'endpoint', label: 'Endpoint', minWidth: 200 },
            { key: 'tunnelId', label: 'TunnelId', minWidth: 90 },
            { key: 'policyState', label: 'Policy State', minWidth: 130 },
            { key: 'stateChangeTime', label: 'State Change Time', minWidth: 160 },
            { key: 'bindingSid', label: 'Binding SID', minWidth: 110 },
            { key: 'candidatePathCount', label: 'Candidate-path Count', minWidth: 100 }
          ]"
          :deviceMode="true" moduleName="srv6TePolicy" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />

        <ProtoPanel
          ref="arpRef"
          title="ARP 协议" desc="ARP 表项信息"
          :list="arpList" :getDiffInfo="arpGetDiff"
          keyField="peerIp" keyLabel="IP地址" :keyWidth="140"
          stateField="arpType" :resultWidth="100"
          :columns="[
            { key: 'macAddress', label: 'MAC 地址', minWidth: 150 },
            { key: 'arpType', label: '类型', minWidth: 70, tip: '类型说明：<br/>I = Interface，接口本身的 ARP 表项；<br/>D = Dynamic，通过 ARP 协议报文获取的动态表项；<br/>S = Static，通过静态配置获取的静态表项' },
            { key: 'expire', label: '老化时间(M)', minWidth: 90 },
            { key: 'interface', label: '接口', minWidth: 120 },
            { key: 'vpnInstance', label: 'VPN实例', minWidth: 120 },
            { key: 'vlan', label: 'VLAN/CEVLAN', minWidth: 110 }
          ]"
          :deviceMode="true" moduleName="arp" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />

        <ProtoPanel
          ref="ipv6neighRef"
          title="IPv6 邻居表" desc="IPV6 表项"
          :list="ipv6neighList" :getDiffInfo="ipv6neighGetDiff"
          keyField="ipv6Address" keyLabel="IPv6地址" :keyWidth="180"
          stateField="state" :resultWidth="100"
          :columns="[
            { key: 'macAddress', label: 'MAC 地址', minWidth: 150 },
            { key: 'state', label: '状态', minWidth: 90 },
            { key: 'age', label: '老化时间', minWidth: 120 },
            { key: 'interface', label: '接口', minWidth: 120 },
            { key: 'vpn', label: 'VPN实例', minWidth: 140 },
            { key: 'vlan', label: 'VLAN/CEVLAN', minWidth: 110 },
            { key: 'isRouter', label: '是否路由器', minWidth: 90 },
            { key: 'secureFlag', label: '安全标志', minWidth: 90 }
          ]"
          :deviceMode="true" moduleName="ipv6neigh" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />
      </DevicePanel>
    </template>

    <!-- 华为 · AR设备 -->
    <template v-else-if="page === 'device-huawei-ar'">
      <DevicePanel
        title="点击上传或拖拽配置文件到此处"
        :info="deviceInfoAR"
        :importing="deviceImporting"
        @upload="onDeviceImport('huawei', 'ar')"
        @drop="onDeviceDrop($event, 'huawei', 'ar')"
      >
        <ProtoPanel
          ref="ifaceRef"
          title="接口信息" desc=""
          :list="ifaceList" :getDiffInfo="ifaceGetDiff"
          keyField="interfaceName" keyLabel="接口" :keyWidth="160"
          stateField="portStatus" :resultWidth="120"
          :columns="arColumns"
          :lead-columns="deviceNameCol"
          moduleName="interface" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :deviceMode="true" :export-name="importedFileName" @focusFilter="onFocus"
        />
        <ProtoPanel
          ref="routingRef"
          title="IPV4路由表" desc="IPV4路由表解析"
          :list="routingList" :getDiffInfo="noDiff"
          deviceMode moduleName="routingStat"
          keyField="proto" keyLabel="协议类别" :keyWidth="200"
          stateField="proto" :resultWidth="100"
          :columns="routingCols"
          v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />
      </DevicePanel>
    </template>

    <!-- 华三 -->
    <template v-else-if="page === 'device-h3c'">
      <DevicePanel
        title="点击上传或拖拽配置文件到此处"
        :info="deviceInfoH3C"
        :importing="deviceImporting"
        @upload="onDeviceImport('h3c')"
        @drop="onDeviceDrop($event, 'h3c')"
      >
        <InterfaceInfoModule ref="interfaceInfoRef" moduleName="interface" />
        <ProtoPanel
          ref="routingRef"
          title="IPV4路由表" desc="IPV4路由表解析"
          :list="routingList" :getDiffInfo="noDiff"
          deviceMode moduleName="routingStat"
          keyField="proto" keyLabel="协议类别" :keyWidth="200"
          stateField="proto" :resultWidth="100"
          :columns="routingCols"
          v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />
      </DevicePanel>
    </template>

    <!-- 全局配置（解析） -->
    <template v-else-if="page === 'device-global'">
      <DevicePanel
        title="点击上传或拖拽配置文件到此处"
        :info="deviceInfoGlobal"
        :importing="deviceImporting"
        @upload="onDeviceImport('auto')"
        @drop="onDeviceDrop($event, 'auto')"
      >
        <ProtoPanel
          ref="globalRef"
          title="全局配置" desc="系统与服务全局配置项"
          :list="globalList" :getDiffInfo="noDiff"
          keyField="item" keyLabel="配置项" :keyWidth="160"
          stateField="item" :resultWidth="120"
          :columns="[{ key: 'value', label: '配置值', minWidth: 280 }]"
          deviceMode moduleName="global" v-model:activeModule="localActive" :filterFocus="filterFocusModule" :export-name="importedFileName" @focusFilter="onFocus"
        />
      </DevicePanel>
    </template>

    <!-- 连接设备采集弹窗（配置解析页 SSH 直采） -->
    <el-dialog v-model="collectDialog" title="连接设备采集" width="440px" append-to-body>
      <div class="dc-body">
        <div class="dc-row">
          <span class="dc-label">采集目标</span>
          <el-select v-model="collectTarget" style="flex:1" :disabled="collecting" @change="onTargetChange">
            <el-option label="华为 · 路由协议(解析)" value="huawei" />
            <el-option label="华为 · 接口信息" value="huawei-ar" />
            <el-option label="华三 · 接口信息" value="h3c" />
          </el-select>
        </div>
        <div class="dc-row">
          <span class="dc-label">选择设备</span>
          <el-select v-model="collectDevId" placeholder="选择设备" style="flex:1" :disabled="collecting">
            <el-option v-for="d in collectDevList" :key="d.id" :label="`${d.name}（${d.host}）`" :value="d.id" />
          </el-select>
        </div>
        <div class="dc-row">
          <span class="dc-label">采集模板</span>
          <el-select v-model="collectTemplateId" style="flex:1" :disabled="collecting" >
            <el-option label="默认（配置+状态）" value="" />
            <el-option v-for="t in deviceVendorTemplates" :key="t.id" :label="`${t.name}（${t.commands.length} 条）`" :value="t.id" />
          </el-select>
        </div>
        <div class="dc-tip">
          将通过 SSH 按所选模板执行命令（默认配置 + 状态），采集结果自动解析到当前页面；模板可在「设置 → 设备与采集」中管理。
        </div>
        <div v-if="collectMsg" class="dc-msg" :class="{ err: !collecting }">{{ collectMsg }}</div>
      </div>
      <template #footer>
        <el-button @click="collectDialog = false" :disabled="collecting">取消</el-button>
        <el-button type="primary" :loading="collecting" @click="doDeviceCollect">开始采集</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
defineOptions({ name: 'DevicePage' })

import { ref, computed, watch, onMounted, onActivated, onDeactivated, onUnmounted } from 'vue'
import ProtoPanel from '../components/ProtoPanel.vue'
import { useExportAll } from '../composables/useExportAll.js'
import { buildParseWorkbook } from '../utils/exportSheet.js'
import InterfaceInfoModule from '../components/InterfaceInfoModule.vue'
import { runDeviceParseInWorker } from '../utils/parseWorker.js'
import { resolveCollectIn, templatesForVendorIn } from '../utils/collectTemplates.js'
import { collectScope } from '../utils/scope.js'
import { settings } from '../utils/settings.js'
import { collectDevice, llmStatus } from '../utils/api.js'
import DevicePanel from '../components/DevicePanel.vue'

const props = defineProps({
  page: { type: String, required: true },
  activeModule: { type: String, default: '' },
  filterFocusModule: { type: String, default: '' }
})

const emit = defineEmits(['update:activeModule', 'focusFilter', 'goto'])

const { interface: ifaceMod, bgp: bgpMod, isis: isisMod, ldp: ldpMod, ldpPeer: ldpPeerMod, srv6: srv6Mod, ospf: ospfMod, arp: arpMod, ipv6neigh: ipv6neighMod, srv6TePolicy: srv6TePolicyMod, lldp: lldpMod, routingStat: routingStatMod } = collectScope
const { neighborList: ifaceList, getDiffInfo: ifaceGetDiff, updateNeighbors } = ifaceMod
const { neighborList: bgpList, getDiffInfo: bgpGetDiff, updateNeighbors: updateBgp } = bgpMod
const { neighborList: isisList, getDiffInfo: isisGetDiff, updateNeighbors: updateIsis } = isisMod
const { neighborList: ldpList, getDiffInfo: ldpGetDiff, updateNeighbors: updateLdp } = ldpMod
const { neighborList: ldpPeerList, getDiffInfo: ldpPeerGetDiff, updateNeighbors: updateLdpPeer } = ldpPeerMod
const { neighborList: srv6List, getDiffInfo: srv6GetDiff, updateNeighbors: updateSrv6 } = srv6Mod
const { neighborList: ospfList, getDiffInfo: ospfGetDiff, updateNeighbors: updateOspf } = ospfMod
const { neighborList: arpList, getDiffInfo: arpGetDiff, updateNeighbors: updateArp } = arpMod
const { neighborList: ipv6neighList, getDiffInfo: ipv6neighGetDiff, updateNeighbors: updateIpv6Neigh } = ipv6neighMod
const { neighborList: srv6TePolicyList, getDiffInfo: srv6TePolicyGetDiff, updateNeighbors: updateSrv6TePolicy } = srv6TePolicyMod
const { neighborList: lldpList, getDiffInfo: lldpGetDiff, updateNeighbors: updateLldp } = lldpMod
const { neighborList: routingList, getDiffInfo: routingGetDiff, updateNeighbors: updateRouting } = routingStatMod

const deviceImporting = ref(false)
const lastVendor = ref('')
const lastSubtype = ref(undefined)

// 最近一次导入的文件名（不含扩展名），用于导出文件按导入文件命名
const importedFileName = ref('')
const stripExt = (n) => (n || '').replace(/\.[^./\\]+$/, '')
const deviceInfoHW = ref(null)
// BGP 邻居统计（设备模式标题旁总计数 tooltip 用）
const bgpStat = ref(null)
// OSPF 邻接统计（设备模式标题旁总计数 tooltip 用）
const ospfStat = ref(null)
const deviceInfoAR = ref(null)
const deviceInfoH3C = ref(null)
const deviceInfoGlobal = ref(null)

const lastGlobalConfig = ref([])

// 全局配置列表（三个子页共用，从各自解析结果中取）
const globalList = computed(() => lastGlobalConfig.value)

// 各解析面板 ref（供「一键导出全部」收集工作表）
const bgpRef = ref(null)
const ospfRef = ref(null)
const isisRef = ref(null)
const ldpRef = ref(null)
const ldpPeerRef = ref(null)
const lldpRef = ref(null)
const srv6Ref = ref(null)
const srv6TePolicyRef = ref(null)
const arpRef = ref(null)
const ipv6neighRef = ref(null)
const ifaceRef = ref(null)
const routingRef = ref(null)
const interfaceInfoRef = ref(null)
const globalRef = ref(null)

const localActive = computed({
  get: () => props.activeModule,
  set: (val) => emit('update:activeModule', val)
})

const onFocus = (name) => {
  emit('focusFilter', name)
}

const setDeviceInfo = (result, vendor, subtype) => {
  if (props.page === 'device-global') { deviceInfoGlobal.value = result; return }
  if (vendor === 'huawei' && !subtype) deviceInfoHW.value = result
  else if (vendor === 'huawei' && subtype === 'ar') deviceInfoAR.value = result
  else deviceInfoH3C.value = result
}

// 共享：把采集/上传得到的原始文本解析并分发到对应面板（上传、拖拽、SSH 采集三处复用）
const applyDeviceText = async (text, vendor, subtype) => {
  lastVendor.value = vendor
  lastSubtype.value = subtype
  const result = await runDeviceParseInWorker(text, vendor, subtype)
  lastGlobalConfig.value = result.globalConfig || []
  setDeviceInfo(result.deviceInfo, vendor, subtype)
  if (props.page === 'device-global') {
    emit('update:activeModule', 'global')
    return
  }
  if (vendor === 'huawei' && !subtype) {
    updateBgp(result.bgp)
    updateOspf(result.ospf)
    updateIsis(result.isis)
    updateLdp(result.ldp)
    updateLdpPeer(result.ldpPeer)
    updateLldp(result.lldp)
    updateSrv6(result.srv6)
    updateArp(result.arp)
    updateIpv6Neigh(result.ipv6neigh)
    updateSrv6TePolicy(result.srv6TePolicy)
    bgpStat.value = result.bgpStat
    ospfStat.value = result.ospfStat
    emit('update:activeModule', 'bgp')
  } else {
    updateNeighbors(result.interfaces)
    updateRouting(result.routing)
    emit('update:activeModule', 'interface')
  }
}
const onDeviceImport = (vendor, subtype) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.txt,.conf,.cfg,.log'
  input.onchange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    importedFileName.value = stripExt(file.name)
    deviceImporting.value = true
    try {
      const text = await file.text()
      const finalVendor = vendor === 'auto' ? (/\bH3C\b/i.test(text) ? 'h3c' : 'huawei') : vendor
      await applyDeviceText(text, finalVendor, subtype)
    } catch (err) {
      console.error('[设备采集] 文件解析失败：', err)
      ElMessage.error('文件读取失败：' + (err && err.message ? err.message : '请确认文件格式正确'))
    }
    deviceImporting.value = false
  }
  input.click()
}

const onDeviceDrop = (event, vendor, subtype) => {
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  importedFileName.value = stripExt(file.name)
  deviceImporting.value = true
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const text = e.target.result
      const finalVendor = vendor === 'auto' ? (/\bH3C\b/i.test(text) ? 'h3c' : 'huawei') : vendor
      await applyDeviceText(text, finalVendor, subtype)
    } catch (err) {
      console.error('[设备采集] 文件解析失败：', err)
      ElMessage.error('文件读取失败：' + (err && err.message ? err.message : '请确认文件格式正确'))
    }
    deviceImporting.value = false
  }
  reader.onerror = () => { deviceImporting.value = false; ElMessage.error('文件读取失败') }
  reader.readAsText(file)
}

// ===== 连接设备采集（配置解析页 SSH 直采，修复此前 onDeviceCollect 未实现导致点击报错的 bug） =====
const collectDialog = ref(false)
const collecting = ref(false)
const collectDevId = ref('')
const collectVendor = ref('huawei')
const collectTemplateId = ref('')
const deviceVendorTemplates = computed(() => templatesForVendorIn(settings.collectTemplates, collectVendor.value))
const collectSubtype = ref(undefined)
const collectMsg = ref('')

// 优先展示与当前面板厂商一致的设备；若没有匹配则回退到全部设备，避免列表为空点不动
const collectDevList = computed(() => {
  const matched = settings.deviceConnections.filter(d => d.vendor === collectVendor.value)
  return matched.length ? matched : settings.deviceConnections
})

const collectTarget = ref('huawei')

const onTargetChange = () => {
  const t = collectTarget.value
  collectVendor.value = t.startsWith('huawei') ? 'huawei' : 'h3c'
  collectSubtype.value = t === 'huawei-ar' ? 'ar' : undefined
  const match = settings.deviceConnections.find(d => d.vendor === collectVendor.value)
  collectDevId.value = (match || settings.deviceConnections[0])?.id || ''
  const targetPage = collectVendor.value === 'h3c' ? 'device-h3c' : (collectSubtype.value === 'ar' ? 'device-huawei-ar' : 'device-huawei')
  emit('goto', targetPage)
}

// 供外部（设置页 / Dashboard）触发：打开采集弹窗，用户在弹窗内选择采集目标+设备，采进对应解析页
const openCollect = () => {
  if (!settings.deviceConnections || settings.deviceConnections.length === 0) {
    ElMessage.warning('请先在「设置 → 设备管理」中添加设备')
    return
  }
  collectTarget.value = 'huawei'
  onTargetChange()
  collectMsg.value = ''
  collectDialog.value = true
}
defineExpose({ openCollect })

const doDeviceCollect = async () => {
  const dev = settings.deviceConnections.find(d => d.id === collectDevId.value)
  if (!dev) { ElMessage.warning('请选择设备'); return }
  collecting.value = true
  collectMsg.value = '正在连接 ' + dev.host + ' 采集中，请稍候…'
  try {
    // 解析页需要接口/光模块等运行状态，采用 full（配置 + 状态）
    const { commands, scope } = resolveCollectIn(settings.collectTemplates, collectTemplateId.value, collectVendor.value, 'full')
    const { text } = await collectDevice({
      host: dev.host, port: dev.port || 22, username: dev.username,
      password: dev.password, vendor: collectVendor.value, scope, commands,
      authType: dev.authType || 'password',
      privateKey: dev.privateKey || undefined, passphrase: dev.passphrase || undefined
    })
    await applyDeviceText(text, collectVendor.value, collectSubtype.value)
    collectDialog.value = false
    ElMessage.success('采集完成（' + (text ? text.length : 0) + ' 字符）')
  } catch (err) {
    collectMsg.value = '采集失败：' + (err && err.message ? err.message : '请检查设备连通性与账号密码')
    ElMessage.error(collectMsg.value)
  }
  collecting.value = false
}

const hwColumns = [
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

// 接口表的「设备名」前导列：抓取配置中 sysname 之后的值（如 HIHK-BC-CMNET-RT01-NE5000E-L1），渲染在「接口」列之前
const deviceNameCol = [{ key: 'deviceName', label: '设备名', minWidth: 200 }]

const arColumns = [
  { key: 'ethTrunk', label: '归属聚合接口', minWidth: 110 },
  { key: 'portStatus', label: '端口状态', minWidth: 80 },
  { key: 'vrf', label: 'VRF', minWidth: 165 },
  { key: 'isisCost', label: 'ISIS Cost', minWidth: 80 },
  { key: 'ipv4', label: 'IPv4', minWidth: 115 },
  { key: 'ipv6', label: 'IPv6', minWidth: 190 },
  { key: 'opticalPower', label: '光功率', minWidth: 172 },
  { key: 'bandwidthUtil', label: '入/出利用率', minWidth: 95 },
  { key: 'mtuL1L2', label: 'LAN/WAN', minWidth: 82 },
  { key: 'interfaceRate', label: '速率', minWidth: 60 },
  { key: 'moduleType', label: '模块类型', minWidth: 90 },
  { key: 'moduleDistance', label: '模块距离', minWidth: 73 },
  { key: 'mtu', label: 'MTU', minWidth: 55 },
  { key: 'packetLossRate', label: '丢包率', minWidth: 62 },
  { key: 'crc', label: 'CRC', minWidth: 60 }
]

// IPV4 路由表（配置解析·设备状态页，仅解析展示，不参与对比）
const routingCols = [
  { key: 'total', label: '路由条目数(Total)', minWidth: 130, tip: 'Total Routes：该协议路由表中路由条目总数。割接前后一致说明路由收敛正常，是割接验证的核心硬指标。' },
  { key: 'active', label: '活跃路由(Active)', minWidth: 120 },
  { key: 'added', label: '新增(Added)', minWidth: 95, tip: 'Added/Deleted/Freed 为设备启动以来的累计增量，仅作参考不参与差异判定。' },
  { key: 'deleted', label: '删除(Deleted)', minWidth: 95 },
  { key: 'freed', label: '释放(Freed)', minWidth: 95 }
]
// 单设备解析模式下无前后对比，差异信息统一返回 null
const noDiff = () => null

// ===================== 一键导出全部（配置解析：路由协议 + 接口信息 合并到同一张表） =====================
const { registerExportAll, setExportHasData, unregisterExportAll } = useExportAll()

// 配置解析各模块列定义（导出共用；与模板内联列保持一致）
const PARSE_MODULE_DEFS = {
  bgp: { title: 'BGP 协议', keyField: 'neighborIp', keyLabel: '邻居 IP', boolFields: ['substituteAs', 'auth', 'bfd'], columns: [
    { key: 'remoteAs', label: '邻居 AS', minWidth: 100 },
    { key: 'neighborState', label: '邻居状态', minWidth: 100 },
    { key: 'description', label: '描述', minWidth: 160 },
    { key: 'addressFamily', label: '地址族', minWidth: 180 },
    { key: 'group', label: '对等体组', minWidth: 120 },
    { key: 'keepalive', label: 'Keepalive', minWidth: 100 },
    { key: 'hold', label: 'Hold', minWidth: 80 },
    { key: 'substituteAs', label: 'Substitute-AS', minWidth: 110 },
    { key: 'auth', label: '认证', minWidth: 70 },
    { key: 'ebgpMaxHop', label: 'EBGP跳数', minWidth: 90 },
    { key: 'bfd', label: 'BFD', minWidth: 70 },
    { key: 'routePolicyImport', label: 'Import策略', minWidth: 220 },
    { key: 'routePolicyExport', label: 'Export策略', minWidth: 220 }
  ] },
  ospf: { title: 'OSPF 协议', keyField: 'interface', keyLabel: '接口', boolFields: ['auth'], columns: [
    { key: 'addressFamily', label: '协议版本', minWidth: 90 },
    { key: 'processId', label: '进程', minWidth: 80 },
    { key: 'vpnInstance', label: 'VPN实例', minWidth: 180 },
    { key: 'areaId', label: '区域', minWidth: 110 },
    { key: 'neighborId', label: '邻居 Router ID', minWidth: 160 },
    { key: 'neighborState', label: '状态', minWidth: 90 },
    { key: 'routerId', label: '本端 Router ID', minWidth: 150 },
    { key: 'cost', label: 'OSPF Cost', minWidth: 90 },
    { key: 'auth', label: 'OSPF认证', minWidth: 90 },
    { key: 'networkType', label: 'OSPF网络类型', minWidth: 120 },
    { key: 'hello', label: 'Hello间隔', minWidth: 90 }
  ] },
  isis: { title: 'ISIS 协议', keyField: 'peerSystemId', keyLabel: '邻居 ID', boolFields: ['auth'], columns: [
    { key: 'interface', label: '接口', minWidth: 120 },
    { key: 'state', label: '状态', minWidth: 100 },
    { key: 'type', label: '类型', minWidth: 90 },
    { key: 'adjProtocol', label: '协议', minWidth: 100 },
    { key: 'circuitType', label: '网络类型', minWidth: 90 },
    { key: 'circuitLevel', label: '链路类型', minWidth: 90 },
    { key: 'auth', label: '认证', minWidth: 80 },
    { key: 'cost', label: 'Cost', minWidth: 70 },
    { key: 'holdTime', label: 'Hold Time', minWidth: 100 },
    { key: 'uptime', label: 'UP Time', minWidth: 110 },
    { key: 'endXSid', label: 'End-X SID', minWidth: 210 }
  ] },
  ldp: { title: 'LDP 协议', keyField: 'peerId', keyLabel: 'Peer ID', boolFields: [], columns: [
    { key: 'status', label: '状态', minWidth: 120 },
    { key: 'lam', label: 'LAM', minWidth: 80 },
    { key: 'ssnRole', label: '会话角色', minWidth: 100 },
    { key: 'ssnAge', label: '会话时长', minWidth: 110 }
  ] },
  ldpPeer: { title: 'LDP Peer', keyField: 'peerId', keyLabel: 'Peer ID', boolFields: [], columns: [
    { key: 'state', label: '状态', minWidth: 90 },
    { key: 'transportAddress', label: '传输地址', minWidth: 140 },
    { key: 'discoveryInterfaces', label: '发现接口', minWidth: 220 }
  ] },
  lldp: { title: 'LLDP 邻居', keyField: 'localIntf', keyLabel: '本端接口', boolFields: [], columns: [
    { key: 'state', label: '状态', minWidth: 80 },
    { key: 'neighborDev', label: '对端设备', minWidth: 200 },
    { key: 'neighborIntf', label: '对端接口', minWidth: 200 },
    { key: 'exptime', label: '剩余超时(秒)', minWidth: 110 }
  ] },
  srv6: { title: 'SRv6 SID', keyField: 'sid', keyLabel: 'SID', boolFields: [], columns: [
    { key: 'funcType', label: '功能类型', minWidth: 120 },
    { key: 'locatorName', label: 'Locator', minWidth: 140 },
    { key: 'locatorId', label: 'Locator ID', minWidth: 100 }
  ] },
  srv6TePolicy: { title: 'SRv6 TE Policy', keyField: 'policyName', keyLabel: '策略名称', boolFields: [], columns: [
    { key: 'color', label: 'Color', minWidth: 90 },
    { key: 'endpoint', label: 'Endpoint', minWidth: 200 },
    { key: 'tunnelId', label: 'TunnelId', minWidth: 90 },
    { key: 'policyState', label: 'Policy State', minWidth: 130 },
    { key: 'stateChangeTime', label: 'State Change Time', minWidth: 160 },
    { key: 'bindingSid', label: 'Binding SID', minWidth: 110 },
    { key: 'candidatePathCount', label: 'Candidate-path Count', minWidth: 100 }
  ] },
  arp: { title: 'ARP 协议', keyField: 'peerIp', keyLabel: 'IP地址', boolFields: [], columns: [
    { key: 'macAddress', label: 'MAC 地址', minWidth: 150 },
    { key: 'arpType', label: '类型', minWidth: 70 },
    { key: 'expire', label: '老化时间(M)', minWidth: 90 },
    { key: 'interface', label: '接口', minWidth: 120 },
    { key: 'vpnInstance', label: 'VPN实例', minWidth: 120 },
    { key: 'vlan', label: 'VLAN/CEVLAN', minWidth: 110 }
  ] },
  ipv6neigh: { title: 'IPv6 邻居表', keyField: 'ipv6Address', keyLabel: 'IPv6地址', boolFields: [], columns: [
    { key: 'macAddress', label: 'MAC 地址', minWidth: 150 },
    { key: 'state', label: '状态', minWidth: 90 },
    { key: 'age', label: '老化时间', minWidth: 120 },
    { key: 'interface', label: '接口', minWidth: 120 },
    { key: 'vpn', label: 'VPN实例', minWidth: 140 },
    { key: 'vlan', label: 'VLAN/CEVLAN', minWidth: 110 },
    { key: 'isRouter', label: '是否路由器', minWidth: 90 },
    { key: 'secureFlag', label: '安全标志', minWidth: 90 }
  ] },
  globalConfig: { title: '全局配置', keyField: 'item', keyLabel: '配置项', boolFields: [], columns: [
    { key: 'value', label: '配置值', minWidth: 280 }
  ] }
}

// 路由协议 + 接口信息 + IPV4路由表 全部模块（从共享 store 读取，合并到同一张表）
// 注：路由协议与接口信息分属不同解析页，但数据都落在同一 collectScope 单例，故可跨页合并
const parseModulesForExport = computed(() => {
  const list = [
    { def: PARSE_MODULE_DEFS.bgp, list: bgpList, getDiffInfo: bgpGetDiff },
    { def: PARSE_MODULE_DEFS.ospf, list: ospfList, getDiffInfo: ospfGetDiff },
    { def: PARSE_MODULE_DEFS.isis, list: isisList, getDiffInfo: isisGetDiff },
    { def: PARSE_MODULE_DEFS.ldp, list: ldpList, getDiffInfo: ldpGetDiff },
    { def: PARSE_MODULE_DEFS.ldpPeer, list: ldpPeerList, getDiffInfo: ldpPeerGetDiff },
    { def: PARSE_MODULE_DEFS.lldp, list: lldpList, getDiffInfo: lldpGetDiff },
    { def: PARSE_MODULE_DEFS.srv6, list: srv6List, getDiffInfo: srv6GetDiff },
    { def: PARSE_MODULE_DEFS.srv6TePolicy, list: srv6TePolicyList, getDiffInfo: srv6TePolicyGetDiff },
    { def: PARSE_MODULE_DEFS.arp, list: arpList, getDiffInfo: arpGetDiff },
    { def: PARSE_MODULE_DEFS.ipv6neigh, list: ipv6neighList, getDiffInfo: ipv6neighGetDiff },
    { def: { title: '接口信息', keyField: 'interfaceName', keyLabel: '接口', boolFields: [], columns: [...deviceNameCol, ...arColumns] }, list: ifaceList, getDiffInfo: ifaceGetDiff },
    { def: { title: 'IPV4路由表', keyField: 'proto', keyLabel: '协议类别', boolFields: [], columns: routingCols }, list: routingList, getDiffInfo: routingGetDiff },
    { def: PARSE_MODULE_DEFS.globalConfig, list: globalList, getDiffInfo: noDiff }
  ]
  return list.map(m => ({
    title: m.def.title,
    list: m.list,
    getDiffInfo: m.getDiffInfo,
    keyField: m.def.keyField,
    keyLabel: m.def.keyLabel,
    columns: m.def.columns,
    boolFields: m.def.boolFields
  }))
})

const pageHasData = computed(() => parseModulesForExport.value.some(m => m.list.value && m.list.value.length))

const exportPageAll = async () => {
  // 导出时实时取出各 store 当前数据（ref → 数组）
  const modules = parseModulesForExport.value.map(m => ({ ...m, list: m.list.value || [] }))
  if (!modules.some(m => m.list.length)) {
    ElMessage.warning('当前没有可导出的解析数据，请先导入配置文件')
    return
  }
  const wb = await buildParseWorkbook(modules)
  if (!wb) { ElMessage.warning('当前没有可导出的解析数据'); return }
  const XLSX = (await import('xlsx-js-style')).default
  const base = importedFileName.value || '解析结果'
  XLSX.writeFile(wb, `${base}_解析汇总.xlsx`, { bookType: 'xlsx', cellStyles: true })
  ElMessage.success('已导出解析结果（每个协议/接口各占一个 sheet，汇总在单个文件）')
}

// 注册「一键导出全部」到全局（Header 按钮调用）：仅在解析页激活且有数据时显示
const registerExport = () => {
  registerExportAll(props.page, exportPageAll)
  setExportHasData(pageHasData.value)
}
onMounted(registerExport)
onActivated(registerExport)
watch(pageHasData, (v) => setExportHasData(v))
onDeactivated(() => unregisterExportAll(props.page))
onUnmounted(() => unregisterExportAll(props.page))

</script>

<style scoped>
.device-page { }
.dp-ai-bar { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-bottom: 12px }
.dp-ai-file { font-size: 12px; color: var(--t3) }
.ai-loading { display: flex; align-items: center; gap: 10px; color: var(--t2); font-size: 13px; padding: 24px 0 }
.ai-spinner { width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--blue); border-radius: 50%; animation: ai-rot 0.8s linear infinite }
@keyframes ai-rot { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
.ai-error { color: var(--red); font-size: 13px; padding: 12px 0; white-space: pre-wrap }
.ai-result { margin: 0; max-height: 55vh; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.7; color: var(--t1); font-family: var(--sans) }
.ai-empty { color: var(--t3); font-size: 13px; padding: 20px 0 }
.ai-diag-tip { font-size: 12.5px; color: var(--t3); margin-bottom: 10px; line-height: 1.6 }
.ai-diag-list { display: flex; flex-direction: column; gap: 8px; max-height: 52vh; overflow: auto; }
.ai-diag-item { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
.ai-diag-item:hover { border-color: var(--blue) }
.ai-diag-item.checked { border-color: var(--blue); background: var(--blue-l) }
.ai-diag-item.sev-high { border-left: 3px solid var(--red) }
.ai-diag-item.sev-medium { border-left: 3px solid var(--orange) }
.ai-diag-item.sev-low { border-left: 3px solid var(--t4) }
.ai-diag-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px }
.ai-diag-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.ai-diag-module { font-size: 12.5px; font-weight: 600; color: var(--t2) }
.ai-diag-key { font-family: monospace; font-size: 12px; background: var(--bg3); padding: 1px 6px; border-radius: 4px; color: var(--blue) }
.ai-diag-issue { font-size: 13px; color: var(--t1); line-height: 1.6 }
.ai-diag-sug { font-size: 12.5px; color: var(--t2); line-height: 1.6 }
.ai-diag-ev { font-size: 12px; color: var(--t3); line-height: 1.6; word-break: break-all }
.learn-badge { margin-right: 12px }
.learn-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px }
.learn-intro { margin: 0; font-size: 12.5px; color: var(--t3); line-height: 1.7; flex: 1 }
.learn-error { color: var(--red); font-size: 13px; padding: 8px 0 12px; white-space: pre-wrap }
.learn-unknown-list { display: flex; flex-direction: column; gap: 4px; max-height: 44vh; overflow: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.learn-unknown-item { display: flex; align-items: center; gap: 10px; font-size: 12.5px; padding: 3px 6px; border-radius: 4px; }
.learn-unknown-item:hover { background: var(--bg3) }
.learn-iface { color: var(--blue); flex-shrink: 0; min-width: 150px; }
.learn-line { color: var(--t1); word-break: break-all; }
.learn-code { font-family: monospace; font-size: 12px; background: var(--bg3); padding: 1px 6px; border-radius: 4px; color: var(--t1) }
.learn-sug-list { display: flex; flex-direction: column; gap: 8px; max-height: 48vh; overflow: auto; }
.learn-sug-item { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; cursor: pointer; }
.learn-sug-item:hover { border-color: var(--blue) }
.learn-sug-item.checked { border-color: var(--blue); background: var(--blue-l) }
.learn-sug-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px }
.learn-sug-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.learn-sug-extract { color: var(--t3); font-size: 12px }
.learn-sug-sample code { font-family: monospace; font-size: 12px; background: var(--bg2); padding: 2px 6px; border-radius: 4px; color: var(--t2) }
.learn-sug-reason { font-size: 12px; color: var(--t3); line-height: 1.6 }
.dc-body { display: flex; flex-direction: column; gap: 12px; }
.dc-row { display: flex; align-items: center; gap: 12px; }
.dc-label { width: 64px; flex-shrink: 0; color: var(--t2); }
.dc-tip { font-size: 12px; color: var(--t3); line-height: 1.6; }
.dc-msg { font-size: 13px; color: var(--t2); }
.dc-msg.err { color: #e74c3c; }
</style>
