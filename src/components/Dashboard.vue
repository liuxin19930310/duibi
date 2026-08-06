<template>
  <div class="app" @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <div class="app-main">
    <!-- ===== SIDEBAR ===== -->
    <Sidebar
      :nav="nav"
      :sbCollapsed="sbCollapsed"
      @toggle:nav="onToggleNav"
    />

    <!-- ===== MAIN ===== -->
    <div class="mn">
      <Header
        :pageTitle="pageTitle"
        :sbCollapsed="sbCollapsed"
        :isLight="isLight"
        :user-name="authStore.user"
        @toggle-theme="toggleTheme"
        @logout="logout"
        @import-config="onImportClick"
      />

      <TabsView :sb-collapsed="sbCollapsed" @toggle-collapse="sbCollapsed = !sbCollapsed" />

      <div class="bd">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <keep-alive :include="router.cachedComponentNames.value">
              <component :is="Component" v-bind="viewProps" ref="viewRef" />
            </keep-alive>
          </transition>
        </router-view>
      </div>
    </div>
    </div><!-- /app-main -->


    <!-- ===== E：拖拽热区遮罩 ===== -->
    <div v-if="isDragging" class="drop-overlay">
      <div class="drop-box">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <div class="drop-title">{{ dropHint }}</div>
        <div class="drop-sub">支持 .txt / .conf / .cfg / .log，松开即可导入</div>
      </div>
    </div>

    <!-- ===== 导入：隐藏的 file input ===== -->
    <input ref="importInputRef" type="file" accept=".txt,.conf,.cfg,.log" style="display:none" @change="onImportFile" @cancel="onImportCancel">

    <!-- ===== 设备采集对比弹窗 ===== -->
    <el-dialog v-model="collectDialog" title="采集配置 · 自动采集对比" width="560px" destroy-on-close>
      <div class="collect-body">
        <div class="collect-row cutover-row">
          <span class="c-label">割接模式</span>
          <div class="cutover-box">
            <el-switch v-model="cutoverOn" @change="onCutoverToggle" active-text="整机替换" inactive-text="日常核查" inline-prompt />
            <span class="cutover-hint">{{ cutoverOn ? 'IP 优先配对 + 忽略大小写/空白，端口迁移、跨版本命令差异不误报' : '名称优先配对 + 区分大小写，日常配置改动精确核查' }}</span>
          </div>
        </div>

        <div class="collect-row" style="margin-top:12px">
          <span class="c-label">选择设备</span>
          <el-select v-model="collectDevId" size="default" style="flex:1" placeholder="请选择已配置的设备">
            <el-option
              v-for="d in settings.deviceConnections"
              :key="d.id"
              :label="`${d.name}（${d.vendor === 'h3c' ? '华三' : '华为'} · ${d.host}）`"
              :value="d.id"
            />
          </el-select>
        </div>

        <div class="collect-row" style="margin-top:12px">
          <span class="c-label">采集模板</span>
          <el-select v-model="collectTemplateId" size="default" style="flex:1" placeholder="默认（按采集范围）" @change="onCollectTemplateChange">
            <el-option label="默认（按采集范围）" value="" />
            <el-option v-for="t in vendorTemplates" :key="t.id" :label="`${t.name}（${t.commands.length} 条）`" :value="t.id" />
          </el-select>
        </div>
        <div class="collect-row" style="margin-top:12px">
          <span class="c-label">采集范围</span>
          <el-select v-model="collectScope" size="default" style="flex:1">
            <el-option label="仅配置（display current-configuration）" value="config" />
            <el-option label="配置 + 状态（含 display interface 等）" value="full" />
          </el-select>
        </div>

        <div class="collect-tip">
          先采集「变更前」配置，执行变更后再采集「变更后」配置，系统自动比对并出变更明细报告。<br>
          <span v-if="collectScope === 'config'">当前仅采集运行配置，适合核查配置改动（推荐）。</span>
          <span v-else>已附带接口/光模块等运行状态，数据量更大、采集更慢；状态类内容会随时间波动，可能产生较多非配置差异。</span><br>
          <span style="color:var(--ok,#67c23a)">采集结果已自动保存到本机，关闭窗口、刷新页面、隔几小时再回来都能续采，不会丢失。</span><br>
          <span style="color:var(--t3)">若已有备份的配置文件，可点「导入」按钮直接作为变更前/后内容，无需连设备。</span>
        </div>

        <div class="collect-actions">
          <div class="ca-group">
            <el-button
              type="primary"
              :loading="collecting && collectStage === 'before'"
              :disabled="collecting"
              @click="doCollect('before')"
            >采集变更前</el-button>
            <el-button :disabled="collecting" @click="importBeforeRef.click()">导入变更前</el-button>
          </div>
          <div class="ca-group">
            <el-button
              type="primary"
              :loading="collecting && collectStage === 'after'"
              :disabled="collecting"
              @click="doCollect('after')"
            >采集变更后</el-button>
            <el-button :disabled="collecting" @click="importAfterRef.click()">导入变更后</el-button>
          </div>
          <el-button :disabled="collecting || (!collectAfter && !collectBefore)" @click="saveAsBaseline">保存为基线</el-button>
          <el-button :disabled="collecting" @click="collectAfterVsBaseline">采集后 vs 基线</el-button>
          <el-button :disabled="collecting || (!collectAfter && !collectBefore)" @click="clearCollectDraftAll">清空重采</el-button>
        </div>
        <input ref="importBeforeRef" type="file" accept=".txt,.conf,.cfg,.log" style="display:none" @change="e => readCollectFile(e, 'before')">
        <input ref="importAfterRef" type="file" accept=".txt,.conf,.cfg,.log" style="display:none" @change="e => readCollectFile(e, 'after')">

        <div class="collect-status">
          <div :class="['c-dot', collectBefore ? 'ok' : '']"></div>
          <span>变更前：{{ collectBefore ? collectBefore.length + ' 字符' : '未采集' }}</span>
          <div :class="['c-dot', collectAfter ? 'ok' : '']"></div>
          <span>变更后：{{ collectAfter ? collectAfter.length + ' 字符' : '未采集' }}</span>
        </div>

        <div v-if="collectMsg" class="collect-msg">{{ collectMsg }}</div>
      </div>
      <template #footer>
        <el-button @click="collectDialog = false">关闭</el-button>
        <el-button type="success" :disabled="!collectBefore || !collectAfter || importing" @click="runAutoCompare">立即比对</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth-store'
