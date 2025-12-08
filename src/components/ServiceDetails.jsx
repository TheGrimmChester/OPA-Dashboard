import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import TraceList from './TraceList'
import './ServiceDetails.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function ServiceDetails({ service, onBack, autoRefresh = true }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStats = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    
    try {
      const response = await axios.get(`${API_URL}/api/services/${service}/stats`)
      setStats(response.data)
    } catch (err) {
      setError(err.response?.status === 404 ? 'Service not found' : 'Error fetching service stats')
      console.error('Fetch service stats error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [service])

  useEffect(() => {
    if (!service) return
    setLoading(true)
    fetchStats()
  }, [service, fetchStats])

  useEffect(() => {
    if (!autoRefresh || !service) return
    
    const interval = setInterval(() => {
      fetchStats()
    }, 5000)
    
    return () => clearInterval(interval)
  }, [autoRefresh, service, fetchStats])

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return 'N/A'
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  if (!service) {
    return <div className="empty-state">Please select a service</div>
  }

  if (loading && !stats) {
    return <div className="loading">Loading service details...</div>
  }

  if (error && !stats) {
    return (
      <div>
        <button onClick={onBack} className="back-button">← Back to Services</button>
        <div className="error-message">{error}</div>
      </div>
    )
  }

  return (
    <div className="ServiceDetails">
      <div className="service-details-header">
        <button onClick={onBack} className="back-button">← Back to Services</button>
        <h2>{service}</h2>
        {refreshing && <span className="refresh-indicator">🔄 Refreshing...</span>}
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
            <h3>Top Endpoints</h3>
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
                  {stats.top_endpoints?.map((ep, idx) => (
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
          </div>

          <div className="service-traces">
            <h3>Recent Traces</h3>
            <TraceList 
              filters={{ service }} 
              onTraceSelect={null}
              autoRefresh={autoRefresh}
            />
          </div>
        </>
      )}
    </div>
  )
}

export default ServiceDetails

