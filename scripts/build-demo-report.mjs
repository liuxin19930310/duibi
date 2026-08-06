import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { parseGlobalConfig } from '../src/utils/compareCore.js'

const B = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const A = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'
const tbRaw = readFileSync(B, 'utf8'), taRaw = readFileSync(A, 'utf8')

// ---- 预处理：剥离操作态污染（仅保留配置段，去掉终端回显）----
function clean(txt) {
  return txt.split('\n').filter(ln => {
    if (/^<[^>]*>/.test(ln)) return false                 // 提示符 / 命令回显
    if (/current state\s*:/.test(ln)) return false
    if (/Internet Address is/.test(ln)) return false
    if (/Memory Using Percentage/.test(ln)) return false
    if (/Line protocol current state/.test(ln)) return false
    if (/^(Route Port|Port Mode|Description|IPv6 is enabled|Last 300 seconds input)/i.test(ln)) return false
    return true
  }).join('\n')
}
const tb = clean(tbRaw), ta = clean(taRaw)

// ---- 块提取：顶层命令 -> 缩进行集合 ----
function extractBlocks(txt, re) {
  const lines = txt.split('\n')
  const blocks = new Map(); let cur = null, buf = []
  for (const ln of lines) {
    const m = ln.match(re)
    if (m) { if (cur) blocks.set(cur, buf); cur = m[1]; buf = []; continue }
    if (/^\S/.test(ln)) { if (cur) blocks.set(cur, buf); cur = null; buf = []; continue }
    if (cur !== null) buf.push(ln)
  }
  if (cur) blocks.set(cur, buf)
  return blocks
}
const ifRe = /^interface\s+(\S+)/
const bIf = extractBlocks(tb, ifRe), aIf = extractBlocks(ta, ifRe)

function meta(blocks) {
  const m = new Map()
  for (const [name, buf] of blocks) {
    let ip = null, desc = null
    for (const ln of buf) {
      const ipm = ln.match(/^\s*ip\s+address\s+(\d+\.\d+\.\d+\.\d+)/i)
      if (ipm) ip = ipm[1]
      const dm = ln.match(/description\s+(\S.*?)\s*$/i)
      if (dm && !desc) desc = dm[1].trim()
    }
    m.set(name, { ip, desc, lines: buf })
  }
  return m
}
const bM = meta(bIf), aM = meta(aIf)

// ---- L1 端口映射 ----
const pairs = []           // {method, before, after, beforeLines, afterLines}
const seenAfter = new Set()
// 同名
for (const [name, a] of aM) {
  if (bM.has(name)) {
    pairs.push({ method: 'name', before: name, after: name, beforeLines: bM.get(name).lines, afterLines: a.lines })
    seenAfter.add(name)
  }
}
const bIps = new Map(), bDescs = new Map()
for (const [n, v] of bM) { if (v.ip) (bIps.get(v.ip) || bIps.set(v.ip, []).get(v.ip)).push(n); if (v.desc) (bDescs.get(v.desc) || bDescs.set(v.desc, []).get(v.desc)).push(n) }
for (const [n, v] of aM) {
  if (seenAfter.has(n)) continue
  if (v.ip && bIps.has(v.ip)) {
    const before = bIps.get(v.ip)[0]
    pairs.push({ method: 'ip', before, after: n, beforeLines: bM.get(before).lines, afterLines: v.lines })
    seenAfter.add(n)
  } else if (v.desc && bDescs.has(v.desc)) {
    const before = bDescs.get(v.desc)[0]
    pairs.push({ method: 'desc', before, after: n, beforeLines: bM.get(before).lines, afterLines: v.lines })
    seenAfter.add(n)
  }
}
const afterOnly = [...aM.keys()].filter(n => !seenAfter.has(n))   // 新增/兜底
const beforeOnly = [...bM.keys()].filter(n => !aM.has(n))          // 移除

