<template>
  <div class="settings-page">
    <aside class="sp-nav">
      <div class="sp-nav-title">设置</div>
      <button
        v-for="g in groups"
        :key="g.key"
        class="sp-nav-item"
        :class="{ active: activeGroup === g.key }"
        @click="activeGroup = g.key"
      >
        <span class="sp-nav-ico" v-html="g.icon"></span>
        <span class="sp-nav-label">{{ g.label }}</span>
      </button>
    </aside>

    <div class="sp-content">
      <h1 class="sp-title">系统设置</h1>

      <section v-show="activeGroup === 'general'" class="sp-card">
        <h2 class="sp-h">外观与布局</h2>
        <div class="sp-row">
          <div class="sp-label">主题<span class="sp-hint">浅色为默认，可跟随系统</span></div>
          <el-radio-group v-model="settings.theme" size="small">
            <el-radio-button label="light">浅色</el-radio-button>
            <el-radio-button label="dark">深色</el-radio-button>
            <el-radio-button label="system">跟随系统</el-radio-button>
          </el-radio-group>
        </div>
        <div class="sp-row">
          <div class="sp-label">侧边栏默认折叠<span class="sp-hint">仅作用于首页与设置页，功能页始终折叠</span></div>
          <el-switch v-model="settings.sidebarCollapsed" />
        </div>
      </section>

      <section v-show="activeGroup === 'general'" class="sp-card">
        <h2 class="sp-h">比对规则</h2>
        <div class="sp-row">
          <div class="sp-label">忽略大小写差异</div>
          <el-switch v-model="settings.ignoreCase" />
        </div>
        <div class="sp-row">
          <div class="sp-label">忽略空白与空行差异</div>
          <el-switch v-model="settings.ignoreWhitespace" />
        </div>
        <div class="sp-row">
          <div class="sp-label">忽略配置顺序重排</div>
          <el-switch v-model="settings.ignoreOrder" />
        </div>
        <div class="sp-row">
          <div class="sp-label">接口匹配优先级<span class="sp-hint">从上到下优先，影响割接前后接口对应</span></div>
          <el-select v-model="settings.interfaceMatchPriority" multiple size="small" style="width: 260px">
            <el-option label="接口名称" value="name" />
            <el-option label="IP 地址" value="ip" />
            <el-option label="描述信息" value="desc" />
          </el-select>
        </div>
      </section>

      <section v-show="activeGroup === 'devices'" class="sp-card">
        <h2 class="sp-h">设备管理</h2>
        <div v-for="dev in settings.deviceConnections" :key="dev.id" class="dev-item">
          <div class="dev-main">
            <span class="dev-name">{{ dev.name }}</span>
            <span class="dev-meta">
              直连 · {{ dev.host }}:{{ dev.port || 22 }}
              · {{ dev.vendor === 'h3c' ? '华三' : '华为' }} · {{ dev.username }}
            </span>
            <span v-if="connResults[dev.id] && !connResults[dev.id].loading" class="conn-res" :class="connResults[dev.id].ok ? 'ok' : 'fail'">
              {{ connResults[dev.id].ok ? '✓ ' : '✗ ' }}{{ connResults[dev.id].message }}
            </span>
          </div>
          <div class="dev-ops">
            <el-button size="small" :loading="connResults[dev.id]?.loading" @click="testSingleConn(dev)">检查连通性</el-button>
            <el-button size="small" @click="onEditDev(dev)">编辑</el-button>
            <el-button size="small" type="danger" @click="onDeleteDev(dev)">删除</el-button>
          </div>
        </div>
      <el-button size="small" type="primary" plain style="margin-top:12px" @click="onAddDev">新增设备</el-button>

      <div style="height:1px;background:var(--border);margin:20px 0" />
      <h2 class="sp-h">设备操作</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <el-button size="small" type="primary" @click="onCollectToPage">采集配置（进解析页）</el-button>
        <el-button size="small" @click="onCollectCompare">采集配置（前后对比）</el-button>
      </div>
    </section>

      <!-- 设备编辑对话框：SSH 直连、密码 / 公私钥 -->
      <el-dialog v-model="devDialogVisible" :title="editId ? '编辑设备' : '新增设备'" width="560px" @closed="onDevDialogClosed">
        <div class="dev-form">
          <div class="df-row">
            <label class="df-label">设备名称</label>
            <el-input v-model="form.name" size="small" placeholder="如 NE40E-RT01" />
          </div>
          <div class="df-row">
            <label class="df-label">厂商</label>
            <el-select v-model="form.vendor" size="small" style="width:160px">
              <el-option label="华为" value="huawei" />
              <el-option label="华三" value="h3c" />
            </el-select>
          </div>
          <div class="df-block">
            <div class="df-block-title">目标设备（最终采集对象）</div>
            <div class="df-row">
              <label class="df-label">主机地址</label>
              <el-input v-model="form.host" size="small" placeholder="IP 或域名" />
              <label class="df-label df-port">端口</label>
              <el-input v-model="form.port" size="small" style="width:92px;flex:none" />
            </div>
            <div class="df-row">
              <label class="df-label">认证方式</label>
              <el-radio-group v-model="form.authType" size="small">
                <el-radio-button label="password">密码</el-radio-button>
                <el-radio-button label="key">公私钥</el-radio-button>
              </el-radio-group>
            </div>
            <div class="df-row">
              <label class="df-label">用户名</label>
              <el-input v-model="form.username" size="small" placeholder="登录用户名" />
            </div>
            <div v-if="form.authType === 'password'" class="df-row">
              <label class="df-label">密码</label>
              <el-input v-model="form.password" size="small" type="password" show-password placeholder="仅存本机浏览器" />
            </div>
            <template v-else>
              <div class="df-row">
                <label class="df-label">私钥</label>
                <el-input v-model="form.privateKey" size="small" type="textarea" :rows="3" placeholder="粘贴 PEM 格式私钥（-----BEGIN ...-----）" style="flex:1" />
              </div>
              <div class="df-row">
                <label class="df-label">口令</label>
                <el-input v-model="form.passphrase" size="small" type="password" show-password placeholder="私钥口令，无则留空" />
              </div>
            </template>
          </div>

        </div>
        <template #footer>
          <el-button size="small" :loading="testing" @click="testConn">测试连通性</el-button>
          <el-button size="small" @click="devDialogVisible = false">取消</el-button>
          <el-button size="small" type="primary" @click="saveDev">保存</el-button>
        </template>
      </el-dialog>

      <section v-show="activeGroup === 'devices'" class="sp-card">
        <h2 class="sp-h">基线管理</h2>
        <div v-for="b in baselines" :key="b.deviceId" class="dev-item">
          <div class="dev-main">
            <span class="dev-name">{{ b.deviceName }}</span>
            <span class="dev-meta">{{ fmtTime(b.savedAt) }} · {{ b.chars.toLocaleString() }} 字符 · {{ scopeLabel(b.scope) }}</span>
          </div>
          <div class="dev-ops">
            <el-button size="small" @click="onViewBaseline(b)">查看</el-button>
            <el-button size="small" type="danger" @click="onDeleteBaseline(b)">删除</el-button>
          </div>
        </div>
      </section>

      <section v-show="activeGroup === 'devices'" class="sp-card">
        <div class="sp-h-row">
          <h2 class="sp-h">采集命令模板</h2>
          <div class="sp-h-acts">
            <el-button size="small" type="primary" plain @click="openTemplateDialog()">新增模板</el-button>
          </div>
        </div>
        <p class="sp-hint tpl-intro">自定义 SSH 采集时下发到设备的命令集；「采集对比 / 解析页采集」弹窗里可按设备厂商选择模板。</p>
        <div v-if="!settings.collectTemplates.length" class="sp-empty">暂无模板，点击「新增模板」创建。</div>
        <div v-for="tpl in settings.collectTemplates" :key="tpl.id" class="tpl-item">
          <div class="tpl-main">
            <span class="tpl-name">{{ tpl.name }}</span>
            <span class="tpl-meta">{{ tpl.vendor === 'h3c' ? '华三' : '华为' }} · {{ templateScopeLabel(tpl.scope) }} · {{ tpl.commands.length }} 条命令</span>
          </div>
          <div class="tpl-ops">
            <el-button size="small" @click="viewTemplate(tpl)">查看</el-button>
            <el-button size="small" @click="openTemplateDialog(tpl)">编辑</el-button>
            <el-button size="small" type="danger" @click="removeTemplate(tpl)">删除</el-button>
          </div>
        </div>
      </section>

      <el-dialog v-model="tplDialogVisible" :title="tplEditId ? '编辑采集模板' : '新增采集模板'" width="560px">
        <div class="tpl-form">
          <div class="df-row">
            <label class="df-label">模板名称</label>
            <el-input v-model="tplForm.name" size="small" placeholder="如：华为 · 全量采集" />
          </div>
          <div class="df-row">
            <label class="df-label">厂商</label>
            <el-select v-model="tplForm.vendor" size="small" style="width:160px">
              <el-option label="华为" value="huawei" />
              <el-option label="华三" value="h3c" />
            </el-select>
          </div>
          <div class="df-row">
            <label class="df-label">采集范围</label>
            <el-select v-model="tplForm.scope" size="small" style="width:160px">
              <el-option label="仅配置" value="config" />
              <el-option label="仅状态" value="status" />
              <el-option label="配置+状态" value="full" />
            </el-select>
          </div>
          <div class="df-row tpl-cmd-row">
            <label class="df-label">命令（每行一条）</label>
            <el-input v-model="tplForm.commandsText" type="textarea" :rows="7" size="small" placeholder="display current-configuration&#10;display interface" />
          </div>
        </div>
        <template #footer>
          <el-button @click="tplDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveTemplate">保存</el-button>
        </template>
      </el-dialog>
      <!-- 模型能力自检 -->
      <el-dialog v-model="capDialogVisible" title="模型能力自检" width="560px" append-to-body>
        <div v-if="capTesting" class="cap-loading">
          <span class="cap-spinner"></span>
          正在逐项检测当前模型能力（会消耗少量模型额度），请稍候…
        </div>
        <div v-else-if="capItems.length" class="cap-list">
          <div v-for="item in capItems" :key="item.key" class="cap-item">
            <span class="cap-name">{{ item.label }}</span>
            <el-tag :type="item.ok ? 'success' : 'danger'" size="small">{{ item.ok ? '正常' : '不支持/异常' }}</el-tag>
            <span class="cap-detail">{{ item.detail }}</span>
          </div>
          <p class="cap-tip">结果反映当前配置模型的能力，用于决定语义分析采用的技术路线（function calling 或 JSON 模式）。</p>
        </div>
        <template #footer>
          <el-button @click="capDialogVisible = false">关闭</el-button>
          <el-button type="primary" :loading="capTesting" @click="runCapabilities">重新检测</el-button>
        </template>
      </el-dialog>
      <section v-show="activeGroup === 'ai'" class="sp-card">
        <h2 class="sp-h">AI 大模型</h2>
        <p class="sp-hint ai-intro">配置后可用于本机后端的大模型能力。密钥仅保存在本机后端，不会写入浏览器。</p>
        <div class="sp-row">
          <div class="sp-label">服务商</div>
          <el-select v-model="aiForm.provider" size="small" style="width:220px" @change="onAiProviderChange">
            <el-option label="DeepSeek" value="deepseek" />
            <el-option label="OpenAI" value="openai" />
            <el-option label="自定义（OpenAI 兼容）" value="custom" />
          </el-select>
        </div>
        <div class="sp-row">
          <div class="sp-label">模型名称<span class="sp-hint">{{ providerModelHint }}</span></div>
          <el-input v-model="aiForm.model" size="small" style="width:240px" placeholder="如 deepseek-chat / gpt-4o-mini" />
        </div>
        <div class="sp-row" v-if="aiForm.provider === 'custom'">
          <div class="sp-label">接口地址</div>
          <el-input v-model="aiForm.baseURL" size="small" style="width:340px" placeholder="https://…/v1" />
        </div>
        <div class="sp-row">
          <div class="sp-label">API Key<span class="sp-hint">{{ aiStatus.keyMasked ? '已配置：' + aiStatus.keyMasked : '留空表示不修改' }}</span></div>
          <el-input v-model="aiForm.apiKey" type="password" show-password size="small" style="width:340px" placeholder="sk-…" />
        </div>
        <div class="sp-row">
          <div class="sp-label">状态</div>
          <div class="ai-status">
            <span :class="['ai-dot', aiStatus.configured ? 'ok' : 'no']"></span>
            <span>{{ aiStatusText }}</span>
          </div>
        </div>
        <div class="sp-row">
          <div class="sp-label">自动学习<span class="sp-hint">解析后自动分析未识别行并生成规则建议（会消耗模型额度，确认后才入库）</span></div>
          <el-switch v-model="settings.aiAutoLearn" size="small" />
        </div>
        <div class="sp-row">
          <div class="sp-label"></div>
          <div class="ai-acts">
            <el-button size="small" type="primary" :loading="aiSaving" @click="saveAi">保存配置</el-button>
            <el-button size="small" :loading="aiTesting" :disabled="!aiStatus.hasKey" @click="testAi">测试连接</el-button>
            <el-button size="small" :loading="capTesting" :disabled="!aiStatus.hasKey" @click="runCapabilities">能力自检</el-button>
            <el-button size="small" type="danger" plain :disabled="!aiStatus.hasKey && !aiStatus.configured" @click="clearAi">退出模型</el-button>
          </div>
        </div>
      </section>
      <section v-show="activeGroup === 'data'" class="sp-card">
        <h2 class="sp-h">数据与历史</h2>
        <div class="sp-row">
          <div class="sp-label">清空当前数据<span class="sp-hint">保留设置，清空所有比对与采集结果</span></div>
          <el-button type="danger" size="small" @click="onClearData">清空数据</el-button>
        </div>
      </section>

      <section v-show="activeGroup === 'data'" class="sp-card">
        <h2 class="sp-h">关于</h2>
        <div class="sp-row">
          <div class="sp-label">版本</div>
          <div class="sp-val">v{{ version }}</div>
        </div>
        <div class="sp-row">
          <div class="sp-label">重置所有设置<span class="sp-hint">恢复默认，不删除数据</span></div>
          <el-button size="small" @click="onResetSettings">重置设置</el-button>
        </div>
        <p class="sp-note">所有解析与比对均在本机完成：配置文件可本地导入，或通过本机后端 SSH 直连设备采集，设备账号密码仅存于本机浏览器。</p>
      </section>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'SettingsPage' })

