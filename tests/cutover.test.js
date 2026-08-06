// 割接迁移核查核心逻辑单元测试
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractIfaces,
  ifaceIps,
  ifaceDesc,
  buildPortPairs,
  comparePortPair,
  buildCutoverSummary,
  parseCutoverResult
} from '../src/utils/cutoverCheck.js'

const before = `#
sysname OLD-ROUTER
#
interface GigabitEthernet1/0/8
 description uplink-to-core
 ip address 10.0.0.1 255.255.255.0
 mtu 4470
#
interface GigabitEthernet1/0/12
 description To-HIHK-NPE-GE1/0/0-10GE
#
interface GigabitEthernet1/0/13
#
interface GigabitEthernet0/0/0
 duplex auto
 ip address 192.168.0.1 255.255.255.0
#
return
`

const after = `#
sysname NEW-ROUTER
#
interface GigabitEthernet3/0/24
 description uplink-to-core
 ip address 10.0.0.1 255.255.255.0
 mtu 9500
#
interface GigabitEthernet3/0/4
 description To-HIHK-NPE-GE1/0/0-10GE
#
interface GigabitEthernet3/0/6
#
interface GigabitEthernet0/0/0
 duplex auto
#
return
`

test('extractIfaces：提取接口块并跳过回显', () => {
  const text = '<HUAWEI>display current-configuration\n#\ninterface GigabitEthernet1/0/1\n description a\n ip address 1.1.1.1 255.255.255.0\n#\nreturn\n'
  const ifaces = extractIfaces(text)
  assert.deepEqual(Object.keys(ifaces), ['GigabitEthernet1/0/1'])
  assert.ok(ifaces['GigabitEthernet1/0/1'].includes('ip address 1.1.1.1 255.255.255.0'))
})

test('buildPortPairs：IP 匹配 + 描述匹配 + 未匹配统计', () => {
  const pairs = buildPortPairs(before, after)
  assert.equal(pairs.matched.length, 1)
  assert.equal(pairs.matched[0].before, 'GigabitEthernet1/0/8')
  assert.equal(pairs.matched[0].after, 'GigabitEthernet3/0/24')
  assert.equal(pairs.matched[0].conf, 'high')
  assert.equal(pairs.descMatched.length, 1)
  assert.equal(pairs.descMatched[0].before, 'GigabitEthernet1/0/12')
  assert.equal(pairs.descMatched[0].after, 'GigabitEthernet3/0/4')
  assert.ok(pairs.sameName.some(p => p.before === 'GigabitEthernet0/0/0' && p.after === 'GigabitEthernet0/0/0'))
  assert.ok(pairs.beforeOnly.includes('GigabitEthernet1/0/13'))
  assert.ok(pairs.afterOnly.includes('GigabitEthernet3/0/6'))
})

test('comparePortPair：检出丢失与新增配置行', () => {
  const bIf = extractIfaces(before)
  const aIf = extractIfaces(after)
  const d = comparePortPair(bIf['GigabitEthernet1/0/8'], aIf['GigabitEthernet3/0/24'])
  assert.ok(d.lost.includes('mtu 4470'))
  assert.ok(d.added.includes('mtu 9500'))
  assert.ok(!d.lost.includes('description uplink-to-core'))
  assert.ok(!d.lost.includes('ip address 10.0.0.1 255.255.255.0'))
})

test('buildCutoverSummary：包含接口规模与迁移对信息', () => {
  const s = buildCutoverSummary(before, after)
  assert.ok(s.includes('before 4 → after 4'))
  assert.ok(s.includes('IP 匹配 1 个'))
  assert.ok(s.includes('描述匹配 1 个'))
  assert.ok(s.includes('GigabitEthernet1/0/8→GigabitEthernet3/0/24'))
})

test('parseCutoverResult：解析 JSON / markdown 包裹 / 容错', () => {
  const raw = '```json\n{"themes":[{"title":"MTU 调整","modules":"interface","scale":"多端口","risk":"high"}],"risks":[{"severity":"high","title":"MTU 不一致","evidence":"mtu 4470->9500","suggestion":"确认对端"}],"verify":[{"group":"BGP","command":"display bgp peer","expect":"6 个邻居 Established"}]}\n```'
  const r = parseCutoverResult(raw)
  assert.equal(r.themes.length, 1)
  assert.equal(r.themes[0].title, 'MTU 调整')
  assert.equal(r.risks[0].severity, '极高')
  assert.equal(r.verify[0].command, 'display bgp peer')
  assert.deepEqual(parseCutoverResult('模型没有返回'), { themes: [], risks: [], verify: [], raw: '模型没有返回' })
})
