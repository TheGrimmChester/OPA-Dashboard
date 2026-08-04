import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import axios from 'axios'
import App from './App'

// The family design system first, then this product's own layer. Order matters:
// anything in product.css is an override of a kit rule, so it has to come after.
import '@open-family/ui/styles.css'
import './product.css'

import { applyProduct, initTheme } from '@open-family/ui'

// Stamp product and theme on <html> before React renders, so the first paint is
// already correct instead of flashing the wrong accent or theme.
applyProduct('opa')
initTheme('opa_theme')

// Attach bearer + identity to API requests (same-origin and known local hub URLs).
axios.interceptors.request.use((config) => {
  const url = config.url || ''
  let attach = false
  if (!/^https?:\/\//i.test(url)) {
    attach = true // relative / same-origin proxy
  } else {
    try {
      const host = new URL(url).hostname
      attach = host === 'localhost' || host === '127.0.0.1' || host === window.location.hostname
    } catch {
      attach = false
    }
  }
  if (attach) {
    config.headers = config.headers || {}
    const token = localStorage.getItem('auth_token')
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`
    }
    const username = localStorage.getItem('username')
    const role = localStorage.getItem('role')
    if (username && !config.headers['X-User-Username']) {
      config.headers['X-User-Username'] = username
    }
    if (role && !config.headers['X-User-Role']) {
      config.headers['X-User-Role'] = role
    }
  }
  return config
})

// When auth is enforced, an expired/absent session surfaces as 401 on API calls.
// Clear the stale session and bounce to /login (once — never loop from the login
// page or the public auth endpoints). Auth-off deployments never hit this.
axios.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error?.response?.status
    const url = error?.config?.url || ''
    const onAuthPath = window.location.pathname === '/login' || /\/api\/auth\//.test(url)
    if (status === 401 && !onAuthPath) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('username')
      localStorage.removeItem('role')
      const back = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.assign(`/login?next=${back}`)
    }
    return Promise.reject(error)
  }
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
    <App />
    </BrowserRouter>
  </React.StrictMode>,
)

