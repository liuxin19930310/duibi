<template>
  <div class="cutover-page">
    <div class="co-head">
      <h2>割接迁移核查</h2>
      <p class="co-desc">
        上传割接前 / 割接后配置，自动做端口迁移配对与逐项对比（本地确定性分析），并借助大模型归纳变更主题、风险和验证清单。
        端口对比在本机完成；变更摘要（含配置要点）将发送给已配置的大模型。
      </p>
    </div>

    <div class="co-upload">
      <el-upload
        drag :auto-upload="false" :limit="1" accept=".cfg,.conf,.txt,.log"
        :on-change="onBeforeFile" :on-remove="() => { beforeText = ''; beforeName = '' }"
        class="co-up"
      >
        <div class="co-up-title">{{ beforeName || '割接前配置（点击或拖拽）' }}</div>
      </el-upload>
      <el-upload
        drag :auto-upload="false" :limit="1" accept=".cfg,.conf,.txt,.log"
        :on-change="onAfterFile" :on-remove="() => { afterText = ''; afterName = '' }"
        class="co-up"
      >
        <div class="co-up-title">{{ afterName || '割接后配置（点击或拖拽）' }}</div>
      </el-upload>
      <el-button type="primary" :loading="analyzing" :disabled="!beforeText || !afterText" @click="runCheck">
        开始迁移核查
      </el-button>
      <div v-if="!beforeText || !afterText" class="co-hint">
        {{ !beforeText && !afterText ? '请先上传割接前、割接后两份配置' : (!beforeText ? '还需上传割接前配置' : '还需上传割接后配置') }}
      </div>
    </div>

    <div v-if="analyzing" class="co-loading">
      <span class="co-spinner"></span>
      正在本地分析配置并调用大模型，请稍候…
    </div>
    <div v-if="error" class="co-error">{{ error }}</div>

    <template v-if="portReport">
      <div class="co-sec">
        <h3>迁移对明细（{{ portReport.totalMatched }} 对 · 本地确定性分析）</h3>
        <el-table :data="portReport.rows" size="small" border max-height="380">
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="co-diff">
                <div v-if="row.lost.length"><b>丢失配置：</b><code v-for="l in row.lost" :key="l">{{ l }}</code></div>
                <div v-if="row.added.length"><b>新增配置：</b><code v-for="l in row.added" :key="l">{{ l }}</code></div>
                <div v-if="!row.lost.length && !row.added.length" class="co-ok">配置一致</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="before" label="老端口" min-width="170" />
          <el-table-column prop="after" label="新端口" min-width="170" />
          <el-table-column prop="matchBy" label="匹配依据" min-width="150" />
          <el-table-column prop="conf" label="置信度" width="80" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === '一致' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="portReport.beforeOnly.length || portReport.afterOnly.length" class="co-unmatched">
          未匹配：老设备 {{ portReport.beforeOnly.length }} 个端口（疑似未用 / 漏迁）、新设备 {{ portReport.afterOnly.length }} 个端口（疑似新增板卡 / 端口）
        </div>
      </div>

      <div class="co-sec">
        <h3>变更主题归纳（大模型）</h3>
        <el-table :data="result.themes" size="small" border empty-text="模型未返回主题">
          <el-table-column prop="title" label="主题" min-width="220" />
          <el-table-column prop="modules" label="涉及模块" min-width="180" />
          <el-table-column prop="scale" label="规模" min-width="160" />
          <el-table-column prop="risk" label="风险" width="80" />
        </el-table>
      </div>

      <div class="co-sec">
        <h3>风险清单（大模型）</h3>
        <el-table :data="result.risks" size="small" border empty-text="模型未返回风险">
          <el-table-column label="级别" width="80">
            <template #default="{ row }">
              <el-tag :type="sevType(row.severity)" size="small">{{ row.severity }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="风险" min-width="200" />
          <el-table-column prop="evidence" label="证据" min-width="220" />
          <el-table-column prop="suggestion" label="建议" min-width="220" />
        </el-table>
      </div>

      <div class="co-sec">
        <h3>验证清单（大模型）</h3>
        <el-table :data="result.verify" size="small" border empty-text="模型未返回验证清单">
          <el-table-column prop="group" label="分组" width="110" />
          <el-table-column prop="command" label="验证命令" min-width="280" />
          <el-table-column prop="expect" label="预期结果" min-width="240" />
        </el-table>
      </div>
    </template>
  </div>
</template>

<script setup>
defineOptions({ name: 'CutoverCheckPage' })

import { ref } from 'vue'
import { buildPortReport, buildCutoverSummary, parseCutoverResult } from '../utils/cutoverCheck.js'
import { llmChat } from '../utils/api.js'

const beforeText = ref('')
const afterText = ref('')
const beforeName = ref('')
const afterName = ref('')
const analyzing = ref(false)
const error = ref('')
const portReport = ref(null)
const result = ref({ themes: [], risks: [], verify: [] })

const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result || ''))
  r.onerror = () => reject(new Error('文件读取失败'))
  r.readAsText(file)
})

