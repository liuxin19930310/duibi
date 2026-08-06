# 语义割接 Diff 设计文档（Semantic Cutover Diff）

> 版本：v1（基于 2026-08-06 讨论与设计落地）
> 范围：在现有**确定性对比引擎**之上，叠加一层**大模型语义推理**，把"字段级 diff"升级为"可解释、可分级、可反哺解析器"的割接风险报告。
> 关联代码：`src/utils/compareCore.js`（`runComparePure`）、`src/utils/learnCore.js`（学习中心）、`src/utils/diagCore.js`（解析诊断）、`server/llm.js`（LLM 代理）。

---

## 1. 背景与目标

系统已经能做**精确的字段级割接对比**：`runComparePure(beforeText, afterText)`（`compareCore.js:140`）产出结构化的 before/after diff，覆盖 `interfaces / globalConfig / bgp / isis / ldp / lldp / srv6 / te / routing` 等模块，每条变更项带 `configDiffFields: [{ field, beforeVal, afterVal }]`、`state`（`正常/变更/已失效/新增邻居`）、`isConsistent`。

但确定性引擎**只回答"什么变了"，不回答"变了意味着什么风险"**。这正是大模型的价值所在——也是本系统设计的核心定位：

- **LLM 不重新做 diff**（确定性引擎更准、更快、更省），而是**消费 diff + 原始配置残差**，产出两类输出。

### 设计目标
1. **语义风险报告**：把字段变更翻译成运维能直接决策的风险结论（高危/中危/低危 + 证据 + 建议）。
2. **解析器强化闭环**：顺带发现"确定性解析器漏网/误解析"的片段，自动生成学习案例（learn case），让解析器越用越强。
3. **可验证、可降级、安全**：模型不改配置、只喂结构化、默认脱敏、失败降级、learn case 人工确认入库。

---

## 2. 设计原则（红线，不可破）

沿用用户拍板与既有实现：

1. **模型不改配置**：LLM 输出永远是"建议"，任何对配置的修改必须由人在 UI 确认。
2. **只喂结构化 / 已裁剪的输入**：原始配置不整篇喂，必须裁剪 + 脱敏后送入。
3. **默认脱敏**：请求发出前在浏览器内跑脱敏管线（密码 / SNMP community / 密钥；IP 可选），secret 不出本机。
4. **失败降级**：LLM 不可用 / 超时 / 报错时，语义分析整体隐藏或折叠，主对比流程零影响。
5. **learn case 人工确认入库**：解析器强化建议生成后，须经人工确认才进入案例库（沿用 `learnCore` 既有设计），杜绝自动污染。

---

## 3. 架构总览

