import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import axios from 'axios'
import { Spinner, productTitle, isNavItemActive } from '@open-family/ui'
import ErrorBoundary from './components/ErrorBoundary'
import { TenantProvider } from './contexts/TenantContext'
import { TimeRangeProvider } from './contexts/TimeRangeContext'
import { I18nProvider, useI18n } from './contexts/I18nContext'
import Shell from './components/shell/Shell'
import { navItems } from './nav'

// Lazily loaded route/page components so their heavy dependencies
// (vis-network, recharts, react-syntax-highlighter, sql-formatter) are
// split into their own chunks instead of the main bundle.
const CompareTraces = lazy(() => import('./pages/CompareTraces'))
const Overview = lazy(() => import('./pages/Overview'))
const Services = lazy(() => import('./pages/Services'))
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
const Serverless = lazy(() => import('./pages/Serverless'))
const Catalog = lazy(() => import('./pages/Catalog'))
const Automation = lazy(() => import('./pages/Automation'))
const Cloud = lazy(() => import('./pages/Cloud'))
const Network = lazy(() => import('./pages/Network'))
const Collaborate = lazy(() => import('./pages/Collaborate'))
const Diagnostics = lazy(() => import('./pages/Diagnostics'))
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
const Account = lazy(() => import('./pages/Account'))
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

/**
 * Name the tab after the page, not the product.
 *
 * A browser tab is read left to right, and the title used to be set once in
 * `index.html`, so every page claimed to be the landing page. This runs on each
 * route change and resolves the label from the same IA the rail reads.
 */
function useDocumentTitle() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  useEffect(() => {
    const match = navItems().find((item) => isNavItemActive(pathname, item))
    document.title = productTitle({
      productName: 'Open Profiling Agent',
      page: match ? t(match.labelKey) : undefined,
    })
  }, [pathname, t])
}

function RoutedApp() {
  useDocumentTitle()
  return (
    <Shell>
      <Suspense fallback={<div className="route-loading" style={{ padding: 'var(--space-6)' }}><Spinner label="Loading page" /></div>}>
        <AppRoutes />
      </Suspense>
    </Shell>
  )
}

function App() {
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
            <I18nProvider>
              <RoutedApp />
            </I18nProvider>
          </TimeRangeProvider>
        </TenantProvider>
      </RequireAuth>
    </ErrorBoundary>
  )
}

/**
 * Every route in the product.
 *
 * Routes renamed to agree with their nav label: `/sql` is `/databases` and
 * `/infrastructure` is `/hosts`, because the rail already called them that.
 *
 * Deleted rather than re-pointed: the six legacy `/live-*` paths, the
 * `/traces/:traceId/flame` route (the flame graph is a tab of the trace now),
 * `/stats` (folded into Platform status as its Storage tab) and `/account`
 * (a duplicate of `/settings/account`).
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="/overview" element={<Overview />} />

      {/* Monitor */}
      <Route path="/services" element={<Services />} />
      <Route path="/services/:serviceName" element={<ServiceDetail />} />
      <Route path="/catalog" element={<Catalog />} />
      <Route path="/key-transactions" element={<KeyTransactions />} />
      <Route path="/commands" element={<Commands />} />
      <Route path="/traces" element={<TraceExplorer />} />
      <Route path="/traces/:traceId" element={<TraceDetail />} />
      <Route path="/profiling" element={<ProfilingView />} />
      <Route path="/errors" element={<ErrorsInbox />} />
      <Route path="/errors/:errorId" element={<ErrorDetail />} />
      <Route path="/logs" element={<Logs />} />

      {/* Reliability */}
      <Route path="/alerts" element={<Alerts />} />
      <Route path="/slos" element={<Slos />} />
      <Route path="/anomalies" element={<Anomalies />} />
      <Route path="/synthetics" element={<Synthetics />} />
      <Route path="/diagnostics" element={<Diagnostics />} />

      {/* Analyze */}
      <Route path="/databases" element={<Databases />} />
      <Route path="/databases/:fingerprint" element={<SqlQueryDetail />} />
      <Route path="/http" element={<ExternalHttp />} />
      <Route path="/http/:endpoint" element={<HttpEndpointDetail />} />
      <Route path="/service-map" element={<ServiceMapView />} />
      <Route path="/network" element={<Network />} />
      <Route path="/rum" element={<BrowserRum />} />
      <Route path="/performance" element={<PerformanceView />} />
      <Route path="/compare" element={<CompareTraces />} />

      {/* Infrastructure */}
      <Route path="/hosts" element={<Infrastructure />} />
      <Route path="/cloud" element={<Cloud />} />
      <Route path="/serverless" element={<Serverless />} />
      <Route path="/metrics" element={<MetricsExplorer />} />
      <Route path="/query" element={<QueryExplorer />} />
      <Route path="/dashboards" element={<Dashboards />} />
      <Route path="/dashboards/:id" element={<Dashboards />} />

      {/* Operate */}
      <Route path="/live" element={<LiveHub />} />
      <Route path="/collaborate" element={<Collaborate />} />
      <Route path="/system" element={<PlatformOps />} />
      <Route path="/automation" element={<Automation />} />

      {/* Administration */}
      <Route path="/users" element={<Users />} />
      <Route path="/api-keys" element={<ApiKeys />} />
      <Route path="/settings/account" element={<Account />} />

      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}

export default App
