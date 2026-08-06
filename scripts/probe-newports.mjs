import { readFileSync } from 'node:fs'
import { runComparePure } from '../src/utils/compareCore.js'
const B='C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const A='C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'
const r = runComparePure(readFileSync(B,'utf8'), readFileSync(A,'utf8'), {vendor:'huawei'})
const ifs = r.interface || []
// 结构化diff里出现的接口名(取 before/after 任一侧)
const diffNames = new Set()
for (const it of ifs) {
  const n = it._key || (it.interfaceName||'').replace(/ vs .*/,'') 
  if (n) diffNames.add(n)
}
// 计算真实『后独有』接口
const execSync = (await import('node:child_process')).execSync
const ifB = execSync('grep -oE "^interface [^ ]+" "'+B+'" | sed "s/^interface //" | sort -u').toString().split('\n').filter(Boolean)
const ifA = execSync('grep -oE "^interface [^ ]+" "'+A+'" | sed "s/^interface //" | sort -u').toString().split('\n').filter(Boolean)
const setB = new Set(ifB)
const newPorts = ifA.filter(n => !setB.has(n))
console.log('真实新增端口数:', newPorts.length)
console.log('结构化diff捕获的接口数:', diffNames.size)
const captured = newPorts.filter(n => diffNames.has(n))
console.log('其中被结构化diff捕获的新增端口数:', captured.length)
if (captured.length) console.log('  捕获样例:', captured.slice(0,5))
