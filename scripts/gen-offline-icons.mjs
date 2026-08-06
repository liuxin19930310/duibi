// 构建期脚本：把项目里实际用到的 MDI 图标抽取成离线子集，避免 @iconify/vue 运行时访问外网 API。
// 用法：node scripts/gen-offline-icons.mjs  （或通过 npm run gen:icons）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'src')

// 1. 扫描 src 下所有源码，收集用到的 mdi:xxx 图标名
const used = new Set()
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(p)
    } else if (/\.(vue|js|ts|jsx|tsx)$/i.test(entry.name)) {
      const txt = fs.readFileSync(p, 'utf8')
      const re = /mdi:([a-z0-9-]+)/g
      let m
      while ((m = re.exec(txt))) used.add(m[1])
    }
  }
}
walk(srcDir)

// 2. 从 @iconify-json/mdi 全量数据里解析需要的图标（含 alias 解析）
const full = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules/@iconify-json/mdi/icons.json'), 'utf8')
)
function resolve(name) {
  if (full.icons[name]) return [name, full.icons[name]]
  if (full.aliases && full.aliases[name]) {
    const parent = full.aliases[name].parent
    return [parent, full.icons[parent]]
  }
  return null
}

const subset = {
  prefix: full.prefix,
  icons: {},
  width: full.width,
  height: full.height,
}
if (full.top) subset.top = full.top

const missing = []
for (const name of used) {
  const r = resolve(name)
  if (!r) {
    missing.push(name)
    continue
  }
  const [key, data] = r
  subset.icons[name] = data
}

// 3. 写出精简子集到 src/iconify/mdi-offline.json
const outDir = path.join(root, 'src/iconify')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'mdi-offline.json')
fs.writeFileSync(outFile, JSON.stringify(subset))

console.log(`✓ 已生成离线图标子集：${used.size} 个图标 → ${path.relative(root, outFile)}`)
if (missing.length) console.warn('⚠ 未找到以下图标（请检查拼写）：', missing.join(', '))
