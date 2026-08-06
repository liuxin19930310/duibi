# 语义割接 Diff 设计文档 v2（Semantic Cutover Diff）

> 版本：v2（基于 v1 的代码对照审查修订，2026-08-06）
> 范围：在现有**确定性对比引擎**之上，叠加一层**大模型语义推理**，把"字段级 diff"升级为"可解释、可分级、可反哺解析器"的割接风险报告。
> 关联代码：`src/utils/compareCore.js`（`runComparePure` / `parseGlobalConfig`）、`src/utils/learnCore.js`（学习中心）、`src/utils/diagCore.js`（解析诊断）、`server/llm.js`（LLM 代理）、`server/learn.js`（案例库后端持久化）。
> v2 主要变更：修正与代码不符的模块清单与命名；修正前端入口位置；补充模型能力探针、上下文窗口采样优先级、脱敏一致性、流式独立端点等实施细节。详见文末「v1 → v2 修正清单」。

---

## 1. 背景与目标

系统已经能做**精确的字段级割接对比**：`runComparePure(beforeText, afterText)`（`compareCore.js:140`）产出结构化的 before/after diff，覆盖 `interface / bgp / isis / ldp / ldpPeer / lldp / srv6 / srv6TePolicy / routingStat` 等模块，每条变更项带 `configDiffFields: [{ field, beforeVal, afterVal }]`、`state`（`正常/变更/已失效/新增邻居`）、`isConsistent`。

但确定性引擎**只回答"什么变了"，不回答"变了意味着什么风险"**。这正是大模型的价值所在——也是本系统设计的核心定位：

- **LLM 不重新做 diff**（确定性引擎更准、更快、更省），而是**消费 diff + 原始配置残差**，产出两类输出。

### 设计目标
1. **语义风险报告**：把字段变更翻译成运维能直接决策的风险结论（高危/中危/低危 + 证据 + 建议）。
2. **解析器强化闭环**：顺带发现"确定性解析器漏网/误解析"的片段，自动生成学习案例（learn case），让解析器越用越强。
3. **可验证、可降级、安全**：模型不改配置、只喂结构化、默认脱敏、失败降级、learn case 人工确认入库。

---

## 2. 设计原则（红线，不可破）

1. **模型不改配置**：LLM 输出永远是"建议"，任何对配置的修改必须由人在 UI 确认。
2. **只喂结构化 / 已裁剪的输入**：原始配置不整篇喂，必须裁剪 + 脱敏后送入。
3. **默认脱敏**：请求发出前在浏览器内跑脱敏管线（密码 / SNMP community / 密钥；IP 可选），secret 不出本机。
4. **失败降级**：LLM 不可用 / 超时 / 报错时，语义分析整体隐藏或折叠，主对比流程零影响。
5. **learn case 人工确认入库**：解析器强化建议生成后，须经人工确认才进入案例库（沿用 `learnCore` 既有设计），杜绝自动污染。
6. **输入契约以实际代码为准**：所有字段名、模块名、返回值结构以 `compareCore.js` 当前实现为唯一事实源，设计文档不臆造模块。

---

## 3. 架构总览

```
  beforeText ─┐
              ├─► runComparePure(before, after) ─► 结构化 diff (interface/bgp/isis/ldp/…)
  afterText  ─┘                                       │  configDiffFields / state / isConsistent
                                                      │
  beforeText ─┐                                       │
  afterText  ─┤─► collectUnknownLines(text, vendor) ─► 原始配置残差 [ {iface, line, vendor} ]
              │     (learnCore.js:90；未解析行采样上限，非全文上限) │  ← 解析器没认出来的命令行（学习素材）
              │                                        │
              └─► 定位变更接口在 raw 中的位置 ─────────► 上下文窗口（变更项 ±N 行原始配置，按变更相关性采样）
                                                       │
                          ┌────────────────────────────┘
                          ▼
                 buildSemanticInput（裁剪 + 脱敏，diff/窗口同规则）
                          ▼
                 LLM 单趟调用（优先 function calling，不支持则 prompt 强约束 JSON）
                          ▼
            ┌─────────────────────────────┐
            │  通道 A：riskFindings        │  → 语义风险报告（UI 渲染）
            │  通道 B：parserGaps          │  → 解析器漏网项
            └─────────────────────────────┘
                          │
                          ▼
              parserGaps ──► 人工确认 ──► 新增 learn case ──► applyCasesToResult（下次解析零成本命中）
                          ▲                                                  │
                          └──────────────── 解析器更强 → 漏网更少 ───────────┘
```

