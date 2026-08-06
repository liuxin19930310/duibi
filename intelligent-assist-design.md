# 智能辅助细分 · 实现设计

> 对应 `optimization-supplement.md` 第 7 节：解析自纠错 / 异常配置自动分类 / 历史案例推荐。
> 本文给出**可落地的实现路径**，基于真实代码现状，不空谈。

## 0. 必须先补的两个 Parser 缺口（否则下面能力无从谈起）

读完 `src/utils/deviceParser.js` 与 `src/utils/db.js` 后，确认两个硬缺口：

- **缺口 A（自纠错前提）**：`parseDeviceInfo` 对每个 block 只"消费已知字段"，**未消费的行被静默丢弃**（`createRow` 默认值全是 `-`）。无法知道"哪些原始行没被识别"。
- **缺口 B（异常打标前提）**：`info` 对象只存了 `bgpCount`（邻居**数量**）、`ifDown`（端口**数量**），但**没有存 peer 状态、err-disable 标志、静态路由下一跳**。要检测"单边邻居/黑洞路由/err-disable"必须先把这些字段抓出来。

数据库 `db.js` 是通用 KV（IndexedDB），`storageSet/get/Keys` 直接用，案例库和解析问题库都能零成本落库。

---

## 1. 解析自纠错（解析失败聚类 + 归因）

### 1.1 改造 parser：记录未识别行
不改现有消费逻辑，而是在每个 section 解析后**反推"未消费行"**。

```js
// 在 parseConfigInterfaces / 各 parseConfig* 内，block 解析完后：
function trackUnrecognized(block, consumedLines, vendor, version, section) {
  const rawLines = block.split('\n').map(l => l.trim()).filter(Boolean)
  const unrecognized = rawLines.filter(l => !consumedLines.has(l))
  return unrecognized.map(l => ({ section, line: l, vendor, version }))
}
```
- 各 `parseConfig*` 在匹配到字段时，把"命中的原始行"加入 `consumedLines` 集合。
- `parseDeviceInfo` 最终返回 `info.unrecognized = [...]`（含 `vendor/version`，用于归因）。

### 1.2 归因分类器（纯函数，无模型）
```js
// src/utils/parseDiagnose.js
function classifyUnrecognized(info) {
  const KNOWN_VERSION_FEATURES = {
    huawei: [/vlan.*assignment/i, /route-policy.*if-match.*color/i], // 已知新版本字段
    h3c:    [/ip\s+subnet.*/i],
  }
  return info.unrecognized.map(u => {
    const isKnownFeature = (KNOWN_VERSION_FEATURES[u.vendor] || [])
      .some(re => re.test(u.line))
    if (isKnownFeature) return { ...u, reason: 'version-feature', fix: '需扩展解析器以支持该版本字段' }
    return { ...u, reason: 'parser-gap', fix: '未知结构，疑似解析器 bug 或新语法' }
  })
}
```
- `version-feature`：该厂商新版本才有、当前解析器未覆盖的字段 → 提示"扩展解析规则"。
- `parser-gap`：完全无法归类 → 疑似 bug。

### 1.3 聚类 + 落库（让问题可见、可治理）
- 在页面解析完成后调用 `classifyUnrecognized`，按 `(vendor, version, line 模板)` 做频次聚类（相同厂商版本 + 相似行归一组），出现频率高的优先排查。
- 存库：`storageSet('netops_parse_issues_' + vendor + '_' + version, clustered)`。
- 前端：在解析页加一个"解析健康度"小条——显示"未识别 N 行，其中 X 行疑似版本差异 / Y 行疑似 bug"，点击展开明细。

**价值**：解析器每跑一次都在自我体检；新设备版本上线时立刻暴露"哪些字段没被吃进去"，把"解析失败靠用户肉眼发现"变成"系统自动报告"。

---

## 2. 异常配置自动分类打标

### 2.1 先补缺口 B 的字段（增强 parser）
在 `parseDeviceInfo` 里扩展输出：
- `bgpPeers: [{ peer, as, state }]`（state 从 `display bgp peer` 的 `Established/Idle` 抓）
- `lldpPeers` 已有 `lldp.js`，复用其"本端口→对端设备"映射
- 接口加 `errDisable: boolean`（display interface 含 `error-down` / `err-disabled`）
- 静态路由保留 `nexthop` 已抓（`staticRoutes`），需额外标记"下一跳是否在本机直连网段"

