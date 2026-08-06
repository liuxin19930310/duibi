import { createApp } from 'vue'
import { Icon, addCollection } from '@iconify/vue'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/main.css'
import router from './router'
import { pinia } from './store'
import App from './App.vue'
import mdiOffline from './iconify/mdi-offline.json'
import { initDB } from './utils/db.js'

// 把用到的 MDI 图标预注册到本地，离线环境也能渲染（不再请求 Iconify 外网 API）
addCollection(mdiOffline)

// 先灌入本地存储缓存（IndexedDB + localStorage 兜底），保证基线/草稿/快照在首屏可读；
// 用 Promise 链而非顶层 await，兼容 es2020 构建目标
initDB().then(() => {
  createApp(App)
    .use(pinia)
    .use(router)
    .component('Icon', Icon)
    .mount('#app')
})