**核心要点**：一次 LLM 调用、两个输出通道。通道 A 解决"差异意味着什么风险"（语义解读），通道 B 解决"解析器漏了什么"（覆盖检测 → 反哺解析器）。两通道由同一个 prompt 的 JSON schema 产出，不增加调用次数。

---

## 4. 输入契约

### 4.1 结构化 diff（必给，以 runComparePure 实际返回为准）

**代码事实**（v2 修正）：`runComparePure` 返回的模块键为：

```js
// compareCore.js runComparePure 的 return（v2 已核实）
{
  bgp, isis, ldp, ldpPeer, srv6, srv6TePolicy,
  interface, routingStat, lldp,
  counts: { bgpCount, isisCount, ldpCount, ldpPeerCount, srv6Count, srv6TePolicyCount, interfaceCount, routingStatCount, lldpCount }
}
```

注意与 v1 的差异：
- 接口模块键是 **`interface`**（不是 `interfaces`）；
- 路由表模块键是 **`routingStat`**（不是 `routing`）；
- SRv6 TE Policy 模块键是 **`srv6TePolicy`**（不是 `te`）；
- 另有 **`ldpPeer`** 模块，v1 遗漏；
- **`runComparePure` 当前不输出 `globalConfig`**（`parseGlobalConfig` 只在解析侧 `parseDeviceProtocolsPure` 内调用）。若语义割接需要全局配置对比，必须在 M1 给对比侧补实现（见 4.1.1），否则从输入契约中移除该模块，**不要假设它存在**。

只挑选**变更项**（`isConsistent === false`）送入，避免噪声：

```js
// 伪代码：从 runComparePure 结果抽取变更（v2 修正字段名）
const MODULES = ['interface', 'bgp', 'isis', 'ldp', 'ldpPeer', 'lldp', 'srv6', 'srv6TePolicy', 'routingStat', 'globalConfig']

const keyOf = {
  interface: (r) => r.interfaceName,
  bgp: (r) => r.neighborIp,
  isis: (r) => r.peerSystemId,
  ldp: (r) => r.peerId,
  ldpPeer: (r) => r.peerId,
  lldp: (r) => r.localIntf,
  srv6: (r) => r.sid,
  srv6TePolicy: (r) => r.policyName,
  routingStat: (r) => r.proto,
  globalConfig: (r) => r.item
}

const changed = []
for (const mod of MODULES) {
  const list = compareResult[mod]
  if (!Array.isArray(list)) continue
  for (const item of list) {
    if (typeof item.isConsistent !== 'boolean') continue // 纯状态/无比较语义的行跳过
    if (!item.isConsistent) {
      changed.push({
        module: mod,
        key: (keyOf[mod] && keyOf[mod](item)) || '?',
        state: item.state || '',
        diffFields: item.configDiffFields || [] // [{ field, beforeVal, afterVal }]
      })
    }
  }
}
```

#### 4.1.1 对比侧补齐 globalConfig（M1 前置小任务，可选但推荐）
`parseGlobalConfig(text, vendor)` 已是纯函数（`compareCore.js` 导出）。对比侧补法：

```js
// 在 runComparePure 内（v2 建议）
const vendor = /(\bH3C\b)/i.test(beforeText + afterText) ? 'h3c' : 'huawei'
const beforeGlobal = parseGlobalConfig(beforeText, vendor)
const afterGlobal = parseGlobalConfig(afterText, vendor)
const globalConfig = afterGlobal.map(a => {
  const b = beforeGlobal.find(x => x.item === a.item)
  const diffFields = []
  if (b && b.value !== a.value) diffFields.push({ field: 'value', beforeVal: b.value, afterVal: a.value })
  return { item: a.item, value: a.value, isConsistent: diffFields.length === 0, configDiffFields: diffFields }
})
```

### 4.2 原始配置残差 + 上下文窗口

