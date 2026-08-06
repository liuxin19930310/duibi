// 鉴权状态（从 naive-ui-pro 的 userStore 思路简化而来，替代原 sessionStorage 标志位）。
// 内部用 localStorage 持久化登录态，刷新后保持。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'netops_auth'
const TOKEN_KEY = 'netops_token'

function loadAuth() {
  try {
    // 必须同时有登录标记和后端 token，否则视为未登录（兼容旧数据：强制重新登录一次）
    return !!localStorage.getItem(STORAGE_KEY) && !!localStorage.getItem(TOKEN_KEY)
  } catch (e) {
    return false
  }
}

export const useAuthStore = defineStore('auth', () => {
  const isAuthed = ref(loadAuth())
  const user = ref('admin')

  function login(name = 'admin', token = '') {
    isAuthed.value = true
    user.value = name
    try {
      localStorage.setItem(STORAGE_KEY, '1')
      if (token) localStorage.setItem(TOKEN_KEY, token)
    } catch (e) { /* ignore */ }
  }

  function logout() {
    isAuthed.value = false
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(TOKEN_KEY)
    } catch (e) { /* ignore */ }
  }

  return {
    isAuthed,
    user,
    login,
    logout,
  }
})

// 便于非组件模块读取（如路由守卫），但优先在组件内使用 useAuthStore()。
export const isAuthed = computed(() => loadAuth())