import { reactive, ref, computed, onMounted } from 'vue'
import { settings, clearAllData, resetSettings } from '../utils/settings.js'
import { templateScopeLabel } from '../utils/collectTemplates.js'
import { listBaselines, loadBaseline, clearBaseline, testConnection, llmStatus, saveLlmConfig, llmTest, clearLlmConfig, llmCapabilities } from '../utils/api.js'
import pkg from '../../package.json'

const version = pkg.version

const emit = defineEmits(['open-collect', 'device-collect'])

const onCollectToPage = () => {
  if (!settings.deviceConnections || settings.deviceConnections.length === 0) {
    ElMessage.warning('请先在上方添加设备')
    return
  }
  emit('device-collect')
}
const onCollectCompare = () => {
  if (!settings.deviceConnections || settings.deviceConnections.length === 0) {
    ElMessage.warning('请先在上方添加设备')
    return
  }
  emit('open-collect')
}

// ===== 设置分组（左侧导航）=====
const ICO = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
const groups = [
  { key: 'general', label: '通用', icon: `<svg ${ICO}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>` },
  { key: 'devices', label: '设备与采集', icon: `<svg ${ICO}><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>` },
  { key: 'ai', label: 'AI 大模型', icon: `<svg ${ICO}><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>` },
  { key: 'data', label: '数据与安全', icon: `<svg ${ICO}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>` }
]
const activeGroup = ref('general')

