<template>
  <div class="login-page">
    <canvas ref="particleCanvas" class="particle-canvas"></canvas>

    <div class="page-container">
      <div class="login-container">
        <!-- Brand -->
        <div class="brand">
          <div class="brand-logo">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="2" />
              <circle cx="16" cy="16" r="6" fill="currentColor" />
            </svg>
          </div>
          <h3>Network</h3>
        </div>

        <!-- Heading -->
        <h1>欢迎回来</h1>
        <p class="subtitle">登录您的帐户以继续</p>

        <!-- Form -->
        <form @submit.prevent="doLogin" class="login-form">
          <!-- Username -->
          <div class="form-group">
            <label for="username">用户名</label>
            <input
              id="username"
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              class="form-input"
              autocomplete="username"
              @focus="isTyping = true"
              @blur="isTyping = false"
            />
          </div>

          <!-- Password -->
          <div class="form-group">
            <div class="password-header">
              <label for="password">密码</label>
              <a href="#" class="forgot-link" @click.prevent>忘记密码?</a>
            </div>
            <div class="password-container">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="输入您的密码"
                autocomplete="current-password"
                @focus="isTyping = true"
                @blur="isTyping = false"
              />
              <button type="button" @click="showPassword = !showPassword" class="toggle-password" :class="{ show: showPassword }" aria-label="Toggle password">
                <svg class="eye-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5C8.24 5 5.01 7.21 3 10.7C5.01 14.19 8.24 16.4 12 16.4C15.76 16.4 18.99 14.19 21 10.7C18.99 7.21 15.76 5 12 5ZM12 14.7C9.97 14.7 8.33 12.89 8.33 10.7C8.33 8.51 9.97 6.7 12 6.7C14.03 6.7 15.67 8.51 15.67 10.7C15.67 12.89 14.03 14.7 12 14.7ZM12 8.2C10.73 8.2 9.7 9.35 9.7 10.7C9.7 12.05 10.73 13.2 12 13.2C13.27 13.2 14.3 12.05 14.3 10.7C14.3 9.35 13.27 8.2 12 8.2Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Remember me -->
          <div class="form-options">
            <label class="checkbox">
              <input type="checkbox" v-model="remember" />
              <span class="checkbox-mark"></span>
              <span>记住登录</span>
            </label>
          </div>

          <!-- Error -->
          <div v-if="error" class="error-alert">{{ error }}</div>

          <!-- Submit -->
          <button type="submit" class="login-button" :disabled="logging" :class="{ loading: logging }">
            <span v-if="logging" class="login-spinner" aria-hidden="true"></span>
            <span>{{ logging ? '正在登录系统...' : '登 录' }}</span>
          </button>

          <!-- Footer -->


        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '../store/auth-store'
import { loginApi } from '../utils/api.js'

const emit = defineEmits(['login'])
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const remember = ref(false)
const showPassword = ref(false)
const isTyping = ref(false)
const logging = ref(false)
const loginFailed = ref(false)
const loginSuccess = ref(false)
const error = ref('')

// Canvas ref
const particleCanvas = ref(null)
let animationId = null
let particles = []
let mouseX = 0
let mouseY = 0
const mouseRadius = 100
const particleCount = 70
const colors = ['#4D6DE3', '#6D56E3', '#D345E2']
const maxDistance = 170
const minDistance = 100

onMounted(() => {
  const saved = localStorage.getItem('netops_remember')
  if (saved) {
    try {
      const data = JSON.parse(saved)
      username.value = data.u || ''
      // 只记住用户名，不再明文保存密码
      remember.value = true
    } catch (_) { /* ignore */ }
  }
  initParticles()
})

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', setupCanvas)
  window.removeEventListener('mousemove', onMouseMove)
})

// ── Particle Canvas ──
function setupCanvas() {
  const canvas = particleCanvas.value
  if (!canvas) return
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  createParticles()
}

