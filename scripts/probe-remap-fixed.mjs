import { readFileSync } from 'node:fs'

const B = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const A = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'
const lb = readFileSync(B,'utf8').split('\n'), la = readFileSync(A,'utf8').split('\n')

// 稳健抽取: 每块接口 -> description(取首次出现的 description 关键词之后内容)
function blockDescs(lines) {
  const map = new Map() // iface -> desc
  let cur = null
  for (const ln of lines) {
    const m = ln.match(/^interface\s+(\S+)/); if (m) { cur = m[1]; continue }
    const d = ln.match(/description\s+(\S.*?)\s*$/i)
    if (d && cur) { map.set(cur, d[1].trim()); break } // 取首个 description
  }
  return map
}
const dB = blockDescs(lb), dA = blockDescs(la)
const ifb = new Set(lb.filter(l=>/^interface\s+/.test(l)).map(l=>l.split(/\s+/)[1]))
const ifa = la.filter(l=>/^interface\s+/.test(l)).map(l=>l.split(/\s+/)[1])
const afterOnly = ifa.filter(n=>!ifb.has(n))

console.log('before 接口数:', ifb.size, ' after 接口数:', ifa.length, ' afterOnly:', afterOnly.length)
console.log('before 有 desc 接口:', dB.size, ' after 有 desc 接口:', dA.size)

// afterOnly 端口中, desc 在 before 任意接口 desc 集合出现 -> 改名迁移对
const beforeDescSet = new Set([...dB.values()])
let descMatch = 0, samples = []
for (const n of afterOnly) {
  const d = dA.get(n)
  if (d && beforeDescSet.has(d)) { descMatch++; if (samples.length < 10) samples.push(`${n} <= "${d}"`) }
}
console.log('afterOnly 端口中, 经 description 精确匹配到 before 链路(改名迁移):', descMatch)
samples.forEach(s=>console.log('   ', s))

// 也统计"同名端口 desc 是否一致"(文档可能把这类也算进描述对)
let sameNameDescMatch = 0
for (const n of ifa) { if (ifb.has(n) && dB.get(n) && dA.get(n) && dB.get(n)===dA.get(n)) sameNameDescMatch++ }
console.log('同名端口且 desc 一致(非改名):', sameNameDescMatch)
