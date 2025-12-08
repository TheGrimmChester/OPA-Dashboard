import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import TraceList from '../components/TraceList'
import ShareButton from '../components/ShareButton'
import LoadingSpinner from '../components/LoadingSpinner'
import './ServiceProfile.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function ServiceProfile() {
  const { serviceName } = useParams()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchStats = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    
    try {
      const response = await axios.get(`${API_URL}/api/services/${encodeURIComponent(serviceName)}/stats`)
      setStats(response.data)
    } catch (err) {
      setError(err.response?.status === 404 ? 'Service not found' : 'Error fetching service stats')
      console.error('Fetch service stats error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [serviceName])

  useEffect(() => {
    if (!serviceName) return
    setLoading(true)
    fetchStats()
  }, [serviceName, fetchStats])

  useEffect(() => {
    if (!autoRefresh || !serviceName) return
    
    const interval = setInterval(() => {
      fetchStats()
    }, 5000)
    
    return () => clearInterval(interval)
  }, [autoRefresh, serviceName, fetchStats])

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return 'N/A'
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const handleTraceSelect = (trace) => {
    navigate(`/traces/${trace.trace_id}`)
  }

  if (loading && !stats) {
    return <LoadingSpinner message="Loading service details..." />
  }

  if (error && !stats) {
    return (
      <div className="service-profile-error">
        <Link to="/services" className="back-link">← Back to Services</Link>
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="ServiceProfile">
      <div className="service-profile-header">
        <div className="service-profile-header-left">
          <Link to="/services" className="back-link">← Back to Services</Link>
          <h1>{serviceName}</h1>
        </div>
        <div className="service-profile-header-right">
          <label className="refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh</span>
          </label>
          <ShareButton />
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {stats && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Traces</div>
              <div className="stat-value">{stats.total_traces.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Spans</div>
              <div className="stat-value">{stats.total_spans.toLocaleString()}</div>
            </div>
            <div className="stat-card error">
              <div className="stat-label">Error Count</div>
              <div className="stat-value">{stats.error_count.toLocaleString()}</div>
            </div>
            <div className="stat-card error">
              <div className="stat-label">Error Rate</div>
              <div className="stat-value">{stats.error_rate.toFixed(2)}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Duration</div>
              <div className="stat-value">{formatDuration(stats.avg_duration)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">P50 Duration</div>
              <div className="stat-value">{formatDuration(stats.p50_duration)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">P95 Duration</div>
              <div className="stat-value">{formatDuration(stats.p95_duration)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">P99 Duration</div>
              <div className="stat-value">{formatDuration(stats.p99_duration)}</div>
            </div>
          </div>

          <div className="top-endpoints">
            <div className="top-endpoints-header">
              <h3>Top Endpoints</h3>
              {stats.top_endpoints && (
                <div className="endpoints-info">
                  {stats.top_endpoints.length} endpoint{stats.top_endpoints.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            {refreshing && <span className="refresh-indicator">🔄 Refreshing...</span>}
            {stats.top_endpoints && stats.top_endpoints.length > 0 ? (
              <div className="endpoints-table-container">
                <table className="endpoints-table">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Count</th>
                      <th>Avg Duration</th>
                      <th>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_endpoints.map((ep, idx) => (
                      <tr key={idx}>
                        <td>{ep.name}</td>
                        <td>{ep.count.toLocaleString()}</td>
                        <td>{formatDuration(ep.avg_duration)}</td>
                        <td>
                          <span className={ep.error_count > 0 ? 'error-count' : ''}>
                            {ep.error_count.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">No endpoints found</div>
            )}
          </div>

          <div className="service-traces">
            <h3>Recent Traces</h3>
            <TraceList 
              filters={{ service: serviceName }} 
              onTraceSelect={handleTraceSelect}
              autoRefresh={autoRefresh}
            />
          </div>
        </>
      )}
    </div>
  )
}

export default ServiceProfile

