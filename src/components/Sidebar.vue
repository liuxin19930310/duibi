<template>
  <aside class="sb" :class="{ collapsed: sbCollapsed }">
    <div class="sb-brand">
      <div class="sb-logo">
        <img :src="netIcon" class="sb-logo-img" alt="NetCompare" />
      </div>
      <div class="sb-brand-txt">
        <div class="sb-brand-name">NetCompare</div>
      </div>
    </div>

    <nav class="sb-nav">
      <div class="sb-i" :class="{ on: currentPage === 'home' }" tabindex="0" @click="onPage('home')" @keydown.enter="onPage('home')" @keydown.space.prevent="onPage('home')">
        <Icon icon="mdi:view-dashboard-outline" class="sb-navico" />
        <span class="t">首页</span>
      </div>

      <div class="sb-i" :class="{ open: nav.compare }" tabindex="0" @click="onToggleNav('compare')" @keydown.enter="onToggleNav('compare')" @keydown.space.prevent="onToggleNav('compare')">
        <svg viewBox="0 0 1024 1024" class="sb-navico" fill="currentColor"><path d="M725.333333 1024H128a85.333333 85.333333 0 0 1-85.333333-85.333333V225.28a85.333333 85.333333 0 0 1 85.333333-85.333333h597.333333a85.333333 85.333333 0 0 1 85.333334 85.333333V938.666667a85.333333 85.333333 0 0 1-85.333334 85.333333zM128 221.866667V938.666667h597.333333V225.28zM784.213333 844.8h-18.773333"/><path d="M901.973333 887.466667H784.213333v-85.333334h117.76L896 79.36 292.693333 85.333333 298.666667 175.786667H213.333333V79.36A79.36 79.36 0 0 1 292.693333 0h609.28a79.36 79.36 0 0 1 79.36 79.36v728.746667a79.36 79.36 0 0 1-79.36 79.36z"/><path d="M213.333333 477.866667h247.466667a75.946667 75.946667 0 0 0 136.533333 0H640a34.133333 34.133333 0 0 0 0-68.266667h-42.666667a75.946667 75.946667 0 0 0-136.533333 0H213.333333a34.133333 34.133333 0 0 0 0 68.266667zM640 674.133333H392.533333a75.946667 75.946667 0 0 0-136.533333 0H213.333333a34.133333 34.133333 0 1 0 0 68.266667h42.666667a75.946667 75.946667 0 0 0 136.533333 0H640a34.133333 34.133333 0 0 0 0-68.266667z"/></svg>
        <span class="t">配置对比</span>
        <Icon icon="mdi:chevron-right" class="sb-arr" />
      </div>
      <div class="sb-sub" :class="{ open: nav.compare }">
        <div class="sb-i" :class="{ on: currentPage === 'hw-p' }" tabindex="0" @click="onPage('hw-p')" @keydown.enter="onPage('hw-p')" @keydown.space.prevent="onPage('hw-p')">
          <span class="sb-cap hw"><img :src="huaweiLogo" class="hw-logo" alt="华为"></span>
          <span class="t">路由协议(对比)</span>
        </div>
        <div class="sb-i" :class="{ on: currentPage === 'hw-i' }" tabindex="0" @click="onPage('hw-i')" @keydown.enter="onPage('hw-i')" @keydown.space.prevent="onPage('hw-i')">
          <span class="sb-cap hw"><img :src="huaweiLogo" class="hw-logo" alt="华为"></span>
          <span class="t">接口信息(对比)</span>
        </div>
        <div class="sb-i" :class="{ on: currentPage === 'srv6-te-multi' }" tabindex="0" @click="onPage('srv6-te-multi')" @keydown.enter="onPage('srv6-te-multi')" @keydown.space.prevent="onPage('srv6-te-multi')">
          <span class="sb-cap hw"><img :src="huaweiLogo" class="hw-logo" alt="华为"></span>
          <span class="t">SRv6 TE Policy</span>
        </div>
        <div class="sb-i h3c-item" :class="{ on: currentPage === 'h3c-p' }" tabindex="0" @click="onPage('h3c-p')" @keydown.enter="onPage('h3c-p')" @keydown.space.prevent="onPage('h3c-p')">
          <span class="sb-cap h3c"><svg viewBox="0 0 22 14" width="17" height="13"><text x="11" y="11" font-size="10" font-weight="700" text-anchor="middle" fill="#E60012" font-family="Arial,Helvetica,sans-serif">H3C</text></svg></span>
          <span class="t">路由协议(对比)</span>
        </div>
        <div class="sb-i" :class="{ on: currentPage === 'text-diff' }" tabindex="0" @click="onPage('text-diff')" @keydown.enter="onPage('text-diff')" @keydown.space.prevent="onPage('text-diff')">
          <span class="sb-cap tddiff"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#4a9eff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h7"/><path d="M3 12h4"/><path d="M3 18h7"/><path d="M14 6h7"/><path d="M14 12h4"/><path d="M14 18h7"/></svg></span>
          <span class="t">文本逐行</span>
        </div>
        <div class="sb-i" :class="{ on: currentPage === 'cutover-check' }" tabindex="0" @click="onPage('cutover-check')" @keydown.enter="onPage('cutover-check')" @keydown.space.prevent="onPage('cutover-check')"><span class="sb-cap tddiff"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#4a9eff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 13h6M9 17h4"/></svg></span><span class="t">割接迁移核查</span></div>
      </div>

      <div class="sb-i" :class="{ open: nav.device }" tabindex="0" @click="onToggleNav('device')" @keydown.enter="onToggleNav('device')" @keydown.space.prevent="onToggleNav('device')">
        <Icon icon="mdi:file-cog-outline" class="sb-navico" />
        <span class="t">配置解析</span>
        <Icon icon="mdi:chevron-right" class="sb-arr" />
      </div>
      <div class="sb-sub" :class="{ open: nav.device }">
        <div class="sb-i" :class="{ on: currentPage === 'device-huawei' }" tabindex="0" @click="onPage('device-huawei')" @keydown.enter="onPage('device-huawei')" @keydown.space.prevent="onPage('device-huawei')"><span class="sb-cap hw"><img :src="huaweiLogo" class="hw-logo" alt="华为"></span><span class="t">路由协议(解析)</span></div>
        <div class="sb-i" :class="{ on: currentPage === 'device-huawei-ar' }" tabindex="0" @click="onPage('device-huawei-ar')" @keydown.enter="onPage('device-huawei-ar')" @keydown.space.prevent="onPage('device-huawei-ar')"><span class="sb-cap hw"><img :src="huaweiLogo" class="hw-logo" alt="华为"></span><span class="t">接口信息(解析)</span></div>
        <div class="sb-i h3c-item" :class="{ on: currentPage === 'device-h3c' }" tabindex="0" @click="onPage('device-h3c')" @keydown.enter="onPage('device-h3c')" @keydown.space.prevent="onPage('device-h3c')"><span class="sb-cap h3c"><svg viewBox="0 0 22 14" width="17" height="13"><text x="11" y="11" font-size="10" font-weight="700" text-anchor="middle" fill="#E60012" font-family="Arial,Helvetica,sans-serif">H3C</text></svg></span><span class="t">接口信息(解析)</span></div>
        <div class="sb-i" :class="{ on: currentPage === 'device-global' }" tabindex="0" @click="onPage('device-global')" @keydown.enter="onPage('device-global')" @keydown.space.prevent="onPage('device-global')"><Icon icon="mdi:file-cog-outline" class="sb-navico" /><span class="t">全局配置(解析)</span></div>
      </div>

      <div class="sb-i" :class="{ on: currentPage === 'settings' }" tabindex="0" @click="onPage('settings')" @keydown.enter="onPage('settings')" @keydown.space.prevent="onPage('settings')">
        <Icon icon="mdi:cog-outline" class="sb-navico" />
        <span class="t">系统设置</span>
      </div>
    </nav>

  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import huaweiLogo from '../assets/huawei-logo.svg'