function createParticles() {
  const canvas = particleCanvas.value
  if (!canvas) return
  particles = []
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 2 + 1,
      color: colors[Math.floor(Math.random() * colors.length)]
    })
  }
}

function draw() {
  const canvas = particleCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height

  ctx.clearRect(0, 0, w, h)

  for (let i = 0; i < particles.length; i++) {
    const p1 = particles[i]

    const dx = mouseX - p1.x
    const dy = mouseY - p1.y
    const mouseDist = Math.sqrt(dx * dx + dy * dy)
    if (mouseDist < mouseRadius) {
      const force = (mouseRadius - mouseDist) / mouseRadius
      const angle = Math.atan2(dy, dx)
      p1.vx -= force * Math.cos(angle) * 0.6
      p1.vy -= force * Math.sin(angle) * 0.6
    }

    p1.x += p1.vx
    p1.y += p1.vy

    if (p1.x < 0 || p1.x > w) p1.vx = -p1.vx
    if (p1.y < 0 || p1.y > h) p1.vy = -p1.vy

    for (let j = i + 1; j < particles.length; j++) {
      const p2 = particles[j]
      const dx2 = p1.x - p2.x
      const dy2 = p1.y - p2.y
      const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2)
      if (dist < maxDistance) {
        const opacity = dist < minDistance ? 0.8 : (maxDistance - dist) / (maxDistance - minDistance) * 0.5
        ctx.beginPath()
        ctx.strokeStyle = `rgba(125, 125, 245, ${opacity})`
        ctx.lineWidth = 1
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
    }

    ctx.beginPath()
    ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2)
    ctx.fillStyle = p1.color
    ctx.fill()
  }

  animationId = requestAnimationFrame(draw)
}

function onMouseMove(e) {
  mouseX = e.clientX
  mouseY = e.clientY
}

function initParticles() {
  setupCanvas()
  window.addEventListener('resize', setupCanvas)
  window.addEventListener('mousemove', onMouseMove)
  draw()
}

// ── Auth Logic ──
const doLogin = async () => {
  error.value = ''
  if (!username.value.trim() || !password.value.trim()) {
    error.value = '请输入用户名和密码'
    loginFailed.value = true
    setTimeout(() => { loginFailed.value = false }, 3000)
    return
  }

  logging.value = true
  try {
    // 后端鉴权：校验账号密码并签发会话 token
    const data = await loginApi(username.value.trim(), password.value)
    if (remember.value) {
      localStorage.setItem('netops_remember', JSON.stringify({ u: username.value.trim() }))
    } else {
      localStorage.removeItem('netops_remember')
    }
    authStore.login(username.value.trim(), data.token)
    loginSuccess.value = true
    emit('login')
  } catch (err) {
    error.value = (err && err.message) ? err.message : '登录失败'
    loginFailed.value = true
    setTimeout(() => { loginFailed.value = false }, 3000)
  } finally {
    logging.value = false
  }
}
</script>

<style scoped>
.login-page {
  --primary: #4D6DE3;
  --primary-dark: #3A5BCE;
  --primary-light: #6E8AFF;
  --secondary: #6D56E3;
  --accent: #D345E2;
  --text-dark: #333333;
  --text-medium: #666666;
  --text-light: #909090;
  --bg-color: #F8F9FE;
  --white: #FFFFFF;
  --shadow-color: rgba(77, 109, 227, 0.15);
  --border-color: #E1E5F5;

  
  min-height: 100vh;
  max-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  background-color: var(--bg-color);
  color: var(--text-dark);
}

/* Particle Canvas Background */
.particle-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  background: linear-gradient(135deg, #F0F4FF 0%, #EEE9FF 100%);
}

/* Page Container */
.page-container {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  position: relative;
  z-index: 1;
}

/* Login Card */
.login-container {
  background-color: var(--white);
  border-radius: 24px;
  box-shadow: 0 10px 40px var(--shadow-color);
  width: 100%;
  max-width: 420px;
  padding: 2.5rem;
  position: relative;
  animation: fade-in-up 0.8s ease;
  overflow: hidden;
}