// ===== AI 大模型配置 =====
const aiForm = reactive({ provider: 'deepseek', model: '', apiKey: '', baseURL: '' })
const aiStatus = ref({ configured: false, provider: '', model: '', hasKey: false, keyMasked: '', baseURL: '' })
const aiSaving = ref(false)
const aiTesting = ref(false)
const providerModelHint = computed(() => {
  if (aiForm.provider === 'deepseek') return '默认 deepseek-chat'
  if (aiForm.provider === 'openai') return '默认 gpt-4o-mini'
  return ''
})
const aiStatusText = computed(() => {
  if (!aiStatus.value.hasKey) return '未配置 API Key'
  if (!aiStatus.value.configured) return '已配置 Key，但服务商/接口不完整'
  return `已就绪（${aiStatus.value.provider || aiStatus.value.baseURL} · ${aiStatus.value.model}）`
})
const loadAiStatus = async () => {
  try {
    const s = await llmStatus()
    aiStatus.value = s
    // 自定义（OpenAI 兼容）在后端存为 provider 空 + baseURL 非空，重新打开时要还原为「自定义」
    if (s.provider === 'openai') aiForm.provider = 'openai'
    else if (s.provider === 'custom' || (s.baseURL && !s.provider)) aiForm.provider = 'custom'
    else aiForm.provider = 'deepseek'
    aiForm.model = s.model || ''
    aiForm.baseURL = s.baseURL || ''
  } catch (e) { /* 后端未启动时静默 */ }
}
const onAiProviderChange = (p) => {
  if (p === 'deepseek' && !aiForm.model) aiForm.model = 'deepseek-chat'
  if (p === 'openai' && !aiForm.model) aiForm.model = 'gpt-4o-mini'
}
const saveAi = async () => {
  aiSaving.value = true
  try {
    const payload = {
      provider: aiForm.provider === 'custom' ? '' : aiForm.provider,
      model: aiForm.model.trim(),
      apiKey: aiForm.apiKey.trim(),
      baseURL: aiForm.provider === 'custom' ? aiForm.baseURL.trim() : ''
    }
    await saveLlmConfig(payload)
    aiForm.apiKey = ''
    ElMessage.success('AI 配置已保存')
    await loadAiStatus()
  } catch (e) {
    ElMessage.error('保存失败：' + (e && e.message ? e.message : '未知错误'))
  } finally {
    aiSaving.value = false
  }
}
const clearAi = () => {
  ElMessageBox.confirm('将清除当前大模型配置（含 API Key），退出后 AI 功能不可用。继续？', '退出模型', { type: 'warning', confirmButtonText: '退出', cancelButtonText: '取消' })
    .then(async () => {
      try {
        const r = await clearLlmConfig()
        aiStatus.value = { ...aiStatus.value, ...r, hasKey: r.hasKey, keyMasked: '' }
        aiForm.apiKey = ''
        ElMessage.success(r.message || '已退出当前模型')
        await loadAiStatus()
      } catch (e) {
        ElMessage.error('退出失败：' + (e && e.message ? e.message : '未知错误'))
      }
    })
    .catch(() => {})
}
const testAi = async () => {
  aiTesting.value = true
  try {
    const r = await llmTest()
    ElMessage.success(r.message || '连接成功')
  } catch (e) {
    ElMessage.error((e && e.message) ? e.message : '连接失败')
  } finally {
    aiTesting.value = false
  }
}

