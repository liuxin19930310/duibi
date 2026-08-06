// 统一的 HTTP 客户端（借鉴 naive-ui-pro 的 axios 封装结构，按 duibi 后端适配）。
// duibi 后端返回的是业务 JSON（如 {raw,text} / {sessionId,vendor}），并非统一的 {code,data,message}，
// 因此响应拦截只做 HTTP 错误归一化（抛出带可读 message 的 Error），不解包统一结构 —— 与原 fetch 行为一致。
import axios from 'axios'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 60000,
})

// 请求拦截：注入登录后颁发的 token
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('netops_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截：HTTP 非 2xx 时，抛出带可读 message 的 Error（与原 fetch 行为一致）。
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 401：token 失效/未登录，清掉本地 token 并通知布局层回到登录页
    if (error.response && error.response.status === 401) {
      try { localStorage.removeItem('netops_token') } catch (e) { /* ignore */ }
      try { window.dispatchEvent(new CustomEvent('netops:unauthorized')) } catch (e) { /* ignore */ }
    }
    const data = error.response && error.response.data
    const msg = (data && data.error) ? data.error : (error.message || '请求失败')
    const err = new Error(msg)
    err.code = error.response && error.response.status
    err.data = data
    return Promise.reject(err)
  }
)

export default request
export { request }
