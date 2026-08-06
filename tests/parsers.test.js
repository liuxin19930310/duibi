// 核心解析器单元测试（Node 内置 test runner，无需额外依赖）
// 运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBgpSummary, runComparePure, parseDeviceProtocolsPure, parseLiveStatusPure, parseGlobalConfig } from '../src/utils/compareCore.js'
import { useIsisModule } from '../src/utils/isis.js'
import { useLdpModule } from '../src/utils/ldp.js'
import { useSrv6SidModule } from '../src/utils/srv6Sid.js'
import { useInterfaceModule } from '../src/utils/interfaceInfo.js'
import { hashText } from '../src/utils/snapshots.js'
import * as deviceParser from '../src/utils/deviceParser.js'
import { findTemplateIn, templatesForVendorIn, resolveCollectIn } from '../src/utils/collectTemplates.js'

const isisMod = useIsisModule()
const ldpMod = useLdpModule()
const srv6Mod = useSrv6SidModule()
const ifaceMod = useInterfaceModule()

test('parseBgpSummary：解析 display bgp peer 表格（含 IPv4/IPv6 邻居）', () => {
  const text = `<HUAWEI>display bgp peer
 BGP local router ID : 10.0.0.1
 Local AS number : 65001
 Total number of peers : 2
 Address Family: IPv4 Unicast
 Peer          AS       MsgRcvd  MsgSent OutQ  Up/Down State   RtRcv  RtSent
 10.1.1.2      65002    100      100     0     01:02:03 Established  500   500
 Address Family: IPv6 Unicast
 Peer          AS       MsgRcvd  MsgSent OutQ  Up/Down State   RtRcv  RtSent
 2001:db8::2   65003    200      200     0     02:03:04 Established  300   300
`
  const peers = parseBgpSummary(text)
  assert.equal(peers.length, 2)
  assert.equal(peers[0].neighborIp, '10.1.1.2')
  assert.equal(peers[0].remoteAs, '65002')
  assert.equal(peers[0].sessionState, 'Established')
  assert.equal(peers[0].routesReceived, 500)
  assert.equal(peers[0].routesSent, 500)
  assert.equal(peers[0].addressType, 'IPv4')
  assert.equal(peers[0].addressFamily, 'IPv4 Unicast')
  assert.equal(peers[1].addressFamily, 'IPv6 Unicast')
  assert.equal(peers[1].neighborIp, '2001:db8::2')
  assert.equal(peers[1].addressType, 'IPv6')
})

test('parseIsisStatusLog + merge：解析 display isis peer（systemId 独占行格式）', () => {
  const text = `<HUAWEI>display isis peer

                          Peer information for IS-IS(1)
---------------------------------------------------------------------------
 System Id            Interface    Circuit Id      State Type HoldTime  MTU
 NXYC-AR1
                      GE0/0/1      0000.0000.0001   Up   L1   30s       1497
`
  const rows = isisMod.mergeIsisStatusToTable(isisMod.parseIsisStatusLog(text))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].systemId, 'NXYC-AR1')
  assert.equal(rows[0].interface, 'GE0/0/1')
  assert.equal(rows[0].state, 'Up')
  assert.equal(rows[0].type, 'L1')
  assert.equal(rows[0].holdTime, '30s')
})

test('parseLdpSessionLog + merge：解析 display mpls ldp session', () => {
  const text = `<HUAWEI>display mpls ldp session
 LDP Session(s) in Public Network
 Codes: LAM - Label Advertisement Mode, SsnAge Unit: DDD:HH:MM

 PeerID             Status      LAM  SsnRole  SsnAge      KASent/Rcv
 10.0.0.2:0         Operational DU   Passive   000:00:02   16/16
`
  const rows = ldpMod.mergeLdpToTable(ldpMod.parseLdpSessionLog(text))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].peerId, '10.0.0.2:0')
  assert.equal(rows[0].status, 'Operational')
  assert.equal(rows[0].lam, 'DU')
  assert.equal(rows[0].ssnRole, 'Passive')
})

test('parseSrv6SidLog + merge：解析 local-sid 块', () => {
  const text = `<HUAWEI>display segment-routing ipv6 local-sid forwarding

 SID          : 24001:0:1:0:0:0:0:100
 FuncType     : End
 LocatorName  : loc1
 LocatorID    : 1

 SID          : 24001:0:1:0:0:0:0:200
 FuncType     : End.X
 LocatorName  : loc1
 LocatorID    : 1
`
  const rows = srv6Mod.mergeSrv6SidToTable(srv6Mod.parseSrv6SidLog(text))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].sid, '24001:0:1:0:0:0:0:100')
  assert.equal(rows[0].funcType, 'End')
  assert.equal(rows[0].locatorName, 'loc1')
  assert.equal(rows[1].funcType, 'End.X')
})

