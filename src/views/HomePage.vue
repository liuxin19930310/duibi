<template>
  <div class="home-page">
    <!-- 统计卡片 -->
    <div class="stats">
      <el-card class="stat stat-total" shadow="never">
        <div class="stat-icon si-blue"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div>
        <div class="stat-bd"><div class="stat-label">总比对项</div><div class="stat-val">{{ totalCount }}</div></div>
      </el-card>
      <el-card class="stat" shadow="never">
        <div class="stat-icon si-green"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="stat-bd"><div class="stat-label">一致</div><div class="stat-val">{{ consistentCount }}</div></div>
      </el-card>
      <el-card class="stat" shadow="never">
        <div class="stat-icon si-orange"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><div class="stat-bd"><div class="stat-label">变更</div><div class="stat-val">{{ diffCount }}</div></div>
      </el-card>
      <el-card class="stat" shadow="never">
        <div class="stat-icon si-red"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><div class="stat-bd"><div class="stat-label">已失效</div><div class="stat-val">{{ deletedCount }}</div></div>
      </el-card>
      <el-card class="stat" shadow="never">
        <div class="stat-icon si-purple"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><div class="stat-bd"><div class="stat-label">新增</div><div class="stat-val">{{ newCount }}</div></div>
      </el-card>
    </div>

    <div class="two-col">
      <!-- 左侧：需要关注 -->
      <el-card class="panel" shadow="never">
        <template #header>
          <div class="panel-hd">
            <span class="panel-title"><svg viewBox="0 0 1024 1024" class="panel-ico-warn" fill="currentColor"><path d="M512 206.144l396.992 687.552L115.008 893.696 512 206.144M512 70.912 0 957.696l1024 0L512 70.912 512 70.912 512 70.912zM512 66.304M480 381.696l64 0 0 320-64 0L480 381.696 480 381.696zM544 765.696l0 64-64 0 0-64M480 765.696"/></svg>需要关注</span>
            <span class="panel-desc">变更 / 失效 / 新增条目汇总</span>
          </div>
        </template>
        <div class="scroll-area alert-scroll">
          <el-empty v-if="alertList.length === 0" description="暂无异常 · 所有配置一致" />
          <div v-for="item in alertList" :key="item.id" class="alert-row" @click="goTo(item.module)">
            <div class="alert-dot" :class="item.severity" />
            <div class="alert-info">
              <div class="alert-title">{{ item.title }}</div>
              <div class="alert-desc">{{ item.desc }}</div>
            </div>
            <div class="alert-tag">{{ item.module }}</div>
          </div>
        </div>
      </el-card>

      <!-- 右侧：各协议概览 -->
      <el-card class="panel" shadow="never">
        <template #header>
          <div class="panel-hd">
            <span class="panel-title"><svg viewBox="0 0 1024 1024" class="panel-ico" fill="currentColor"><path d="M954.88 237.568c0-60.416-56.832-109.568-126.464-109.568H195.584c-70.144 0-126.464 49.152-126.464 109.568v548.352c0 60.416 56.832 109.568 126.464 109.568h632.832c70.144 0 126.464-49.152 126.464-109.568V237.568z m-803.84-28.16c11.776-10.24 28.16-16.384 45.056-15.872h632.832c34.816 0 63.488 14.336 63.488 44.544v246.784h-50.176l-54.272-47.104c-12.288-10.752-32.256-10.752-44.544 0-3.584 3.072-6.144 6.656-7.68 10.752l-38.912 101.888L604.16 390.144c-7.68-13.312-26.624-18.944-42.496-12.288-7.168 3.072-12.288 8.192-15.36 14.336l-92.16 199.68-101.376-307.2c-4.608-14.336-22.528-23.04-38.912-18.944-8.704 2.048-15.872 7.168-19.456 14.336l-117.76 204.288H133.12V247.808c-1.024-14.336 6.144-28.16 17.92-38.4z m725.504 611.84c-7.68 7.68-31.232 9.728-48.128 9.728H195.584c-16.896 0-32.768-5.632-45.056-15.872s-18.432-24.064-18.432-38.912v-236.544h63.488c11.776 0 23.04-5.632 28.16-15.36l90.112-156.16 104.448 316.416c3.584 11.264 15.36 19.456 28.672 19.968h1.536c12.8 0 24.576-6.656 29.184-17.408L578.56 468.992l95.232 164.864c7.68 13.312 26.624 18.944 42.496 12.288 7.68-3.072 13.312-8.704 15.872-15.872l47.104-122.368 27.136 23.552c6.144 5.12 13.824 8.192 22.528 8.192h62.976v236.544c0 14.336-9.728 40.448-14.336 44.544l-1.024 0.512z"/></svg>协议状态</span>
            <span class="panel-desc">点击跳转查看详情</span>
          </div>
        </template>
        <div class="proto-list">
          <div v-for="m in moduleStats" :key="m.name" class="proto-row" @click="goTo(m.name)">
            <div class="proto-row-name">{{ m.name }}</div>
            <div class="proto-row-bar">
              <el-progress
                :percentage="m.total ? Math.round((m.consistent / m.total) * 100) : 0"
                :stroke-width="4"
                :show-text="false"
                :color="barColor(m)"
              />
            </div>
            <div class="proto-row-nums">
              <span class="num-ok">{{ m.consistent }}</span>
              <span class="num-sep">/</span>
              <span class="num-total">{{ m.total }}</span>
            </div>
            <div class="proto-row-alerts">
              <span v-if="m.del" class="alert-cnt red">{{ m.del }} 失效</span>
              <span v-if="m.diff" class="alert-cnt orange">{{ m.diff }} 变更</span>
              <span v-if="m.new" class="alert-cnt blue">{{ m.new }} 新增</span>
              <span v-if="!m.diff && !m.del && !m.new" class="alert-cnt green">正常</span>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 变更明细 -->
    <el-card class="panel" shadow="never">
      <template #header>
        <div class="panel-hd">
          <span class="panel-title"><svg viewBox="0 0 1024 1024" class="panel-ico-doc" fill="currentColor"><path d="M824.96 760.064a32 32 0 0 1 37.44 40.768 150.4 150.4 0 0 1-144.32 106.112c-24.128 0-47.424-5.632-68.416-16.192l-10.24-5.696-8.192-5.376a32 32 0 0 1-58.688-10.944l-0.576-5.76v-71.68a31.936 31.936 0 0 1 62.528-9.6c11.328 36.48 45.248 61.312 83.456 61.184 38.4 0 72-24.576 83.392-61.184a32 32 0 0 1 23.616-21.632z m-107.072-156.096l12.032 0.448c19.84 1.6 38.976 6.976 56.448 15.744l10.24 5.632 8.128 5.376a33.28 33.28 0 0 1 16.448-13.376l5.248-1.408 5.568-0.448c15.488 0 28.736 11.008 31.488 26.24l0.512 5.76v71.68a31.936 31.936 0 0 1-62.464 9.6 87.04 87.04 0 0 0-83.456-61.248c-38.4 0-72 24.64-83.456 61.376a32.256 32.256 0 0 1-56.448 9.216 32 32 0 0 1-4.672-28.544 150.784 150.784 0 0 1 133.504-105.664l10.88-0.384z"/><path d="M128 128v727.424a64 64 0 0 0 64 64h337.28v-64H219.712c-15.36 0-27.776 15.36-27.776 0V128H800v456.96h64V128a64 64 0 0 0-64-64H192a64 64 0 0 0-64 64z"/><path d="M633.152 284.864H276.928v64h356.224v-64zM528 447.872H276.928v64H528v-64z"/></svg>变更明细</span>
          <span class="panel-desc">所有协议中发生变化的字段</span>
        </div>
      </template>
      <el-empty v-if="changeLog.length === 0" description="暂无变更记录 · 所有协议配置均一致" />
      <el-table v-else :data="changeLog" border size="small" max-height="300" class="change-table">
        <el-table-column label="协议" width="92">
          <template #default="{ row }"><span class="proto-badge">{{ row.proto }}</span></template>
        </el-table-column>
        <el-table-column prop="id" label="标识" min-width="150" show-overflow-tooltip />
        <el-table-column prop="field" label="字段" min-width="140" show-overflow-tooltip />
        <el-table-column label="旧值" min-width="180" show-overflow-tooltip>
          <template #default="{ row }"><span class="val-old">{{ row.before }}</span></template>
        </el-table-column>
        <el-table-column label="新值" min-width="180" show-overflow-tooltip>
          <template #default="{ row }"><span class="val-new">{{ row.after }}</span></template>
        </el-table-column>
      </el-table>
      <div v-if="changeLogTruncated" class="change-hint">仅显示前 {{ changeLogLimit }} 条 · 共 {{ changeLogTotal }} 条变更记录</div>
    </el-card>
  </div>
