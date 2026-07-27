import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import axios from 'axios'
import App from './App'
import './index.css'
import './theme/tokens.css'
import './theme/ui.css'

// Attach the bearer token to every same-origin API request so pages work when
// OPA_AUTH_REQUIRED is enabled, without each component wiring headers by hand.
// Scoped to same-origin/relative URLs so the token is never sent cross-origin.
axios.interceptors.request.use((config) => {
  const url = config.url || ''
  let sameOrigin = true
  if (/^https?:\/\//i.test(url)) {
    try {
      sameOrigin = new URL(url).origin === window.location.origin
    } catch {
      sameOrigin = false
    }
  }
  if (sameOrigin) {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers = config.headers || {}
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`
      }
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