import Sidebar from './Sidebar.vue'
import Header from './Header.vue'
import TabsView from './TabsView.vue'
import { runCompare, compareState } from '../utils/compare.js'
import { settings, themeState, applyTheme, setCutoverMode } from '../utils/settings.js'
import { collectDevice, saveBaseline, loadBaseline, saveCollectDraft, loadCollectDraft, clearCollectDraft } from '../utils/api.js'
import { setDiffPair } from '../utils/diffStore.js'
import { resolveCollectIn, templatesForVendorIn, findTemplateIn } from '../utils/collectTemplates.js'
import { PAGE_PATHS } from '../router/pageMap.js'

const emit = defineEmits(['logout'])

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isLight = computed(() => themeState.isLight)
const sbCollapsed = ref(settings.sidebarCollapsed)
watch(() => settings.sidebarCollapsed, (v) => {
  if (route.meta.pageKey === 'home') sbCollapsed.value = v
})

const activeModule = ref('')
const filterFocusModule = ref('')
const nav = reactive({ compare: false, device: false })

const onToggleNav = (key) => {
  nav[key] = !nav[key]
}

const onHomeNavigate = (moduleName) => {
  const map = { 'BGP': 'hw-p', 'ISIS': 'hw-p', 'LDP': 'hw-p', 'LDP Peer': 'hw-p', 'SRv6': 'hw-p', '接口': 'hw-i', 'IPV4路由表': 'hw-i' }
  const key = map[moduleName] || 'hw-p'
  if (moduleName === '接口') activeModule.value = 'interface'
  if (moduleName === 'IPV4路由表') activeModule.value = 'routingStat'
  nav.compare = true
  nav.device = false
  router.push(PAGE_PATHS[key])
}