</template>

<script setup>
defineOptions({ name: 'HomePage' })

import { computed } from 'vue'
import { compareState } from '../utils/compare.js'

const { bgp: { list: bgpList }, isis: { list: isisList }, ldp: { list: ldpList }, ldpPeer: { list: ldpPeerList }, srv6: { list: srv6List }, interface: { list: ifaceList } } = compareState

const emit = defineEmits(['navigate'])

const calcStats = (list) => {
  let consistent = 0, diff = 0, newCnt = 0, del = 0
  list.forEach(i => {
    const st = (i.sessionState || i.state || i.status || i.funcType || i.portStatus || '').toLowerCase()
    if (st.includes('新增')) { newCnt++ }
    else if (st.includes('已失效') || st.includes('已删除')) { del++ }
    else if (i.isConsistent === true) { consistent++ }
    else if (i.isConsistent === false) { diff++ }
    else { consistent++ }
  })
  return { consistent, diff, new: newCnt, del }
}

const allStats = computed(() => {
  const lists = [bgpList, isisList, ldpList, ldpPeerList, srv6List, ifaceList]
  let c = 0, d = 0, n = 0, dl = 0
  lists.forEach(l => { const s = calcStats(l.value); c += s.consistent; d += s.diff; n += s.new; dl += s.del })
  return { consistent: c, diff: d, new: n, del: dl, total: c + d + n + dl }
})

