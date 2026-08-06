// 采集侧（设备采集）独立的模块实例集合。
// 所有采集侧页面/组件（DevicePage、InterfaceInfoModule、HomePage）共享同一实例，
// 但完全独立于对比侧（compare.js 内部维护的对比实例），两侧互不影响。
import { useBgpModule } from './bgp.js'
import { useIsisModule } from './isis.js'
import { useLdpModule } from './ldp.js'
import { useLdpPeerModule } from './ldpPeer.js'
import { useSrv6SidModule } from './srv6Sid.js'
import { useInterfaceModule } from './interfaceInfo.js'
import { useOspfModule } from './ospf.js'
import { useArpModule } from './arp.js'
import { useIpv6NeighModule } from './ipv6neigh.js'
import { useSrv6TePolicyModule } from './srv6TePolicy.js'
import { useLldpModule } from './lldp.js'
import { useRoutingStatModule } from './routingStat.js'

export const collectScope = {
  bgp: useBgpModule(),
  isis: useIsisModule(),
  ldp: useLdpModule(),
  ldpPeer: useLdpPeerModule(),
  srv6: useSrv6SidModule(),
  interface: useInterfaceModule(),
  ospf: useOspfModule(),
  arp: useArpModule(),
  ipv6neigh: useIpv6NeighModule(),
  srv6TePolicy: useSrv6TePolicyModule(),
  lldp: useLldpModule(),
  routingStat: useRoutingStatModule()
}
