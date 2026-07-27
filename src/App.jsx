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
import TraceFilters from './components/TraceFilters'
import PurgeButton from './components/PurgeButton'
import HelpIcon from './components/HelpIcon'
import TenantSwitcher from './components/TenantSwitcher'
import { TenantProvider } from './contexts/TenantContext'
import { TimeRangeProvider } from './contexts/TimeRangeContext'
import AppShell from './components/shell/AppShell'
import './App.css'

// Lazily loaded route/page components so their heavy dependencies
// (vis-network, recharts, react-syntax-highlighter, sql-formatter) are
// split into their own chunks instead of the main bundle.
const ServiceOverview = lazy(() => import('./components/ServiceOverview.jsx'))
const TraceList = lazy(() => import('./components/TraceList'))
const PerformanceMetrics = lazy(() => import('./components/PerformanceMetrics'))
const NetworkView = lazy(() => import('./components/NetworkView'))
const TraceView = lazy(() => import('./pages/TraceView'))
const CompareTraces = lazy(() => import('./pages/CompareTraces'))
const ServiceProfile = lazy(() => import('./pages/ServiceProfile'))
const SqlAnalysis = lazy(() => import('./pages/SqlAnalysis'))
const ErrorAnalysis = lazy(() => import('./pages/ErrorAnalysis'))
const HttpAnalysis = lazy(() => import('./pages/HttpAnalysis'))
const ErrorViewer = lazy(() => import('./components/ErrorViewer'))
const LiveDumps = lazy(() => import('./pages/LiveDumps'))
const LiveLogs = lazy(() => import('./pages/LiveLogs'))
const LiveHttp = lazy(() => import('./pages/LiveHttp'))
const LiveDashboard = lazy(() => import('./pages/LiveDashboard'))
const LiveServiceMap = lazy(() => import('./pages/LiveServiceMap'))
const LiveSql = lazy(() => import('./pages/LiveSql'))
const LiveRedis = lazy(() => import('./pages/LiveRedis'))
const ServiceMap = lazy(() => import('./components/ServiceMap'))
const Stats = lazy(() => import('./pages/Stats'))
const RumDashboard = lazy(() => import('./components/RumDashboard'))
const ContinuousProfiling = lazy(() => import('./components/ContinuousProfiling'))
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
const Login = lazy(() => import('./pages/Login'))
const Users = lazy(() => import('./pages/Users'))