// ===== 模型能力自检 =====
const capDialogVisible = ref(false)
const capTesting = ref(false)
const capResults = ref(null)

const capItems = computed(() => {
  const c = capResults.value
  if (!c) return []
  return [
    { key: 'connectivity', label: '连通性 / 基础对话', ok: !!(c.connectivity && c.connectivity.ok), detail: c.connectivity ? (c.connectivity.model || '') + (c.connectivity.error ? ' · ' + c.connectivity.error : '') : '' },
    { key: 'structuredOutput', label: '结构化输出（JSON 模式）', ok: !!(c.structuredOutput && c.structuredOutput.supported), detail: c.structuredOutput ? (c.structuredOutput.supported ? '支持 response_format: json_object' : (c.structuredOutput.error || '不支持')) : '' },
    { key: 'functionCalling', label: 'Function Calling', ok: !!(c.functionCalling && c.functionCalling.supported), detail: c.functionCalling ? (c.functionCalling.supported ? '支持 tools / 函数调用' : (c.functionCalling.error || '不支持')) : '' },
    { key: 'longContext', label: '长上下文', ok: !!(c.longContext && c.longContext.ok), detail: c.longContext ? ('发送 ' + (c.longContext.sentChars || 0) + ' 字符' + (c.longContext.error ? ' · ' + c.longContext.error : '') + (c.longContext.ok ? '，正常返回' : '')) : '' }
  ]
})

