import { readFileSync } from 'node:fs'

const B = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const A = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'

// 提取 接口名 + 其 description（按块扫描，仅取配置接口行，跳过 display 输出）
function ifaceNames(txt) {
  const set = new Set()
  for (const ln of txt.split('\n')) {
    const m = ln.match(/^interface\s+(\S+)/)
    if (m) set.add(m[1])
  }
  return set
}
// 提取 description 映射 desc -> [ifaceNames]
function descMap(txt) {
  const map = new Map()
  let cur = null
  for (const ln of txt.split('\n')) {
    const m = ln.match(/^interface\s+(\S+)/)
    if (m) { cur = m[1]; continue }
    const d = ln.match(/^\s*description\s+(.+)$/)
    if (d && cur) {
      const desc = d[1].trim()
      map.set(desc, [...(map.get(desc) || []), cur])
    }
  }
  return map
}

const tB = readFileSync(B, 'utf8'), tA = readFileSync(A, 'utf8')
const ifB = ifaceNames(tB), ifA = ifaceNames(tA)
const dB = descMap(tB), dA = descMap(tA)

const afterOnly = [...ifA].filter((n) => !ifB.has(n))
let remapped = 0, trulyNew = 0
const remapSamples = [], newSamples = []
for (const n of afterOnly) {
  let descOfN = null
  for (const [desc, names] of dA) { if (names.includes(n)) { descOfN = desc; break } }
  if (descOfN && dB.has(descOfN)) {
    remapped++
    if (remapSamples.length < 10) remapSamples.push(`  ${n}  <= "${descOfN}"  (before: ${(dB.get(descOfN)).join(',')})`)
  } else {
    trulyNew++
    if (newSamples.length < 10) newSamples.push(`  ${n}  desc="${descOfN || '(无 description)'}"`)
  }
}
console.log('after 独有端口名总数:', afterOnly.length)
console.log('  其中按 description 匹配到 before 链路 (改名迁移端口):', remapped)
console.log('  其中 description 在 before 无匹配 (真正新增端口):', trulyNew)
console.log('\n--- 改名迁移样例 (新端口 <= 老描述, 即同一条链路仅端口改名) ---')
remapSamples.forEach((s) => console.log(s))
console.log('\n--- 真正新增端口样例 ---')
newSamples.forEach((s) => console.log(s))