function Navigation() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState(null)
  const navRef = React.useRef(null)
  const dropdownRefs = React.useRef({})
  const buttonRefs = React.useRef({})
  const ignoreNextClickRef = React.useRef(false)

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (expandedGroup === null) {
      return
    }

    const handleClickOutside = (event) => {
      // Ignore the click if it was the one that opened the dropdown
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false
        return
      }

      const target = event.target
      
      // Check if click is on the button that opened this dropdown
      const clickedButton = buttonRefs.current[expandedGroup]
      if (clickedButton && (clickedButton === target || clickedButton.contains(target))) {
        return
      }
      
      // Check if click is inside the dropdown
      const clickedDropdown = target.closest('.nav-group-dropdown')
      if (clickedDropdown) {
        return
      }
      
      // Check if click is inside any nav group item
      const clickedNavItem = target.closest('.nav-group-item')
      if (clickedNavItem) {
        return
      }
      
      // If clicking outside the entire nav, close
      if (navRef.current && !navRef.current.contains(target)) {
        setExpandedGroup(null)
      }
    }

    // Use a small delay to ensure the dropdown is fully rendered
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 100)

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      document.removeEventListener('click', handleClickOutside)
    }
  }, [expandedGroup])

  const navGroups = [
    {
      label: 'Core',
      icon: FiHome,
      helpText: 'Core features for viewing services, traces, and overview',
      items: [
        { path: '/', label: 'Overview', icon: FiHome, helpText: 'View aggregated metrics and statistics for all services' },
        { path: '/traces', label: 'Traces', icon: FiActivity, helpText: 'Browse and search through collected traces' },
        { path: '/services', label: 'Services', icon: FiServer, helpText: 'View detailed information about each service' },
        { path: '/stats', label: 'Statistics', icon: FiBarChart2, helpText: 'View system statistics, traces metrics, and database size' },
      ]
    },
    {
      label: 'Analysis',
      icon: FiTrendingUp,
      helpText: 'Analysis tools for performance, SQL, errors, HTTP requests, and network monitoring',
      items: [
        { path: '/performance', label: 'Performance', icon: FiTrendingUp, helpText: 'Monitor performance metrics over time with percentile analysis' },
        { path: '/sql', label: 'SQL', icon: FiDatabase, helpText: 'Analyze SQL query performance and execution patterns' },
        { path: '/errors', label: 'Errors', icon: FiAlertCircle, helpText: 'View and analyze error occurrences and stack traces' },
        { path: '/http', label: 'HTTP Requests', icon: FiGlobe, helpText: 'Analyze HTTP request performance and execution patterns grouped by URL and method' },
        { path: '/network', label: 'Network', icon: FiGlobe, helpText: 'Monitor network traffic, latency, and bandwidth usage' },
        { path: '/profiling', label: 'Profiling', icon: FiCpu, helpText: 'Continuous/aggregated profiler: top functions by self-time across all requests' },
        { path: '/rum', label: 'RUM', icon: FiGlobe, helpText: 'Real User Monitoring - Core Web Vitals and page performance from real browsers' },
      ]
    },
    {
      label: 'Live',
      icon: FiRadio,
      helpText: 'Real-time monitoring and live data feeds',
      items: [
        { path: '/live', label: 'Live Dashboard', icon: FiActivity, helpText: 'Overview of all live monitoring features in one organized view' },
        { path: '/live-dumps', label: 'Live Dumps', icon: FiTerminal, helpText: 'View real-time variable dumps and debugging information' },
        { path: '/live-logs', label: 'Live Logs', icon: FiFileText, helpText: 'View real-time application logs with filtering and correlation' },
        { path: '/live-http', label: 'Live HTTP', icon: FiGlobe, helpText: 'Monitor incoming and outgoing HTTP requests in real-time with detailed request/response data' },
        { path: '/live/service-map', label: 'Live Service Map', icon: FiServer, helpText: 'Real-time service dependency visualization with auto-refresh' },
        { path: '/live/sql', label: 'Live SQL', icon: FiDatabase, helpText: 'Real-time SQL query monitoring with auto-refresh' },
        { path: '/live/redis', label: 'Live Redis', icon: FiHardDrive, helpText: 'Real-time Redis operation monitoring with auto-refresh' },
      ]
    },
    {
      label: 'Monitoring',
      icon: FiTarget,
      helpText: 'Monitoring tools for service maps',
      items: [
        { path: '/service-map', label: 'Service Map', icon: FiServer, helpText: 'Visualize service dependencies and relationships' },
      ]
    },
    {
      label: 'Admin',
      icon: FiUsers,
      helpText: 'Administration: users, roles and access',
      items: [
        { path: '/users', label: 'Users & Roles', icon: FiUsers, helpText: 'Manage users and their roles (viewer/editor/admin)' },
      ]
    }
  ]

  return (
      <header className="App-header">
        <div className="header-content">
          <div className="header-left">
            <button 
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <FiX /> : <FiMenu />}
            </button>
            <Link to="/" className="header-title-link">
              <div className="header-logo">
                <FiActivity className="logo-icon" />
                <h1>Open Profiling Agent</h1>
              </div>
            </Link>
          </div>
          <div className="header-controls">
            <TenantSwitcher />
          </div>
        </div>
        <nav ref={navRef} className={`main-nav ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          {navGroups.map((group, groupIndex) => {
            const GroupIcon = group.icon
            const hasActiveItem = group.items.some(item => {
              const active = isActive(item.path) && (item.path !== '/' || location.pathname === '/')
              return active
            })
            const isExpanded = expandedGroup === groupIndex
            
            return (
              <div key={groupIndex} className={`nav-group-item ${hasActiveItem ? 'has-active' : ''} ${isExpanded ? 'has-dropdown' : ''}`}>
                <button
                  ref={(el) => {
                    if (el) {
                      buttonRefs.current[groupIndex] = el
                    } else {
                      delete buttonRefs.current[groupIndex]
                    }
                  }}
                  type="button"
                  className="nav-group-button"
                  onMouseDown={(e) => {
                    // Set flag on mousedown (before click) to prevent immediate close
                    if (!isExpanded) {
                      ignoreNextClickRef.current = true
                    }
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const newExpanded = isExpanded ? null : groupIndex
                    setExpandedGroup(newExpanded)
                    // Keep flag true to prevent immediate close
                    if (newExpanded !== null) {
                      ignoreNextClickRef.current = true
                      setTimeout(() => {
                        ignoreNextClickRef.current = false
                      }, 300)
                    } else {
                      ignoreNextClickRef.current = false
                    }
                  }}
                  title={group.label}
                >
                  <GroupIcon className="nav-icon" />
                  <span className="nav-group-label">{group.label}</span>
                  {group.helpText && <HelpIcon text={group.helpText} position="right" />}
                  {isExpanded ? <FiChevronDown className="nav-chevron" /> : <FiChevronRight className="nav-chevron" />}
                </button>
                {isExpanded && (
                  <div 
                    ref={(el) => {
                      if (el) {
                        dropdownRefs.current[groupIndex] = el
                      } else {
                        delete dropdownRefs.current[groupIndex]
                      }
                    }}
                    className="nav-group-dropdown" 
                    data-testid={`dropdown-${group.label.toLowerCase()}`}
                    style={{
                      display: 'block',
                      visibility: 'visible',
                      opacity: 1,
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      zIndex: 10000,
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      minWidth: '180px',
                      marginTop: '2px',
                      padding: '8px 0',
                      width: 'auto',
                      height: 'auto'
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.path) && (item.path !== '/' || location.pathname === '/')
                      return (
                        <Link 
                          key={item.path}
                          to={item.path} 
                          className={`nav-dropdown-item ${active ? 'active' : ''}`}
                          onClick={() => {
                            setMobileMenuOpen(false)
                            setExpandedGroup(null)
                          }}
                        >
                          <Icon className="nav-icon" />
                          <span>{item.label}</span>
                          {item.helpText && <HelpIcon text={item.helpText} position="right" />}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </header>
  )
}

function App() {
  const [filters, setFilters] = useState({})
  const [autoRefresh, setAutoRefresh] = useState(true)

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
            <Route
              path="/traces/:traceId/flame"
              element={<TraceView />}
            />
            <Route 
              path="/compare" 
              element={<CompareTraces />} 
            />
            <Route
              path="/performance"
              element={<PerformanceView />}
            />
            <Route
              path="/network"
              element={<NetworkView autoRefresh={autoRefresh} />}
            />
            <Route
              path="/profiling"
              element={<ProfilingView />}
            />
            <Route
              path="/rum"
              element={<BrowserRum />}
            />
            <Route
              path="/login"
              element={<Login />}
            />
            <Route
              path="/users"
              element={<Users />}
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
            <Route path="/live-dumps" element={<Navigate to="/live" replace />} />
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
