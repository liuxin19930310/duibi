<template>
  <Login v-if="!authed" @login="authed = true" />
  <Dashboard v-else @logout="logout" />
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import Login from './components/Login.vue'
import Dashboard from './components/Dashboard.vue'
import { useAuthStore } from './store/auth-store'
import { logoutApi } from './utils/api.js'

const authStore = useAuthStore()
const authed = computed(() => authStore.isAuthed)

const logout = async () => {
  try { await logoutApi() } catch (e) { /* ignore */ }
  authStore.logout()
}

// token 失效（401）时回到登录页
const onUnauthorized = () => { authStore.logout() }
onMounted(() => window.addEventListener('netops:unauthorized', onUnauthorized))
onUnmounted(() => window.removeEventListener('netops:unauthorized', onUnauthorized))
</script>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
</style>
