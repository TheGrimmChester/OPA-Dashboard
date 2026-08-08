import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiLogIn, FiUser, FiLock, FiAlertCircle } from 'react-icons/fi'
import axios from 'axios'
import { Panel } from '../components/ui'
import './Login.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const OAM_URL = (import.meta.env.VITE_OAM_URL || '').replace(/\/$/, '')

// Decode a JWT payload (no verification — display only; the server verifies).
function decodeJwt(token) {
  try {
    const part = token.split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

// Post-login redirect target: honor a ?next= query param (set by the 401
// interceptor) but only allow same-app relative paths; fall back to '/'.
function nextTarget() {
  const next = new URLSearchParams(window.location.search).get('next')
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/'
}

/**
 * OAM issues JWTs when codeployed. Prefer same-origin /oam-auth so CSP
 * connect-src 'self' allows login XHR. Hub /api/auth/login may proxy to OAM,
 * but peers use the bridge; Absolute VITE_OAM_URL is for deep-links only.
 */
async function resolveAuthBase() {
  try {
    const { data } = await axios.get(`${API_URL}/api/auth/status`)
    if (data?.mode === 'codeployed' || data?.mode === 'hub' || data?.standalone === false) {
      return '/oam-auth'
    }
  } catch {
    /* standalone or status unavailable — fall through */
  }
  try {
    await axios.get('/oam-auth/api/auth/status')
    return '/oam-auth'
  } catch {
    /* bridge absent */
  }
  if (OAM_URL) return OAM_URL
  return API_URL
}

function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ssoEnabled, setSsoEnabled] = useState(false)
  const [authBase, setAuthBase] = useState(API_URL)

  // Capture the token the OIDC callback puts in the URL fragment (#token=...&
  // dnonce=...). Only accept it if dnonce matches the value this SPA stored
  // before initiating login — this proves the token belongs to a login WE
  // started and blocks token-fixation via a crafted /login#token=... link.
  // username/role come from the token's own signed claims, not spoofable params.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (window.location.hash && window.location.hash.includes('token=')) {
        const p = new URLSearchParams(window.location.hash.slice(1))
        const token = p.get('token')
        const dnonce = p.get('dnonce')
        const expected = sessionStorage.getItem('oidc_dnonce')
        // Preserve any ?next= before we strip the fragment from the URL.
        const target = nextTarget()
        // Strip the token from the URL immediately regardless of outcome.
        window.history.replaceState(null, '', window.location.pathname)
        sessionStorage.removeItem('oidc_dnonce')
        if (token && expected && dnonce && dnonce === expected) {
          const claims = decodeJwt(token)
          if (claims) {
            localStorage.setItem('auth_token', token)
            if (claims.username) localStorage.setItem('username', claims.username)
            if (claims.role) localStorage.setItem('role', claims.role)
            navigate(target)
            return
          }
        }
        setError('SSO login could not be verified. Please try again.')
      }

      const base = await resolveAuthBase()
      if (cancelled) return
      setAuthBase(base)
      try {
        const r = await axios.get(`${base}/api/auth/oidc/status`)
        if (!cancelled) setSsoEnabled(!!r.data?.enabled)
      } catch {
        if (!cancelled) setSsoEnabled(false)
      }
    })()
    return () => { cancelled = true }
  }, [navigate])

  // Begin SSO: generate a one-time delivery nonce, remember it, and hand it to
  // the auth issuer, which echoes it back in the post-login fragment.
  const startSso = () => {
    const nonce = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}${Date.now()}`
    sessionStorage.setItem('oidc_dnonce', nonce)
    window.location.href = `${authBase}/api/auth/oidc/login?dnonce=${encodeURIComponent(nonce)}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const base = authBase || await resolveAuthBase()
      const response = await axios.post(`${base}/api/auth/login`, {
        username,
        password,
      })

      localStorage.setItem('auth_token', response.data.token)
      localStorage.setItem('username', response.data.username)
      localStorage.setItem('role', response.data.role)

      navigate(nextTarget())
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon"><FiLogIn /></span>
          <div className="login-brand-title">Open Profiling</div>
          <div className="login-brand-sub">Sign in to your dashboard</div>
        </div>

        <Panel>
          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="login-error" role="alert">
                <FiAlertCircle /> <span>{error}</span>
              </div>
            )}

            <div className="login-field">
              <label className="login-label" htmlFor="login-username">
                <FiUser size={12} /> Username
              </label>
              <input
                id="login-username"
                className="oui-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="login-password">
                <FiLock size={12} /> Password
              </label>
              <input
                id="login-password"
                className="oui-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="oui-btn is-primary login-btn"
              disabled={loading}
            >
              {loading ? 'Logging in…' : 'Login'}
            </button>
          </form>

          {ssoEnabled && (
            <div className="login-sso">
              <div className="login-divider"><span>or</span></div>
              <button type="button" className="oui-btn is-secondary login-btn" onClick={startSso}>
                <FiLogIn size={12} /> Login with SSO
              </button>
            </div>
          )}

        </Panel>
      </div>
    </div>
  )
}

export default Login
