import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { 
  FiActivity, 
  FiLayers, 
  FiAlertCircle, 
  FiClock, 
  FiTrendingUp,
  FiRefreshCw,
  FiServer,
  FiCpu,
  FiGlobe,
  FiDatabase,
  FiChevronDown,
  FiChevronUp
} from 'react-icons/fi'
import axios from 'axios'
import HelpIcon from './HelpIcon'
import './ServiceOverview.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function ServiceOverview({ onServiceSelect, autoRefresh = true }) {
  const navigate = useNavigate()
  
  const handleServiceClick = (serviceName, e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (onServiceSelect) {
      onServiceSelect(serviceName)
    }
    navigate(`/services/${encodeURIComponent(serviceName)}`)
  }
  const [services, setServices] = useState([])
  const [globalTotals, setGlobalTotals] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedSections, setExpandedSections] = useState({})

  const toggleSection = (serviceIdx, section) => {
    const key = `${serviceIdx}-${section}`
    setExpandedSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const fetchServices = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    
    try {
      const response = await axios.get(`${API_URL}/api/services`)
      setServices(response.data.services || [])
      setGlobalTotals(response.data.global_totals || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching services')
      console.error('Fetch services error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchServices()
  }, [fetchServices])

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      fetchServices()
    }, 5000) // 5 seconds
    
    return () => clearInterval(interval)
  }, [autoRefresh, fetchServices])

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return 'N/A'
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatNumber = (num) => {
    if (num == null || num === undefined) return '0'
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  if (loading && services.length === 0) {
    return (
      <div className="ServiceOverview">
        <div className="service-overview-header">
          <h2>Service Overview</h2>
        </div>
        <div className="services-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="service-card skeleton" style={{ height: '200px' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="ServiceOverview">
      <div className="service-overview-header">
        <div className="header-title-section">
          <FiServer className="header-icon" />
          <h2>Service Overview</h2>
          <HelpIcon text="View aggregated metrics and statistics for all services. Click on a service card to see detailed information." position="right" />
        </div>
        {refreshing && (
          <div className="refresh-indicator">
            <FiRefreshCw className="spinning" />
            <span>Refreshing...</span>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      {/* Global Totals Section */}
      {globalTotals && (
        <div className="global-totals-section">
          <h3>Global Totals <HelpIcon text="Aggregated metrics across all services in the system" position="right" /></h3>
          <div className="global-totals-grid">
            <div className="global-metric-card">
              <div className="global-metric-label">Total Traces <HelpIcon text="Total number of traces collected across all services" position="right" /></div>
              <div className="global-metric-value">{formatNumber(globalTotals.total_traces)}</div>
            </div>
            <div className="global-metric-card">
              <div className="global-metric-label">Total Spans <HelpIcon text="Total number of spans (individual operations) across all traces" position="right" /></div>
              <div className="global-metric-value">{formatNumber(globalTotals.total_spans)}</div>
            </div>
            <div className="global-metric-card">
              <div className="global-metric-label">Error Count <HelpIcon text="Total number of errors encountered across all services" position="right" /></div>
              <div className="global-metric-value error">{formatNumber(globalTotals.error_count)}</div>
            </div>
            <div className="global-metric-card">
              <div className="global-metric-label">Total CPU Time <HelpIcon text="Total CPU time consumed across all operations" position="right" /></div>
              <div className="global-metric-value">{formatDuration(globalTotals.total_cpu_ms)}</div>
            </div>
            <div className="global-metric-card">
              <div className="global-metric-label">Total Network Sent <HelpIcon text="Total bytes sent over the network across all services" position="right" /></div>
              <div className="global-metric-value">{formatBytes(globalTotals.total_bytes_sent)}</div>
            </div>
            <div className="global-metric-card">
              <div className="global-metric-label">Total Network Received <HelpIcon text="Total bytes received over the network across all services" position="right" /></div>
              <div className="global-metric-value">{formatBytes(globalTotals.total_bytes_received)}</div>
            </div>
            <div className="global-metric-card">
              <div className="global-metric-label">Total HTTP Requests <HelpIcon text="Total number of HTTP requests made across all services" position="right" /></div>
              <div className="global-metric-value">{formatNumber(globalTotals.total_http_requests)}</div>
            </div>
            <div className="global-metric-card">
              <div className="global-metric-label">Total SQL Queries <HelpIcon text="Total number of SQL queries executed across all services" position="right" /></div>
              <div className="global-metric-value">{formatNumber(globalTotals.total_sql_queries)}</div>
            </div>
            <div className="global-metric-card">
              <div className="global-metric-label">Avg Duration <HelpIcon text="Average duration of all traces across all services" position="right" /></div>
              <div className="global-metric-value">{formatDuration(globalTotals.avg_duration)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="services-grid">
        {services.map((service, idx) => (
          <Link
            key={idx} 
            to={`/services/${encodeURIComponent(service.service)}`}
            className="service-card card"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="service-card-header">
              <div className="service-name-section">
                <FiServer className="service-icon" />
                <h3>{service.service}</h3>
                <div className="service-badges">
                  {service.language && (
                    <span className="badge badge-language" title={`Language: ${service.language}`}>
                      {service.language}
                    </span>
                  )}
                  {service.framework && (
                    <span className="badge badge-framework" title={`Framework: ${service.framework}`}>
                      {service.framework}
                    </span>
                  )}
                  {service.language_version && (
                    <span className="badge badge-version" title={`Version: ${service.language_version}`}>
                      v{service.language_version}
                    </span>
                  )}
                </div>
              </div>
              <span className={`error-rate ${service.error_rate > 5 ? 'high' : service.error_rate > 1 ? 'medium' : 'low'}`}>
                <FiAlertCircle className="error-icon" />
                {service.error_rate.toFixed(2)}%
              </span>
            </div>
            
            <div className="service-metrics">
              <div className="metric">
                <div className="metric-label">
                  <FiActivity className="metric-icon" />
                  Total Traces
                  <HelpIcon text="Total number of traces collected for this service" position="right" />
                </div>
                <div className="metric-value">{formatNumber(service.total_traces)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiLayers className="metric-icon" />
                  Total Spans
                  <HelpIcon text="Total number of spans (individual operations) for this service" position="right" />
                </div>
                <div className="metric-value">{formatNumber(service.total_spans)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiAlertCircle className="metric-icon" />
                  Error Count
                  <HelpIcon text="Total number of errors encountered for this service" position="right" />
                </div>
                <div className="metric-value error">{formatNumber(service.error_count)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiCpu className="metric-icon" />
                  Total CPU
                  <HelpIcon text="Total CPU time consumed by this service" position="right" />
                </div>
                <div className="metric-value">{formatDuration(service.total_cpu_ms)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiGlobe className="metric-icon" />
                  Network Sent
                  <HelpIcon text="Total bytes sent over the network by this service" position="right" />
                </div>
                <div className="metric-value">{formatBytes(service.total_bytes_sent)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiGlobe className="metric-icon" />
                  Network Received
                  <HelpIcon text="Total bytes received over the network by this service" position="right" />
                </div>
                <div className="metric-value">{formatBytes(service.total_bytes_received)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiGlobe className="metric-icon" />
                  HTTP Requests
                  <HelpIcon text="Total number of HTTP requests made by this service" position="right" />
                </div>
                <div className="metric-value">{formatNumber(service.total_http_requests)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiDatabase className="metric-icon" />
                  SQL Queries
                  <HelpIcon text="Total number of SQL queries executed by this service" position="right" />
                </div>
                <div className="metric-value">{formatNumber(service.sql_query_count)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiClock className="metric-icon" />
                  Avg Duration
                  <HelpIcon text="Average duration of traces for this service" position="right" />
                </div>
                <div className="metric-value">{formatDuration(service.avg_duration)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiTrendingUp className="metric-icon" />
                  P95 Duration
                  <HelpIcon text="95th percentile duration - 95% of requests complete within this time" position="right" />
                </div>
                <div className="metric-value">{formatDuration(service.p95_duration)}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">
                  <FiTrendingUp className="metric-icon" />
                  P99 Duration
                  <HelpIcon text="99th percentile duration - 99% of requests complete within this time" position="right" />
                </div>
                <div className="metric-value">{formatDuration(service.p99_duration)}</div>
              </div>
            </div>
            
            {/* Expandable HTTP Requests Section */}
            {service.top_http_requests && service.top_http_requests.length > 0 && (
              <div className="expandable-section">
                <button 
                  className="expandable-header"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleSection(idx, 'http')
                  }}
                >
                  <FiGlobe />
                  <span>HTTP Requests ({service.top_http_requests.length})</span>
                  <HelpIcon text="View the most frequently called HTTP endpoints for this service" position="right" />
                  {expandedSections[`${idx}-http`] ? <FiChevronUp /> : <FiChevronDown />}
                </button>
                {expandedSections[`${idx}-http`] && (
                  <div className="expandable-content">
                    <table className="requests-table">
                      <thead>
                        <tr>
                          <th>Endpoint</th>
                          <th>Count</th>
                          <th>Avg Duration</th>
                          <th>Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {service.top_http_requests.map((req, reqIdx) => (
                          <tr key={reqIdx}>
                            <td><code>{req.endpoint || 'N/A'}</code></td>
                            <td>{formatNumber(req.request_count)}</td>
                            <td>{formatDuration(req.avg_duration)}</td>
                            <td className={req.error_count > 0 ? 'error' : ''}>{formatNumber(req.error_count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            
            {/* Expandable SQL Queries Section */}
            {service.top_sql_queries && service.top_sql_queries.length > 0 && (
              <div className="expandable-section">
                <button 
                  className="expandable-header"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleSection(idx, 'sql')
                  }}
                >
                  <FiDatabase />
                  <span>SQL Queries ({service.top_sql_queries.length})</span>
                  <HelpIcon text="View the most frequently executed SQL queries for this service" position="right" />
                  {expandedSections[`${idx}-sql`] ? <FiChevronUp /> : <FiChevronDown />}
                </button>
                {expandedSections[`${idx}-sql`] && (
                  <div className="expandable-content">
                    <table className="queries-table">
                      <thead>
                        <tr>
                          <th>Query Fingerprint</th>
                          <th>Executions</th>
                          <th>Avg Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {service.top_sql_queries.map((query, queryIdx) => (
                          <tr key={queryIdx}>
                            <td><code className="sql-fingerprint">{query.fingerprint || 'N/A'}</code></td>
                            <td>{formatNumber(query.execution_count)}</td>
                            <td>{formatDuration(query.avg_duration)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>

      {services.length === 0 && !loading && (
        <div className="empty-state">
          <FiServer className="empty-icon" />
          <p>No services found</p>
          <span className="empty-subtitle">Services will appear here once traces are collected</span>
        </div>
      )}
    </div>
  )
}

export default ServiceOverview