// 内容对比
function diffLines(a, b) {
  const sa = new Set(a.map(s => s.trim()).filter(Boolean))
  const sb = new Set(b.map(s => s.trim()).filter(Boolean))
  const removed = [...sa].filter(x => !sb.has(x))
  const added = [...sb].filter(x => !sa.has(x))
  return { removed, added, changed: removed.length > 0 || added.length > 0 }
}
for (const p of pairs) { const d = diffLines(p.beforeLines, p.afterLines); p.status = d.changed ? '差异' : '一致'; p.diff = d }
const namePairs = pairs.filter(p => p.method === 'name')
const ipPairs = pairs.filter(p => p.method === 'ip')
const descPairs = pairs.filter(p => p.method === 'desc')
const consistent = pairs.filter(p => p.status === '一致').length
const diffCount = pairs.filter(p => p.status === '差异').length

// 疑似漏迁：beforeOnly 里有 description 的（活跃链路可能丢失）
const leakSuspect = beforeOnly.filter(n => bM.get(n).desc)
const emptyShellRemoved = beforeOnly.filter(n => !bM.get(n).desc)

// ---- L2 全局系统配置 ----
const gb = parseGlobalConfig(tb), ga = parseGlobalConfig(ta)
const toMap = arr => { const m = new Map(); for (const it of arr) m.set(it.item, it.value); return m }
const mb = toMap(gb), ma = toMap(ga)
const globalChanged = []
for (const [k, v] of mb) if (ma.has(k) && ma.get(k) !== v) globalChanged.push({ item: k, before: v, after: ma.get(k) })
for (const k of ma.keys()) if (!mb.has(k)) globalChanged.push({ item: k, before: '（无）', after: ma.get(k) })

// ---- L2 命令指纹对比（按命令类型统计 before/after）----
const FAM = ['qppb-policy', 'carrier', 'trust', 'mpls', 'set', 'transmission-alarm', 'ipv6', 'ip']
function famCount(txt) {
  const c = {}; FAM.forEach(f => c[f] = 0)
  for (const ln of txt.split('\n')) {
    const t = ln.trim().split(/\s+/)[0] || ''
    if (FAM.includes(t)) c[t]++
  }
  return c
}
const cb = famCount(tb), ca = famCount(ta)
const famRows = FAM.map(f => ({ cmd: f, before: cb[f], after: ca[f], delta: ca[f] - cb[f] }))

// ---- L3 协议核查（BGP 邻居按 IP/group 配对）----
function bgpPeers(txt) {
  const peers = new Set(); let inBgp = false
  for (const ln of txt.split('\n')) {
    if (/^bgp\s+\d+/.test(ln)) { inBgp = true; continue }
    if (inBgp && /^(isis|ospf|ospfv3|interface|rip|return|quit)\b/i.test(ln)) { inBgp = false }
    if (inBgp) {
      const m = ln.match(/^\s*(?:peer|neighbor)\s+([\d.:a-fA-F]+|\S+)/i)
      if (m && !/undo/i.test(ln)) peers.add(m[1])
    }
  }
  return peers
}
const pb = bgpPeers(tb), pa = bgpPeers(ta)
const bgpPaired = [...pa].filter(x => pb.has(x)).length
const bgpOnlyAfter = [...pa].filter(x => !pb.has(x))
const bgpOnlyBefore = [...pb].filter(x => !pa.has(x))