const toggleTheme = () => {
  settings.theme = themeState.isLight ? 'dark' : 'light'
}

// 初始应用浅色主题
onMounted(() => {
  applyTheme()
})

// 切换到功能页面或设置页时自动收起侧栏，回到首页时展开
watch(() => route.meta.pageKey, (val) => {
  if (val !== 'home') {
    sbCollapsed.value = true
  } else {
    sbCollapsed.value = settings.sidebarCollapsed
  }
  // 进入比对相关页面时自动展开「配置比对」菜单
  if (['hw-p', 'hw-i', 'text-diff', 'srv6-te-multi'].includes(val)) { nav.compare = true }
  // 进入配置解析页面时自动展开菜单
  if (val && val.startsWith('device-')) { nav.device = true }
  // 切到各解析页时重置 activeModule，自动展开该页默认模块（否则残留上一页模块状态导致面板折叠）
  if (val === 'device-huawei-ar') { activeModule.value = 'interface' }
  if (val === 'device-huawei-trunk') { activeModule.value = 'trunk' }
  if (val === 'device-huawei') { activeModule.value = 'bgp' }
  if (val === 'device-global') { activeModule.value = 'global' }
})

// 页面标题（由路由 meta.title 驱动）
const pageTitle = computed(() => route.meta.title || '首页')

// router-view 渲染组件的 props 绑定：按当前路由精确传入所需 props/事件，
// 避免向无关组件透传多余 prop。
const viewProps = computed(() => {
  const name = route.name
  const pk = route.meta.pageKey
  const compareDeviceCommon = {
    page: pk,
    activeModule: activeModule.value,
    'onUpdate:activeModule': (v) => { activeModule.value = v },
    filterFocusModule: filterFocusModule.value,
    onFocusFilter: (v) => { filterFocusModule.value = v },
  }
  if (name === 'home') return { onNavigate: onHomeNavigate }
  if (name === 'cutover-summary') return { onNavigate: onSummaryNavigate }
  if (name === 'snapshot') return { onGoto: onGoto }
  if (name === 'live-device') return { onGoto: onGoto }
  if (name === 'settings') return { onOpenCollect: onCollectClick, onDeviceCollect: onDeviceCollectFromSettings }
  if (name === 'device-huawei' || name === 'device-huawei-ar' || name === 'device-huawei-trunk' || name === 'device-h3c') {
    return { ...compareDeviceCommon, onGoto: onGoto, onDeviceCollect: onDeviceCollectFromSettings }
  }
  return compareDeviceCommon
})

// ===== 导入（本地文件） =====
const importInputRef = ref(null)
const importStep = ref(0) // 0=初始 1=已选变更前
const importBeforeFile = ref(null)
const importAfterFile = ref(null)
const importing = ref(false)


// ===== E：全局拖拽热区（拖入配置文件即导入） =====
const isDragging = ref(false)
let dragDepth = 0

const hasFiles = (e) => {
  const dt = e.dataTransfer
  return !!(dt && dt.types && Array.from(dt.types).includes('Files'))
}

const onDragEnter = (e) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth++
  isDragging.value = true
}
const onDragOver = (e) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
}
const onDragLeave = (e) => {
  if (!hasFiles(e)) return
  dragDepth--
  if (dragDepth <= 0) {
    dragDepth = 0
    isDragging.value = false
  }
}
const onDrop = (e) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth = 0
  isDragging.value = false
  const files = Array.from(e.dataTransfer.files || [])
  if (files.length) handleDroppedFiles(files)
}

const ACCEPT = ['.txt', '.conf', '.cfg', '.log']
const isAcceptedFile = (name) => {
  const lower = (name || '').toLowerCase()
  return ACCEPT.some(ext => lower.endsWith(ext))
}