```
  beforeText ─┐
              ├─► runComparePure(before, after) ─► 结构化 diff (interfaces/globalConfig/bgp/…)
  afterText  ─┘                                       │  configDiffFields / state / isConsistent
                                                      │
  beforeText ─┐                                       │
  afterText  ─┤─► collectUnknownLines(text, vendor) ─► 原始配置残差 [ {iface, line, vendor} ]
              │     (learnCore.js:90；未解析行采样上限，非全文上限) │  ← 解析器没认出来的命令行（学习素材）
              │                                        │
              └─► 定位变更接口在 raw 中的位置 ─────────► 上下文窗口（变更项 ±N 行原始配置）
                                                       │
                          ┌────────────────────────────┘
                          ▼
                 buildSemanticInput（裁剪 + 脱敏）
                          ▼
                 LLM 单趟调用（function calling，结构化 JSON 输出）
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

### 4.1 结构化 diff（必给）
直接来自 `runComparePure` 的结果。只挑选**变更项**（`isConsistent === false`）送入，避免噪声：

```js
// 伪代码：从 compareResult 抽取变更
const changed = []
for (const mod of ['interfaces','globalConfig','bgp','isis','ldp','lldp','srv6','te','routing']) {
  for (const item of compareResult[mod] || []) {
    if (!item.isConsistent) {
      changed.push({
        module: mod,
        key: item.interfaceName || item.item || item.neighborIp || item.sid || '?',
        state: item.state,
        diffFields: item.configDiffFields // [{ field, beforeVal, afterVal }]
      })
    }
  }
}
```

### 4.2 原始配置残差 + 上下文窗口（用户关键补充）
**为什么必须给**：若只喂 §4.1 的 diff，解析器漏解析/误解析的片段根本不会出现在 diff 里，LLM 永远看不到，既可能误判"无风险"，也无法帮你发现解析器弱点。所以 LLM 必须能触达原始配置——但**不整篇喂**。

**残差（parser 未识别行）**：复用 `collectUnknownLines(beforeText, vendor)` 与对 `afterText` 的同调，输出 `[{iface, line, vendor}]`。这是学习素材，也是覆盖检测的黄金输入。

> **澄清上限误解**：这里的"上限"指的是**未解析行（parser 漏网的命令行）**的采样上限，**不是整个配置的上限**。你导入的配置整体几千行完全不用管——因为整个配置本来就不该全喂 LLM（token 爆炸 + LLM 不擅长精确逐行比对，那是确定性引擎的活）。语义 diff 实际喂的是「结构化 diff + 未解析残差 + 变更上下文窗口」的组合，三者裁剪后合计 ≤ `MAX_CONFIG_CHARS`（见 §4.2 末尾）。

#### 4.2.1 未解析行采样上限修订（原 `MAX_UNKNOWN_LINES = 200` 的隐患）
`collectUnknownLines`（`learnCore.js:83/90/106`）当前是**顺序硬截断**：`if (result.length >= MAX_UNKNOWN_LINES) return`，即前 200 条被收集到的未解析行留下、其余**静默丢弃且不告知**。问题在于：
- 若配置很新 / 解析器覆盖差，未解析行很容易 > 200，顺序截断会**漏掉靠后的、可能恰恰最关键的漏网行**（如某段 ACL / NAT 子命令）。
- 截断是"先到先得"，与"是否和变更相关"无关，优先级错乱。

**修订为优先级采样 + 自适应上限 + 覆盖率告警**（语义 diff 与学习中心共用该函数，应同步修订 `learnCore.collectUnknownLines`）：
1. **自适应上限**：`MAX_UNKNOWN_LINES` 不再固定 200，改为按 token 预算反推，或至少放宽到如 500，并把"是否截断"作为信号。
2. **优先级采样**：收集到的未解析行先按"是否落在变更接口 / 变更协议块附近"打分排序，**变更相关优先**，不足额度再随机抽样兜底，避免只采前段。
3. **覆盖率透明化**：函数额外返回 `totalUncovered` 与 `sampledCount`；语义 diff 报告在 `parserGaps` 区明确标注*"本次分析基于 N 条未解析中的 K 条抽样，剩余 M 条建议先扩充解析器或人工复核"*——**绝不假装看全了**。
4. **覆盖率本身即告警**：若 `totalUncovered` 超阈值（如 > 某比例或绝对数），语义报告单独列一节"解析覆盖率不足"，提示应先强化 parser，而非依赖 LLM 硬猜。

**上下文窗口（变更项原始上下文）**：对每个变更接口，在原始配置文本中定位其 `interface XXX` 行，截取 **±N 行（建议 N=15）** 原始配置。用途：让 LLM 核实解析器没看错（例如 `nat` 子命令是否被正确归类），并理解变更所处的完整配置语义。

**裁剪总量上限**（沿用 `diagCore.js:23-24` 的经验值，可配置）：
- 每模块变更项摘要行上限：`MAX_ROWS_PER_MODULE = 30`
- 原始配置节选字符上限：`MAX_CONFIG_CHARS = 6000`（残差 + 上下文窗口合计，超出按优先级截断：先保证 diff，再保证残差，最后上下文窗口）
- 残差内部优先级：变更接口 / 变更协议块附近的未解析行 > 随机抽样；与变更无关的纯噪声残差可降权或丢弃（详见 §4.2.1）

### 4.3 脱敏管线（默认开）
在 `buildSemanticInput` 内、送入 LLM 前执行（纯前端、确定性）：
- 掩码：`password`、`snmp-agent community`、`pre-shared-key`、`secret`、`token` 等后面的敏感值 → `***`
- IP 地址：可配置为脱敏（`10.x.x.x` 形态）或保留（割接分析通常需要保留以定位对端）
- 记录"掩了哪些类型"的审计信息随请求上下文留存（不送入 LLM）

---

## 5. 输出 Schema（function calling，结构化 JSON）

**不使用自由文本 + 正则抠取**（那是最脆的环节，见 `diagCore.parseDiagnoseIssues` 的现状）。改为让 LLM 走**结构化输出 / function calling**，严格按内部 schema 返回 JSON，彻底消掉"解析 LLM 输出"这个易碎层。

```json
{
  "riskFindings": [
    {
      "severity": "high" | "medium" | "low" | "info",
      "module": "interfaces" | "globalConfig" | "bgp" | "...",
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
      "suggestedField": "vlanGroup" // 可选，提示 learn case 的提取目标字段（须 ∈ LEARN_FIELDS）
    }
  ]
}
```

**通道 A — `riskFindings`**：语义风险报告。强制 `evidence` 引用具体 `diff` 字段或 `rawLine`，保证可溯源、可人工复核。
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

新增模块，挂载到 `server/index.js` 的 `/api/semantic`，**完全复用 `llm.js` 的代理与鉴权范式**：

- 复用 `llm.js` 的 `loadConfig`（Key 优先级：设置页 > `.env` > 文件）、`resolveEndpoint`、`chatCompletion`。
- 端点：
  - `POST /api/semantic/analyze`：入参 `{ diff, unknownLines, contextWindows, vendor }`（前端已裁剪+脱敏），后端用 `chatCompletion` 以 function-calling 方式调用，返回结构化 JSON。
  - 建议**改为流式（`stream: true`）**转发 `text/event-stream`，前端打字机渲染并可中途取消（当前 `llm.js` 是 `stream:false`，待办项，见 §9）。
- 鉴权：全局 `authRequired` 已生效，无需额外写。
- 不落盘、不写配置：纯推理接口。

> 注意：`buildSemanticInput` 的裁剪/脱敏在**前端**完成（脱敏必须在本机），后端只负责转发已脱敏的负载。

---

## 7. 前端实现

- 入口：对比结果页（如 `DevicePage.vue` 的对比视图）新增按钮 **「语义割接分析」**。
- 触发：调用 `runComparePure` 已有结果 + `collectUnknownLines` + 上下文窗口 → `buildSemanticInput` → `POST /api/semantic/analyze`。
- 渲染：新增 `SemanticDiffPanel.vue`（参考 `ProtoPanel` / 诊断面板的折叠交互）：
  - 通道 A：`riskFindings` 按 severity 分组，高危置顶，每条可展开看 `evidence/impact/suggestion`，显示 `confidence`。
  - 通道 B：`parserGaps` 列表，每条带「转为学习案例」按钮 → 调 `learnCore.parseCaseSuggestions` 同款流程，人工确认后入库（复用现有学习中心入库 UI）。
- 降级：LLM 不可用 / 超时 / 返回空 → 面板整体隐藏或显示"语义分析暂不可用（不影响对比结果）"，主流程零影响。

---

## 8. 闭环：解析器强化（通道 B → learn case）

这是用户强调的"对现有解析器进行强化和学习"的落地路径，**完全复用现有学习中心能力**：

1. `parserGaps[].rawLine` 作为未知行候选，喂给 `buildLearnPrompt`（复用 `learnCore.js:191`）。
2. 用户在 UI 确认提取规则（字段须 ∈ `LEARN_FIELDS`，见 `learnCore.js:12`），生成 case。
3. case 经 `mergeCasesWithDedup`（`learnCore.js:338`，按 `id` 合并 + `patternsSimilar` 语义去重）入库（后端 `server/learn.js` 持久化）。
4. 下次 `applyCasesToResult(interfaces, unknownLines, cases)`（`learnCore.js:166`）零成本命中，解析器覆盖提升。

闭环：`parse → diff → LLM 解读+找漏网 → learn case → 解析器增强 → 漏网更少 → 下轮 diff 更准`。

---

## 9. 成本与降级

- **调用次数**：每次分析 1 次 LLM 调用（双通道同趟），不随模块数线性增长。
- **Token 管控**：§4.2 的裁剪上限（diff + 残差 + 上下文窗口合计 ≤ `MAX_CONFIG_CHARS`）是硬约束。
- **结果缓存**（高 ROI 待办）：按 `hash(diff + unknownLines + model)` 缓存到后端/IndexedDB，同一份配置块二次割接不再烧 token（复用 `diagCore` 输入结构）。
- **流式输出**（待办）：`llm.js` 当前 `stream:false`，大配置块会整页卡顿；改 `stream:true` 转发 SSE，可中途取消。
- **降级**：LLM 故障 → 隐藏语义面板；解析器强化（通道 B）失败不影响通道 A；反之同理。

---

## 10. 评估（golden set，区分玩具与可靠系统的分水岭）

没有评估骨干，所有 LLM 优化都是玄学。建议建：

- **golden set**：已知 `(before, after)` 配置 → 已知正确风险报告（人工标注 high/medium/low 各若干）。
- **自动指标**：
  - 风险召回率 / 误报率（对比人工标注）
  - `parserGaps` 中"真漏网"占比（而非把已解析项误报为漏网）
  - 端到端 token 成本 / 时延
- **CI 门禁**：任何 prompt / 模型切换必须过 golden set、不许回归。

---

## 11. 实施里程碑

| 阶段 | 内容 | 风险 | 依赖 |
|---|---|---|---|
| M1 | `buildSemanticInput`（裁剪+脱敏）+ `server/semantic.js` 代理转发 | 低 | `llm.js` 已有范式 |
| M2 | `SemanticDiffPanel.vue` 渲染通道 A（风险报告） | 低 | M1 |
| M3 | 通道 B（parserGaps）→ 一键转 learn case | 低 | 学习中心 UI 已存在 |
| M4 | 流式输出 + 结果缓存 | 中 | `llm.js` 改 `stream` |
| M5 | golden set + 评估脚本 | 中 | M1-M3 |

**建议顺序**：M1→M2→M3 先打通端到端（低风险、直接验证价值），再上 M4（体感优化），最后 M5（保障不退步）。

---

## 附：与现有功能的关系

- **学习中心**（`learnCore`）：本设计的通道 B 是其"输入源"之一（从割接 diff 场景批量发现漏网），二者共用案例库与持久化（`server/learn.js`）。
- **解析诊断**（`diagCore`）：本设计复用其 `buildDiagnoseInput` 的裁剪常量与"结构化输出"思路；语义割接 diff 是诊断的"割接对比"专用化版本，输入多带了一份 before/after diff。
- **确定性对比**（`compareCore`）：本设计的**唯一权威 diff 源**，永不被动摇。

> 一句话：确定性引擎做"什么变了"（权威），LLM 做"变了意味着什么 + 哪里还没解析到"（语义 + 覆盖），两者各司其职、互相增强。
