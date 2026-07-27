import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
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
const PerformanceView = lazy(() => import('./pages/PerformanceView'))
const LiveHub = lazy(() => import('./pages/LiveHub'))
const SqlQueryDetail = lazy(() => import('./pages/SqlQueryDetail'))
const ErrorDetail = lazy(() => import('./pages/ErrorDetail'))
const KeyTransactions = lazy(() => import('./pages/KeyTransactions'))
const Login = lazy(() => import('./pages/Login'))
const Users = lazy(() => import('./pages/Users'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const Slos = lazy(() => import('./pages/Slos'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Anomalies = lazy(() => import('./pages/Anomalies'))

function App() {
  const [filters, setFilters] = useState({})
  const [autoRefresh, setAutoRefresh] = useState(true)
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

  const handleTraceSelect = (trace) => {
    // Navigation handled by Link component
  }

  const handleServiceSelect = (service) => {
    // Navigation handled by Link component
  }

  return (
    <ErrorBoundary>
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
              path="/traces"
              element={<TraceExplorer />}
            />
            <Route
              path="/stats"
              element={<Stats autoRefresh={autoRefresh} />}
            />
            <Route
              path="/system"
              element={<Stats autoRefresh={autoRefresh} />}
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
    </ErrorBoundary>
  )
}

export default App
