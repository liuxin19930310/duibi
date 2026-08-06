<template>
  <header class="hdr">
    <div class="hdr-l">
      <span class="hdr-title">{{ pageTitle }}</span>
    </div>

    <div class="hdr-r">
      <!-- 一键导出全部（仅解析页有数据时显示，位于主题切换左侧） -->
      <button v-if="hasExportData" class="hdr-ico" @click="triggerExportAll" title="一键导出全部（导出当前页全部模块到一张表）" aria-label="一键导出全部">
        <svg viewBox="0 0 1024 1024" class="hdr-exp-ico" fill="currentColor"><path d="M540.444444 678.874074h-65.422222V362.192593h-0.948148l-84.385185 95.762963h-0.948148v-0.948149c-13.688415-8.489719-23.391763-22.676859-36.02963-32.237037-4.144356-3.135526-10.396444-6.207526-12.325926-11.377777 3.897837-3.034074 6.46637-7.386074 9.481482-11.377778 8.79123-11.641363 20.416474-21.296356 29.392592-33.185185 4.144356-5.489778 11.02317-9.682489 15.170371-15.170371 16.164978-21.389274 35.991704-39.28557 52.148148-60.681481 13.358459-17.6896 31.032889-32.331852 44.562963-50.251852 4.790044-6.343111 12.245333-10.60883 16.118518-18.014815h1.896297c8.984652 13.718756 23.392711 24.014696 33.185185 36.977778 26.682785 35.323259 59.618607 65.165274 86.281481 100.503704 10.003911 13.258904 23.006815 24.434726 33.185185 37.925926 3.861807 5.12 10.891378 8.633837 13.274074 15.17037-6.532741 2.327704-10.075022 9.426489-15.17037 13.274074-8.594015 6.490074-16.054044 13.425778-24.651852 19.911111-4.148148 3.128889-4.93037 7.252385-11.377778 8.533333-3.244563-9.1648-14.357807-15.405511-19.911111-22.755555-12.821807-16.971852-27.961837-31.383704-40.77037-48.355556-6.191407-8.205274-15.8976-14.260148-20.859259-23.703703h-0.948148v44.562963c-2.479407 4.015407-0.948148 15.003496-0.948149 20.859259v251.259259zM216.177778 522.42963h65.422222v219.97037h452.266667V522.42963h65.422222v286.34074H216.177778V522.42963z" fill="currentColor"/></svg>
      </button>
      <!-- 主题 -->
      <button class="hdr-ico" @click="emit('toggle-theme')" :title="isLight ? '切换深色' : '切换浅色'" :aria-label="isLight ? '切换深色主题' : '切换浅色主题'">
        <Icon v-if="!isLight" icon="mdi:weather-sunny" />
        <Icon v-else icon="mdi:weather-night" />
      </button>
      <!-- 导入配置（图标按钮，替换原语言占位） -->
            <button class="hdr-ico" @click="onImportConfig" title="导入配置（变更前/后）" aria-label="导入配置">
        <svg viewBox="0 0 1024 1024" class="hdr-imp-ico" fill="currentColor"><path d="M919.68 948.48H104.32a96.64 96.64 0 0 1-96.64-96V167.04a96.64 96.64 0 0 1 96.64-96H384a96 96 0 0 1 72.96 33.28l56.96 64a29.44 29.44 0 0 0 24.32 11.52l379.52-3.84a96.64 96.64 0 0 1 96.64 96v576a96.64 96.64 0 0 1-94.72 100.48zM104.32 135.04a32 32 0 0 0-32.64 32v685.44a32 32 0 0 0 32.64 32h815.36a32 32 0 0 0 32.64-32v-576a32.64 32.64 0 0 0-32.64-32l-378.88 3.84a98.56 98.56 0 0 1-73.6-35.84l-56.32-64A33.28 33.28 0 0 0 384 135.04z" fill="currentColor"/><path d="M501.76 819.84a69.12 69.12 0 0 1-48-19.2l-192-192A33.92 33.92 0 0 1 256 576a32 32 0 0 1 30.08-19.84h85.76l3.2-134.4a96 96 0 0 1 96-96h70.4A96 96 0 0 1 640 419.84V554.24h97.92A32 32 0 0 1 768 576a32.64 32.64 0 0 1-8.32 35.2l-213.76 192a64 64 0 0 1-44.16 16.64zM362.24 618.24L499.2 755.2l154.88-136.96H640a64 64 0 0 1-64-67.2v-128a32 32 0 0 0-32-32H471.04a32 32 0 0 0-32 32v128a64 64 0 0 1-67.2 67.2z" fill="currentColor"/></svg>
      </button>
      <!-- 配置快照快捷入口 -->
      <button class="hdr-ico" @click="goSnapshots" title="配置快照" aria-label="配置快照">
        <Icon icon="mdi:camera-outline" />
      </button>
      <!-- 在线设备快捷入口 -->
      <button class="hdr-ico" @click="goLiveDevice" title="在线设备" aria-label="在线设备">
        <svg viewBox="0 0 1024 1024" class="hdr-dev-ico" fill="currentColor"><path d="M512.021333 714.837333l-109.461333 140.138667h218.922667l-109.461334-140.138667m0-65.429333a27.093333 27.093333 0 0 1 19.541334 8.298667l160.192 192a27.178667 27.178667 0 0 1-19.541334 46.08H351.829333a27.178667 27.178667 0 0 1-19.541333-46.08l160.192-192a27.093333 27.093333 0 0 1 19.541333-8.298667z" fill="currentColor"/><path d="M385.088 810.944H202.666667a106.794667 106.794667 0 0 1-106.666667-106.666667v-469.333333a106.794667 106.794667 0 0 1 106.666667-106.666667h618.666666a106.794667 106.794667 0 0 1 106.666667 106.666667v469.333333a106.794667 106.794667 0 0 1-106.666667 106.666667h-190.272a42.176 42.176 0 0 0-11.328-23.317333l-38.805333-40.661334H821.333333a42.666667 42.666667 0 0 0 42.666667-42.666666v-469.333334a42.666667 42.666667 0 0 0-42.666667-42.666666h-618.666666a42.666667 42.666667 0 0 0-42.666667 42.666666v469.333334a42.666667 42.666667 0 0 0 42.666667 42.666666h232.533333l-38.805333 40.661334a42.218667 42.218667 0 0 0-11.306667 23.317333z" fill="currentColor"/><path d="M453.824 563.498667l-119.530667-119.530667a31.082667 31.082667 0 0 1 0-43.946667 31.061333 31.061333 0 0 1 43.946667 0l97.557333 97.557334 188.074667-188.074667a31.04 31.04 0 0 1 43.946667 0 31.082667 31.082667 0 0 1 0 43.946667l-210.048 210.048a31.082667 31.082667 0 0 1-43.946667 0z" fill="currentColor"/></svg>
      </button>
      <!-- 割接汇总快捷入口（替代原全屏按钮） -->
      <button class="hdr-ico" @click="goCutoverSummary" title="割接汇总" aria-label="割接汇总">
        <svg viewBox="0 0 1024 1024" class="hdr-sum-ico" fill="currentColor"><path d="M516.928 174.528l365.952 173.76-365.952 182.4-387.52-182.4 387.52-173.76zM520 128c-3.072 0-15.36 3.008-18.496 3.008L83.264 316.416c-12.288 2.88-18.496 17.28-18.496 28.928a31.616 31.616 0 0 0 18.496 28.928l415.232 196.992c3.008 2.88 12.288 2.88 15.36 2.88 6.144 0 12.288-2.88 18.432-2.88l399.808-196.992a31.616 31.616 0 0 0 18.496-28.928 31.616 31.616 0 0 0-18.496-28.928C661.44 190.72 524.16 128 520 128z m-24.576 631.424L80.128 548.032c-12.288-5.76-15.36-20.224-9.152-31.808 6.08-11.584 18.432-14.528 33.792-11.584l418.304 211.392h6.144l390.656-202.688a48.448 48.448 0 0 1 18.432-2.88c6.144 2.88 12.288 5.76 15.36 11.52 3.072 5.76 3.072 11.584 3.072 17.408-3.072 5.76-6.144 11.584-12.288 14.464l-393.664 205.568c-9.216 2.944-18.496 5.824-27.712 5.824-9.216 0-18.496-2.88-27.648-5.76z m1.792 171.328L80.128 721.92c-6.08-2.944-12.224-8.704-12.224-14.528a17.536 17.536 0 0 1 0-17.344c6.144-11.648 21.44-14.464 33.792-8.704l418.304 214.336h6.144l390.592-202.752c6.208-2.88 15.424-2.88 18.496-2.88 6.144 2.88 12.288 5.76 15.36 11.52 3.072 2.944 3.072 11.648 3.072 17.408-3.072 5.76-6.144 11.584-12.288 14.528L554.88 930.56a64 64 0 0 1-57.728 0.192z" fill="currentColor"/></svg>
      </button>
      <!-- 用户 -->
      <el-dropdown trigger="click" @command="onUser">
        <div class="hdr-user" title="账户" aria-label="账户" role="button">
          <span class="avatar"><svg viewBox="0 0 1024 1024" class="avatar-ico" fill="currentColor"><path d="M512.6 191.3c-101.2 0-183.3 82.1-183.3 183.3s82.1 183.3 183.3 183.3 183.3-82.1 183.3-183.3-82.1-183.3-183.3-183.3z m0 315.4c-72.9 0-132.1-59.1-132.1-132.1s59.1-132.1 132.1-132.1c72.9 0 132.1 59.1 132.1 132.1s-59.2 132.1-132.1 132.1z"/><path d="M252.2 819.7C254.3 700 369.4 603.5 511 603.5S767.6 700 769.7 819.7h52.7c0-149.6-139.3-270.8-311.1-270.8s-311 121.2-311 270.8h51.9z"/></svg></span>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useExportAll } from '../composables/useExportAll.js'