**为什么必须给**：若只喂 §4.1 的 diff，解析器漏解析/误解析的片段根本不会出现在 diff 里，LLM 永远看不到，既可能误判"无风险"，也无法帮你发现解析器弱点。所以 LLM 必须能触达原始配置——但**不整篇喂**。

**残差（parser 未识别行）**：复用 `collectUnknownLines(beforeText, vendor)` 与对 `afterText` 的同调，输出 `[{iface, line, vendor}]`。这是学习素材，也是覆盖检测的黄金输入。

> **澄清上限误解**：这里的"上限"指的是**未解析行（parser 漏网的命令行）**的采样上限，**不是整个配置的上限**。整个配置本来就不该全喂 LLM（token 爆炸 + LLM 不擅长精确逐行比对，那是确定性引擎的活）。语义 diff 实际喂的是「结构化 diff + 未解析残差 + 变更上下文窗口」的组合，三者裁剪后合计 ≤ `MAX_CONFIG_CHARS`（见 §4.2.2）。

#### 4.2.1 未解析行采样上限修订（原 `MAX_UNKNOWN_LINES = 200` 的隐患，v2 确认属实）
`collectUnknownLines`（`learnCore.js:83/106`）当前是**顺序硬截断**：`if (result.length >= MAX_UNKNOWN_LINES) return`，即前 200 条被收集到的未解析行留下、其余**静默丢弃且不告知**。问题在于：
- 若配置很新 / 解析器覆盖差，未解析行很容易 > 200，顺序截断会**漏掉靠后的、可能恰恰最关键的漏网行**（如某段 ACL / NAT 子命令）。
- 截断是"先到先得"，与"是否和变更相关"无关，优先级错乱。

**修订为优先级采样 + 自适应上限 + 覆盖率告警**（语义 diff 与学习中心共用该函数，应同步修订 `learnCore.collectUnknownLines`）：
1. **自适应上限**：`MAX_UNKNOWN_LINES` 不再固定 200，改为按 token 预算反推，或至少放宽到如 500，并把"是否截断"作为信号。
2. **优先级采样**：收集到的未解析行先按"是否落在变更接口 / 变更协议块附近"打分排序，**变更相关优先**，不足额度再随机抽样兜底，避免只采前段。
3. **覆盖率透明化**：函数额外返回 `totalUncovered` 与 `sampledCount`；语义 diff 报告在 `parserGaps` 区明确标注*"本次分析基于 N 条未解析中的 K 条抽样，剩余 M 条建议先扩充解析器或人工复核"*——**绝不假装看全了**。
4. **覆盖率本身即告警**：若 `totalUncovered` 超阈值（如 > 某比例或绝对数），语义报告单独列一节"解析覆盖率不足"，提示应先强化 parser，而非依赖 LLM 硬猜。

#### 4.2.2 上下文窗口（变更项原始上下文，按变更相关性采样）
对每个变更接口，在原始配置文本中定位其 `interface XXX` 行（协议变更则定位对应协议块），截取 **±N 行（建议 N=15）** 原始配置。用途：让 LLM 核实解析器没看错（例如 `nat` 子命令是否被正确归类），并理解变更所处的完整配置语义。

**v2 新增：窗口也必须按变更相关性采样**，否则变更项一多预算立即爆炸：
- 变更项 ≤ 5 个：全部取窗口；
- 变更项 > 5 个：按 `severity 信号`（如删除/失效/新增 > 字段值变更 > 描述变更）排序，最多取 5 个变更项的窗口，其余只送 diff 摘要；
- 窗口内部行数可再按剩余预算动态收缩（N 从 15 降为 8 / 4）。

**裁剪总量上限**（沿用 `diagCore.js` 的经验值，可配置）：
- 每模块变更项摘要行上限：`MAX_ROWS_PER_MODULE = 30`
- 原始配置节选字符上限：`MAX_CONFIG_CHARS = 6000`（残差 + 上下文窗口合计，超出按优先级截断：**先保证 diff → 再保证残差 → 最后上下文窗口**；窗口内部再按 §4.2.2 采样收缩）
- 残差内部优先级：变更接口 / 变更协议块附近的未解析行 > 随机抽样；与变更无关的纯噪声残差可降权或丢弃

### 4.3 脱敏管线（默认开，v2 补充一致性要求）

