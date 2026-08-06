import { readFileSync } from 'node:fs'

const B = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const A = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'

function ifaceNames(txt) {
  const s = new Set()
  for (const ln of txt.split('\n')) { const m = ln.match(/^interface\s+(\S+)/); if (m) s.add(m[1]) }
  return s
}
function descMap(txt) {
  const map = new Map(); let cur = null
  for (const ln of txt.split('\n')) {
    const m = ln.match(/^interface\s+(\S+)/); if (m) { cur = m[1]; continue }
    const d = ln.match(/^\s*description\s+(.+)$/)
    if (d && cur) { const desc = d[1].trim(); map.set(desc, [...(map.get(desc) || []), cur]) }
  }
  return map
}
// 取某端口的完整配置块(到下一个顶层 interface 或 # 收尾)
function blockOf(txt, name) {
  const lines = txt.split('\n'); const out = []; let on = false; let depth = 0
  for (const ln of lines) {
    const m = ln.match(/^interface\s+(\S+)/)
    if (m) { if (m[1] === name) { on = true; out.push(ln); continue } else if (on) break }
    if (on) out.push(ln)
  }
  return out.join('\n')
}

const tB = readFileSync(B, 'utf8'), tA = readFileSync(A, 'utf8')
const ifB = ifaceNames(tB), ifA = ifaceNames(tA)
const dB = descMap(tB), dA = descMap(tA)

// 1) before-only(被移除)端口 + 其描述是否在 after 任何端口出现(改名迁移判定)
const beforeOnly = [...ifB].filter((n) => !ifA.has(n))
let renamedAway = 0
const removedSamples = []
for (const n of beforeOnly) {
  let desc = null
  for (const [d, names] of dB) { if (names.includes(n)) { desc = d; break } }
  const stillThere = desc && dA.has(desc) // after 有同描述端口 => 改名迁移
  if (stillThere) renamedAway++
  if (removedSamples.length < 8) removedSamples.push(`  ${n}  desc="${desc || '(无)'}"  ${stillThere ? '=> 在 after 以新名存在(改名迁移)' : '=> after 无此描述(可能真删除/未迁移)'}`)
}
console.log('before 独有端口(被移除/改名)总数:', beforeOnly.length)
console.log('  其中描述在 after 仍有匹配 (判定为改名迁移):', renamedAway)
console.log('--- before 被移除端口样例 ---')
removedSamples.forEach((s) => console.log(s))

// 2) 抽样 3 个 after-only 新端口, 看是空壳还是满配
console.log('\n--- after 新增端口配置深度抽样 ---')
const afterOnly = [...ifA].filter((n) => !ifB.has(n))
for (const n of afterOnly.slice(0, 3)) {
  const blk = blockOf(tA, n)
  const lns = blk.split('\n').filter((x) => x.trim() && !x.startsWith('interface'))
  console.log(`\n# ${n} (${lns.length} 行配置):`)
  lns.slice(0, 12).forEach((l) => console.log('   ' + l.trim()))
}
