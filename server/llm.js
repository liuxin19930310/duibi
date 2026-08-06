// 大模型接入（OpenAI 兼容）：支持 DeepSeek / OpenAI / 自定义接口。
// 配置优先级：环境变量（LLM_PROVIDER / LLM_API_KEY / LLM_MODEL / LLM_BASE_URL）
//            > 本地配置文件 server/llm-config.json（设置页写入）。
// 密钥只存后端，不落浏览器。
const express = require('express')
const fs = require('fs')
const path = require('path')

// 加载项目根目录 .env（若存在），仅补充未设置的环境变量；不覆盖已有 env。
// 用于在不改代码、不暴露明文密钥的前提下注入 LLM_API_KEY 等。
function loadDotEnv () {
  try {
    const envPath = path.join(__dirname, '..', '.env')
    if (!fs.existsSync(envPath)) return
    const text = fs.readFileSync(envPath, 'utf8')
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const k = line.slice(0, eq).trim()
      let v = line.slice(eq + 1).trim()
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!(k in process.env)) process.env[k] = v
    }
  } catch (e) { /* ignore */ }
}
loadDotEnv()

const router = express.Router()
const CONFIG_PATH = path.join(__dirname, 'llm-config.json')
// 运行时密钥（来自设置页输入，仅存内存，不写盘；重启后由环境变量 LLM_API_KEY 提供）
let runtimeApiKey = ''

const PROVIDERS = {
  deepseek: { baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
}

function loadConfig () {
  let fileCfg = {}
  try {
    if (fs.existsSync(CONFIG_PATH)) fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (e) { /* ignore */ }
  return {
    provider: process.env.LLM_PROVIDER || fileCfg.provider || '',
    apiKey: runtimeApiKey || process.env.LLM_API_KEY || fileCfg.apiKey || '',
    model: process.env.LLM_MODEL || fileCfg.model || '',
    baseURL: process.env.LLM_BASE_URL || fileCfg.baseURL || ''
  }
}

function resolveEndpoint (cfg) {
  if (cfg.baseURL) return { url: cfg.baseURL.replace(/\/+$/, '') + '/chat/completions', model: cfg.model || 'default' }
  const p = PROVIDERS[cfg.provider]
  if (!p) throw new Error('未知的模型服务商，请先在「设置 → AI 大模型」中配置')
  return { url: p.baseURL + '/chat/completions', model: cfg.model || p.model }
}

async function chatCompletion (cfg, messages, temperature = 0.2, extra = {}) {
  const { url, model } = resolveEndpoint(cfg)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model, messages, temperature, stream: false, ...extra }),
      signal: controller.signal
    })
    if (!resp.ok) {
      let detail = ''
      try {
        const j = await resp.json()
        detail = (j.error && (j.error.message || JSON.stringify(j.error))) || ''
      } catch (e) { /* ignore */ }
      throw new Error(`模型接口返回 ${resp.status}${detail ? '：' + detail : ''}`)
    }
    const data = await resp.json()
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    if (!content) throw new Error('模型返回内容为空')
    return { content, model }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('模型调用超时（60s）')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// 通用单次请求：支持追加 body 参数（用于能力探测：response_format / tools）
async function rawChat (cfg, messages, extra = {}) {
  const { url, model } = resolveEndpoint(cfg)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.2, stream: false, ...extra }),
      signal: controller.signal
    })
    let data = null
    try { data = await resp.json() } catch (e) { /* ignore */ }
    return { resp, data }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('模型调用超时（60s）')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
function maskKey (k) {
  if (!k) return ''
  return k.length <= 8 ? '****' : k.slice(0, 4) + '****' + k.slice(-4)
}

// 当前配置状态（不返回明文 Key）
router.get('/status', (req, res) => {
  const cfg = loadConfig()
  let endpoint = null
  try { endpoint = resolveEndpoint(cfg) } catch (e) { /* ignore */ }
  res.json({
    ok: true,
    provider: cfg.provider || '',
    model: cfg.model || (endpoint && endpoint.model) || '',
    hasKey: !!cfg.apiKey,
    keyMasked: maskKey(cfg.apiKey),
    baseURL: cfg.baseURL || '',
    configured: !!(cfg.apiKey && endpoint)
  })
})

// 保存配置（apiKey 留空时保留原 Key）
router.post('/config', (req, res) => {
  const { provider = '', model = '', apiKey = '', baseURL = '' } = req.body || {}
  if (!provider && !baseURL) return res.status(400).json({ error: '请选择服务商或填写自定义接口地址', code: 'BAD_REQUEST' })
  let fileCfg = {}
  try { if (fs.existsSync(CONFIG_PATH)) fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch (e) { /* ignore */ }
  const next = { ...fileCfg }
  if (provider) next.provider = provider
  if (model) next.model = model
  if (baseURL) next.baseURL = baseURL
  // 注意：API Key 不再写入磁盘配置文件；仅在本进程内存中临时保存，
  // 重启后需由环境变量 LLM_API_KEY（或 .env）提供，避免密钥明文落盘。
  delete next.apiKey
  if (apiKey) runtimeApiKey = apiKey
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2))
    const key = process.env.LLM_API_KEY || runtimeApiKey
    res.json({ ok: true, message: '配置已保存', provider: next.provider || '', model: next.model || '', hasKey: !!key, keyMasked: maskKey(key) })
  } catch (e) {
    res.status(500).json({ error: '保存配置失败：' + (e.message || e), code: 'SAVE_FAILED' })
  }
})