在 `buildSemanticInput` 内、送入 LLM 前执行（纯前端、确定性）：
- 掩码：`password`、`snmp-agent community`、`pre-shared-key`、`secret`、`token` 等后面的敏感值 → `***`
- IP 地址：可配置为脱敏（`10.x.x.x` 形态）或保留（割接分析通常需要保留以定位对端）
- 记录"掩了哪些类型"的审计信息随请求上下文留存（不送入 LLM）

**v2 补充：脱敏一致性是硬要求**——同一份输入里，`diff 中的值`、`残差行`、`上下文窗口`必须走**同一套脱敏规则**（同一字段、同一掩码形态），否则 LLM 会看到 diff 说 `community` 变了、窗口里却是 `***`，`evidence` 无法溯源。实现上建议：
1. 先对 before/after 全文跑一遍脱敏，再在其上做 diff 抽取与窗口截取（保证三处文本同源）；
2. `riskFindings.evidence` 只允许引用脱敏后的文本；
3. 脱敏规则集中在一个函数（`src/utils/redact.js`），diff / 残差 / 窗口共用。

---

## 5. 输出 Schema（结构化 JSON）

**优先使用 function calling / 结构化输出**，严格按内部 schema 返回 JSON，避免"自由文本 + 正则抠取"（`diagCore.parseDiagnoseIssues` 的现状是易碎层，v2 保留"消除它"的目标）。

**v2 新增：模型能力探针（M1 第一件事）**——在选型落地前先验证当前配置的模型（SenseNova / DeepSeek 的 OpenAI 兼容端点）是否支持：
- `tools` / `function calling`；
- 或至少 `response_format: { type: 'json_object' }`；
- 不支持时 fallback：prompt 内强制"只输出 JSON 数组/对象" + 复用 `diagCore.parseDiagnoseIssues` 同款解析（带 markdown 代码块剥离、容错）。**探针结果决定 §5 用哪条路径，且 fallback 路径必须预先实现，不能上线后才发现模型不支持。**

```json
{
  "riskFindings": [
    {
      "severity": "high" | "medium" | "low" | "info",
      "module": "interface" | "globalConfig" | "bgp" | "...",
      "title": "NAT 由动态改为静态，已有会话将中断",
      "evidence": "diff: nat outbound 100 address-group dynamic → static; 接口 GE1/0/1",
      "impact": "割接瞬间该 NAT 映射下的存量会话断开，需确认业务是否容忍",
      "suggestion": "割接窗口内先建立等价静态映射并确认对端可达，再切换",
      "confidence": 0.0_1.0
    }
  ],
  "parserGaps": [
    {
      "iface": "GE1/0/1",
      "rawLine": "service-instance 100 vlan-group 2",
      "issue": "该行未被接口解析器识别，可能含可学习字段",
      "suggestedField": "vlanGroup"
    }
  ]
}
```

**通道 A — `riskFindings`**：语义风险报告。强制 `evidence` 引用具体 `diff` 字段或 `rawLine`（且为脱敏后文本），保证可溯源、可人工复核。
**通道 B — `parserGaps`**：解析器漏网项。每条直接对应一个潜在的 learn case 候选，UI 上可"一键转为学习案例"。

### 风险分级标准（severity 判定参考）

| 级别 | 典型信号 | 示例 |
|---|---|---|
| high | 会话中断 / 路由黑洞 / 业务放行之 ACL 被删 / 邻居失效且无对端同步 | NAT 动态→静态；BGP 邻居"已失效"；ACL 100 删除 |
| medium | 容量/性能退化、地址冲突风险、认证方式变更 | MTU 减小；新增 loopback 未通告；bfd 间隔变长 |
| low | 仅命名规范调整、描述变更、等价重写 | `GE0/1`→`GE1/0` 同物理口；ACL 等价重写 |
| info | 无风险的事实性说明 | 新增接口但无业务依赖 |

---

## 6. 后端实现（`server/semantic.js`）

新增模块，挂载到 `server/index.js` 的 `/api/semantic`，**复用 `llm.js` 的代理与鉴权范式**（`loadConfig` / `resolveEndpoint` / `chatCompletion`）：

- 端点：
  - `POST /api/semantic/analyze`：入参 `{ diff, unknownLines, contextWindows, vendor }`（前端已裁剪+脱敏），后端以 function-calling（或 fallback prompt）方式调用，返回结构化 JSON。