// ================= 渲染 HTML =================
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const pairRows = pairs.slice(0, 40).map(p => {
  const sample = p.diff.changed
    ? `<span class="del">- ${esc((p.diff.removed[0] || '').trim())}</span><br><span class="add">+ ${esc((p.diff.added[0] || '').trim())}</span>`
    : '<span class="ok">完全一致</span>'
  return `<tr><td><span class="tag tag-${p.method}">${p.method}</span></td><td>${esc(p.before)}</td><td>${esc(p.after)}</td><td><span class="st st-${p.status}">${p.status}</span></td><td class="mono">${sample}</td></tr>`
}).join('')

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>割接迁移核查 · 预览</title>
<style>
* { box-sizing: border-box; }
body { margin:0; font-family:-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif; background:#f5f7fa; color:#1f2733; padding:28px; }
.wrap { max-width:1100px; margin:0 auto; }
h1 { font-size:22px; margin:0 0 4px; }
.sub { color:#6b7785; font-size:13px; margin-bottom:20px; }
.note { background:#eef4ff; border:1px solid #cfe0ff; color:#274a8a; padding:10px 14px; border-radius:8px; font-size:12.5px; margin-bottom:22px; }
.cards { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:26px; }
.card { background:#fff; border:1px solid #e3e8ef; border-radius:12px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,.04); }
.card .t { font-size:12.5px; color:#6b7785; }
.card .n { font-size:26px; font-weight:700; margin:6px 0 2px; }
.card .d { font-size:12px; color:#8a94a6; }
.card.ok .n { color:#1a7f47; } .card.warn .n { color:#b26a00; } .card.bad .n { color:#c0392b; }
section { background:#fff; border:1px solid #e3e8ef; border-radius:12px; padding:18px 20px; margin-bottom:18px; }
section h2 { font-size:16px; margin:0 0 12px; display:flex; align-items:center; gap:8px; }
section h2 .pill { font-size:11px; background:#eef1f5; color:#566; padding:2px 8px; border-radius:20px; font-weight:500; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th,td { text-align:left; padding:8px 10px; border-bottom:1px solid #eef1f5; }
th { color:#6b7785; font-weight:600; font-size:12px; }
.mono { font-family:'SFMono-Regular',Consolas,monospace; font-size:12px; }
.tag { font-size:11px; padding:1px 7px; border-radius:10px; color:#fff; }
.tag-name{background:#3b82f6} .tag-ip{background:#0ea5e9} .tag-desc{background:#8b5cf6}
.st { font-size:12px; font-weight:600; } .st-一致{color:#1a7f47} .st-差异{color:#b26a00}
.del{color:#c0392b} .add{color:#1a7f47} .ok{color:#1a7f47}
.bad-row td { background:#fff5f5; }
.legend { font-size:12px; color:#8a94a6; margin-top:8px; }
.kv { font-family:monospace; font-size:12px; }
.pos { color:#1a7f47 } .neg { color:#c0392b }
</style></head><body><div class="wrap">
<h1>割接迁移核查 · 面板预览</h1>
<div class="sub">数据源：宁夏 AR 替换割接真实样本（华为 NE5000E，同设备 V800R011→V800R025）· 演示用确定性引擎输出</div>
<div class="note">⚠️ 这是<b>预览演示</b>，结果由本地确定性脚本对真实样本计算生成，尚未接入产品后端。下列数字对应设计文档 §2/§7 的验收基准。</div>

<div class="cards">
  <div class="card"><div class="t">端口迁移</div><div class="n">${pairs.length}</div><div class="d">配对 ${pairs.length} · 一致 ${consistent} · 差异 ${diffCount}</div></div>
  <div class="card"><div class="t">全局系统配置</div><div class="n">${globalChanged.length}</div><div class="d">变化项（sysname/NTP/SNMP…）</div></div>
  <div class="card"><div class="t">命令指纹</div><div class="n warn">${FAM.length}</div><div class="d">类未解析命令 · before→after 对比</div></div>
  <div class="card ${bgpOnlyAfter.length ? 'bad' : 'ok'}"><div class="t">协议核查 (BGP)</div><div class="n">${bgpPaired}/${pa.size}</div><div class="d">邻居配对 ${bgpPaired}/${pa.size}${bgpOnlyAfter.length ? ' · 新增 ' + bgpOnlyAfter.length : ''}</div></div>
</div>

<section><h2>① 迁移完整性总览 <span class="pill">L1+L2</span></h2>
<table>
<tr><th>资产层</th><th>配对/对比数</th><th>一致</th><th>差异</th><th>缺失(before有/after无)</th><th>新增(after独有)</th></tr>
<tr><td>端口配置</td><td>${pairs.length}</td><td class="pos">${consistent}</td><td class="neg">${diffCount}</td><td>${beforeOnly.length}（空壳${emptyShellRemoved.length} / 疑似漏迁${leakSuspect.length}）</td><td>${afterOnly.length}</td></tr>
<tr><td>全局系统配置</td><td>${mb.size + ma.size}</td><td>${mb.size - globalChanged.length}</td><td class="neg">${globalChanged.length}</td><td>—</td><td>—</td></tr>
<tr><td>命令指纹</td><td>${FAM.length} 类</td><td>—</td><td>见④</td><td>见④</td><td>见④</td></tr>
<tr><td>协议(BGP)</td><td>${pa.size}</td><td>${bgpPaired}</td><td>—</td><td>${bgpOnlyBefore.length}</td><td>${bgpOnlyAfter.length}</td></tr>
</table>
<div class="legend">映射方法：同名 ${namePairs.length} · IP ${ipPairs.length} · 描述(改名) ${descPairs.length}</div>
</section>

<section><h2>② 疑似漏迁清单 <span class="pill">置顶 · 按影响排序</span></h2>
${leakSuspect.length ? `<table><tr><th>老端口</th><th>描述</th><th>说明</th></tr>${leakSuspect.slice(0,12).map(n=>`<tr class="bad-row"><td class="mono">${esc(n)}</td><td class="mono">${esc(bM.get(n).desc)}</td><td>before 有描述、after 无同名/同IP/同描述配对 → 需人工确认是否真漏迁</td></tr>`).join('')}</table>` : '<p class="legend">未发现「有描述的老端口」在 after 丢失 → 无高疑似漏迁。${emptyShellRemoved.length} 个无描述老端口判定为正常移除（空壳/未用）。</p>'}
</section>

<section><h2>③ 迁移对明细 <span class="pill">抽样前 40 对</span></h2>
<table><tr><th>方法</th><th>before 端口</th><th>after 端口</th><th>状态</th><th>样例差异</th></tr>${pairRows}</table>
</section>

<section><h2>④ 命令指纹对比 <span class="pill">未解析命令 · 确定性</span></h2>
<table><tr><th>命令类型</th><th>before</th><th>after</th><th>Δ</th></tr>${famRows.map(r=>`<tr><td class="mono">${r.cmd}</td><td>${r.before}</td><td>${r.after}</td><td class="${r.delta>0?'pos':r.delta<0?'neg':''}">${r.delta>0?'+':''}${r.delta}</td></tr>`).join('')}</table>
<div class="legend">说明：解析器未覆盖的命令按类型统计出现次数，直接回答"这类策略迁没迁全"。纯本地、零成本。</div>
</section>

<section><h2>⑤ 全局系统配置变化 <span class="pill">L2</span></h2>
${globalChanged.length ? `<table><tr><th>配置项</th><th>before</th><th>after</th></tr>${globalChanged.slice(0,15).map(g=>`<tr><td>${esc(g.item)}</td><td class="mono">${esc(g.before)}</td><td class="mono">${esc(g.after)}</td></tr>`).join('')}</table>` : '<p class="legend">全局系统配置无差异。</p>'}
</section>

<section><h2>⑥ 协议核查 (BGP) <span class="pill">L3 配置层</span></h2>
<table><tr><th>指标</th><th>值</th></tr>
<tr><td>邻居配对</td><td class="pos">${bgpPaired} / ${pa.size}</td></tr>
<tr><td>仅 after 新增</td><td>${bgpOnlyAfter.length ? bgpOnlyAfter.map(esc).join(', ') : '无'}</td></tr>
<tr><td>仅 before 移除</td><td>${bgpOnlyBefore.length ? bgpOnlyBefore.map(esc).join(', ') : '无'}</td></tr>
</table>
<div class="legend">设计文档 §2 标注 BGP 邻居 6/6；本样本实测 ${pb.size}/${pa.size}（计数口径差异，验收基准待重标）。L3 状态层（自动 SSH 对照实际会话状态）为 M2 范围，本预览未含。</div>
</section>

</div></body></html>`

mkdirSync('preview', { recursive: true })
const out = 'preview/cutover-migration-preview.html'
writeFileSync(out, html, 'utf8')
console.log('生成预览:', out)
console.log('端口配对:', pairs.length, '| 一致', consistent, '| 差异', diffCount)
console.log('映射: 同名', namePairs.length, 'IP', ipPairs.length, '描述(改名)', descPairs.length)
console.log('afterOnly(新增/兜底):', afterOnly.length, '| beforeOnly(移除):', beforeOnly.length, '| 疑似漏迁(有desc):', leakSuspect.length)
console.log('全局变化项:', globalChanged.length, '| BGP 配对', bgpPaired + '/' + pa.size)
