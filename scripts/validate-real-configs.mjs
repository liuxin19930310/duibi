import { readFileSync } from 'node:fs'
import { runComparePure, parseGlobalConfig, parseDeviceProtocolsPure } from '../src/utils/compareCore.js'
import { collectUnknownLines } from '../src/utils/learnCore.js'

const BEFORE = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const AFTER = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'

const beforeText = readFileSync(BEFORE, 'utf8')
const afterText = readFileSync(AFTER, 'utf8')
console.log('文件读取完成: 前', beforeText.length, '字符 / 后', afterText.length, '字符')

const options = { vendor: 'huawei' } // 显式指定, 排除 vendor 自动识别干扰

console.log('\n===== 1) runComparePure 结构化 diff 计数 =====')
try {
  const r = runComparePure(beforeText, afterText, options)
  console.log('counts:', JSON.stringify(r.counts, null, 0))
  console.log('顶层模块键:', Object.keys(r).filter(k => k !== 'counts'))
  // 抽样 bgp / isis / interface 差异条数
  for (const mod of ['bgp', 'isis', 'interface', 'srv6', 'ldp', 'routingStat', 'lldp']) {
    const arr = r[mod]
    if (Array.isArray(arr)) console.log(`  ${mod}: ${arr.length} 条差异`)
  }
} catch (e) {
  console.log('runComparePure 抛错:', e.message)
}

console.log('\n===== 2) parseGlobalConfig (M1 担忧#1: 是否产出 globalConfig) =====')
try {
  const gB = parseGlobalConfig(beforeText, 'huawei')
  const gA = parseGlobalConfig(afterText, 'huawei')
  console.log('  前 globalConfig 条目数:', gB?.length ?? 0)
  console.log('  后 globalConfig 条目数:', gA?.length ?? 0)
} catch (e) {
  console.log('  parseGlobalConfig 抛错:', e.message)
}

console.log('\n===== 3) collectUnknownLines 未解析行 (M1 担忧#2: 协议层/噪声覆盖) =====')
try {
  const uB = collectUnknownLines(beforeText, 'huawei')
  const uA = collectUnknownLines(afterText, 'huawei')
  console.log('  前 未解析行数:', uB?.lines?.length ?? uB?.length ?? '?')
  console.log('  后 未解析行数:', uA?.lines?.length ?? uA?.length ?? '?')
  // 抽样后文件前 20 行未解析内容, 看是否混入 display 操作态
  const sample = (Array.isArray(uA) ? uA : uA.lines || []).slice(0, 20)
  console.log('  --- 后文件未解析行样例(前20) ---')
  for (const l of sample) console.log('   ', typeof l === 'string' ? l : JSON.stringify(l))
} catch (e) {
  console.log('  collectUnknownLines 抛错:', e.message)
}