@keyframes fade-in-up {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

.login-container::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 5px;
  background: linear-gradient(90deg, var(--primary) 0%, var(--secondary) 50%, var(--accent) 100%);
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
}

.brand-logo {
  width: 36px;
  height: 36px;
  margin-right: 0.75rem;
  color: var(--primary);
}

.brand h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--primary-dark);
  margin: 0;
}

/* Headings */
h1 {
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-dark);
}

.subtitle {
  font-size: 0.95rem;
  color: var(--text-light);
  margin-bottom: 2rem;
}

/* ── Form ── */
.login-form {
  margin-top: 1rem;
}

.form-group {
  margin-bottom: 1.25rem;
}

.password-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-medium);
  margin-bottom: 0.5rem;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 0.95rem;
  background-color: #f5f7fd;
  border: 1px solid transparent;
  border-radius: 8px;
  transition: all 0.3s ease;
  outline: none;
  
  box-sizing: border-box;
}

.form-input::placeholder { color: var(--text-light); }

.form-input:focus {
  border-color: var(--primary);
  background-color: var(--white);
  box-shadow: 0 0 0 3px rgba(77, 109, 227, 0.1);
}

.password-container {
  display: flex;
  align-items: center;
  background-color: #f5f7fd;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.3s ease;
  overflow: hidden;
}

.password-container:focus-within {
  border-color: var(--primary);
  background-color: var(--white);
  box-shadow: 0 0 0 3px rgba(77, 109, 227, 0.1);
}

.password-container input {
  background: transparent;
  border: none;
  padding: 12px 0 12px 16px;
  flex: 1;
  font-size: 0.95rem;
  outline: none;
  
}

.password-container input::placeholder { color: var(--text-light); }

.toggle-password {
  background: transparent;
  border: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-light);
  flex-shrink: 0;
  transition: color 0.3s;
}

.toggle-password.show { color: var(--primary); }

.eye-icon {
  width: 20px;
  height: 20px;
}

.forgot-link {
  color: var(--primary);
  font-size: 0.75rem;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.3s;
}

.forgot-link:hover {
  color: var(--primary-dark);
  text-decoration: underline;
}

/* ── Checkbox ── */
.form-options {
  margin-bottom: 1.75rem;
}

.checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox input {
  position: absolute;
  opacity: 0;
  height: 0;
  width: 0;
}

.checkbox-mark {
  position: relative;
  height: 18px;
  width: 18px;
  background-color: #f5f7fd;
  border-radius: 4px;
  margin-right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  flex-shrink: 0;
}

.checkbox input:checked ~ .checkbox-mark {
  background-color: var(--primary);
}

.checkbox-mark::after {
  content: "";
  position: absolute;
  display: none;
  width: 5px;
  height: 10px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  top: 2px;
}

.checkbox input:checked ~ .checkbox-mark::after {
  display: block;
}

.checkbox span:last-child {
  font-size: 0.875rem;
  color: var(--text-medium);
}

/* ── Error ── */
.error-alert {
  padding: 0.75rem;
  font-size: 0.875rem;
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-radius: 8px;
  margin-bottom: 1rem;
}

/* ── Login Button ── */
.login-button {
  width: 100%;
  padding: 14px;
  background: linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%);
  color: var(--white);
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
  
}

.login-button:hover:not(:disabled) {
  box-shadow: 0 4px 15px rgba(77, 109, 227, 0.4);
}

.login-button:active:not(:disabled) {
  transform: translateY(1px);
}

.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-button.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.login-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.login-button::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.2) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  transition: left 0.7s;
}

.login-button:hover:not(:disabled)::before {
  left: 100%;
}

/* ── Footer ── */
.footer-text {
  margin-top: 1.5rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-light);
}

/* ── Responsive ── */
@media (max-width: 480px) {
  .login-container {
    padding: 2rem;
  }

  h1 {
    font-size: 1.5rem;
  }

  .subtitle {
    font-size: 0.875rem;
  }
}
</style>
