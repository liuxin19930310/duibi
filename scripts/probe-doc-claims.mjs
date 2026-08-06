import { readFileSync } from 'node:fs'

const B = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const A = 'C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'
const tb = readFileSync(B, 'utf8'), ta = readFileSync(A, 'utf8')
const lb = tb.split('\n'), la = ta.split('\n')

// 1) BGP 邻居数: 统计 peer/neighbor 行 (排除 undo, 排除注释)
function bgpPeers(lines) {
  let inBgp = false, peers = new Set()
  for (const ln of lines) {
    if (/^bgp\s+\d+/.test(ln)) { inBgp = true; continue }
    if (inBgp && /^(isis|ospf|ospfv3|interface|rip|return|quit)\b/i.test(ln)) { inBgp = false }
    if (inBgp) {
      const m = ln.match(/^\s*(?:peer|neighbor)\s+([\d.:a-fA-F]+)/i)
      if (m && !/undo/i.test(ln)) peers.add(m[1])
    }
  }
  return peers
}
const pb = bgpPeers(lb), pa = bgpPeers(la)
console.log('BGP 邻居数 before/after:', pb.size, '/', pa.size)

// 2) 三层口 IP + 按 IP 配对
function ifIp(lines) {
  const map = new Map() // ip -> [iface]
  let cur = null
  for (const ln of lines) {
    const m = ln.match(/^interface\s+(\S+)/); if (m) { cur = m[1]; continue }
    const ip = ln.match(/^\s*ip\s+address\s+(\d+\.\d+\.\d+\.\d+)/i)
    if (ip && cur) { map.set(ip[1], [...(map.get(ip[1])||[]), cur]) }
  }
  return map
}
const ib = ifIp(lb), ia = ifIp(la)
const ipPairs = [...ia.keys()].filter(ip => ib.has(ip)).length
console.log('三层口数 before/after:', ib.size, '/', ia.size, ' IP 配对对:', ipPairs)

// 3) description 出现在两文件的
function descs(lines) {
  const s = new Set()
  for (const ln of lines) { const d = ln.match(/^\s*description\s+(.+)$/); if (d) s.add(d[1].trim()) }
  return s
}
const db = descs(lb), da = descs(la)
let commonDesc = 0; for (const d of da) if (db.has(d)) commonDesc++
console.log('description 条数 before/after:', db.size, '/', da.size, ' 两文件共有 desc:', commonDesc)

// 4) afterOnly 端口(无同名)的 desc 是否能精确匹配 before 某 desc
const ifb = new Set(lb.filter(l=>/^interface\s+/.test(l)).map(l=>l.split(/\s+/)[1]))
const ifa = la.filter(l=>/^interface\s+/.test(l)).map(l=>l.split(/\s+/)[1])
const afterOnly = ifa.filter(n=>!ifb.has(n))
let descMatchRenamed = 0
// 建 afterOnly -> 其 desc
const afterDesc = new Map()
let cur=null
for (const ln of la){ const m=ln.match(/^interface\s+(\S+)/); if(m){cur=m[1];continue} const d=ln.match(/^\s*description\s+(.+)$/); if(d&&cur)afterDesc.set(cur,d[1].trim()) }
for (const n of afterOnly){ const d=afterDesc.get(n); if(d&&db.has(d)) descMatchRenamed++ }
console.log('afterOnly 端口数:', afterOnly.length, ' 其中 desc 精确匹配 before:', descMatchRenamed)
