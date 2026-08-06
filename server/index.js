// 网络配置采集后端：Node.js + ssh2
// 提供 POST /api/collect：SSH 直连网络设备（华为/华三），执行采集命令，返回纯文本回显。
// 前端（Vite）通过 /api 代理调用，或直接访问 http://localhost:3001
const express = require('express')
const crypto = require('crypto')
const { Client } = require('ssh2')

const app = express()
app.use(express.json({ limit: '20mb' }))

const PORT = process.env.PORT || 3001

// ===================== 鉴权 =====================
// 登录凭据（环境变量覆盖；默认 admin/admin 仅用于本地演示，启动时会提示）
const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin'
// 可选静态 API 令牌：设置后可用 Authorization: Bearer <API_TOKEN> 直连（脚本/自动化）
const STATIC_TOKEN = process.env.API_TOKEN || ''
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const authSessions = new Map() // sessionToken -> expiresAt

function cleanupAuthSessions () {
  const now = Date.now()
  for (const [token, exp] of authSessions) if (exp <= now) authSessions.delete(token)
  // 顺带清理限流桶
  for (const [k, b] of rateBuckets) if (b.resetAt <= now) rateBuckets.delete(k)
}

// 简单限流（按 IP）
const rateBuckets = new Map()
function rateLimit (limit, windowMs, label) {
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const b = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs }
    if (now > b.resetAt) { b.count = 0; b.resetAt = now + windowMs }
    b.count++
    rateBuckets.set(key, b)
    if (b.count > limit) {
      return res.status(429).json({ error: `请求过于频繁（${label}），请稍后再试`, code: 'RATE_LIMITED' })
    }
    next()
  }
}
setInterval(cleanupAuthSessions, 10 * 60 * 1000)

// 鉴权中间件：除登录 / 健康检查外，全部要求 Bearer token（SSE 可用 query 传 token）
function authRequired (req, res, next) {
  if (req.path === '/api/auth/login' || req.path === '/api/health') return next()
  const headerToken = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
  const token = headerToken || req.query.token || ''
  const validStatic = STATIC_TOKEN && token === STATIC_TOKEN
  const validSession = token && authSessions.has(token) && authSessions.get(token) > Date.now()
  if (validStatic || validSession) {
    req.authToken = token
    return next()
  }
  return res.status(401).json({ error: '未授权，请先登录', code: 'UNAUTHORIZED' })
}
app.use(authRequired)
// 大模型接入（OpenAI 兼容）：DeepSeek / OpenAI / 自定义
app.use('/api/llm', require('./llm'))

// 兼容老设备的算法集合（华为/华三老版本常见）
const ALGORITHMS = {
  kex: [
    'diffie-hellman-group1-sha1',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha1',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'curve25519-sha256'
  ],
  cipher: [
    'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
    'aes128-cbc', 'aes192-cbc', 'aes256-cbc',
    '3des-cbc'
  ],
  serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ssh-ed25519']
}

// 按厂商返回关分页命令（华为与华三语法不同，这是关键差异）
function pagingCmd(vendor) {
  // 华三：screen-length disable；华为：screen-length 0 temporary
  return vendor === 'h3c' ? 'screen-length disable' : 'screen-length 0 temporary'
}

// 按厂商 + 采集范围返回采集命令模板
//   scope: 'config'（仅当前配置，默认）| 'status'（仅运行状态）| 'full'（配置 + 状态）
function buildCommands(vendor, scope = 'config') {
  const isH3c = vendor === 'h3c'
  // 当前配置（华为/华三命令一致）
  const config = ['display current-configuration']
  // 运行状态：接口/IP/设备硬件/光模块（华为与华三命令模板不同）
  const status = isH3c
    ? [
        'display interface',
        'display ip interface brief',
        'display device manuinfo',
        'display transceiver interface verbose'
      ]
    : [
        'display interface',
        'display ip interface brief',
        'display device',
        'display transceiver verbose'
      ]
  if (scope === 'status') return status
  if (scope === 'full') return [...config, ...status]
  return config
}

