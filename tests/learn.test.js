// AI 自我学习核心逻辑单元测试（Node 内置 test runner）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collectUnknownLines,
  extractCaseValue,
  applyCasesToResult,
  buildLearnPrompt,
  parseCaseSuggestions,
  LEARN_FIELDS,
  countUncovered,
  shouldAutoLearn,
  normalizeCasePattern,
  patternsSimilar,
  mergeCasesWithDedup
} from '../src/utils/learnCore.js'

test('collectUnknownLines：收集接口块内未识别命令，跳过已知命令', () => {
  const text = `#
sysname HUAWEI-CORE
#
interface GigabitEthernet0/0/1
 description to-agg-01
 ip address 10.1.1.1 255.255.255.0
 port link-type trunk
 port trunk allow-pass vlan 2 to 4094
 unknown-command foo bar
 speed 1000
#
interface GigabitEthernet0/0/2
 shutdown
 another-unknown x
#
`
  const lines = collectUnknownLines(text, 'huawei')
  assert.ok(lines.some(l => l.iface === 'GigabitEthernet0/0/1' && l.line === 'unknown-command foo bar'))
  assert.ok(lines.some(l => l.iface === 'GigabitEthernet0/0/2' && l.line === 'another-unknown x'))
  assert.ok(lines.every(l => l.line !== 'port link-type trunk'))
  assert.ok(lines.every(l => l.line !== 'port trunk allow-pass vlan 2 to 4094'))
  assert.ok(lines.every(l => l.line !== 'description to-agg-01'))
  assert.ok(lines.every(l => l.line !== 'ip address 10.1.1.1 255.255.255.0'))
})

test('collectUnknownLines：跳过 display 回显与提示符区', () => {
  const text = `<HUAWEI>display interface brief
Interface  PHY   Protocol InUti OutUti inErrors outErrors
GE0/0/1    up    up       0.1%   0.2%   0        0
<HUAWEI>display current-configuration
#
interface GigabitEthernet0/0/1
 description core-uplink
#
`
  const lines = collectUnknownLines(text, 'huawei')
  assert.equal(lines.length, 0)
})

test('collectUnknownLines：同接口同命令去重，非配置区不收集', () => {
  const text = `#
interface GigabitEthernet0/0/1
 foo bar 1
 foo bar 1
#
interface GigabitEthernet0/0/2
 foo bar 2
#
`
  const lines = collectUnknownLines(text)
  assert.equal(lines.length, 2)
  assert.equal(lines.filter(l => l.line === 'foo bar 1').length, 1)
})

test('extractCaseValue：捕获组、整行模板、非法正则', () => {
  assert.equal(extractCaseValue(' latency-compensate 100', { pattern: '^latency-compensate\\s+(\\d+)$', extract: '$1' }), '100')
  assert.equal(extractCaseValue(' isolation enable', { pattern: '^isolation\\s+enable$', extract: '${line}' }), 'isolation enable')
  assert.equal(extractCaseValue('x', { pattern: 'bad [', extract: '$1' }), null)
  assert.equal(extractCaseValue('x', { pattern: '^nomatch$', extract: '$1' }), null)
})

test('applyCasesToResult：命中修正空字段并记录命中，非空字段不覆盖', () => {
  const rows = [{ interfaceName: 'GigabitEthernet0/0/1', description: '-', mtu: '-' }]
  const unknown = [
    { iface: 'GigabitEthernet0/0/1', line: ' link-delay down 100', vendor: 'huawei' },
    { iface: 'GigabitEthernet0/0/2', line: ' mtu 9000', vendor: 'huawei' }
  ]
  const cases = [
    { id: 'c1', vendor: 'huawei', pattern: '^link-delay\\s+down\\s+(\\d+)$', field: 'mtu', extract: '$1', status: 'active' },
    { id: 'c2', vendor: 'huawei', pattern: '^mtu\\s+(\\d+)$', field: 'mtu', extract: '$1', status: 'active' }
  ]
  const { hits, applied } = applyCasesToResult(rows, unknown, cases)
  assert.equal(rows[0].mtu, '100')
  assert.equal(hits.length, 1)
  assert.equal(applied, 1)
  assert.deepEqual(rows[0].aiFixed, ['mtu'])
})

test('applyCasesToResult：停用案例、厂商不匹配、非法字段均跳过', () => {
  const rows = [{ interfaceName: 'XGE1/0/1', ipv4: '-' }]
  const unknown = [{ iface: 'XGE1/0/1', line: ' ip address 1.2.3.4 255.255.255.0', vendor: 'h3c' }]
  const cases = [
    { id: 'd1', vendor: 'huawei', pattern: '^ip\\s+address\\s+(\\S+)', field: 'ipv4', extract: '$1', status: 'active' },
    { id: 'd2', vendor: '', pattern: '^ip\\s+address\\s+(\\S+)', field: 'ipv4', extract: '$1', status: 'disabled' },
    { id: 'd3', vendor: '', pattern: '^ip\\s+address\\s+(\\S+)', field: 'not_a_field', extract: '$1', status: 'active' }
  ]
  const { hits } = applyCasesToResult(rows, unknown, cases)
  assert.equal(hits.length, 0)
  assert.equal(rows[0].ipv4, '-')
})

test('buildLearnPrompt：包含厂商、字段清单与去重后的未知行', () => {
  const { system, user } = buildLearnPrompt([
    { line: 'a b c', iface: 'GE0/0/1' },
    { line: 'a b c', iface: 'GE0/0/2' },
    { line: 'd e f', iface: 'GE0/0/3' }
  ], 'huawei')
  assert.ok(user.includes('huawei'))
  assert.ok(user.includes('mtu'))
  assert.ok(user.includes('a b c'))
  assert.ok(user.indexOf('a b c') === user.lastIndexOf('a b c'))
  assert.ok(user.includes('d e f'))
  assert.ok(system.includes('华为'))
  assert.ok(Object.keys(LEARN_FIELDS).length >= 15)
})