import netIcon from '../assets/net-icon.svg'
import { PAGE_PATHS } from '../router/pageMap.js'

const props = defineProps({
  nav: { type: Object, required: true },
  sbCollapsed: { type: Boolean, default: false }
})

const emit = defineEmits([
  'toggle:nav'
])

const router = useRouter()
const route = useRoute()
const currentPage = computed(() => route.meta.pageKey || 'home')
const onPage = (p) => {
  router.push(PAGE_PATHS[p])
}

const onToggleNav = (key) => {
  emit('toggle:nav', key)
}
</script>

<style scoped>
.sb { width:200px; min-width:200px; background:var(--sidebar); display:flex; flex-direction:column; border-right:1px solid var(--border); transition:width .25s ease,min-width .25s ease; overflow:hidden; z-index:10 }
.sb.collapsed { width:60px; min-width:60px }
.sb.collapsed:hover { width:200px; min-width:200px }
.sb.collapsed:not(:hover) .t,
.sb.collapsed:not(:hover) .sb-arr,
.sb.collapsed:not(:hover) .sb-brand-name {
  opacity: 0; visibility: hidden; transform: translateX(-10px); width: 0; flex:0 0 0;
  transition: opacity .25s, visibility .25s, transform .25s, width .25s;
}
.sb .t, .sb .sb-arr, .sb .sb-brand-name { transition: opacity .25s, visibility .25s, transform .25s, width .25s }
.sb.collapsed:not(:hover) > .sb-nav > .sb-i { justify-content:center; gap:0; padding: 0; margin-right: 0; border-left: none }
.sb.collapsed:not(:hover) .sb-nav { padding:6px 0 }
.sb.collapsed:not(:hover) .sb-sub { display:none }
.sb.collapsed:not(:hover) .sb-i svg { opacity:1 }
.sb.collapsed:not(:hover) .sb-brand { padding:0; justify-content:center; border-bottom:none }
.sb.collapsed:not(:hover) .sb-logo { margin:0 }
.sb.collapsed:not(:hover) .sb-logo-img { width:22px; height:22px; margin:0 }
.sb-brand { height:48px; display:flex; align-items:center; gap:12px; padding:0 18px; flex-shrink:0; border-bottom:1px solid var(--border) }
.sb-logo { width:28px; height:28px; display:grid; place-items:center; flex-shrink:0; transition:all .15s }
.sb-logo-img { width:26px; height:26px; display:block }
.sb-brand-name { font-size:15px; font-weight:700; color:var(--t1); letter-spacing:.3px; white-space:nowrap; line-height:1.2 }
.sb-nav { flex:1; padding:2px 0; overflow-y:auto }
.sb-i { display:flex; align-items:center; gap:12px; height:36px; padding:0 20px; cursor:pointer; font-size:14px; font-weight:400; color:var(--t2); transition:all .15s; border-left:3px solid transparent; white-space:nowrap; border-radius:0 6px 6px 0; margin-right:6px }
.sb-i:hover { color:var(--t1); background:var(--sidebar-h) }
.sb-i:focus-visible { outline:2px solid var(--blue); outline-offset:-2px; color:var(--t1); background:var(--sidebar-h) }
.sb-i:focus:not(:focus-visible) { outline:none }
.sb-i.on { color:var(--t1); background:var(--sidebar-a) }
.sb-i.on svg { opacity:1; color:var(--blue) }
.sb-i svg { width:18px; height:18px; flex-shrink:0; opacity:.5; transition:opacity .15s }
.sb-i:hover svg { opacity:.8 }
.sb-i .t { flex:1 }
.sb-navico { font-size:18px; flex-shrink:0; opacity:1; color:var(--t2) }
.sb-i:hover .sb-navico { opacity:1 }
.sb-sub { overflow:hidden; max-height:0; opacity:0; display:none }
.sb-sub.open { display:block; max-height:1000px; opacity:1; visibility: visible }
.sb-sub>.sb-i { font-size:13px; font-weight:400; color:var(--t3); padding-left:50px; margin-right:0; border-radius:0; border-left:2px solid transparent }
.sb-sub>.sb-i:hover { color:var(--t1); background:var(--sidebar-h) }
.sb-sub>.sb-i.on { color:var(--t1); background:var(--sidebar-a); font-weight:400 }
.sb-sub>.sb-i.h3c-item { color:var(--t1) }
.sb-sub>.sb-i.h3c-item.on { background:var(--sidebar-a); border-left-color:var(--blue); font-weight:400 }
.sb-arr { font-size:14px; color:var(--t4); transition:transform .2s,color .15s; flex-shrink:0 }
.sb-i.open .sb-arr { transform:rotate(90deg) }
.sb-i.open > .sb-arr { color:var(--blue) }
.sb-sub>.sb-i { gap:9px }
.sb-cap { width:20px; height:20px; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden }
.sb-cap.hw { background:#fff }
.sb-cap.h3c { background:#fff }
.sb-cap.tddiff { background:transparent }
.hw-logo { width:100%; height:100%; object-fit:contain; display:block }
.sb-sub>.sb-i.on .sb-cap { box-shadow:0 0 0 2px var(--blue) }
</style>
