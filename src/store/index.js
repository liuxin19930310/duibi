// Pinia 实例（单例）。在 main.js 中 app.use(pinia) 注册。
// 后续可在此处用 pinia.use(preferencePlugin) 装配持久化插件。
import { createPinia } from 'pinia'

export const pinia = createPinia()
