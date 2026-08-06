// src/utils/compare.js
import { useBgpModule } from './bgp.js'
import { useIsisModule } from './isis.js'
import { useLdpModule } from './ldp.js'
import { useLdpPeerModule } from './ldpPeer.js'
import { useSrv6SidModule } from './srv6Sid.js'
import { useSrv6TePolicyModule } from './srv6TePolicy.js'
import { useInterfaceModule } from './interfaceInfo.js'
import { buildOpticalPowerSubDiffs } from './interfaceInfo.js'
import { useRoutingStatModule } from './routingStat.js'
import { useLldpModule } from './lldp.js'
import { runCompareInWorker } from './parseWorker.js'

// ===== 1. 创建对比侧独立的模块实例（与设备采集侧 DevicePage 各自独立、互不影响） =====
const bgpMod = useBgpModule()
const isisMod = useIsisModule()
const ldpMod = useLdpModule()
const ldpPeerMod = useLdpPeerModule()
const srv6Mod = useSrv6SidModule()
const srv6TePolicyMod = useSrv6TePolicyModule()
const ifaceMod = useInterfaceModule()
const routingStatMod = useRoutingStatModule()
const lldpMod = useLldpModule()

// 对比侧更新方法（写入对比侧私有实例，不影响设备采集侧）
const updateBgp = bgpMod.updateNeighbors
const updateIsis = isisMod.updateNeighbors
const updateLdp = ldpMod.updateNeighbors
const updateLdpPeer = ldpPeerMod.updateNeighbors
const updateSrv6Sid = srv6Mod.updateNeighbors
const updateSrv6TePolicy = srv6TePolicyMod.updateNeighbors
const updateInterface = ifaceMod.updateNeighbors
const updateRoutingStat = routingStatMod.updateNeighbors
const updateLldp = lldpMod.updateNeighbors



// 供 ComparePage 读取对比侧数据（与上方 updateXxx 同一实例，确保对比结果正确显示）
export const compareState = {
  bgp: { list: bgpMod.neighborList, getDiffInfo: bgpMod.getDiffInfo },
  isis: { list: isisMod.neighborList, getDiffInfo: isisMod.getDiffInfo },
  ldp: { list: ldpMod.neighborList, getDiffInfo: ldpMod.getDiffInfo },
  ldpPeer: { list: ldpPeerMod.neighborList, getDiffInfo: ldpPeerMod.getDiffInfo },
  srv6: { list: srv6Mod.neighborList, getDiffInfo: srv6Mod.getDiffInfo },
  srv6TePolicy: { list: srv6TePolicyMod.neighborList, getDiffInfo: srv6TePolicyMod.getDiffInfo },
  interface: { list: ifaceMod.neighborList, getDiffInfo: ifaceMod.getDiffInfo },
  routingStat: { list: routingStatMod.neighborList, getDiffInfo: routingStatMod.getDiffInfo },
  lldp: { list: lldpMod.neighborList, getDiffInfo: lldpMod.getDiffInfo }
}

// ===== 4. 核心对比方法（暴露出去） =====
// 纯解析 + 比对在 Web Worker 中执行（compareCore.js），主线程只负责把结果写回响应式 store，
// 大配置解析不再阻塞界面；Worker 不可用时自动降级为主线程解析。
export async function runCompare(beforeText, afterText, options = {}) {
  const result = await runCompareInWorker(beforeText, afterText, options)
  updateBgp(result.bgp)
  updateIsis(result.isis)
  updateLdp(result.ldp)
  updateLdpPeer(result.ldpPeer)
  updateSrv6Sid(result.srv6)
  updateSrv6TePolicy(result.srv6TePolicy)
  updateInterface(result.interface)
  updateRoutingStat(result.routingStat)
  updateLldp(result.lldp)
  return result.counts
}

/** 单文件导入：只解析提取数据到表格，不做对比（当前无调用方，保留兼容导出） */
export async function loadSingle(text) {
  const { loadSinglePure } = await import('./compareCore.js')
  const r = loadSinglePure(text)
  updateBgp(r.bgp)
  updateIsis(r.isis)
  updateLdp(r.ldp)
  updateLdpPeer(r.ldpPeer)
  updateSrv6Sid(r.srv6)
  updateSrv6TePolicy(r.srv6TePolicy)
  updateInterface(r.interface)
  updateRoutingStat(r.routingStat)
  updateLldp(r.lldp)
  return r.counts
}