const runCapabilities = async () => {
  capTesting.value = true
  capResults.value = null
  capDialogVisible.value = true
  try {
    const r = await llmCapabilities()
    capResults.value = r.capabilities || {}
  } catch (e) {
    capResults.value = { connectivity: { ok: false, model: '', error: (e && e.message) || '自检请求失败' } }
  } finally {
    capTesting.value = false
  }
}
// ===== 采集命令模板管理 =====
const tplDialogVisible = ref(false)
const tplEditId = ref('')
const tplForm = reactive({ name: '', vendor: 'huawei', scope: 'config', commandsText: '' })

const openTemplateDialog = (tpl) => {
  tplEditId.value = tpl ? tpl.id : ''
  tplForm.name = tpl ? tpl.name : ''
  tplForm.vendor = tpl ? tpl.vendor : 'huawei'
  tplForm.scope = tpl ? tpl.scope : 'config'
  tplForm.commandsText = tpl ? tpl.commands.join('\n') : ''
  tplDialogVisible.value = true
}

const saveTemplate = () => {
  const commands = tplForm.commandsText.split('\n').map(s => s.trim()).filter(Boolean)
  const name = tplForm.name.trim()
  if (!name) { ElMessage.warning('请填写模板名称'); return }
  if (!commands.length) { ElMessage.warning('请至少填写一条命令'); return }
  if (tplEditId.value) {
    const tpl = settings.collectTemplates.find(t => t.id === tplEditId.value)
    if (tpl) {
      tpl.name = name
      tpl.vendor = tplForm.vendor
      tpl.scope = tplForm.scope
      tpl.commands = commands
    }
  } else {
    settings.collectTemplates.push({
      id: 'tpl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      vendor: tplForm.vendor,
      scope: tplForm.scope,
      commands,
      builtin: false
    })
  }
  tplDialogVisible.value = false
  ElMessage.success('模板已保存')
}

