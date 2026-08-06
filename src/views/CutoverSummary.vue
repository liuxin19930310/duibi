<template>
  <div class="cutover-summary-page">
    <div class="page-title-row">
      <h2 class="page-title">割接汇总</h2>
      <span class="page-desc">跨全部模块聚合割接前后对比结论</span>
    </div>

    <div v-if="hasData">
      <div class="cutover-summary">
        <div class="summary-head">
          <span class="verdict" :class="verdictClass">{{ verdictText }}</span>
          <span class="summary-sub">割接前后对比汇总 · 一致 <b>{{ totalConsistentCount }}</b> · 差异 <b>{{ totalDiffCount }}</b></span>
        </div>
        <div class="summary-grid">
          <div
            class="sum-item"
            v-for="m in moduleSummaries"
            :key="m.label"
            :class="{ 'has-diff': m.diff > 0 || m.new > 0 || m.del > 0 }"
            role="button"
            tabindex="0"
            :title="`点击查看「${m.label}」对比明细`"
            @click="goModule(m.label)"
            @keyup.enter="goModule(m.label)"
          >
            <div class="sum-name">{{ m.label }}</div>
            <div class="sum-nums">
              <span class="ok">一致 {{ m.consistent }}</span>
              <span class="diff" v-if="m.diff">差异 {{ m.diff }}</span>
              <span class="new" v-if="m.new">新增 {{ m.new }}</span>
              <span class="del" v-if="m.del">已失效 {{ m.del }}</span>
            </div>
            <div class="sum-go">查看明细 →</div>
          </div>
        </div>
        <div class="grid-hint">点击任一模块卡片，可直接跳转至对应对比明细</div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="13" y2="11"/></svg>
      </div>
      <div class="empty-title">暂无对比数据</div>
      <div class="empty-desc">请先在「配置比对」中导入割接前 / 后文件并完成对比，<br>再回到本页查看割接汇总结论。</div>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'CutoverSummary' })

import { computed } from 'vue'
import { compareState } from '../utils/compare.js'

const emit = defineEmits(['navigate'])

const bgpList = compareState.bgp.list
const isisList = compareState.isis.list
const ldpList = compareState.ldp.list
const ldpPeerList = compareState.ldpPeer.list
const srv6List = compareState.srv6.list
const srv6TePolicyList = compareState.srv6TePolicy.list
const routingStatList = compareState.routingStat.list
const ifaceList = compareState.interface.list

// ===== 汇总结论区：跨全部模块聚合一致/差异，给出割接验证结论 =====
const summaryModules = [
  { label: 'BGP 协议', list: bgpList },
  { label: 'ISIS 协议', list: isisList },
  { label: 'LDP 协议', list: ldpList },
  { label: 'LDP Peer', list: ldpPeerList },
  { label: 'SRv6 SID', list: srv6List },
  { label: 'SRv6 TE Policy', list: srv6TePolicyList },
  { label: 'IPV4路由表', list: routingStatList },
  { label: '接口信息', list: ifaceList }
]
const moduleSummaries = computed(() => {
  return summaryModules
    .map(m => {
      const list = m.list.value
      const consistent = list.filter(i => i.isConsistent === true).length
      const diff = list.filter(i => i.isConsistent === false).length
      const newCnt = list.filter(i => JSON.stringify(i).includes('新增')).length
      const delCnt = list.filter(i => /已失效|已删除/.test(JSON.stringify(i))).length
      return { label: m.label, total: list.length, consistent, diff, new: newCnt, del: delCnt }
    })
    .filter(m => m.total > 0)
})
const totalDiffCount = computed(() => moduleSummaries.value.reduce((s, m) => s + m.diff, 0))
const totalConsistentCount = computed(() => moduleSummaries.value.reduce((s, m) => s + m.consistent, 0))
const hasData = computed(() => moduleSummaries.value.length > 0)
const verdictText = computed(() => totalDiffCount.value === 0 ? '割接验证通过' : `存在 ${totalDiffCount.value} 项差异，需确认`)
const verdictClass = computed(() => totalDiffCount.value === 0 ? 'ok' : 'bad')

// 模块标签 → 配置比对页的 page + activeModule（用于点击钻取）
const moduleTargets = {
  'BGP 协议': { page: 'hw-p', module: 'bgp' },
  'ISIS 协议': { page: 'hw-p', module: 'isis' },
  'LDP 协议': { page: 'hw-p', module: 'ldp' },
  'LDP Peer': { page: 'hw-p', module: 'ldpPeer' },
  'SRv6 SID': { page: 'hw-p', module: 'srv6' },
  'SRv6 TE Policy': { page: 'hw-p', module: 'srv6TePolicy' },
  'IPV4路由表': { page: 'hw-i', module: 'routingStat' },
  '接口信息': { page: 'hw-i', module: 'interface' }
}
const goModule = (label) => {
  const t = moduleTargets[label]
  if (t) emit('navigate', t)
}

</script>

<style scoped>
.page-title-row { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; flex-wrap: wrap }
.page-title { font-size: 18px; font-weight: 700; color: var(--t1); margin: 0 }
.page-desc { font-size: 13px; color: var(--t3) }

/* 汇总结论区 */
.cutover-summary {
  background: var(--bg2, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 14px;
}
.summary-head {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.verdict {
  font-size: 15px;
  font-weight: 700;
  padding: 4px 14px;
  border-radius: 6px;
}
.verdict.ok {
  background: rgba(34, 197, 94, 0.14);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.4);
}
.verdict.bad {
  background: rgba(239, 68, 68, 0.14);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.4);
}
.summary-sub {
  font-size: 13px;
  color: var(--t3, #6b7280);
}
.summary-sub b {
  color: var(--t2, #111827);
  font-size: 14px;
}
.summary-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sum-item {
  background: var(--bg3, #f7f8fa);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  padding: 6px 10px;
  min-width: 150px;
  cursor: pointer;
  transition: all .15s;
  position: relative;
}
.sum-item:hover {
  border-color: var(--blue-b, #93c5fd);
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.12);
  transform: translateY(-1px);
}
.sum-item.has-diff {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.05);
}
.sum-item.has-diff:hover {
  border-color: rgba(239, 68, 68, 0.7);
  box-shadow: 0 2px 10px rgba(239, 68, 68, 0.18);
}
.sum-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--t2, #111827);
  margin-bottom: 4px;
}
.sum-nums {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
}
.sum-nums .ok { color: #16a34a; }
.sum-nums .diff { color: #dc2626; }
.sum-nums .new { color: #0891b2; }
.sum-nums .del { color: #d97706; }
.sum-go {
  margin-top: 5px;
  font-size: 11px;
  color: var(--blue, #2563eb);
  opacity: 0;
  transition: opacity .15s;
  white-space: nowrap;
}
.sum-item:hover .sum-go { opacity: 1; }
.grid-hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--t3, #9ca3af);
}

/* 空状态 */
.empty-state { padding: 64px 24px; text-align: center; color: var(--t3); }
.empty-icon { width: 56px; height: 56px; margin: 0 auto 14px; color: var(--t4); }
.empty-title { font-size: 15px; font-weight: 600; color: var(--t2); margin-bottom: 6px; }
.empty-desc { font-size: 13px; color: var(--t3); line-height: 1.7; }
</style>