- 鉴权：全局 `authRequired` 已生效，无需额外写。
- 不落盘、不写配置：纯推理接口。

**v2 修正（流式）**：
- v1 建议直接改 `llm.js` 为 `stream: true`——**不可取**：`chatCompletion` 被 AI 诊断、学习中心、测试连接共用，直接改会影响存量调用。
- 改为 `server/semantic.js` 内部实现独立的流式转发（`stream: true` + SSE 转发 `text/event-stream`），前端打字机渲染、可中途取消；`llm.js` 保持 `stream: false` 不动，待 M4 时再评估统一改造。

> 注意：`buildSemanticInput` 的裁剪/脱敏在**前端**完成（脱敏必须在本机），后端只负责转发已脱敏的负载。

---

## 7. 前端实现

- **入口（v2 修正）**：挂在**对比结果页 `ComparePage.vue`**（`DevicePage.vue` 是解析页、没有对比视图），新增按钮「语义割接分析」。ComparePage 已有 `runCompare` 产出结果，天然是入口点。
- 触发：用 `runCompare` 结果 + `collectUnknownLines` + 上下文窗口 → `buildSemanticInput` → `POST /api/semantic/analyze`。
- 渲染：新增 `SemanticDiffPanel.vue`（参考 `ProtoPanel` / 诊断面板的折叠交互）：
  - 通道 A：`riskFindings` 按 severity 分组，高危置顶，每条可展开看 `evidence/impact/suggestion`，显示 `confidence`；
  - 通道 B：`parserGaps` 列表，每条带「转为学习案例」按钮 → 复用学习中心入库流程（`parseCaseSuggestions` 同款），人工确认后入库；
  - 覆盖率提示：按 §4.2.1 显示"本次分析基于 N 条未解析中的 K 条抽样"。
- 降级：LLM 不可用 / 超时 / 返回空 → 面板整体隐藏或显示"语义分析暂不可用（不影响对比结果）"，主流程零影响。

---

## 8. 闭环：解析器强化（通道 B → learn case）

1. `parserGaps[].rawLine` 作为未知行候选，喂给 `buildLearnPrompt`（`learnCore.js`）；
2. 用户在 UI 确认提取规则（字段须 ∈ `LEARN_FIELDS`，`learnCore.js`），生成 case；
3. case 经 `mergeCasesWithDedup`（`learnCore.js`，`patternsSimilar` 语义去重）入库（前端 IndexedDB + 后端 `server/learn.js` 落盘 `learn-cases.json`）；
4. 下次 `applyCasesToResult(interfaces, unknownLines, cases)`（`learnCore.js`）零成本命中，解析器覆盖提升。

闭环：`parse → diff → LLM 解读+找漏网 → learn case → 解析器增强 → 漏网更少 → 下轮 diff 更准`。

---

## 9. 成本与降级

- **调用次数**：每次分析 1 次 LLM 调用（双通道同趟），不随模块数线性增长。
- **Token 管控**：§4.2 的裁剪上限（diff + 残差 + 上下文窗口合计 ≤ `MAX_CONFIG_CHARS`）是硬约束；上下文窗口按变更相关性采样（§4.2.2）。
- **结果缓存**（高 ROI 待办）：按 `hash(diff + unknownLines + model)` 缓存到后端/IndexedDB，同一份配置块二次割接不再烧 token。
- **流式输出**（M4）：`server/semantic.js` 独立实现 SSE 流式，前端可取消；`llm.js` 公共 `chatCompletion` 不动，避免存量功能回归。
- **降级**：LLM 故障 → 隐藏语义面板；解析器强化（通道 B）失败不影响通道 A；反之同理。

---

## 10. 评估（golden set）

没有评估骨干，所有 LLM 优化都是玄学。建议建：

- **golden set**：已知 `(before, after)` 配置 → 已知正确风险报告（人工标注 high/medium/low 各若干，建议起步 ≥ 5 组）。
- **自动指标**：
  - 风险召回率 / 误报率（对比人工标注）；
  - `parserGaps` 中"真漏网"占比（而非把已解析项误报为漏网）；
  - 端到端 token 成本 / 时延。
