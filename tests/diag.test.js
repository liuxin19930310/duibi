// AI 解析诊断核心逻辑单元测试
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatModuleSummary,
  buildDiagnoseInput,
  buildDiagnosePrompt,
  parseDiagnoseIssues
} from '../src/utils/diagCore.js'

test('formatModuleSummary：单行紧凑摘要、空模块、超长截断', () => {
  const module = {
    name: 'BGP 协议',
    fields: ['neighborIp', 'remoteAs', 'neighborState'],
    list: [
      { neighborIp: '10.1.1.2', remoteAs: '65002', neighborState: 'Established' },
      { neighborIp: '10.1.1.3', remoteAs: '65003', neighborState: 'Idle' }
    ]
  }
  const s = formatModuleSummary(module)
  assert.ok(s.includes('【BGP 协议】共 2 行'))
  assert.ok(s.includes('1. 10.1.1.2 | 65002 | Established'))
  assert.ok(s.includes('2. 10.1.1.3 | 65003 | Idle'))

  assert.ok(formatModuleSummary({ name: 'LLDP', fields: [], list: [] }).includes('（无数据）'))

  const many = Array.from({ length: 35 }, (_, i) => ({ interfaceName: 'GE' + i, portStatus: 'up' }))
  const long = formatModuleSummary({ name: '接口信息', fields: ['interfaceName', 'portStatus'], list: many })
  assert.ok(long.includes('（其余 5 行省略）'))
  assert.ok(!long.includes('GE30'))
})

test('buildDiagnoseInput：多模块拼接 + 配置截断', () => {
  const modules = [
    { name: 'BGP', fields: ['neighborIp'], list: [{ neighborIp: '10.1.1.2' }] },
    { name: 'ISIS', fields: ['peerSystemId'], list: [] }
  ]
  const input = buildDiagnoseInput(modules, 'x'.repeat(8000))
  assert.ok(input.summaries.includes('【BGP】'))
  assert.ok(input.summaries.includes('【ISIS】'))
  assert.equal(input.config.length, 6000)
  assert.equal(input.totalConfigChars, 8000)
})

test('buildDiagnosePrompt：包含解析结果、配置节选与 JSON 输出要求', () => {
  const { system, user } = buildDiagnosePrompt({ summaries: '【BGP】...', config: 'sysname X', totalConfigChars: 100 })
  assert.ok(user.includes('【解析结果】'))
  assert.ok(user.includes('【配置节选】'))
  assert.ok(user.includes('sysname X'))
  assert.ok(user.includes('100 字符'))
  assert.ok(user.includes('severity'))
  assert.ok(system.includes('交叉核对'))
})

test('parseDiagnoseIssues：解析 JSON、markdown 包裹、severity 归一化、过滤无效', () => {
  const raw = '```json\n' +
    '[{"module":"BGP","key":"10.1.1.2","field":"neighborState","issue":"邻居状态 Idle","severity":"HIGH","suggestion":"检查连通性","evidence":"解析值 Idle"},' +
    '{"module":"接口","key":"GE0/0/1","issue":"接口 shutdown","severity":"中"},' +
    '{"module":"x","issue":""}]\n```'
  const issues = parseDiagnoseIssues(raw)
  assert.equal(issues.length, 2)
  assert.equal(issues[0].severity, 'high')
  assert.equal(issues[1].severity, 'medium')
  assert.equal(issues[0].module, 'BGP')
  assert.equal(issues[0].suggestion, '检查连通性')
  assert.ok(issues[0].id)
  assert.deepEqual(parseDiagnoseIssues('模型没有发现问题'), [])
})