const removeTemplate = (tpl) => {
  ElMessageBox.confirm(`确定删除模板「${tpl.name}」？`, '删除确认', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    .then(() => {
      const idx = settings.collectTemplates.findIndex(t => t.id === tpl.id)
      if (idx >= 0) settings.collectTemplates.splice(idx, 1)
      ElMessage.success('已删除模板')
    })
    .catch(() => {})
}


const viewTemplate = (tpl) => {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = tpl.commands.map(c => `<code style="display:block;margin:2px 0">${esc(c)}</code>`).join('')
  ElMessageBox.alert(`<div style="max-height:50vh;overflow:auto">${html}</div>`, `模板：${esc(tpl.name)}`, { dangerouslyUseHTMLString: true })
}

// ===== 基线管理 =====
const baselines = ref([])
const refreshBaselines = () => { baselines.value = listBaselines() }
onMounted(() => { refreshBaselines(); loadAiStatus() })

const fmtTime = (ts) => {
  if (!ts) return '时间未知'
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const scopeLabel = (s) => ({ config: '仅配置', status: '仅状态', full: '配置+状态' }[s] || '仅配置')

const onViewBaseline = (b) => {
  const text = loadBaseline(b.deviceId)
  const lines = text.split('\n')
  const preview = lines.slice(0, 200).join('\n')
  const more = lines.length > 200 ? `\n\n……（共 ${lines.length} 行 / ${text.length.toLocaleString()} 字符，仅预览前 200 行）` : ''
  const esc = (preview + more).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  ElMessageBox.alert(
    `<pre style="max-height:52vh;overflow:auto;margin:0;white-space:pre-wrap;word-break:break-all;font-size:12px;line-height:1.5;font-family:var(--mono,monospace)">${esc}</pre>`,
    `基线预览 · ${b.deviceName}`,
    { dangerouslyUseHTMLString: true, confirmButtonText: '关闭', customClass: 'baseline-view-box' }
  ).catch(() => {})
}

const onDeleteBaseline = (b) => {
  ElMessageBox.confirm(`确定删除设备「${b.deviceName}」的基线快照？`, '删除基线', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    clearBaseline(b.deviceId)
    refreshBaselines()
    ElMessage.success('已删除基线')
  }).catch(() => {})
}

const onClearData = () => {
  ElMessageBox.confirm('将清空所有比对与采集结果，但保留设置。确定继续？', '清空数据', {
    confirmButtonText: '清空',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    clearAllData()
    ElMessage.success('已清空当前数据')
  }).catch(() => {})
}

const onResetSettings = () => {
  ElMessageBox.confirm('将恢复所有设置为默认值（不影响数据），确定继续？', '重置设置', {
    confirmButtonText: '重置',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    resetSettings()
    ElMessage.success('设置已恢复默认')
  }).catch(() => {})
}

// ===== 设备管理 =====
const genId = () => 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const emptyForm = () => ({
  id: '', name: '', vendor: 'huawei',
  // 目标设备（SSH 直连）
  host: '', port: 22, username: '', password: '',
  authType: 'password', privateKey: '', passphrase: ''
})
const form = reactive(emptyForm())
const devDialogVisible = ref(false)
let editId = null

const onAddDev = () => {
  Object.assign(form, emptyForm())
  editId = null
  devDialogVisible.value = true
}

const onEditDev = (dev) => {
  Object.assign(form, JSON.parse(JSON.stringify(dev)))
  editId = dev.id
  devDialogVisible.value = true
}

const onDevDialogClosed = () => {
  Object.assign(form, emptyForm())
  editId = null
}

// 连通性检查：验证设备可达 + 凭据正确。设备管理列表行与新增/编辑对话框共用同一底层调用
const testing = ref(false)
const connResults = reactive({})

const runConnTest = async (payload) => {
  try {
    const r = await testConnection(payload)
    return { ok: true, message: r.message || '连接成功' }
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) }
  }
}

