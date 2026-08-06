import { readFileSync } from 'node:fs'
import { runComparePure } from '../src/utils/compareCore.js'
const B='C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接前.log'
const A='C:/Users/Liuxin/Desktop/宁夏AR替换割接/新建文件夹/割接后.log'
const r = runComparePure(readFileSync(B,'utf8'), readFileSync(A,'utf8'), {vendor:'huawei'})
// 接口差异类型分布
const ifs = r.interface || []
const types = {}
for (const it of ifs) { const t = it.changeType || it.type || it.status || 'unknown'; types[t]=(types[t]||0)+1 }
console.log('接口差异总数:', ifs.length, ' 类型分布:', JSON.stringify(types))
// 抽样一条 "added/new" 接口, 看新端口是否被识别
const added = ifs.find(it => /add|new|新增|插入/i.test(JSON.stringify(it).slice(0,200)))
console.log('样例接口差异条目(前2条):')
for (const it of ifs.slice(0,2)) console.log('  ', JSON.stringify(it).slice(0,260))
// BGP 差异是否含 ip-prefix / 4-byte-as
const bgp = r.bgp || []
console.log('\nBGP 差异条数:', bgp.length)
let hitPrefix=0, hit4byte=0
for (const b of bgp) { const s=JSON.stringify(b); if(/ip-prefix/.test(s)) hitPrefix++; if(/4-byte-as/.test(s)) hit4byte++ }
console.log('  BGP 差异中含 ip-prefix 提及:', hitPrefix, ' 含 4-byte-as 提及:', hit4byte)
console.log('  BGP 差异样例(前3条):')
for (const b of bgp.slice(0,3)) console.log('   ', JSON.stringify(b).slice(0,260))