test('parseCaseSuggestions：解析 markdown 包裹 JSON、中文字段名、过滤无效项', () => {
  const raw = '```json\n' +
    '[{"pattern":"^link-delay\\\\s+down\\\\s+(\\\\d+)$","field":"mtu","extract":"$1","sample":" link-delay down 100","reason":"链路延迟"},' +
    '{"pattern":"^foo$","field":"不存在的字段","extract":"$1"}]\n```'
  const s = parseCaseSuggestions(raw)
  assert.equal(s.length, 1)
  assert.equal(s[0].field, 'mtu')
  assert.equal(s[0].extract, '$1')
  assert.equal(s[0].reason, '链路延迟')

  const zh = parseCaseSuggestions('[{"pattern":"^x$","field":"接口描述","extract":"$1"}]')
  assert.equal(zh[0].field, 'description')

  assert.deepEqual(parseCaseSuggestions('模型没有给出建议'), [])
  assert.deepEqual(parseCaseSuggestions('[{"pattern":""}]'), [])
})

test('countUncovered：统计未被案例覆盖的未识别行', () => {
  const unknown = [
    { iface: 'GE0/0/1', line: ' link-delay down 100', vendor: 'huawei' },
    { iface: 'GE0/0/2', line: ' hello-interval 30', vendor: 'huawei' },
    { iface: 'GE0/0/3', line: ' unknown-xyz abc', vendor: 'huawei' }
  ]
  const cases = [
    { id: 'c1', vendor: 'huawei', pattern: '^link-delay\\s+down\\s+(\\d+)$', field: 'mtu', extract: '$1', status: 'active' }
  ]
  const { covered, uncovered } = countUncovered(unknown, cases)
  assert.equal(covered.length, 1)
  assert.equal(covered[0].line, ' link-delay down 100')
  assert.equal(uncovered.length, 2)
})

test('shouldAutoLearn：开关/模型就绪/数量阈值/冷却期共同决定', () => {
  const base = { enabled: true, llmReady: true, uncoveredCount: 5, lastTs: 0 }
  assert.equal(shouldAutoLearn(base), true)
  assert.equal(shouldAutoLearn({ ...base, enabled: false }), false)
  assert.equal(shouldAutoLearn({ ...base, llmReady: false }), false)
  assert.equal(shouldAutoLearn({ ...base, uncoveredCount: 2 }), false)
  assert.equal(shouldAutoLearn({ ...base, uncoveredCount: 3 }), true)
  assert.equal(shouldAutoLearn({ ...base, lastTs: Date.now() - 5000 }), false)
  assert.equal(shouldAutoLearn({ ...base, lastTs: Date.now() - 40000 }), true)
})

test('normalizeCasePattern / patternsSimilar：归一化与编辑距离判定', () => {
  assert.equal(normalizeCasePattern('^Link-Delay   Down (\\d+)$'), '^link-delaydown(\\d+)$')
  assert.equal(patternsSimilar('^link-delay\\s+down\\s+(\\d+)$', '^link-delay\\s+down\\s+(\\d+)$'), true)
  assert.equal(patternsSimilar('^LINK-DELAY down (\\d+)$', '^link-delay\\s+down\\s+(\\d+)$'), true)
  assert.equal(patternsSimilar('^hello-interval (\\d+)$', '^hello-interval\\s+(\\d+)$'), true)
  assert.equal(patternsSimilar('^mtu\\s+(\\d+)$', '^link-delay\\s+down\\s+(\\d+)$'), false)
})

test('mergeCasesWithDedup：完全重复/相似合并、字段不同保留、统计正确', () => {
  const existing = [
    { id: 'a1', pattern: '^link-delay\\s+down\\s+(\\d+)$', field: 'mtu', extract: '$1', sample: 'old', hitCount: 5 }
  ]
  const incoming = [
    { id: 'b1', pattern: '^link-delay\\s+down\\s+(\\d+)$', field: 'mtu', extract: '$1', sample: 'new sample' },
    { id: 'b2', pattern: '^link-delay down (\\d+)$', field: 'mtu', extract: '$1' },
    { id: 'b3', pattern: '^link-delay\\s+down\\s+(\\d+)$', field: 'description', extract: '$1' },
    { id: 'b4', pattern: '^hello-interval\\s+(\\d+)$', field: 'mtu', extract: '$1' },
    { id: 'b5', pattern: '^x$', field: 'not_a_field', extract: '$1' },
    { id: 'b6', pattern: '', field: 'mtu', extract: '$1' }
  ]
  const { list, added, merged } = mergeCasesWithDedup(existing, incoming)
  assert.equal(merged, 2)
  assert.equal(added, 2)
  assert.equal(list.length, 3)
  const dup = list.find(c => c.id === 'a1')
  assert.equal(dup.sample, 'new sample')
  assert.equal(dup.hitCount, 5)
  assert.ok(list.some(c => c.id === 'b3'))
  assert.ok(list.some(c => c.id === 'b4'))
  assert.ok(!list.some(c => c.id === 'b5'))
  assert.ok(!list.some(c => c.id === 'b6'))
})

test('mergeCasesWithDedup：incoming 内部重复也合并', () => {
  const incoming = [
    { id: 'x1', pattern: '^foo\\s+(\\d+)$', field: 'mtu', extract: '$1' },
    { id: 'x2', pattern: '^foo (\\d+)$', field: 'mtu', extract: '$1' }
  ]
  const { list, added, merged } = mergeCasesWithDedup([], incoming)
  assert.equal(added, 1)
  assert.equal(merged, 1)
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'x1')
})