const props = defineProps({
  pageTitle: { type: String, default: '首页' },
  sbCollapsed: { type: Boolean, default: false },
  isLight: { type: Boolean, default: true },
  userName: { type: String, default: 'admin' },
})
const emit = defineEmits(['toggle-theme', 'logout', 'import-config'])
const router = useRouter()
const { hasExportData, triggerExportAll } = useExportAll()

const avatarText = computed(() => (props.userName || 'A').slice(0, 1).toUpperCase())

function goCutoverSummary() {
  router.push('/cutover-summary')
}
function goLiveDevice() {
  router.push('/live-device')
}
function goSnapshots() {
  router.push('/snapshots')
}

function onUser(cmd) {
  if (cmd === 'logout') emit('logout')
}

// 导入配置：仅转发给布局层（Dashboard）处理文件选择
function onImportConfig() {
  emit('import-config')
}
</script>

<style scoped>
.hdr { height:48px; background:var(--bg2); border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; padding:0 16px 0 24px; flex-shrink:0 }
.hdr-l { min-width:0; display:flex; align-items:center }
.hdr-title { font-size:14px; font-weight:600; color:var(--t1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.hdr-r { display:flex; align-items:center; gap:6px }

/* 右侧图标工具栏（图二风格） */
.hdr-ico {
  display:inline-flex; align-items:center; justify-content:center;
  width:26px; height:26px; border-radius:6px;
  border:none; background:transparent; color:var(--t2); cursor:pointer;
  font-size:15px; transition:all .15s;
}
.hdr-ico:hover { color:var(--blue); background:var(--sidebar-h); }
.hdr-imp-ico { width:15px; height:15px; display:block; }
.hdr-exp-ico { width:16px; height:16px; display:block; }
.hdr-sum-ico { width:16px; height:16px; display:block; }
.hdr-dev-ico { width:16px; height:16px; display:block; }

.hdr-user {
  display:inline-flex; align-items:center; justify-content:center;
  height:26px; padding:0 4px; border-radius:6px;
  cursor:pointer; color:var(--t2); transition:all .15s;
}
.hdr-user:hover { background:var(--sidebar-h); color:var(--t1); }
.avatar {
  width:22px; height:22px; border-radius:50%;
  background:var(--blue); color:#fff;
  display:inline-flex; align-items:center; justify-content:center;
  flex-shrink:0;
}
.avatar-ico { width:14px; height:14px; display:block; }
</style>
