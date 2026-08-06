// M0 模型能力探针：验证当前配置模型的 function calling / json_mode 支持度。
// 复用 llm.js 的配置解析优先级（env key > file key；baseURL/model 来自 llm-config.json 或 env）。
// 用法：node scripts/probe-model.mjs
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

// ---- 解析配置（镜像 llm.js loadConfig，但不含内存 runtimeApiKey）----
function loadDotEnv() {
  const envPath = path.join(ROOT, '.env')
  const out = {}
  if (fs.existsSync(envPath)) {
    for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const k = line.slice(0, eq).trim()
      let v = line.slice(eq + 1).trim()
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      out[k] = v
    }
  }
  return out
}
const env = loadDotEnv()
let fileCfg = {}
try { fileCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'llm-config.json'), 'utf8')) } catch {}

const cfg = {
  apiKey: env.LLM_API_KEY || fileCfg.apiKey || '',
  baseURL: env.LLM_BASE_URL || fileCfg.baseURL || '',
  model: env.LLM_MODEL || fileCfg.model || ''
}
if (!cfg.apiKey || !cfg.baseURL || !cfg.model) {
  console.error('缺少配置：', { hasKey: !!cfg.apiKey, baseURL: cfg.baseURL, model: cfg.model })
  process.exit(1)
}
const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions'

const post = async (body) => {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 60000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const text = await resp.text()
    if (!resp.ok) return { ok: false, status: resp.status, raw: text.slice(0, 400) }
    return { ok: true, json: JSON.parse(text) }
  } finally {
    clearTimeout(t)
  }
}

const results = {}
console.log(`\n=== 模型能力探针 @ ${cfg.model} (${cfg.baseURL}) ===\n`)

// Test 0: 基线对话
{
  const r = await post({ model: cfg.model, temperature: 0, stream: false,
    messages: [{ role: 'user', content: '用一句话回答：1+1 等于几？' }] })
  const content = r.ok ? (r.json.choices?.[0]?.message?.content || '') : ''
  results.baseline = { ok: r.ok, status: r.status, sample: content.slice(0, 80), raw: r.raw }
  console.log(`[0] 基线对话        : ${r.ok ? 'OK' : 'FAIL(' + r.status + ')'}  ${content.slice(0, 60)}`)
}

// Test 1: function calling / tools
{
  const tools = [{
    type: 'function',
    function: {
      name: 'get_device_status',
      description: '查询某网络设备的运行状态',
      parameters: { type: 'object', properties: { device: { type: 'string', description: '设备名' } }, required: ['device'] }
    }
  }]
  const r = await post({ model: cfg.model, temperature: 0, stream: false, tools, tool_choice: 'auto',
    messages: [{ role: 'user', content: '帮我查一下核心交换机 Core-SW-01 的状态' }] })
  const msg = r.ok ? r.json.choices?.[0]?.message : null
  const toolCalls = msg?.tool_calls
  results.tools = { ok: r.ok, hasToolCalls: Array.isArray(toolCalls) && toolCalls.length > 0, status: r.status, raw: r.raw }
  console.log(`[1] function calling: ${r.ok ? (results.tools.hasToolCalls ? '支持(tool_calls 返回)' : '不支持(忽略 tools, 返回普通文本)') : 'FAIL(' + r.status + ')'}  ${toolCalls?.[0]?.function?.name || ''}`)
}

// Test 2: response_format = json_object
{
  const r = await post({ model: cfg.model, temperature: 0, stream: false,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: '只输出 JSON：{"risk":"high","note":"测试"}，不要其它文字' }] })
  let valid = false, parseErr = ''
  if (r.ok) {
    const c = r.json.choices?.[0]?.message?.content || ''
    try { JSON.parse(c); valid = true } catch (e) { parseErr = c.slice(0, 80) }
  }
  results.jsonMode = { ok: r.ok, validJson: valid, status: r.status, raw: r.raw, sample: parseErr }
  console.log(`[2] json_mode       : ${r.ok ? (valid ? '支持(返回合法 JSON)' : '返回但非合法 JSON') : 'FAIL(' + r.status + ')'}  ${parseErr.slice(0, 50)}`)
}

// 结论
console.log('\n=== 结论 ===')
const t = results.tools
const j = results.jsonMode
let path5
if (t.ok && t.hasToolCalls) path5 = 'A: function calling 可用 → 语义 diff 走 tool_calls 结构化输出（最优）'
else if (j.ok && j.validJson) path5 = 'B: 仅 json_mode → 语义 diff 走 response_format=json_object + 严格 schema 约束'
else path5 = 'C: 都不支持 → 语义 diff 走 prompt 强约束 JSON + 容错解析（复用 parseDiagnoseIssues 思路，但需按语义 schema 改写）'
console.log(path5)
console.log(`function_calling: ${t.ok && t.hasToolCalls ? 'YES' : 'NO'} | json_mode: ${j.ok && j.validJson ? 'YES' : 'NO'} | baseline: ${results.baseline.ok ? 'YES' : 'NO'}`)
console.log(`\n（注：本探针用持久化配置 .env + server/llm-config.json；若本次会话在设置页临时改过 Key，需以运行后端 /status 为准。）`)