// 建立一条 SSH 直连，返回就绪的 Client
// opts: { host, port, username, password?, privateKey?, passphrase?, authType, connTimeout }
function connectSsh(opts) {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    const cfg = {
      host: opts.host,
      port: Number(opts.port) || 22,
      username: opts.username,
      readyTimeout: opts.connTimeout || 15000,
      algorithms: ALGORITHMS,
      // 允许老设备使用 sha1 主机密钥
      hostVerifier: () => true
    }
    // 仅直连目标设备
    if (opts.authType === 'key') {
      cfg.privateKey = opts.privateKey
      if (opts.passphrase) cfg.passphrase = opts.passphrase
    } else {
      cfg.password = opts.password
    }
    conn.on('ready', () => resolve(conn))
    conn.on('error', (err) => reject(err))
    conn.connect(cfg)
  })
}

// 在已连接的 Client 上开 shell，逐条发送采集命令，返回原始回显文本
function runShellCollect(client, { commands, vendor, pageCmd, idleMs = 1200, connTimeout = 15000, execTimeout = 10000 }) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (err, data) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(data)
    }

    const cmds = (commands && commands.length) ? commands : buildCommands(vendor, 'config')
    const pageOff = pageCmd || pagingCmd(vendor)

    client.shell((err, stream) => {
      if (err) return finish(err)
      let output = ''
      let lastDataAt = Date.now()
      let commandsSent = false
      let hardTimer = null
      let pollTimer = null

      const cleanup = () => {
        if (pollTimer) clearInterval(pollTimer)
        if (hardTimer) clearTimeout(hardTimer)
      }

      stream.on('data', (chunk) => {
        output += chunk.toString('utf8')
        lastDataAt = Date.now()
      })
      stream.stderr.on('data', (chunk) => {
        output += chunk.toString('utf8')
        lastDataAt = Date.now()
      })
      stream.on('close', () => { cleanup(); finish(null, output) })

      // 1) 关分页，避免输出被 ---- More ---- 截断（华为/华三命令不同）
      stream.write(pageOff + '\r')
      // 2) 稍等进入命令视图后，逐条发送采集命令（间隔发送，避免大输出被误判为结束）
      const gap = 700
      cmds.forEach((c, i) => {
        setTimeout(() => {
          stream.write(c + '\r')
          if (i === cmds.length - 1) commandsSent = true
        }, 500 + i * gap)
      })

      // 3) 静默检测：命令发完后持续无新数据超阈值即结束
      pollTimer = setInterval(() => {
        if (commandsSent && Date.now() - lastDataAt > idleMs) {
          cleanup()
          finish(null, output)
        }
      }, 300)

      // 4) 兜底硬超时，防止设备异常导致连接挂死（随命令数量放大，状态采集数据量大）
      const budget = connTimeout + execTimeout + 6000 + cmds.length * gap
      hardTimer = setTimeout(() => {
        cleanup()
        finish(null, output)
      }, budget)
    })
  })
}

// 主采集入口：SSH 直连目标设备，执行采集命令，返回原始回显文本
// params:
//   target: { host, port, username, password?, privateKey?, passphrase?, authType }
async function collectViaSsh({ target, commands, vendor, pageCmd, idleMs, connTimeout = 15000, execTimeout = 10000 }) {
  let targetConn = null
  try {
    targetConn = await connectSsh({ ...target, connTimeout })
    return await runShellCollect(targetConn, { commands, vendor, pageCmd, idleMs, connTimeout, execTimeout })
  } finally {
    try { if (targetConn) targetConn.end() } catch (e) { /* ignore */ }
  }
}

// 校验目标设备连接必填项
function authMissing(ep) {
  if (!ep) return '缺少连接信息'
  if (!ep.host || !ep.username) return '缺少主机地址或用户名'
  if (ep.authType === 'key') {
    if (!ep.privateKey) return '密钥认证缺少私钥内容'
  } else {
    if (!ep.password) return '缺少登录密码'
  }
  return null
}

// 清洗回显：去分页提示、ANSI 转义、退格、命令回显行，尽量保留干净配置文本
// keepCmd=true 时保留命令回显行（实时同步需要命令头供前端解析/比对识别）
function stripOutput(raw, commands, keepCmd) {
  if (!raw) return ''
  let text = raw.replace(/[\b]/g, '') // 退格符
  text = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '') // ANSI 转义
  text = text.replace(/----\s*More\s*----[\s\S]*?$/gm, '') // 分页残留
  if (commands && commands.length && !keepCmd) {
    for (const c of commands) {
      const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp('^' + escaped + '\\s*$', 'gm')
      text = text.replace(re, '')
    }
  }
  // 去掉行首的终端回显噪音（如命令前自动回显的提示符残留）
  return text.replace(/\r\n/g, '\n').trim()
}