test('parseInterfaceInfoLog：解析 display interface（UP/Down、描述、MTU）', () => {
  const text = `<HUAWEI>display interface
GigabitEthernet0/0/1 current state : UP (ifindex: 1)
Line protocol current state : UP
Description: to-CORE
The Maximum Transmit Unit is 1500
Internet Address is 10.1.1.1/24

GigabitEthernet0/0/2 current state : down
Line protocol current state : DOWN
`
  const map = ifaceMod.parseInterfaceInfoLog(text)
  assert.equal(map['GigabitEthernet0/0/1'].portStatus, 'UP')
  assert.equal(map['GigabitEthernet0/0/1'].description, 'to-CORE')
  assert.equal(map['GigabitEthernet0/0/1'].mtu, '1500')
  assert.equal(map['GigabitEthernet0/0/2'].portStatus, 'Down')
})

test('解析逻辑去重：interfaceInfo 复用 deviceParser 的纯解析实现', () => {
  assert.equal(ifaceMod.parseInterfaceInfoLog, deviceParser.parseInterfaceInfoLog)
  assert.equal(ifaceMod.parseInterfaceBrief, deviceParser.parseInterfaceBrief)
  assert.equal(ifaceMod.parseConfigForIpAddress, deviceParser.parseConfigForIpAddress)
  assert.equal(ifaceMod.parseConfigForIsisCost, deviceParser.parseConfigForIsisCost)
  assert.equal(ifaceMod.parseConfigForDescription, deviceParser.parseConfigForDescription)
  assert.equal(ifaceMod.parseConfigForEthTrunkMembers, deviceParser.parseConfigForEthTrunkMembers)
  assert.equal(ifaceMod.parseConfigForVrf, deviceParser.parseConfigForVrf)
})

test('runComparePure：纯解析+比对返回可克隆数据（Web Worker 协议）', () => {
  const before = `<HUAWEI>display bgp peer
 BGP local router ID : 10.0.0.1
 Local AS number : 65001
 Total number of peers : 2
 Peer          AS       MsgRcvd  MsgSent OutQ  Up/Down State   RtRcv  RtSent
 10.1.1.2      65002    100      100     0     01:02:03 Established  500   500
 10.1.1.3      65003    200      200     0     02:03:04 Established  300   300
`
  const after = before.replace('02:03:04', '03:03:04').replace('Established  300', 'Established  320')
  const result = runComparePure(before, after, { ignoreWhitespace: true, ignoreCase: true })
  assert.equal(result.counts.bgpCount, 2)
  assert.equal(result.bgp.length, 2)
  const diffRows = result.bgp.filter(r => r.isConsistent === false)
  assert.equal(diffRows.length, 1)
  assert.equal(diffRows[0].configDiffFields.length > 0, true)
  // 结果必须可结构化克隆：仅含普通对象/数组/字符串/数字/布尔/null
  assert.equal(JSON.parse(JSON.stringify(result.bgp)).length, 2)
})
test('parseLiveStatusPure：先 parse 再 merge（修复接口面板垃圾行 bug）', () => {
  const text = `<HUAWEI>display interface
GigabitEthernet0/0/1 current state : UP (ifindex: 1)
Line protocol current state : UP
Description: to-CORE
The Maximum Transmit Unit is 1500
Internet Address is 10.1.1.1/24
`
  const r = parseLiveStatusPure(text)
  assert.equal(r.iface.length, 1)
  assert.equal(r.iface[0].interfaceName, 'GigabitEthernet0/0/1')
  assert.equal(r.iface[0].portStatus, 'UP')
  assert.equal(r.iface[0].mtu, '1500')
})