// 拖入文件：第 1 个作「变更前」，第 2 个作「变更后」，复用同一导入流程
const handleDroppedFiles = (files) => {
  if (importing.value) return
  const accepted = files.filter(f => isAcceptedFile(f.name))
  if (accepted.length === 0) {
    ElMessage.warning('请拖入配置文件（.txt / .conf / .cfg / .log）')
    return
  }
  if (importStep.value === 0) {
    if (accepted.length >= 2) {
      importBeforeFile.value = accepted[0]
      importAfterFile.value = accepted[1]
      importStep.value = 2
      ElMessage({ type: 'success', message: `已接收 变更前：${accepted[0].name} / 变更后：${accepted[1].name}，开始比对`, customClass: 'file-step-msg', duration: 3000 })
      doCompare()
    } else {
      importBeforeFile.value = accepted[0]
      importStep.value = 1
      ElMessage({ type: 'success', message: `已选变更前文件：${accepted[0].name}，请拖入「变更后」文件`, customClass: 'file-step-msg', duration: 3000 })
    }
  } else if (importStep.value === 1) {
    importAfterFile.value = accepted[0]
    importStep.value = 2
    doCompare()
  }
}


const onImportClick = () => {
  if (importing.value) return
  if (importStep.value < 2) importInputRef.value?.click()
}

const onImportFile = (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  if (importStep.value === 0) {
    importBeforeFile.value = file
    importStep.value = 1
    ElMessage({
      type: 'success',
      message: `已选变更前文件：${file.name}，请选择「变更后」文件`,
      customClass: 'file-step-msg',
      duration: 3000
    })
  } else {
    importAfterFile.value = file
    importStep.value = 2
    doCompare()
  }
}

// 文件选择框点「取消」：若已处于「选变更后」阶段，则重置整个导入流程，
// 避免卡死在第二步、只能刷新页面才能重选变更前文件的问题
const onImportCancel = () => {
  if (importStep.value === 1) {
    importStep.value = 0
    importBeforeFile.value = null
    importAfterFile.value = null
    ElMessage({
      type: 'info',
      message: '已取消导入，可重新选择「变更前」文件',
      customClass: 'file-step-msg',
      duration: 3000
    })
  }
}

// ===== 采集配置对比（SSH 直采自动比对） =====
const cutoverOn = ref(settings.cutoverMode) // 割接模式（与设置同步）
const onCutoverToggle = (val) => {
  setCutoverMode(val)
  ElMessage.success(val ? '已切换：割接模式（IP 优先 + 忽略大小写/空白）' : '已切换：日常核查（名称优先 + 区分大小写）')
}
const collectDialog = ref(false)
const collectDevId = ref('')
const collectScope = ref('config') // 采集范围：config=仅配置 | full=配置+状态
const collectTemplateId = ref('') // 采集命令模板：''=默认（按采集范围）| 模板 id
const vendorTemplates = computed(() => templatesForVendorIn(settings.collectTemplates, selectedDev.value?.vendor || ''))
const onCollectTemplateChange = (id) => {
  const tpl = findTemplateIn(settings.collectTemplates, id)
  if (tpl) collectScope.value = tpl.scope
}
const collectBefore = ref('')   // 变更前配置文本
const collectAfter = ref('')    // 变更后配置文本
const collecting = ref(false)   // 采集中（前/后任一）
const collectStage = ref('')    // 'before' | 'after' | '' 当前正在采的阶段
const collectMsg = ref('')
const importBeforeRef = ref(null)
const importAfterRef = ref(null)

const onCollectClick = () => {
  if (settings.deviceConnections.length === 0) {
    ElMessage.warning('请先在「设置 → 设备管理」中添加设备')
    router.push(PAGE_PATHS['settings'])
    return
  }
  // 保持上次选中的设备（若已失效则回退到第一台）
  if (!settings.deviceConnections.find(d => d.id === collectDevId.value)) {
    collectDevId.value = settings.deviceConnections[0].id
  }
  collectMsg.value = ''
  collectTemplateId.value = '' // 每次打开默认按采集范围
  cutoverOn.value = settings.cutoverMode
  // 关窗不清空、重开续采：载入该设备的采集草稿
  restoreDraft(collectDevId.value)
  collectDialog.value = true
}