### 2.2 规则引擎（纯函数，零依赖）
```js
// src/utils/anomalyDetect.js
export function detectAnomalies(info) {
  const out = []
  // (1) err-disable 端口
  info.interfaces.forEach(i => {
    if (i.errDisable) out.push({ level:'high', type:'err-disable', iface:i.interfaceName,
      detail:'端口处于 error-down 状态，需排查物理/协议原因' })
    // (2) 互联口缺 description（含 eth-trunk 或对联接口视为互联）
    if ((i.ethTrunk !== '-' || /^Eth-Trunk|^GE|^XGE/i.test(i.interfaceName))
        && i.description === '-')
      out.push({ level:'mid', type:'no-desc', iface:i.interfaceName, detail:'互联接口缺少 description' })
    // (3) CRC / 错包
    if (Number(i.crc) > 0 || Number(i.packetLossRate) > 0)
      out.push({ level:'mid', type:'crc', iface:i.interfaceName, detail:`CRC=${i.crc} 丢包=${i.packetLossRate}` })
  })
  // (4) 单边 BGP 邻居：配置了 peer 但状态非 Established
  info.bgpPeers.forEach(p => {
    if (p.state !== 'Established')
      out.push({ level:'high', type:'bgp-half', peer:p.peer, detail:`BGP 邻居 ${p.peer} 状态 ${p.state}` })
  })
  // (5) 黑洞路由：静态路由下一跳不在本机任何接口网段且非直连
  info.staticRoutes.forEach(r => {
    if (!isReachable(r.nexthop, info.interfaces))
      out.push({ level:'high', type:'blackhole', route:r.dest, detail:`下一跳 ${r.nexthop} 不可达` })
  })
  return out
}
```
- `isReachable` 是纯 IP 计算（下一跳是否落在任一接口 IP/掩码网段，或属于直连网段）。
- 输出 `anomalies[]`，前端在接口表新增"异常"列（图标 + tooltip）+ 页面顶部统计徽标（如"⚠ 3 高危 5 中危"）。

**价值**：把"人工逐行扫配置找问题"变成"打开页面自动标红"，尤其割接前巡检极有用。

---

## 3. 历史案例推荐（纯本地、无模型）

### 3.1 案例沉淀（扩展 db.js 现有 KV）
- 每次"成功割接"（解析结果 + 用户选定的**变更类型** + 用的**模板** + 最终结论）存一条：
  ```js
  storageSet('netops_case_' + Date.now(), {
    vendor, modelSeries, changeType,   // 如 huawei/CE/核心扩容
    templateUsed, summary, result,
    fingerprint: { ifCount, bgpCount, vlanCount, hasSrv6 } // 用于相似度
  })
  ```
- `modelSeries` 从 `info.model` 提取前缀（如 `CE6800`）。

### 3.2 相似度召回（MVP 可极简）
- 新任务进来时，按 `(vendor, modelSeries, changeType)` 精确→模糊匹配，召回 Top-3 历史 case。
- 进阶：用 `fingerprint` 向量做余弦相似度，推荐"拓扑规模相近"的历史方案。
- 前端：新建割接时显示"参考历史：①…②…③…"，一键"套用模板"。

**价值**：团队经验不随人离职流失；新人也能复用老手的成熟方案。

---

## 4. 落地顺序（建议）

| 阶段 | 内容 | 依赖 | 工作量 |
|---|---|---|---|
| **M1（地基）** | 补 Parser 缺口 A+B：记录未识别行、抓 bgpPeers/errDisable/下一跳 | deviceParser.js | 中 |
| **M2** | 异常分类打标 `anomalyDetect.js` + 前端"异常"列 | M1-B | 中 |
| **M3** | 解析自纠错 `parseDiagnose.js` + 解析健康度条 | M1-A | 中 |
| **M4** | 历史案例库 + 推荐（先做手动存/套用，再上相似度） | db.js | 低中 |

> M1 是绝对前提——它顺带还能改善"一键导出/对比"的数据完整性（现在漏抓的字段以后都能用上）。建议从 M1 起步，我可以直接动手改 `deviceParser.js`（改前按你习惯先备份）。

---
*注：这三类能力都是**数据驱动 + 规则引擎**，不依赖大模型，可完全本地运行，符合当前架构（纯前端 + 本地 IndexedDB + 可选后端采集）。*