app.post('/api/collect', rateLimit(20, 60 * 1000, '采集'), async (req, res) => {
  const body = req.body || {}
  const { host, port, username, password, vendor, commands, scope, authType, privateKey, passphrase } = body

  const target = {
    host,
    port,
    username,
    password,
    authType: authType || 'password',
    privateKey,
    passphrase
  }

  // 参数校验
  const targetMissing = authMissing(target)
  if (targetMissing) {
    return res.status(400).json({ error: `目标设备${targetMissing}`, code: 'BAD_REQUEST' })
  }

  // 前端显式传 commands 优先；否则按 vendor + scope 生成命令模板
  const finalCommands = (commands && commands.length) ? commands : buildCommands(vendor, scope || 'config')
  const pageOff = pagingCmd(vendor)
  // 多命令（状态/全量采集）数据量大，放宽静默阈值，避免命令间短暂停顿被误判结束
  const idleMs = finalCommands.length > 1 ? 2500 : 1200
  try {
    const raw = await collectViaSsh({ target, commands: finalCommands, vendor, pageCmd: pageOff, idleMs })
    const text = stripOutput(raw, finalCommands)
    res.json({ raw, text, commands: finalCommands, loginMode: 'direct' })
  } catch (err) {
    console.error('[collect] 设备连接失败:', err && err.message)
    res.status(502).json({
      error: err && err.message ? err.message : '设备连接失败',
      code: (err && (err.level || err.code)) || 'UNKNOWN'
    })
  }
})

// ===================== 实时同步：常驻会话 + SSE 推送 =====================
const sessions = new Map()
const SESSION_IDLE_MS = 30 * 60 * 1000 // 空闲 30 分钟自动回收

function genSessionId() {
  return crypto.randomUUID()
}

// 实时同步只拉取轻量状态命令（割接验证关注项），避免压设备控制平面
function buildLiveCommands(vendor) {
  const isH3c = vendor === 'h3c'
  return [
    'display bgp peer',
    'display isis peer',
    'display ip interface brief',
    'display ip routing-table statistics',
    isH3c ? 'display segment-routing ipv6 te policy' : 'display srv6-te policy brief'
  ]
}

// 建立常驻会话（连上不立即关闭），返回 sessionId
app.post('/api/device/connect', rateLimit(10, 60 * 1000, '设备连接'), async (req, res) => {
  const body = req.body || {}
  const { host, port, username, password, vendor, authType, privateKey, passphrase } = body
  const target = { host, port, username, password, authType: authType || 'password', privateKey, passphrase }
  const tMiss = authMissing(target)
  if (tMiss) return res.status(400).json({ error: `目标设备${tMiss}`, code: 'BAD_REQUEST' })
  try {
    const client = await connectSsh({ ...target })
    const id = genSessionId()
    const session = { id, client, vendor: vendor || 'huawei', device: { host, username }, lastActive: Date.now(), alive: true }
    client.on('close', () => { session.alive = false; sessions.delete(id) })
    client.on('error', () => { session.alive = false })
    sessions.set(id, session)
    res.json({ sessionId: id, vendor: session.vendor })
  } catch (err) {
    console.error('[device/connect] 失败:', err && err.message)
    res.status(502).json({ error: err && err.message ? err.message : '设备连接失败', code: (err && (err.level || err.code)) || 'UNKNOWN' })
  }
})

// 关闭常驻会话
app.post('/api/device/disconnect', (req, res) => {
  const { sessionId } = req.body || {}
  const s = sessions.get(sessionId)
  if (!s) return res.json({ ok: true, closed: false })
  try { s.client.end() } catch (e) { /* ignore */ }
  sessions.delete(sessionId)
  res.json({ ok: true, closed: true })
})

