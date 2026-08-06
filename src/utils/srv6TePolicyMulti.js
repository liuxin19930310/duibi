// src/utils/srv6TePolicyMulti.js
// SRv6 TE Policy 多设备割接对比工具：
//   - extractDeviceName：从日志正文提取设备名（取 <hostname> 提示符，失败回退文件名）
//   - diffDevicePolicies：单设备「割接前/后」按策略名称比对，输出逐策略差异行
//   - buildDevicePairs：将「割接前」「割接后」多文件按设备名配对
// 复用了 srv6TePolicy.js 的解析能力，与配置对比页(compare.js)的 SRv6 TE Policy 比对口径一致。
import { useSrv6TePolicyModule } from './srv6TePolicy.js'

const mod = useSrv6TePolicyModule()
const parseSrv6TePolicyLog = mod.parseSrv6TePolicyLog

// 从日志正文提取设备名。华为/华三日志首行提示符形如 <HOSTNAME>display ...
export function extractDeviceName(text, fileName = '') {
  if (text) {
    const m = text.match(/<([^>\r\n]+)>/)
    if (m && m[1] && m[1].trim()) return m[1].trim()
  }
  // 回退：文件名去常见前后缀（_OLD/_NEW/_BEFORE/_AFTER/前/后 等）与扩展名
  let base = (fileName || '').replace(/\.[^./\\]+$/, '')
  base = base.replace(/[_\-]?(old|new|before|after|b|a|前|后)$/i, '')
  return base || (fileName || 'unknown')
}

// 单设备前后对比：按策略名称匹配，逐字段比对
// 返回 { rows, stats }；rows 每项含 _key / configDiffFields / isConsistent / policyState(覆盖为 新增策略|已失效|实际状态)
export function diffDevicePolicies(beforeText, afterText) {
  const normVal = (v) => (v == null ? '' : String(v)).trim().replace(/\s+/g, ' ')
  const before = parseSrv6TePolicyLog(beforeText || '')
  const after = parseSrv6TePolicyLog(afterText || '')
  const afterMap = new Map(after.map(i => [i.policyName, i]))
  // 仅对比「状态（Policy State）」与「Candidate-path Count」两个字段（设备名用于配对）。
  // Color / Endpoint / TunnelId / State Change Time / Binding SID 仅展示，不参与差异判定。
  const fields = ['policyState', 'candidatePathCount']
  const rows = []
  for (const b of before) {
    const a = afterMap.get(b.policyName)
    if (a) {
      const diffFields = []
      fields.forEach(f => {
        if (normVal(b[f]) !== normVal(a[f])) diffFields.push({ field: f, beforeVal: String(b[f] ?? '-'), afterVal: String(a[f] ?? '-') })
      })
      rows.push({ ...a, policyName: b.policyName, _key: b.policyName, isConsistent: diffFields.length === 0, configDiffFields: diffFields })
      afterMap.delete(b.policyName)
    } else {
      rows.push({
        ...b,
        policyName: b.policyName,
        _key: b.policyName,
        isConsistent: false,
        configDiffFields: [{ field: 'policyState', beforeVal: String(b.policyState ?? '-'), afterVal: '已失效' }],
        policyState: '已失效'
      })
    }
  }
  for (const [, a] of afterMap) {
    rows.push({
      ...a,
      policyName: a.policyName,
      _key: a.policyName,
      isConsistent: false,
      configDiffFields: [{ field: 'policyState', beforeVal: '-', afterVal: String(a.policyState ?? '-') }],
      policyState: '新增策略'
    })
  }
  const stats = {
    total: rows.length,
    consistent: rows.filter(r => r.isConsistent === true).length,
    changed: rows.filter(r => r.isConsistent === false && r.policyState !== '已失效' && r.policyState !== '新增策略').length,
    added: rows.filter(r => r.policyState === '新增策略').length,
    removed: rows.filter(r => r.policyState === '已失效').length
  }
  return { rows, stats }
}

// 配对：beforeFiles / afterFiles 形如 [{ id, device, fileName, text }]
export function buildDevicePairs(beforeFiles, afterFiles) {
  const bMap = new Map(beforeFiles.map(f => [f.device, f]))
  const aMap = new Map(afterFiles.map(f => [f.device, f]))
  const devices = [...new Set([...bMap.keys(), ...aMap.keys()])].sort((a, b) => a.localeCompare(b))
  const pairs = []
  const onlyBefore = []
  const onlyAfter = []
  for (const d of devices) {
    const b = bMap.get(d)
    const a = aMap.get(d)
    if (b && a) pairs.push({ device: d, before: b, after: a })
    else if (b) onlyBefore.push(b)
    else if (a) onlyAfter.push(a)
  }
  return { pairs, onlyBefore, onlyAfter }
}