const totalCount = computed(() => allStats.value.total)
const consistentCount = computed(() => allStats.value.consistent)
const diffCount = computed(() => allStats.value.diff)
const deletedCount = computed(() => allStats.value.del)
const newCount = computed(() => allStats.value.new)

const moduleStats = computed(() => [
  { name: 'BGP', key: 'bgp', ...calcStats(bgpList.value), total: bgpList.value.length },
  { name: 'ISIS', key: 'isis', ...calcStats(isisList.value), total: isisList.value.length },
  { name: 'LDP', key: 'ldp', ...calcStats(ldpList.value), total: ldpList.value.length },
  { name: 'LDP Peer', key: 'ldpPeer', ...calcStats(ldpPeerList.value), total: ldpPeerList.value.length },
  { name: 'SRv6', key: 'srv6', ...calcStats(srv6List.value), total: srv6List.value.length },
  { name: '接口', key: 'iface', ...calcStats(ifaceList.value), total: ifaceList.value.length },
])

const barColor = (m) => {
  if (!m.total) return 'var(--bg4)'
  const rate = m.consistent / m.total
  return rate >= 0.95 ? 'var(--green)' : rate >= 0.7 ? 'var(--orange)' : 'var(--red)'
}

const alertList = computed(() => {
  const alerts = []
  const addItems = (list, proto, stateField, keyField) => {
    list.forEach(i => {
      const st = (i[stateField] || '').toLowerCase()
      if (st.includes('已失效') || st.includes('已删除')) {
        alerts.push({ id: `${proto}-${i[keyField]}`, module: proto, title: i[keyField] || '-', desc: `${proto} 会话/端口已失效`, severity: 'red' })
      } else if (i.isConsistent === false) {
        const fields = (i.configDiffFields || []).map(d => d.field).join('、')
        alerts.push({ id: `${proto}-${i[keyField]}`, module: proto, title: i[keyField] || '-', desc: `字段变更：${fields}`, severity: 'orange' })
      } else if (st.includes('新增')) {
        alerts.push({ id: `${proto}-${i[keyField]}`, module: proto, title: i[keyField] || '-', desc: `新增${proto}条目`, severity: 'blue' })
      }
    })
  }
  addItems(bgpList.value, 'BGP', 'sessionState', 'neighborIp')
  addItems(isisList.value, 'ISIS', 'state', 'endXSid')
  addItems(ldpList.value, 'LDP', 'status', 'peerId')
  addItems(ldpPeerList.value, 'LDP Peer', 'transportAddress', 'peerId')
  addItems(srv6List.value, 'SRv6', 'funcType', 'sid')
  addItems(ifaceList.value, '接口', 'portStatus', 'interfaceName')
  const order = { red: 0, orange: 1, blue: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 30)
})