const viewRef = ref(null)

// 设置页「设备管理」点采集 → 切到配置解析页并打开 DevicePage 内部采集弹窗。
// 路由组件为懒加载，nextTick 时可能尚未挂载，轮询等待组件就绪后再打开弹窗。
const onDeviceCollectFromSettings = () => {
  router.push(PAGE_PATHS['device-huawei'])
  nav.compare = true
  const waitOpenCollect = (attempt = 0) => {
    const view = viewRef.value
    if (view && typeof view.openCollect === 'function') {
      view.openCollect()
      return
    }
    if (attempt > 50) return // 5 秒兜底
    setTimeout(() => waitOpenCollect(attempt + 1), 100)
  }
  nextTick(() => waitOpenCollect())
}

// 实时面板内「设为割接后并比对」后跳转到割接汇总
const onGoto = (target) => {
  activeModule.value = ''
  filterFocusModule.value = ''
  router.push(PAGE_PATHS[target])
  if (target.startsWith('device-')) nav.compare = true
}

// 割接汇总页点击某模块 → 钻取到配置比对对应明细（仅显示并展开该模块）
const onSummaryNavigate = ({ page: targetPage, module }) => {
  router.push(PAGE_PATHS[targetPage])
  activeModule.value = module
  filterFocusModule.value = module
  nav.compare = true
  nav.device = false
}

const selectedDev = computed(() =>
  settings.deviceConnections.find(d => d.id === collectDevId.value) || null
)

// 从本地草稿恢复某设备的采集进度（变更前/后）
const restoreDraft = (deviceId) => {
  const d = loadCollectDraft(deviceId)
  collectBefore.value = d ? (d.before || '') : ''
  collectAfter.value = d ? (d.after || '') : ''
  if (d && d.scope) collectScope.value = d.scope
  if (d && (d.before || d.after)) {
    const parts = []
    if (d.before) parts.push('变更前')
    if (d.after) parts.push('变更后')
    collectMsg.value = `已恢复上次采集（${parts.join(' + ')}），可继续采集或直接比对`
    setDiffPair(d.before || '', d.after || '', '变更前', '变更后')
  }
}

// 持久化当前设备的采集进度
const persistDraft = () => {
  const dev = selectedDev.value
  if (!dev) return
  saveCollectDraft(dev.id, {
    before: collectBefore.value,
    after: collectAfter.value,
    scope: collectScope.value,
    deviceName: dev.name
  })
}

// 切换设备时载入该设备各自的采集草稿
watch(collectDevId, (id) => {
  if (collectDialog.value) restoreDraft(id)
})

// 清空当前设备的采集进度，重新开始
const clearCollectDraftAll = () => {
  const dev = selectedDev.value
  collectBefore.value = ''
  collectAfter.value = ''
  collectMsg.value = ''
  if (dev) clearCollectDraft(dev.id)
  ElMessage.success('已清空本次采集，可重新采集')
}

// 手动导入本地配置文件作为变更前/后（无需连设备）
const readCollectFile = async (e, stage) => {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const text = await file.text()
    if (stage === 'before') collectBefore.value = text
    else collectAfter.value = text
    setDiffPair(collectBefore.value, collectAfter.value, '变更前', '变更后')
    collectMsg.value = `已导入${stage === 'before' ? '变更前' : '变更后'}配置（${text.length} 字符）`
    persistDraft()
    // 两份齐了自动比对
    if (collectBefore.value && collectAfter.value) runAutoCompare()
  } catch (err) {
    collectMsg.value = '文件读取失败：' + (err && err.message ? err.message : '未知错误')
    ElMessage.error('文件读取失败：' + (err && err.message ? err.message : '请确认文件为文本配置'))
  }
}