test('parseDeviceProtocolsPure：配置解析页协议 + 设备信息', () => {
  const text = `<HUAWEI>display bgp peer
 BGP local router ID : 10.0.0.1
 Local AS number : 65001
 Total number of peers : 1
 Peer          AS       MsgRcvd  MsgSent OutQ  Up/Down State   RtRcv  RtSent
 10.1.1.2      65002    100      100     0     01:02:03 Established  500   500

<HUAWEI>display current-configuration
sysname NXYC-AR2
#
interface GigabitEthernet0/0/1
 description to-CORE
 ip address 10.1.1.1 255.255.255.0
#
`
  const r = parseDeviceProtocolsPure(text, 'huawei')
  assert.equal(r.bgp.length, 1)
  assert.equal(r.bgp[0].neighborIp, '10.1.1.2')
  assert.equal(r.bgp[0].neighborState, 'Established')
  assert.equal(r.deviceInfo.hostname, 'NXYC-AR2')
  assert.equal(r.interfaces.length >= 1, true)
  assert.ok(r.bgpStat && r.ospfStat)
})
test('采集命令模板：自定义模板解析逻辑', () => {
  const templates = [
    { id: 't1', name: '华为 · 仅配置', vendor: 'huawei', scope: 'config', commands: ['display current-configuration'] },
    { id: 't2', name: '华为 · 仅状态', vendor: 'huawei', scope: 'status', commands: ['display interface', 'display ip interface brief'] },
    { id: 't3', name: '华三 · 全量', vendor: 'h3c', scope: 'full', commands: ['display current-configuration', 'display interface'] }
  ]
  assert.equal(templatesForVendorIn(templates, 'huawei').length, 2)
  const tpl = findTemplateIn(templates, 't2')
  assert.deepEqual(tpl.commands, ['display interface', 'display ip interface brief'])
  // 选中模板 → 使用模板命令与 scope
  const r1 = resolveCollectIn(templates, 't2', 'huawei', 'config')
  assert.equal(r1.scope, 'status')
  assert.ok(r1.commands.includes('display interface'))
  // 未选模板 → commands 为空，后端按 scope 内置生成
  const r2 = resolveCollectIn(templates, '', 'huawei', 'full')
  assert.equal(r2.commands, undefined)
  assert.equal(r2.scope, 'full')
  // 模板厂商与目标设备不匹配 → 忽略模板
  const r3 = resolveCollectIn(templates, 't3', 'huawei', 'config')
  assert.equal(r3.commands, undefined)
  assert.equal(r3.scope, 'config')
})
test('hashText：相同文本哈希一致、不同长度不同哈希', () => {
  const a = 'router bgp 100\npeer 1.1.1.1\n'
  assert.equal(hashText(a), hashText(a))
  assert.notEqual(hashText(a), hashText(a + ' '))
  assert.equal(hashText(''), hashText(''))
})

test('parseGlobalConfig：华为全局配置解析（系统/服务/统计）', () => {
  const text = `#
sysname SW-CORE-01
#
clock timezone Beijing add 08:00:00
dns server 8.8.8.8
dns domain example.com
#
ntp-service enable
ntp-service server 10.0.0.1
ntp-service server 10.0.0.2
#
snmp-agent
snmp-agent community read public
snmp-agent community write private
#
ssh server enable
#
info-center enable
#
interface Vlanif1
 ip address 1.1.1.1 255.255.255.0
#
vlan 10
vlan 20
vlan 30 to 40
#
ip route-static 192.168.0.0 255.255.255.0 10.0.0.254
bgp 65001
#
acl number 2001
acl 2002
`
  const rows = parseGlobalConfig(text, 'huawei')
  const get = (item) => { const r = rows.find(x => x.item === item); return r ? r.value : null }
  assert.equal(get('系统名称'), 'SW-CORE-01')
  assert.equal(get('NTP 服务器'), '10.0.0.1、10.0.0.2')
  assert.ok(get('SNMP').includes('已启用'))
  assert.ok(get('SNMP').includes('public'))
  assert.equal(get('SSH 服务'), '已启用')
  assert.equal(get('Telnet 服务'), '未启用')
  assert.equal(get('DNS 服务器'), '8.8.8.8')
  assert.equal(get('域名'), 'example.com')
  assert.equal(get('VLAN 数量'), '3')
  assert.equal(get('静态路由数'), '1')
  assert.equal(get('BGP AS 号'), '65001')
  assert.equal(get('ACL 数量'), '2')
})

test('parseGlobalConfig：华三配置（H3C 型号 / ntp server / telnet）与空配置', () => {
  const text = `#
sysname H3C-AGG
#
H3C S5560-X-30C-EI
#
ntp server 10.1.1.1
snmp-agent
snmp-agent sys-info version v2c
telnet server enable
`
  const rows = parseGlobalConfig(text, 'h3c')
  const get = (item) => { const r = rows.find(x => x.item === item); return r ? r.value : null }
  assert.equal(get('设备型号'), 'S5560-X-30C-EI')
  assert.equal(get('NTP 服务器'), '10.1.1.1')
  assert.equal(get('Telnet 服务'), '已启用')
  assert.equal(get('SNMP'), '已启用')

  const empty = parseGlobalConfig('', 'huawei')
  assert.ok(empty.length > 0)
  assert.equal(empty.find(x => x.item === '系统名称').value, '—')
})