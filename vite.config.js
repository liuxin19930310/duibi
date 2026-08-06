import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  worker: {
    // 解析 Worker 采用 ES 模块格式：允许 Worker 内部代码分割（parse.worker 与主包共享依赖 chunk）
    format: 'es',
  },
  build: {
    // 依赖分包交由 Rollup 自动处理：路由已改为懒加载，各页面及共享依赖会按需拆块；
    // 手动整包分包会把大量 Element Plus 组件强行聚到一个大 chunk，反而拖慢首屏。
    // 提示阈值调高到 700KB，避免对按需加载的导出大块（xlsx）误报警。
    chunkSizeWarningLimit: 700,
  },
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
