import fs from 'node:fs'
import { extractIfaces, ifaceIps, ifaceDesc, buildPortPairs, normBlock } from './src/utils/cutoverCheck.js'

const DIR = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹'
const beforeText = fs.readFileSync(DIR + '/割接前.log', 'utf8')
const afterText = fs.readFileSync(DIR + '/割接后.log', 'utf8')
const bIf = extractIfaces(beforeText)
const aIf = extractIfaces(afterText)
const pairs = buildPortPairs(beforeText, afterText)

console.log('== before 未匹配端口（' + pairs.beforeOnly.length + '）内容明细 ==')
for (const n of pairs.beforeOnly) {
  const b = bIf[n]
  console.log(n, '| 行数:', b.length, '| desc:', (ifaceDesc(b) || '-').slice(0, 50), '| 内容:', JSON.stringify(normBlock(b).slice(0, 3)))
}

console.log('\n== after 无IP端口总数:', pairs.afterOnly.length, '==')
// after 未匹配端口内容分布
let emptyA = 0, shutdownA = 0, hasConfA = 0
const confA = []
for (const n of pairs.afterOnly) {
  const nb = normBlock(aIf[n])
  if (!nb.length) emptyA++
  else if (nb.length === 1 && nb[0] === 'shutdown') shutdownA++
  else { hasConfA++; if (confA.length < 12) confA.push(n + ': ' + JSON.stringify(nb.slice(0, 3))) }
}
console.log('after 未匹配端口分类: 空=' + emptyA + ', 仅shutdown=' + shutdownA + ', 有配置=' + hasConfA)
console.log('有配置样例:', confA)

// before 未匹配端口分类
let emptyB = 0, shutdownB = 0, hasConfB = 0
const confB = []
for (const n of pairs.beforeOnly) {
  const nb = normBlock(bIf[n])
  if (!nb.length) emptyB++
  else if (nb.length === 1 && nb[0] === 'shutdown') shutdownB++
  else { hasConfB++; if (confB.length < 12) confB.push(n + ': ' + JSON.stringify(nb.slice(0, 4))) }
}
console.log('\nbefore 未匹配端口分类: 空=' + emptyB + ', 仅shutdown=' + shutdownB + ', 有配置=' + hasConfB)
console.log('有配置样例:', confB)