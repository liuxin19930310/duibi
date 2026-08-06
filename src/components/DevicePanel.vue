<template>
  <div class="dev-info">
    <div v-if="!info" class="di-empty">
      <div class="drop-zone" :class="{ loading: importing }" @click="!importing && $emit('upload')" @dragover.prevent @drop.prevent="!importing && $emit('drop', $event)">
        <div v-if="!importing">
          <div class="drop-icon">
            <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6v20M12 18l8 8 8-8" />
              <path d="M6 26v6a2 2 0 002 2h24a2 2 0 002-2v-6" />
            </svg>
          </div>
          <div class="drop-title">{{ title }}</div>
          <span class="drop-btn">选择文件导入</span>
        </div>
        <div v-else class="loading-spinner">
          <svg class="spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10" opacity=".2"/>
            <path d="M12 2a10 10 0 019.95 9" />
          </svg>
          <div class="drop-title">正在解析配置...</div>
        </div>
      </div>
    </div>
    <div v-else class="dev-result">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '点击上传或拖拽配置文件到此处' },
  info: { default: null },
  importing: { type: Boolean, default: false }
})

defineEmits(['upload', 'drop'])
</script>

<style scoped>
.dev-info { }
.di-empty { text-align:center; padding:60px 20px; color:var(--t3); min-height:400px; display:flex; align-items:center; justify-content:center }
.drop-zone {
  max-width: 420px;
  margin: 48px auto;
  padding: 40px 32px;
  border: 2px dashed var(--border);
  border-radius: 16px;
  cursor: pointer;
  transition: all .3s;
  background: var(--bg2);
  text-align: center;
}
.drop-zone:hover {
  border-color: var(--blue);
  background: var(--blue-l);
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(74,158,255,.12);
}
.drop-zone .drop-icon {
  color: var(--t4);
  margin-bottom: 12px;
  transition: color .3s;
}
.drop-zone:hover .drop-icon {
  color: var(--blue);
}
.drop-zone .drop-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--t2);
  margin-bottom: 16px;
  transition: color .3s;
}
.drop-zone:hover .drop-title {
  color: var(--t1);
}
.drop-zone .drop-btn {
  display: inline-block;
  padding: 7px 22px;
  border-radius: 8px;
  background: var(--blue);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  transition: all .2s;
  cursor: pointer;
}
.drop-zone:hover .drop-btn {
  opacity: .9;
  box-shadow: 0 4px 12px rgba(74,158,255,.3);
}
.drop-zone.loading {
  cursor: default;
  border-color: var(--blue);
  background: var(--blue-l);
}
.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.loading-spinner .spin-icon {
  animation: rot 1s linear infinite;
  width: 32px;
  height: 32px;
  color: var(--blue);
}

@keyframes rot {
  from { transform: rotate(0deg) }
  to { transform: rotate(360deg) }
}

.dev-result { }
</style>
