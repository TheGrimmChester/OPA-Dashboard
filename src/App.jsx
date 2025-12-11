import React, { useState, useEffect } from 'react'
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
} from 'react-icons/fi'
import ErrorBoundary from './components/ErrorBoundary'
import ServiceOverview from './components/ServiceOverview.jsx'
import TraceList from './components/TraceList'
import TraceFilters from './components/TraceFilters'
import PerformanceMetrics from './components/PerformanceMetrics'
import NetworkView from './components/NetworkView'
import TraceView from './pages/TraceView'
import CompareTraces from './pages/CompareTraces'
import ServiceProfile from './pages/ServiceProfile'
import SqlAnalysis from './pages/SqlAnalysis'
import ErrorAnalysis from './pages/ErrorAnalysis'
import ErrorViewer from './components/ErrorViewer'
import LiveDumps from './pages/LiveDumps'
import LiveLogs from './pages/LiveLogs'
import LiveDashboard from './pages/LiveDashboard'
import LiveServiceMap from './pages/LiveServiceMap'
import LiveSql from './pages/LiveSql'
import ServiceMap from './components/ServiceMap'
import PurgeButton from './components/PurgeButton'
import HelpIcon from './components/HelpIcon'
import TenantSwitcher from './components/TenantSwitcher'
import { TenantProvider } from './contexts/TenantContext'
import './App.css'

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
      ]
    },
    {
      label: 'Analysis',
      icon: FiTrendingUp,
      helpText: 'Analysis tools for performance, SQL, errors, and network monitoring',
      items: [
        { path: '/performance', label: 'Performance', icon: FiTrendingUp, helpText: 'Monitor performance metrics over time with percentile analysis' },
        { path: '/sql', label: 'SQL', icon: FiDatabase, helpText: 'Analyze SQL query performance and execution patterns' },
        { path: '/errors', label: 'Errors', icon: FiAlertCircle, helpText: 'View and analyze error occurrences and stack traces' },
        { path: '/network', label: 'Network', icon: FiGlobe, helpText: 'Monitor network traffic, latency, and bandwidth usage' },
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
        { path: '/live/service-map', label: 'Live Service Map', icon: FiServer, helpText: 'Real-time service dependency visualization with auto-refresh' },
        { path: '/live/sql', label: 'Live SQL', icon: FiDatabase, helpText: 'Real-time SQL query monitoring with auto-refresh' },
      ]
    },
    {
      label: 'Monitoring',
      icon: FiTarget,
      helpText: 'Monitoring tools for service maps',
      items: [
        { path: '/service-map', label: 'Service Map', icon: FiServer, helpText: 'Visualize service dependencies and relationships' },
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
        <div className="App">
          <Navigation />
          <div className="app-toolbar">
            <label className="refresh-toggle">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                aria-label="Auto-refresh"
              />
              <FiRefreshCw className={autoRefresh ? 'spinning' : ''} />
              <span>Auto-refresh</span>
            </label>
            <PurgeButton />
          </div>
        <main className="App-main">
          <Routes>
            <Route 
              path="/" 
              element={
                <ServiceOverview 
                  onServiceSelect={handleServiceSelect}
                  autoRefresh={autoRefresh}
                />
              } 
            />
            <Route 
              path="/services" 
              element={
          <ServiceOverview 
            onServiceSelect={handleServiceSelect}
            autoRefresh={autoRefresh}
          />
              } 
            />
            <Route 
              path="/services/:serviceName" 
              element={<ServiceProfile />} 
            />
            <Route 
              path="/traces" 
              element={
          <div className="traces-view">
            <TraceFilters onFiltersChange={setFilters} />
            <TraceList 
              filters={filters}
              onTraceSelect={handleTraceSelect}
              autoRefresh={autoRefresh}
            />
          </div>
              } 
            />
            <Route 
              path="/traces/:traceId" 
              element={<TraceView />} 
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
              element={<PerformanceMetrics autoRefresh={autoRefresh} />} 
            />
            <Route 
              path="/network" 
              element={<NetworkView autoRefresh={autoRefresh} />} 
            />
            <Route 
              path="/service-map" 
              element={<ServiceMap />} 
            />
            <Route 
              path="/sql" 
              element={<SqlAnalysis />} 
            />
            <Route 
              path="/sql/:fingerprint" 
              element={<SqlAnalysis />} 
            />
            <Route 
              path="/errors" 
              element={<ErrorViewer />} 
            />
            <Route 
              path="/errors/:errorId" 
              element={<ErrorAnalysis />} 
            />
            <Route 
              path="/live" 
              element={<LiveDashboard />} 
            />
            <Route 
              path="/live-dumps" 
              element={<LiveDumps />} 
            />
            <Route 
              path="/live-logs" 
              element={<LiveLogs />} 
            />
            <Route 
              path="/live/service-map" 
              element={<LiveServiceMap />} 
            />
            <Route 
              path="/live/sql" 
              element={<LiveSql />} 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      </TenantProvider>
    </ErrorBoundary>
  )
}

export default App