- **CI 门禁**：任何 prompt / 模型切换必须过 golden set、不许回归。

---

## 11. 实施里程碑

| 阶段 | 内容 | 风险 | 依赖 |
|---|---|---|---|
| M0 | **模型能力探针**：验证当前模型的 tools / response_format 支持度，决定 §5 走 function calling 还是 prompt 强约束 + fallback 解析 | 低 | 现有 LLM 配置 |
| M1 | 对比侧补 `globalConfig` diff（§4.1.1，推荐）；`buildSemanticInput`（裁剪 + 脱敏 + 一致性）；`server/semantic.js` 代理转发 | 低 | M0；`llm.js` 已有范式 |
| M2 | `SemanticDiffPanel.vue` 渲染通道 A（风险报告） | 低 | M1 |
| M3 | 通道 B（parserGaps）→ 一键转 learn case（含覆盖率提示） | 低 | 学习中心 UI 已存在 |
| M4 | `server/semantic.js` 独立流式输出 + 结果缓存 | 中 | M1-M3 |
| M5 | golden set + 评估脚本 | 中 | M1-M3 |

**建议顺序**：M0 → M1 → M2 → M3 先打通端到端（低风险、直接验证价值），再上 M4（体感优化），最后 M5（保障不退步）。
> 跑通并固化了 M1-M5 的单趟基线（含 golden set 基准）后，演进到 §12 的 M6-M8：全文语境 + 分层推理、配置语义图谱/知识积累、交互式追问 + 自动验证。

---


---

## 12. 演进路线：放开 token 约束后的更优方案（M6-M8）

> v2 新增章节。M0-M5 的"最优"建立在**省 token**这个约束上：单趟调用、输入裁剪、双通道压缩——本质是"用最少的钱拿到可用的结果"。本章讨论放开该约束后的质变方向。它们不是替代 M1-M5，而是跑通单趟基线（拿到 golden set 基准）之后的演进。

### 12.1 三个质变方向

| 方向 | 解决的根本问题 | 对应阶段 |
|---|---|---|
| 全文语境 | 局部 diff 推理有结构性盲区：跨模块联动风险看不到 | M6 |
| 分层多趟推理 | 单趟注意力摊薄，深层次推理易被表面信息淹没 | M6 |
| 知识积累 | 每次割接从零理解，无法利用设备历史与配置依赖关系 | M7 |
| 会话 + 行动闭环 | 一次性报告不可追问、不落到执行验证 | M8 |

### 12.2 M6：全文语境 + 分层推理

**为什么必须**：现有输入是「diff 摘要 + 采样残差 + 少量上下文窗口」，模型看不到配置全貌，只能解释"这一处变了"，发现不了**跨模块联动风险**——例如「NAT 改动 + 静态路由删除 + OSPF 区域边界变化」单看都不高危，合起来会导致某条业务路径中断。这是局部推理的结构性盲区，不是优化 prompt 能解决的。

**做法（分层多趟）**：

1. **第一趟 · 意图归纳**：通读整份 before/after 配置，把散落的字段变更归纳成"变更意图组"——这几处其实是同一个动作（如"把业务 A 从旧链路切到新链路"），输出 `[{ intentId, title, changedItems: [...] }]`；
2. **第二趟 · 定向深挖**：对每个高价值意图组单独调用，聚焦它、附带完整的相关配置块，追问"这组变更的失效模式、影响面、验证步骤"；
3. **可选第三趟 · 对抗评审**：让模型换个视角挑前两趟结论的错（如"哪些结论在配置中找不到证据"），合并后输出最终报告。

**超大配置的变通**：全文送入仍受模型上下文窗口物理上限（当前常见 32K~128K token）。超限时采用**全文分段 + 汇总**：按模块/区域切段，各段独立归纳，再汇总成全局意图视图；分段边界要包含接口归属判定，避免"接口块被切开"。

**评估硬要求**：多趟是否真的比单趟准，必须用 golden set 量化对比（召回率 / 误报率 / 联动风险命中数），不能想当然"多花钱就更好"；只有单趟基线已固化后才启动 M6。

### 12.3 M7：配置语义图谱 + 设备知识积累

**预计算 + 增量分析**（长期价值最高的方向）：

