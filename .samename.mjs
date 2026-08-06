import fs from 'node:fs'
import { extractIfaces, ifaceIps, buildPortPairs } from './src/utils/cutoverCheck.js'

const DIR = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹'
const beforeText = fs.readFileSync(DIR + '/割接前.log', 'utf8')
const afterText = fs.readFileSync(DIR + '/割接后.log', 'utf8')
const bIf = extractIfaces(beforeText)
const aIf = extractIfaces(afterText)
const pairs = buildPortPairs(beforeText, afterText)

// 同名匹配：before 未匹配端口，若 after 有同名且未匹配 → 配对
const aMatchedNames = new Set(pairs.matched.map(p => p.after).concat(pairs.descMatched.map(p => p.after)))
const sameName = []
for (const n of pairs.beforeOnly) {
  if (aIf[n] && !aMatchedNames.has(n)) sameName.push({ before: n, after: n })
}
console.log('同名可匹配:', sameName.length, '/', pairs.beforeOnly.length)
sameName.slice(0, 40).forEach(p => console.log('  ', p.before))

const remaining = pairs.beforeOnly.filter(n => !sameName.some(s => s.before === n))
console.log('\n同名匹配后剩余未匹配:', remaining.length)
for (const n of remaining) {
  console.log('  ', n, '| 行数:', bIf[n].length, '| IP:', JSON.stringify(ifaceIps(bIf[n])))
}