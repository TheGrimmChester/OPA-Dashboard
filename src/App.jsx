import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import axios from 'axios'
import {
  FiHome, 
  FiActivity, 
  FiServer, 
  FiTrendingUp, 
  FiGlobe, 
  FiDatabase, 
  FiAlertCircle,
  FiTarget,
  FiRefreshCw,
  FiMenu,
  FiX,
  FiChevronDown,
  FiChevronRight,
  FiTerminal,
  FiFileText,
  FiRadio,
  FiBarChart2,
  FiHardDrive,
  FiCpu,
  FiUsers,
} from 'react-icons/fi'
import ErrorBoundary from './components/ErrorBoundary'
import { TenantProvider } from './contexts/TenantContext'
import { TimeRangeProvider } from './contexts/TimeRangeContext'
import AppShell from './components/shell/AppShell'
import './App.css'

// Lazily loaded route/page components so their heavy dependencies
// (vis-network, recharts, react-syntax-highlighter, sql-formatter) are
// split into their own chunks instead of the main bundle.
const CompareTraces = lazy(() => import('./pages/CompareTraces'))
const Stats = lazy(() => import('./pages/Stats'))
const Overview = lazy(() => import('./pages/Overview'))
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'))
const TraceDetail = lazy(() => import('./pages/TraceDetail'))
const ProfilingView = lazy(() => import('./pages/ProfilingView'))
const TraceExplorer = lazy(() => import('./pages/TraceExplorer'))
const Databases = lazy(() => import('./pages/Databases'))
const ErrorsInbox = lazy(() => import('./pages/ErrorsInbox'))
const ServiceMapView = lazy(() => import('./pages/ServiceMapView'))
const BrowserRum = lazy(() => import('./pages/BrowserRum'))
const ExternalHttp = lazy(() => import('./pages/ExternalHttp'))
const HttpEndpointDetail = lazy(() => import('./pages/HttpEndpointDetail'))
const PerformanceView = lazy(() => import('./pages/PerformanceView'))
const LiveHub = lazy(() => import('./pages/LiveHub'))
const PlatformOps = lazy(() => import('./pages/PlatformOps'))
const Logs = lazy(() => import('./pages/Logs'))
const MetricsExplorer = lazy(() => import('./pages/MetricsExplorer'))
const Infrastructure = lazy(() => import('./pages/Infrastructure'))
const SqlQueryDetail = lazy(() => import('./pages/SqlQueryDetail'))
const ErrorDetail = lazy(() => import('./pages/ErrorDetail'))
const KeyTransactions = lazy(() => import('./pages/KeyTransactions'))
const Commands = lazy(() => import('./pages/Commands'))
const Login = lazy(() => import('./pages/Login'))
const Users = lazy(() => import('./pages/Users'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const Slos = lazy(() => import('./pages/Slos'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Anomalies = lazy(() => import('./pages/Anomalies'))
const Synthetics = lazy(() => import('./pages/Synthetics'))
const QueryExplorer = lazy(() => import('./pages/QueryExplorer'))
const Dashboards = lazy(() => import('./pages/Dashboards'))

// Result of the one-time auth probe, cached for the lifetime of the page so
// client-side navigations never re-probe. `true` = render the app (auth off or
// endpoint absent), `false` = auth enforced and no session → redirect to /login.
let authProbe = null

// Pre-render auth guard. Without it, an unauthenticated visit under enforced
// auth briefly flashes the full app (every panel then 401s) before the axios
// interceptor bounces to /login. With a stored token we render immediately —
// if the token is stale, the 401 interceptor still handles it. Otherwise we
// probe /api/auth/status once: 401/403 means auth is enforced (redirect),
// 200/404 means auth is off or the endpoint doesn't exist (render).
function RequireAuth({ children }) {
  const [allowed, setAllowed] = useState(() => !!localStorage.getItem('auth_token'))

  useEffect(() => {
    if (allowed) return undefined
    if (!authProbe) {
      authProbe = axios
        .get('/api/auth/status')
        .then(() => true)
        .catch((err) => {
          const status = err?.response?.status
          return status !== 401 && status !== 403
        })
    }
    let active = true
    authProbe.then((ok) => {
      if (!active) return
      if (ok) {
        setAllowed(true)
      } else {
        const back = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.assign(`/login?next=${back}`)
      }
    })
    return () => { active = false }
  }, [allowed])

  if (!allowed) return null
  return children
}

function App() {
  // Stats polls on its own; this stays a constant until something in the shell
  // needs to toggle it.
  const autoRefresh = true
  const { pathname } = useLocation()

  // The login screen renders standalone — no nav/topbar shell around it. When
  // auth is enforced, the 401 interceptor (main.jsx) sends unauthenticated users
  // here; showing the full app chrome behind the form would be misleading.
  if (pathname === '/login') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<div className="route-loading" style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>}>
          <Login />
        </Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <RequireAuth>
      <TenantProvider>
        <TimeRangeProvider>
        <AppShell>
          <Suspense fallback={<div className="route-loading" style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>}>
          <Routes>
            <Route
              path="/"
              element={<Overview />}
            />
            <Route
              path="/services"
              element={<Overview />}
            />
            <Route
              path="/services/:serviceName"
              element={<ServiceDetail />}
            />
            <Route
              path="/key-transactions"
              element={<KeyTransactions />}
            />
            <Route
              path="/commands"
              element={<Commands />}
            />
            <Route
              path="/traces"
              element={<TraceExplorer />}
            />
            <Route
              path="/stats"
              element={<Stats autoRefresh={autoRefresh} />}
            />
            <Route
              path="/system"
              element={<PlatformOps />}
            />
            <Route
              path="/traces/:traceId"
              element={<TraceDetail />}
            />
            {/* Legacy flame route folded into the Trace Detail waterfall. */}
            <Route path="/traces/:traceId/flame" element={<Navigate to="/traces" replace />} />
            <Route 
              path="/compare" 
              element={<CompareTraces />} 
            />
            <Route
              path="/performance"
              element={<PerformanceView />}
            />
            {/* Network folded into Performance (bandwidth panels) + Trace Detail I/O. */}
            <Route path="/network" element={<Navigate to="/performance" replace />} />
            <Route
              path="/profiling"
              element={<ProfilingView />}
            />
            <Route
              path="/rum"
              element={<BrowserRum />}
            />
            <Route
              path="/users"
              element={<Users />}
            />
            <Route
              path="/api-keys"
              element={<ApiKeys />}
            />
            <Route
              path="/service-map"
              element={<ServiceMapView />}
            />
            <Route
              path="/sql"
              element={<Databases />}
            />
            <Route
              path="/sql/:fingerprint"
              element={<SqlQueryDetail />}
            />
            <Route
              path="/http"
              element={<ExternalHttp />}
            />
            <Route
              path="/http/:endpoint"
              element={<HttpEndpointDetail />}
            />
            <Route
              path="/slos"
              element={<Slos />}
            />
            <Route
              path="/alerts"
              element={<Alerts />}
            />
            <Route
              path="/anomalies"
              element={<Anomalies />}
            />
            <Route
              path="/synthetics"
              element={<Synthetics />}
            />
            <Route
              path="/errors"
              element={<ErrorsInbox />}
            />
            <Route
              path="/errors/:errorId"
              element={<ErrorDetail />}
            />
            <Route
              path="/live"
              element={<LiveHub />}
            />
            <Route
              path="/logs"
              element={<Logs />}
            />
            <Route
              path="/metrics"
              element={<MetricsExplorer />}
            />
            <Route
              path="/query"
              element={<QueryExplorer />}
            />
            <Route
              path="/dashboards"
              element={<Dashboards />}
            />
            <Route
              path="/dashboards/:id"
              element={<Dashboards />}
            />
            <Route
              path="/infrastructure"
              element={<Infrastructure />}
            />
            {/* Legacy live routes now consolidated into the Live hub. */}
            <Route path="/live-dumps" element={<Navigate to="/live?tab=dumps" replace />} />
            <Route path="/live-logs" element={<Navigate to="/live" replace />} />
            <Route path="/live-http" element={<Navigate to="/live" replace />} />
            <Route path="/live/service-map" element={<Navigate to="/live" replace />} />
            <Route path="/live/sql" element={<Navigate to="/live" replace />} />
            <Route path="/live/redis" element={<Navigate to="/live" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </AppShell>
        </TimeRangeProvider>
      </TenantProvider>
      </RequireAuth>
    </ErrorBoundary>
  )
}

export default App