// 设备管理列表：对任意已保存设备单独做连通性检查
const testSingleConn = async (dev) => {
  connResults[dev.id] = { loading: true }
  const res = await runConnTest({
    host: dev.host,
    port: dev.port || 22,
    username: dev.username,
    password: dev.password,
    authType: dev.authType,
    privateKey: dev.privateKey,
    passphrase: dev.passphrase,
    vendor: dev.vendor
  })
  connResults[dev.id] = { loading: false, ok: res.ok, message: res.message }
}

// 新增/编辑设备对话框内，点击「测试连通性」验证表单中的设备
const testConn = async () => {
  if (!form.host || !form.username) {
    ElMessage.warning('请先填写主机地址与用户名')
    return
  }
  testing.value = true
  const res = await runConnTest({
    host: form.host,
    port: form.port || 22,
    username: form.username,
    password: form.password,
    authType: form.authType,
    privateKey: form.privateKey,
    passphrase: form.passphrase,
    vendor: form.vendor
  })
  testing.value = false
  if (res.ok) ElMessage.success(res.message)
  else ElMessage.error('连接失败：' + res.message)
}

const saveDev = () => {
  const list = settings.deviceConnections
  if (!form.name || !form.host || !form.username) {
    ElMessage.warning('设备名称、主机地址、用户名不能为空')
    return
  }
  const record = JSON.parse(JSON.stringify(form))
  if (editId) {
    const i = list.findIndex(d => d.id === editId)
    if (i >= 0) list[i] = record
  } else {
    record.id = genId()
    list.push(record)
  }
  devDialogVisible.value = false
  ElMessage.success('设备已保存')
}

const onDeleteDev = (dev) => {
  ElMessageBox.confirm(`确定删除设备「${dev.name}」？`, '删除设备', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const i = settings.deviceConnections.findIndex(d => d.id === dev.id)
    if (i >= 0) settings.deviceConnections.splice(i, 1)
    ElMessage.success('已删除')
  }).catch(() => {})
}
</script>

