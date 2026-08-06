import { readFileSync } from 'node:fs'
const B = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const A = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'
const lb = readFileSync(B,'utf8').split('\n'), la = readFileSync(A,'utf8').split('\n')

// 正确块作用域: 顶层命令(非缩进)开始新块; interface 块内缩进行取其 description
function ifaceDescs(lines) {
  const map = new Map(); let cur = null
  for (const ln of lines) {
    if (/^\S/.test(ln)) { // 顶层
      const m = ln.match(/^interface\s+(\S+)/); cur = m ? m[1] : null; continue
    }
    const d = ln.match(/description\s+(\S.*?)\s*$/i)
    if (d && cur && !map.has(cur)) map.set(cur, d[1].trim())
  }
  return map
}
const dB = ifaceDescs(lb), dA = ifaceDescs(la)
const ifb = new Set(lb.filter(l=>/^interface\s+/.test(l)).map(l=>l.split(/\s+/)[1]))
const ifa = la.filter(l=>/^interface\s+/.test(l)).map(l=>l.split(/\s+/)[1])
const afterOnly = ifa.filter(n=>!ifb.has(n))
console.log('before 接口总数:', ifb.size, ' 其中带 description 接口:', dB.size)
console.log('after  接口总数:', ifa.length, ' 其中带 description 接口:', dA.size)
console.log('afterOnly(改名/新增)端口:', afterOnly.length)
const beforeDescSet = new Set([...dB.values()])
let descMatch = 0; const samples = []
for (const n of afterOnly) {
  const d = dA.get(n)
  if (d && beforeDescSet.has(d)) { descMatch++; if (samples.length<10) samples.push(`${n} <= "${d}"`) }
}
console.log('afterOnly 端口中, 经 interface-description 精确匹配到 before(改名迁移对):', descMatch)
samples.forEach(s=>console.log('   ',s))
console.log('before 接口 description 样例(前6):')
let c = 0
for (const [k,v] of dB) { if (c++ >= 6) break; console.log('   ',k,'=>',v) }