// SSE：按 interval 轮询设备状态并推送（连接常驻，由 disconnect 显式释放）
app.get('/api/device/stream/:id', (req, res) => {
  const id = req.params.id
  const session = sessions.get(id)
  if (!session) { res.status(404).json({ error: '会话不存在或已断开', code: 'NO_SESSION' }); return }
  const interval = Math.max(2000, parseInt(req.query.interval) || 30000)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write('retry: 3000\n\n')
  let busy = false
  let closed = false
  const cmds = buildLiveCommands(session.vendor)
  const pageOff = pagingCmd(session.vendor)

  const tick = async () => {
    if (closed || busy || !session.alive) return
    busy = true
    try {
      const raw = await runShellCollect(session.client, { commands: cmds, vendor: session.vendor, pageCmd: pageOff, idleMs: 3000, connTimeout: 15000, execTimeout: 8000 })
      const text = stripOutput(raw, cmds, true) // 保留命令回显，便于前端解析/比对
      session.lastActive = Date.now()
      if (!closed) res.write('data: ' + JSON.stringify({ ts: Date.now(), text }) + '\n\n')
    } catch (err) {
      console.error('[device/stream] 采集失败:', err && err.message)
      if (!closed) res.write('data: ' + JSON.stringify({ type: 'error', message: err && err.message ? err.message : '采集失败' }) + '\n\n')
    } finally {
      busy = false
    }
  }

  tick() // 立即采一次
  const timer = setInterval(tick, interval)
  const hb = setInterval(() => { if (!closed) res.write(': ping\n\n') }, 15000)

  req.on('close', () => {
    closed = true
    clearInterval(timer)
    clearInterval(hb)
    // 注意：不关闭 SSH 连接，连接需显式 disconnect 才释放
  })
})

// 空闲会话定期回收，避免连接泄漏
setInterval(() => {
  const now = Date.now()
  for (const [sid, s] of sessions) {
    if (now - s.lastActive > SESSION_IDLE_MS) {
      try { s.client.end() } catch (e) { /* ignore */ }
      sessions.delete(sid)
    }
  }
}, 5 * 60 * 1000)

// 连通性测试：仅建立 SSH 连接并立即释放，用于新增/编辑设备时验证可达性与凭据
app.post('/api/test-connection', async (req, res) => {
  const body = req.body || {}
  const { host, port, username, password, vendor, authType, privateKey, passphrase } = body
  const target = { host, port, username, password, authType: authType || 'password', privateKey, passphrase }
  const miss = authMissing(target)
  if (miss) return res.status(400).json({ error: `目标设备${miss}`, code: 'BAD_REQUEST' })
  let conn = null
  const start = Date.now()
  try {
    conn = await connectSsh({ ...target, connTimeout: 15000 })
    const costMs = Date.now() - start
    res.json({ ok: true, message: `连接成功（耗时 ${costMs}ms）`, costMs })
  } catch (err) {
    console.error('[test-connection] 失败:', err && err.message)
    res.status(502).json({ error: err && err.message ? err.message : '连接失败', code: (err && (err.level || err.code)) || 'UNKNOWN' })
  } finally {
    try { if (conn) conn.end() } catch (e) { /* ignore */ }
  }
})

app.post('/api/auth/login', rateLimit(5, 60 * 1000, '登录'), (req, res) => {
  const { username, password } = req.body || {}
  cleanupAuthSessions()
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex')
    authSessions.set(token, Date.now() + SESSION_TTL_MS)
    return res.json({ ok: true, token, expiresIn: SESSION_TTL_MS })
  }
  return res.status(401).json({ error: '用户名或密码错误', code: 'BAD_CREDENTIALS' })
})

app.post('/api/auth/logout', (req, res) => {
  if (req.authToken) authSessions.delete(req.authToken)
  res.json({ ok: true })
})

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

app.listen(PORT, () => {
  console.log(`[netops-collector] 采集后端已启动: http://localhost:${PORT}`)
  if (ADMIN_USER === 'admin' && ADMIN_PASSWORD === 'admin') {
    console.log('[netops-collector] ⚠ 正在使用默认账号 admin/admin，生产/局域网环境请通过 ADMIN_USER / ADMIN_PASSWORD 环境变量修改')
  }
  if (STATIC_TOKEN) console.log('[netops-collector] 已启用静态 API_TOKEN（脚本直连可用）')
})
