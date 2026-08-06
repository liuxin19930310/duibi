// 原型：把真实割接配置切片后直接交给 LLM（agnes），看它实际能产出什么
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const B = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const A = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'

function loadEnv() {
  const env = {}
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch (e) {}
  return env
}
function loadLlmCfg() {
  try { return JSON.parse(readFileSync(resolve(process.cwd(), 'server/llm-config.json'), 'utf8')) }
  catch (e) { return {} }
}

// 切片：header 截断、bgp/isis 全收、剩余预算按序塞 interface 块
function slice(text, budget) {
  const lines = text.split('\n')
  const header = [], bgp = [], isis = [], ifaces = []
  let curIf = null, inBgp = false, inIsis = false
  for (const ln of lines) {
    if (/^interface\s/.test(ln)) { curIf = [ln]; ifaces.push(curIf); inBgp = false; inIsis = false; continue }
    if (/^bgp\s/.test(ln)) { bgp.push(ln); inBgp = true; inIsis = false; curIf = null; continue }
    if (/^isis\s/.test(ln)) { isis.push(ln); inIsis = true; inBgp = false; curIf = null; continue }
    if (/^(ospf|ospfv3|rip|return)\b/.test(ln)) { inBgp = false; inIsis = false; curIf = null; continue }
    if (curIf) curIf.push(ln)
    else if (inBgp) bgp.push(ln)
    else if (inIsis) isis.push(ln)
    else header.push(ln)
  }
  const cap = (arr, max) => { let s = ''; for (const l of arr) { if (s.length + l.length + 1 > max) break; s += l + '\n' } return s }
  let out = cap(header, 15000)
  out += '\n' + cap(bgp, 15000) + '\n' + cap(isis, 10000)
  let ifaceCount = 0
  for (const b of ifaces) {
    const s = b.join('\n')
    if (out.length + s.length + 1 > budget) break
    out += '\n' + s
    ifaceCount++
  }
  return { text: out, totalIfaces: ifaces.length, slicedIfaces: ifaceCount }
}

async function chat(messages) {
  const cfg = loadLlmCfg()
  const env = loadEnv()
  const apiKey = env.LLM_API_KEY || cfg.apiKey
  const baseURL = (cfg.baseURL || '').replace(/\/$/, '')
  const model = cfg.model
  const r = await fetch(baseURL + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages, temperature: 0.3, response_format: { type: 'json_object' } })
  })
  const j = await r.json()
  if (j.error) throw new Error(JSON.stringify(j.error))
  const content = j.choices?.[0]?.message?.content || ''
  if (!content) { console.log('[诊断] 空返回, 完整响应:', JSON.stringify(j).slice(0, 600)); return '' }
  return content
}

const BEFORE_BUDGET = 45000
const AFTER_BUDGET = 45000
const sb = slice(readFileSync(B, 'utf8'), BEFORE_BUDGET)
const sa = slice(readFileSync(A, 'utf8'), AFTER_BUDGET)
console.log(`切片: 前 唯一接口=${sb.totalIfaces} 喂=${sb.slicedIfaces} (${sb.text.length}字符); 后 唯一接口=${sa.totalIfaces} 喂=${sa.slicedIfaces} (${sa.text.length}字符)`)

const system = `你是一名资深运营商核心网络工程师，精通华为 NE5000E 路由器。
这是一次设备替换割接：老设备配置(割接前)已 1:1 迁移到新设备(割接后)。新设备因新增板卡多了端口，老端口因槽位变化可能改名，目标是迁移后协议状态全部正常、老链路配置不丢失。
注意：下面的接口配置是【抽样】的（只含前面一部分接口块），不是全部，你应明确说明这一局限。
请严格输出 JSON，不要多余文字：
{
  "summary": "一句话总体结论",
  "suspected_missing_links": ["老端口链路疑似在割接后丢失的条目，含端口名和理由"],
  "new_port_check": ["对抽样到的新端口是否满配的核查结论"],
  "protocol_health": ["BGP/ISIS 等协议状态初判"],
  "limitations": ["你本次看不到全量数据导致的局限"]
}`

const user = `===== 割接前配置(抽样) =====\n${sb.text}\n\n===== 割接后配置(抽样) =====\n${sa.text}`
console.log(`Prompt 总字符: ${user.length}`)

try {
  const content = await chat([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ])
  if (!content) { console.log('无内容，终止。'); process.exit(0) }
  console.log('\n===== LLM 原始返回 =====\n' + content)
  try { console.log('\n===== 解析后 =====\n' + JSON.stringify(JSON.parse(content), null, 2)) }
  catch (e) { console.log('(返回非严格JSON)') }
} catch (e) { console.error('调用失败:', e.message) }