<style scoped>
.settings-page { max-width: 1000px; margin: 0; display: flex; gap: 24px; align-items: flex-start; }
.sp-nav { position: sticky; top: 20px; width: 168px; flex-shrink: 0; }
.sp-nav-title { font-size: 13px; font-weight: 600; color: var(--t2); padding: 0 12px 10px; }
.ai-intro { margin: 0 0 12px }
.ai-status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--t2) }
.ai-dot { width: 8px; height: 8px; border-radius: 50% }
.ai-dot.ok { background: var(--green) }
.ai-dot.no { background: var(--t4) }
.ai-acts { display: flex; gap: 10px; flex-wrap: wrap }
.cap-loading { display: flex; align-items: center; gap: 10px; color: var(--t2); font-size: 13px; padding: 20px 0 }
.cap-spinner { width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--blue); border-radius: 50%; animation: cap-rot 0.8s linear infinite }
@keyframes cap-rot { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
.cap-list { display: flex; flex-direction: column; gap: 10px }
.cap-item { display: flex; align-items: center; gap: 10px; font-size: 13px; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px }
.cap-name { width: 180px; flex-shrink: 0; color: var(--t2) }
.cap-detail { color: var(--t3); font-size: 12.5px; word-break: break-all }
.cap-tip { font-size: 12px; color: var(--t4); line-height: 1.6; margin: 4px 0 0 }
.sp-h-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px }
.sp-h-acts { display: flex; gap: 8px }
.tpl-intro { margin: 0 0 12px }
.tpl-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--div) }
.tpl-item:last-child { border-bottom: none }
.tpl-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.tpl-name { font-weight: 500; color: var(--t1) }
.tpl-meta { font-size: 12px; color: var(--t3) }
.tpl-ops { display: flex; gap: 8px; flex-shrink: 0 }
.tpl-cmd-row { align-items: flex-start }
.tpl-cmd-row .df-label { padding-top: 6px }
.sp-nav-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 9px 12px; margin-bottom: 4px; border: none; background: transparent; border-radius: 8px; font-size: 13px; color: var(--t2); cursor: pointer; transition: background .15s, color .15s; }
.sp-nav-item:hover { background: var(--bg2); }
.sp-nav-item.active { background: var(--el-color-primary, #409eff); color: #fff; }
.sp-nav-label { line-height: 1; }
.sp-content { flex: 1; min-width: 0; }
.sp-title { font-size: 18px; font-weight: 600; color: var(--t1); margin: 0 0 16px; }
.sp-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--r); padding: 18px 20px; margin-bottom: 16px; }
.sp-h { font-size: 14px; font-weight: 600; color: var(--t2); margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--div); }
.sp-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; gap: 16px; }
.sp-row + .sp-row { border-top: 1px solid var(--div); }
.sp-label { font-size: 13px; color: var(--t1); display: flex; flex-direction: column; gap: 2px; }
.sp-hint { font-size: 11px; color: var(--t3); }
.sp-val { font-size: 13px; color: var(--t2); font-family: var(--mono); }
.sp-note { font-size: 12px; color: var(--t3); line-height: 1.6; margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--div); }
.dev-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--div); gap: 12px; }
.dev-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dev-name { font-size: 13px; color: var(--t1); font-weight: 600; }
.dev-meta { font-size: 11px; color: var(--t3); font-family: var(--mono); word-break: break-all; }
.dev-ops { display: flex; gap: 8px; flex-shrink: 0; }
.conn-res { font-size: 11px; font-family: var(--mono); word-break: break-all; padding-top: 2px; }
.conn-res.ok { color: #2faa5d; }
.conn-res.fail { color: #e35b5b; }
.dev-form { padding: 2px; }
.df-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.df-label { width: 64px; flex-shrink: 0; font-size: 12px; color: var(--t2); text-align: right; }
.df-label.df-port { width: 32px; }
.df-row .el-input, .df-row .el-select { flex: 1; min-width: 0; }
.df-block { border: 1px solid var(--border); border-radius: 8px; padding: 14px 14px 4px; margin-bottom: 14px; background: var(--bg2); }
.df-block-title { font-size: 12px; font-weight: 600; color: var(--t1); margin-bottom: 12px; }
@media (max-width: 760px) {
  .settings-page { flex-direction: column; gap: 12px; }
  .sp-nav { position: static; width: auto; display: flex; flex-wrap: wrap; gap: 8px; }
  .sp-nav-title { display: none; }
  .sp-nav-item { width: auto; margin-bottom: 0; }
}
</style>

<style>
.baseline-view-box { width: 680px; max-width: 92vw; }
/* 设置页左侧导航图标（v-html 注入，需非 scoped 样式） */
.sp-nav-ico { display: inline-flex; width: 16px; height: 16px; flex-shrink: 0; }
.sp-nav-ico svg { width: 16px; height: 16px; display: block; }
</style>