- **割接前预计算**：对基线配置离线分析，构建语义图谱——接口依赖、路由联动、NAT 映射、业务承载关系（哪条业务依赖哪个接口/邻居/路由），存为结构化知识（后端落盘，可复用 `server/learn.js` 的持久化范式）；
- **割接时增量分析**：只分析"差异对图谱的影响"——某接口 down 会级联影响哪些承载业务、某路由删除的下一跳是否还有兜底；
- **设备历史记忆**：同一设备多次割接后，模型可对比"本次变更是否把上次修过的问题改回来了"，判断变更回归。

**存储形态建议**：图谱与历史以 JSON 落盘（与案例库同款文件存储），键为 `deviceId + 基线指纹`；版本化保留，支持"回到 N 次前"对比。

### 12.4 M8：交互式追问 + 自动验证命令

**会话式诊断**：分析完成后不锁死为一次性报告，用户可追问（"这个 BGP 变更具体影响哪几条业务？"），后端在已加载的完整配置上下文上继续回答（M6 的全文语境是前置）。

**验证闭环**：每条风险自动附带**割接后验证命令序列**（如 `display bgp peer` / `display ip routing-table` / `display nat session`），用户在割接后执行并回贴输出，模型核对"是否与预期一致"，形成 诊断 → 执行 → 复核 的闭环。

### 12.5 边界与前置条件

- **上下文窗口物理上限**：全文送入不是无限，超限走分段汇总（§12.2）；
- **时延**：多趟推理端到端时延显著上升，UI 必须流式渲染 + 可取消（M4 的独立流式端点是前置）；
- **模型能力**：M0 探针需覆盖"长上下文"与"多轮追问"能力，不达标时 M6-M8 的收益会打折；
- **评估不倒退**：M6-M8 每个阶段都必须过 golden set（§10），防止引入不可验证的"更复杂"。

---

## 附 A：v1 → v2 修正清单

| # | v1 原文 | v2 修正 | 依据 |
|---|---|---|---|
| 1 | diff 覆盖 `interfaces / globalConfig / bgp / isis / ldp / lldp / srv6 / te / routing` | 实际为 `interface / bgp / isis / ldp / ldpPeer / lldp / srv6 / srv6TePolicy / routingStat`；`globalConfig` 需对比侧补实现（§4.1.1） | `runComparePure` return（compareCore.js 已核实） |
| 2 | 接口模块名 `interfaces` | `interface` | 同上 |
| 3 | 路由模块名 `routing` | `routingStat` | 同上 |
| 4 | TE 模块名 `te` | `srv6TePolicy` | 同上 |
| 5 | 入口在"`DevicePage.vue` 的对比视图" | 入口在 `ComparePage.vue`（DevicePage 无对比视图） | 路由/页面结构核实 |
| 6 | 直接改 `llm.js` 为流式 | `server/semantic.js` 独立实现流式，不动公共 `chatCompletion` | `llm.js` 被诊断/学习中心/测试共用 |
| 7 | 上下文窗口"±N 行"无上限策略 | 窗口按变更相关性采样（变更项 ≤5 全取，>5 取前 5），预算动态收缩 | §4.2.2 |
| 8 | 脱敏仅列类型 | 明确 diff / 残差 / 窗口同规则脱敏，evidence 只引用脱敏后文本；脱敏函数集中复用 | §4.3 |
| 9 | 未明确模型能力 | 新增 M0 模型能力探针 + fallback 路径预实现 | §5 / §11 |
| 10 | 未提 `ldpPeer` 模块 | 补入输入契约 | `runComparePure` return |

## 附 B：与现有功能的关系

- **学习中心**（`learnCore`）：本设计的通道 B 是其"输入源"之一（从割接 diff 场景批量发现漏网），二者共用案例库与持久化（前端 IndexedDB + 后端 `server/learn.js`）。
- **解析诊断**（`diagCore`）：本设计复用其裁剪常量与"结构化输出"思路；语义割接 diff 是诊断的"割接对比"专用化版本，输入多带了一份 before/after diff。
- **确定性对比**（`compareCore`）：本设计的**唯一权威 diff 源**，永不被动摇。

> 一句话：确定性引擎做"什么变了"（权威），LLM 做"变了意味着什么 + 哪里还没解析到"（语义 + 覆盖），两者各司其职、互相增强。