// 采集某个快照（stage: 'before' | 'after'），写入对应文本后尝试自动比对
const doCollect = async (stage) => {
  const dev = selectedDev.value
  if (!dev) { ElMessage.warning('请先选择设备'); return }
  collecting.value = true
  collectStage.value = stage
  collectMsg.value = (stage === 'before' ? '正在采集「变更前」配置' : '正在采集「变更后」配置') + '…'
  try {
    const { commands, scope } = resolveCollectIn(settings.collectTemplates, collectTemplateId.value, dev.vendor, collectScope.value)
    const { text } = await collectDevice({
      host: dev.host, port: dev.port || 22, username: dev.username,
      password: dev.password, vendor: dev.vendor, scope, commands,
      authType: dev.authType || 'password',
      privateKey: dev.privateKey || undefined, passphrase: dev.passphrase || undefined
    })
    if (stage === 'before') collectBefore.value = text
    else collectAfter.value = text
    setDiffPair(collectBefore.value, collectAfter.value, '变更前', '变更后')
    collectMsg.value = (stage === 'before' ? '已采集变更前配置（' : '已采集变更后配置（') + text.length + ' 字符）'
    // 持久化采集进度：关窗/刷新不丢，隔几小时也能续采
    persistDraft()
    // 两次齐了自动比对
    if (collectBefore.value && collectAfter.value) runAutoCompare()
  } catch (err) {
    collectMsg.value = '采集失败：' + (err && err.message ? err.message : '未知错误')
    ElMessage.error('采集失败：' + (err && err.message ? err.message : '请检查设备地址/账号或后端是否启动'))
  }
  collecting.value = false
  collectStage.value = ''
}

// 把当前「变更后」存为基线，下次可直接「采集后 vs 基线」一键比对
const saveAsBaseline = () => {
  const dev = selectedDev.value
  if (!dev) return
  // 优先保存「变更后」，没有则用「变更前」，只要采集过任意一份即可存为基线
  const snapshot = collectAfter.value || collectBefore.value
  if (!snapshot) { ElMessage.warning('请先采集配置（变更前或变更后均可）'); return }
  saveBaseline(dev.id, snapshot, { deviceName: dev.name, scope: collectScope.value })
  ElMessage.success('已保存为基线快照（' + snapshot.length + ' 字符）')
}

// 载入基线作为变更前，再采集变更后自动比对（典型割接自动化流程）
const collectAfterVsBaseline = async () => {
  const dev = selectedDev.value
  if (!dev) { ElMessage.warning('请先选择设备'); return }
  const base = loadBaseline(dev.id)
  if (!base) { ElMessage.warning('该设备暂无基线，请先「采集变更前」或「保存为基线」'); return }
  collectBefore.value = base
  await doCollect('after')
}

const runAutoCompare = async () => {
  importing.value = true
  try {
    const result = await runCompare(collectBefore.value, collectAfter.value, {
      ignoreCase: settings.ignoreCase,
      ignoreWhitespace: settings.ignoreWhitespace,
      ignoreOrder: settings.ignoreOrder,
      interfaceMatchPriority: settings.interfaceMatchPriority
    })
    collectDialog.value = false
    showImportSuccess(result)
  } catch (err) {
    console.error('[设备采集比对] 失败：', err)
    ElMessage.error('比对失败：' + (err && err.message ? err.message : '请确认采集内容正确'))
  }
  importing.value = false
}

// 在比对结果中找出第一个含变更的模块（按常见关注顺序），用于导入后自动展开
const CHANGED_MODULE_ORDER = ['ldpPeer', 'ldp', 'isis', 'bgp', 'srv6', 'srv6TePolicy']
const findFirstChangedModule = () => {
  for (const m of CHANGED_MODULE_ORDER) {
    const entry = compareState[m]
    if (!entry) continue
    const list = entry.list
    const arr = list && typeof list === 'object' && 'value' in list ? list.value : list
    if (Array.isArray(arr) && arr.some(r => r && r.isConsistent === false)) return m
  }
  return ''
}