const allChangeLog = computed(() => {
  const logs = []
  const addDiffs = (list, proto, keyField) => {
    list.forEach(i => {
      if (i.configDiffFields && i.configDiffFields.length > 0) {
        i.configDiffFields.forEach(d => {
          logs.push({ proto, id: i[keyField] || '-', field: d.field, before: d.beforeVal, after: d.afterVal })
        })
      }
    })
  }
  addDiffs(bgpList.value, 'BGP', 'neighborIp')
  addDiffs(isisList.value, 'ISIS', 'endXSid')
  addDiffs(ldpList.value, 'LDP', 'peerId')
  addDiffs(ldpPeerList.value, 'LDP Peer', 'peerId')
  addDiffs(srv6List.value, 'SRv6', 'sid')
  addDiffs(ifaceList.value, '接口', 'interfaceName')
  return logs
})
const changeLogLimit = 50
const changeLogTotal = computed(() => allChangeLog.value.length)
const changeLogTruncated = computed(() => changeLogTotal.value > changeLogLimit)
const changeLog = computed(() => allChangeLog.value.slice(0, changeLogLimit))

const goTo = (name) => {
  emit('navigate', name)
}
</script>

<style scoped>
.stats { display:grid; grid-template-columns:160px repeat(4,1fr); gap:12px; margin-bottom:12px }
@media (max-width:1100px) { .stats { grid-template-columns:repeat(auto-fit,minmax(150px,1fr)) } }
.stat { transition:all .25s; cursor:default }
.stat :deep(.el-card__body) { display:flex; align-items:center; gap:14px; padding:14px 16px }
.stat:hover { border-color:var(--blue-b); transform:translateY(-2px); box-shadow:0 4px 16px rgba(0,0,0,.15) }
.stat-total { grid-column:1 }
.stat-total .stat-bd .stat-val { font-size:30px }
.stat-icon { width:40px; height:40px; border-radius:10px; display:grid; place-items:center; font-size:18px; flex-shrink:0 }
.si-blue { background:var(--blue-l); color:var(--blue) }
.si-green { background:var(--green-l); color:var(--green) }
.si-orange { background:var(--orange-l); color:var(--orange) }
.si-red { background:var(--red-l); color:var(--red) }
.si-purple { background:var(--purple-l); color:var(--purple) }
.stat-bd .stat-label { font-size:11px; color:var(--t3); margin-bottom:0 }
.stat-bd .stat-val { font-size:24px; font-weight:700; color:var(--t1); line-height:1 }