// 退出当前模型：清空配置（不删除文件，避免被 safe-delete 拦截），并清内存 Key（环境变量配置不受影响）
router.post('/clear', (req, res) => {
  try {
    runtimeApiKey = ''
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify({})) } catch (e) { /* 忽略写盘失败 */ }
    const cfg = loadConfig()
    let endpoint = null
    try { endpoint = resolveEndpoint(cfg) } catch (e) { /* ignore */ }
    res.json({
      ok: true,
      message: '已退出当前模型',
      provider: cfg.provider || '',
      model: cfg.model || (endpoint && endpoint.model) || '',
      hasKey: !!cfg.apiKey,
      keyMasked: '',
      baseURL: cfg.baseURL || '',
      configured: !!(cfg.apiKey && endpoint)
    })
  } catch (e) {
    res.status(500).json({ error: '退出失败：' + (e.message || e), code: 'CLEAR_FAILED' })
  }
})

// 测试连接：发送一条 ping
router.post('/test', async (req, res) => {
  const cfg = loadConfig()
  if (!cfg.apiKey) return res.status(400).json({ error: '尚未配置 API Key', code: 'LLM_NOT_CONFIGURED' })
  try {
    const r = await chatCompletion(cfg, [{ role: 'user', content: 'ping' }], 0)
    res.json({ ok: true, message: `连接成功（${r.model}）` })
  } catch (e) {
    res.status(502).json({ error: '连接失败：' + (e.message || e), code: 'LLM_ERROR' })
  }
})
// 模型能力自检：连通性 / 结构化输出 / Function Calling / 长上下文
router.post('/capabilities', async (req, res) => {
  const cfg = loadConfig()
  if (!cfg.apiKey) return res.status(400).json({ error: '尚未配置 API Key', code: 'LLM_NOT_CONFIGURED' })
  const caps = {}

  // 1. 连通性 + 基础对话
  try {
    const r = await chatCompletion(cfg, [{ role: 'user', content: 'ping' }], 0)
    caps.connectivity = { ok: true, model: r.model }
  } catch (e) {
    caps.connectivity = { ok: false, model: '', error: (e && e.message) || '连接失败' }
    return res.json({ ok: true, capabilities: caps })
  }

  // 2. 结构化输出（response_format: json_object）
  try {
    const { resp, data } = await rawChat(cfg, [{ role: 'user', content: '只输出 JSON：{"ok":true}' }], { response_format: { type: 'json_object' }, temperature: 0 })
    const msg = data && data.choices && data.choices[0] && data.choices[0].message
    const content = msg && msg.content
    const supported = !!resp.ok && typeof content === 'string' && content.includes('"ok"')
    caps.structuredOutput = {
      ok: true,
      supported,
      error: resp.ok ? '' : (data && data.error && (data.error.message || JSON.stringify(data.error))) || ('HTTP ' + resp.status)
    }
  } catch (e) {
    caps.structuredOutput = { ok: false, supported: false, error: (e && e.message) || '检测失败' }
  }

  // 3. Function Calling（tools + tool_choice）
  try {
    const { resp, data } = await rawChat(cfg, [{ role: 'user', content: '请调用 ping 函数并返回结果' }], {
      tools: [{ type: 'function', function: { name: 'ping', description: '测试函数调用', parameters: { type: 'object', properties: {} } } }],
      tool_choice: 'auto',
      temperature: 0
    })
    const msg = data && data.choices && data.choices[0] && data.choices[0].message
    const hasToolCall = !!(msg && (msg.tool_calls || msg.function_call))
    caps.functionCalling = {
      ok: true,
      supported: !!resp.ok && hasToolCall,
      error: resp.ok ? (hasToolCall ? '' : '接口接受 tools 参数，但模型未按函数调用返回（可能按普通文本处理）') : (data && data.error && (data.error.message || JSON.stringify(data.error))) || ('HTTP ' + resp.status)
    }
  } catch (e) {
    caps.functionCalling = { ok: false, supported: false, error: (e && e.message) || '检测失败' }
  }

  // 4. 长上下文（发送约 1.2 万字符，能返回说明上下文足够）
  try {
    const longText = '设备配置上下文能力测试。'.repeat(1200)
    const r = await chatCompletion(cfg, [{ role: 'user', content: longText + '\n请只回复：OK' }], 0)
    caps.longContext = { ok: true, sentChars: longText.length }
  } catch (e) {
    caps.longContext = { ok: false, sentChars: 12000, error: (e && e.message) || '上下文不足或超时' }
  }

  res.json({ ok: true, capabilities: caps })
})

// 通用对话代理：system + user，返回模型回答
router.post('/chat', async (req, res) => {
  const { system = '', user = '', temperature = 0.2, responseFormat = false } = req.body || {}
  if (!user) return res.status(400).json({ error: '缺少分析内容', code: 'BAD_REQUEST' })
  const cfg = loadConfig()
  if (!cfg.apiKey) return res.status(400).json({ error: '尚未配置大模型 API Key，请先在「设置 → AI 大模型」中配置', code: 'LLM_NOT_CONFIGURED' })
  try {
    const r = await chatCompletion(cfg, [
      { role: 'system', content: system || '你是一个网络运维助手，只基于提供的数据作答，不臆测，不编造命令。' },
      { role: 'user', content: user }
    ], temperature, responseFormat ? { response_format: { type: 'json_object' } } : {})
    res.json({ ok: true, content: r.content, model: r.model })
  } catch (e) {
    res.status(502).json({ error: (e && e.message) || '模型调用失败', code: 'LLM_ERROR' })
  }
})

module.exports = router