function showImportSuccess(result) {
  // 不再跳回首页：直接落到「华为·路由协议」比对页，并自动展开首个有变更的模块，让结果所见即所得
  const firstChanged = findFirstChangedModule()
  nav.compare = true
  nav.device = false
  filterFocusModule.value = ''
  router.push(PAGE_PATHS['hw-p'])
  if (firstChanged) activeModule.value = firstChanged
}

const doCompare = async () => {
  if (!importBeforeFile.value) return
  importing.value = true
  try {
    const bText = await importBeforeFile.value.text()
    const aText = importAfterFile.value ? await importAfterFile.value.text() : ''
    setDiffPair(bText, aText, importBeforeFile.value && importBeforeFile.value.name || '变更前', importAfterFile.value && importAfterFile.value.name || '变更后')
    const result = await runCompare(bText, aText, { ignoreCase: settings.ignoreCase, ignoreWhitespace: settings.ignoreWhitespace, ignoreOrder: settings.ignoreOrder, interfaceMatchPriority: settings.interfaceMatchPriority })
    showImportSuccess(result)
  } catch (err) {
    console.error('[配置比对] 双文件比对失败：', err)
    ElMessage.error('文件读取失败：' + (err && err.message ? err.message : '请确认文件格式正确'))
  }
  importStep.value = 0
  importBeforeFile.value = null
  importAfterFile.value = null
  importing.value = false
}

const logout = () => emit('logout')
</script>

<style scoped>
.app { display:flex; flex-direction:column; height:100vh; position:relative }
.app-main { display:flex; flex:1; min-height:0 }
.mn { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0 }
.bd { flex:1; overflow:auto; padding:14px 24px 24px; width:100% }
.collect-body { font-size: 13px; color: var(--t1); }
.collect-row { display:flex; align-items:center; gap:12px; }
.c-label { width:64px; flex-shrink:0; color: var(--t2); }
.cutover-row { align-items:flex-start; padding:10px 12px; background:var(--sidebar-h); border-radius:6px; }
.cutover-row .c-label { padding-top:2px; }
.cutover-box { display:flex; flex-direction:column; gap:6px; flex:1; min-width:0; }
.cutover-hint { color:var(--t3); font-size:12px; line-height:1.5; }
.collect-tip { margin:14px 0; padding:10px 12px; background:var(--sidebar-h); border-radius:6px; color:var(--t3); line-height:1.6; }
.collect-actions { display:flex; flex-wrap:wrap; gap:10px; }
.ca-group { display:inline-flex; gap:8px; }
.collect-status { display:flex; align-items:center; gap:8px; margin-top:16px; color:var(--t2); }
.c-dot { width:9px; height:9px; border-radius:50%; background:var(--border); margin-left:6px; }
.c-dot.ok { background:#67c23a; }
.collect-msg { margin-top:12px; padding:8px 10px; background:var(--sidebar-h); border-radius:6px; color:var(--t2); font-family:var(--mono); word-break:break-all; }
.drop-overlay { position:absolute; inset:0; z-index:60; display:flex; align-items:center; justify-content:center; background:rgba(15,17,23,0.72); pointer-events:none }
html.light .drop-overlay { background:rgba(245,247,250,0.72) }
.drop-box { width:min(520px,80%); padding:48px 32px; border:2px dashed var(--blue-b); border-radius:16px; background:var(--blue-l); display:flex; flex-direction:column; align-items:center; gap:14px; color:var(--blue); text-align:center }
.drop-title { font-size:16px; font-weight:600; color:var(--t1) }
.drop-sub { font-size:12px; color:var(--t3) }
@keyframes sbpulse { 0%{box-shadow:0 0 0 0 rgba(74,158,255,.5)} 50%{box-shadow:0 0 0 4px rgba(74,158,255,.12)} 100%{box-shadow:0 0 0 0 rgba(74,158,255,.5)} }

/* 路由切换淡入淡出 */
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