.panel { margin-bottom:12px; border-radius:var(--r); overflow:hidden }
.panel :deep(.el-card__body) { padding:0 }
.panel :deep(.el-card__header) { padding:12px 18px; border-bottom:1px solid var(--div) }
.panel-hd { display:flex; align-items:center; justify-content:space-between }
.panel-title { font-size:14px; font-weight:600; color:var(--t1); display:inline-flex; align-items:center; gap:6px }
.panel-ico { width:16px; height:16px; flex-shrink:0; color:var(--blue) }
.panel-ico-warn { width:16px; height:16px; flex-shrink:0; color:var(--red) }
.panel-ico-doc { width:16px; height:16px; flex-shrink:0; color:var(--blue) }
.panel-desc { font-size:11px; color:var(--t3) }

.alert-row { display:flex; align-items:center; gap:10px; padding:10px 18px; cursor:pointer; transition:background .15s; border-bottom:1px solid var(--div) }
.alert-row:last-child { border-bottom:none }
.alert-row:hover { background:var(--sidebar-h) }
.alert-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0 }
.alert-dot.red { background:var(--red) }
.alert-dot.orange { background:var(--orange) }
.alert-dot.blue { background:var(--blue) }
.alert-info { flex:1; min-width:0 }
.alert-title { font-size:13px; font-weight:600; color:var(--t2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.4 }
.alert-desc { font-size:12px; color:var(--t3); margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.4 }
.alert-tag { font-size:11px; padding:2px 8px; border-radius:10px; background:var(--bg3); color:var(--t3); flex-shrink:0; border:1px solid var(--border); line-height:1.4 }

.proto-row { display:flex; align-items:center; gap:10px; padding:8px 6px; margin:0 -6px; cursor:pointer; border-bottom:1px solid var(--div); transition:background .15s }
.proto-row:last-child { border-bottom:none }
.proto-row:hover { background:var(--sidebar-h); border-radius:6px }
.proto-row-name { width:64px; font-size:12px; font-weight:500; color:var(--t2); flex-shrink:0 }
.proto-row-bar { flex:1 }
.proto-row-bar :deep(.el-progress) { width:100% }
.proto-row-nums { width:54px; text-align:right; flex-shrink:0 }
.num-ok { font-size:13px; font-weight:600; color:var(--green); font-family:var(--mono) }
.num-sep { color:var(--t4); margin:0 1px }
.num-total { font-size:12px; color:var(--t3); font-family:var(--mono) }
.proto-row-alerts { width:auto; display:flex; gap:3px; flex-shrink:0; flex-wrap:nowrap; justify-content:flex-end }
.alert-cnt { font-size:11px; padding:1px 5px; border-radius:8px; line-height:1.4; white-space:nowrap }
.alert-cnt.red { background:var(--red-bg); color:var(--red) }
.alert-cnt.orange { background:var(--orange-bg); color:var(--orange) }
.alert-cnt.blue { background:var(--blue-l); color:var(--blue) }
.alert-cnt.green { background:var(--green-bg); color:var(--green) }

.proto-badge { font-size:11px; padding:1px 8px; border-radius:10px; background:var(--blue-l); color:var(--blue); font-weight:500; line-height:1.4 }
.val-old { color:var(--red); font-size:12px; line-height:1.4 }
.val-new { color:var(--green); font-weight:600; font-size:12px; line-height:1.4 }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px }
@media (max-width:900px) {
  .stats { grid-template-columns:repeat(2,1fr) }
  .stat-total { grid-column:1 / span 2 }
  .two-col { grid-template-columns:1fr }
}
.two-col .panel { display:flex; flex-direction:column }
.two-col .panel :deep(.el-card__body) { display:flex; flex-direction:column; min-height:0 }
.alert-scroll { flex:1; min-height:0; max-height:none; display:flex; flex-direction:column }
.alert-scroll .el-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center }
.scroll-area { overflow-y: auto }
.proto-list { padding: 12px }
.change-hint { padding:8px 18px; border-top:1px solid var(--div); font-size:12px; color:var(--t3); text-align:center }

/* 空状态已改用 el-empty 组件（见 template 中的 <el-empty>） */
.el-empty { padding:32px 24px }
</style>