const onBeforeFile = async (file) => {
  beforeName.value = file.name
  beforeText.value = await readFile(file.raw)
}
const onAfterFile = async (file) => {
  afterName.value = file.name
  afterText.value = await readFile(file.raw)
}

const sevType = (s) => ({ 极高: 'danger', 高: 'warning', 中: 'primary', 低: 'info' }[s] || 'warning')

const runCheck = async () => {
  analyzing.value = true
  error.value = ''
  result.value = { themes: [], risks: [], verify: [] }
  try {
    // 1. 本地确定性分析（端口映射 + 逐项对比）
    portReport.value = buildPortReport(beforeText.value, afterText.value)
    // 2. 大模型：变更主题 + 风险 + 验证清单（结构化 JSON 输出）
    const summary = buildCutoverSummary(beforeText.value, afterText.value)
    const system = '你是资深网络运维专家，熟悉华为（HUAWEI）与华三设备。基于提供的割接摘要分析，只依据数据，不臆测、不编造。严格只输出 JSON（不要其他任何文字），格式：{"themes":[{"title":"主题","modules":"涉及模块","scale":"规模","risk":"high|medium|low"}],"risks":[{"severity":"high|medium|low","title":"风险标题","evidence":"证据","suggestion":"建议"}],"verify":[{"group":"分组","command":"验证命令","expect":"预期结果"}]}'
    const user = '以下是割接前/后配置对比的实测摘要：\n\n' + summary
    const r = await llmChat({ system, user, temperature: 0.1, responseFormat: true })
    result.value = parseCutoverResult(r.content)
    if (!result.value.themes.length && !result.value.risks.length && !result.value.verify.length) {
      error.value = '大模型未返回可解析的结构化结果（本地端口对比已完成），可重试。'
    }
  } catch (e) {
    error.value = (e && e.message) ? e.message : '分析失败'
  } finally {
    analyzing.value = false
  }
}
</script>

<style scoped>
.cutover-page { padding: 16px 24px 40px; }
.co-head h2 { margin: 0 0 6px; font-size: 18px; color: var(--t1); }
.co-desc { margin: 0 0 16px; font-size: 12.5px; color: var(--t3); line-height: 1.7; max-width: 860px; }
.co-upload { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
.co-up { width: 230px; }
.co-up :deep(.el-upload-dragger) { padding: 18px 12px; }
.co-up-title { font-size: 13px; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.co-hint { font-size: 12.5px; color: var(--t4); }
.co-loading { display: flex; align-items: center; gap: 10px; color: var(--t2); font-size: 13px; padding: 16px 0; }
.co-spinner { width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--blue); border-radius: 50%; animation: co-rot 0.8s linear infinite; }
@keyframes co-rot { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
.co-error { color: var(--red); font-size: 13px; padding: 10px 0; white-space: pre-wrap; }
.co-sec { margin-bottom: 22px; }
.co-sec h3 { margin: 0 0 10px; font-size: 14px; color: var(--t2); }
.co-diff { display: flex; flex-direction: column; gap: 4px; padding: 6px 12px; font-size: 12.5px; }
.co-diff code { font-family: monospace; background: var(--bg3); padding: 1px 6px; border-radius: 4px; color: var(--t1); margin-right: 6px; word-break: break-all; }
.co-ok { color: var(--green); }
.co-unmatched { margin-top: 8px; font-size: 12.5px; color: var(--t3); }
</style>
