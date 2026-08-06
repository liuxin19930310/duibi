<template>
  <div class="tabs-bar">
    <button class="tabs-collapse" :class="{ collapsed: sbCollapsed }" @click="emit('toggle-collapse')" title="收起/展开侧边栏">
      <svg viewBox="0 0 1024 1024" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M561.92 192a47.36 47.36 0 0 1 0 64l-256 256 256 256a47.36 47.36 0 0 1-64 64L206.08 545.92A50.56 50.56 0 0 1 192 512a47.36 47.36 0 0 1 14.08-33.28L494.72 192a47.36 47.36 0 0 1 67.2 0z" fill="currentColor"/><path d="M817.92 192a47.36 47.36 0 0 1 0 64l-256 256 256 256a47.36 47.36 0 0 1-64 64L462.08 545.92A50.56 50.56 0 0 1 448 512a47.36 47.36 0 0 1 14.08-33.28L750.72 192a47.36 47.36 0 0 1 67.2 0z" fill="currentColor"/></svg>
    </button>
    <div class="tabs-scroll">
      <template v-for="(tab, index) in tabs.visitedViews" :key="tab.fullPath">
        <div
          class="tab-item"
          :class="{ active: tab.fullPath === route.fullPath }"
          @click="onClick(tab)"
        >
          <Icon v-if="tab.name === 'home'" class="tab-ico" icon="mdi:view-dashboard-outline" />
          <Icon v-else class="tab-ico" icon="mdi:file-document-outline" />
          <span class="tab-text">{{ tab.title }}</span>
          <span v-if="!tab.affix" class="tab-close" @click.stop="onClose(tab)">
            <Icon icon="mdi:close" />
          </span>
        </div>
      </template>
    </div>

    <el-dropdown class="tabs-more" trigger="click" @command="onCommand">
      <span class="tabs-more-btn"><Icon icon="mdi:chevron-down" /></span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="others">关闭其他</el-dropdown-item>
          <el-dropdown-item command="all">关闭全部</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useTabsStore } from '../store/tabs-store'

const props = defineProps({
  sbCollapsed: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle-collapse'])

const route = useRoute()
const router = useRouter()
const tabs = useTabsStore()

function onClick(tab) {
  if (tab.fullPath !== route.fullPath) router.push(tab.fullPath)
}

// 关闭标签：从已访问列表移除，并释放对应 keep-alive 缓存名；若关的是当前页则跳到剩余最后一页
function onClose(tab) {
  const closedActive = tab.fullPath === route.fullPath
  tabs.removeVisitedView(tab)

  if (tab.componentName && router.cachedComponentNames) {
    router.cachedComponentNames.value = router.cachedComponentNames.value.filter(
      n => n !== tab.componentName
    )
  }

  if (closedActive) {
    const remaining = tabs.visitedViews
    const target = remaining[remaining.length - 1]
    router.push(target ? target.fullPath : '/home')
  }
}

function onCommand(cmd) {
  if (cmd === 'others') tabs.closeOthers(route)
  else if (cmd === 'all') {
    tabs.closeAll()
    router.push('/home')
  }
}
</script>

<style scoped>
.tabs-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 0 12px 0 16px;
  flex-shrink: 0;
}
.tabs-scroll {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.tabs-scroll::-webkit-scrollbar { height: 4px; }
.tabs-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--t2);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: all .15s;
}
.tab-item:hover { color: var(--t1); background: var(--sidebar-h); }
.tab-item.active {
  color: var(--blue);
  background: var(--blue-l);
  border-color: var(--blue-b);
}
.tab-ico { font-size: 13px; }
.tab-text { line-height: 1; }
.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  margin-left: 2px;
}
.tab-close iconify-icon { font-size: 11px; }
.tab-close:hover { background: var(--border); color: var(--t1); }
.tab-item.active .tab-close:hover { background: var(--blue-b); color: #fff; }

.tabs-collapse {
  display:inline-flex; align-items:center; justify-content:center;
  width:26px; height:26px; border-radius:6px; margin-right:4px;
  border:none; background:transparent; color:var(--t2); cursor:pointer;
  flex-shrink:0; transition:all .15s;
}
.tabs-collapse:hover { background:var(--sidebar-h); color:var(--t1); }
.tabs-collapse svg { width:16px; height:16px; transition:transform .2s; }
.tabs-collapse.collapsed svg { transform:rotate(180deg); }
.tabs-more { margin-left: 8px; flex-shrink: 0; }
.tabs-more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: var(--t2);
  cursor: pointer;
}
.tabs-more-btn:hover { background: var(--sidebar-h); color: var(--t1); }
</style>
