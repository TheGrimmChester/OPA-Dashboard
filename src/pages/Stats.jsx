import React, { useState, useEffect, useCallback } from 'react'
import { 
  FiBarChart2, 
  FiActivity, 
  FiServer, 
  FiDatabase,
  FiRefreshCw,
  FiAlertCircle,
  FiClock,
  FiTrendingUp,
  FiHardDrive
} from 'react-icons/fi'
import { statsApi } from '../services/statsApi'
import TimeRangePicker from '../components/TimeRangePicker'
import HelpIcon from '../components/HelpIcon'
import './Stats.css'

function Stats({ autoRefresh = true }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [timeRange, setTimeRange] = useState('24h')

  const calculateTimeRange = (range) => {
    const now = new Date()
    let fromDate = new Date()
    
    switch (range) {
      case '1h':
        fromDate.setHours(now.getHours() - 1)
        break
      case '6h':
        fromDate.setHours(now.getHours() - 6)
        break
      case '24h':
        fromDate.setHours(now.getHours() - 24)
        break
      case '7d':
        fromDate.setDate(now.getDate() - 7)
        break
      case '30d':
        fromDate.setDate(now.getDate() - 30)
        break
      default:
        fromDate.setHours(now.getHours() - 24)
    }
    
    return {
      from: fromDate.toISOString().slice(0, 19).replace('T', ' '),
      to: now.toISOString().slice(0, 19).replace('T', ' ')
    }
  }

  const fetchStats = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    
    try {
      const timeRangeObj = calculateTimeRange(timeRange)
      const data = await statsApi.getStats(timeRangeObj.from, timeRangeObj.to)
      setStats(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching statistics')
      console.error('Fetch stats error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [timeRange])

  useEffect(() => {
    setLoading(true)
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      fetchStats()
    }, 5000) // 5 seconds
    
    return () => clearInterval(interval)
  }, [autoRefresh, fetchStats])

  const formatNumber = (num) => {
    if (num == null || num === undefined) return '0'
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return 'N/A'
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  if (loading && !stats) {
    return (
      <div className="Stats">
        <div className="loading">Loading statistics...</div>
      </div>
    )
  }

  return (
    <div className="Stats">
      <div className="stats-header">
        <div className="header-title-section">
          <FiBarChart2 className="header-icon" />
          <h2>Statistics</h2>
          <HelpIcon text="View comprehensive system statistics including traces metrics, agent internal stats, and database size information" position="right" />
        </div>
        <div className="time-range-controls">
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          {refreshing && (
            <div className="refresh-indicator">
              <FiRefreshCw className="spinning" />
              <span>Refreshing...</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      {stats && (
        <div className="stats-sections">
          {/* Traces Statistics Section */}
          <div className="stats-section">
            <div className="stats-section-header">
              <FiActivity className="section-icon" />
              <h3>Traces Statistics</h3>
              <HelpIcon text="Statistics about traces and spans collected in the system" position="right" />
            </div>
            
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">
                  <FiActivity />
                  <span>Total Traces</span>
                </div>
                <p className="stat-value">
                  {formatNumber(stats.traces?.total_traces || 0)}
                </p>
              </div>
              
              <div className="stat-card">
                <div className="stat-label">
                  <FiActivity />
                  <span>Total Spans</span>
                </div>
                <p className="stat-value">
                  {formatNumber(stats.traces?.total_spans || 0)}
                </p>
              </div>
              
              <div className="stat-card">
                <div className="stat-label">
                  <FiAlertCircle />
                  <span>Error Rate</span>
                </div>
                <p className="stat-value">
                  {(stats.traces?.error_rate || 0).toFixed(2)}
                  <span className="stat-unit">%</span>
                </p>
              </div>
              
              <div className="stat-card">
                <div className="stat-label">
                  <FiClock />
                  <span>Avg Duration</span>
                </div>
                <p className="stat-value">
                  {formatDuration(stats.traces?.avg_duration_ms || 0)}
                </p>
              </div>
              
              <div className="stat-card">
                <div className="stat-label">
                  <FiTrendingUp />
                  <span>P50 Duration</span>
                </div>
                <p className="stat-value">
                  {formatDuration(stats.traces?.p50_duration_ms || 0)}
                </p>
              </div>
              
              <div className="stat-card">
                <div className="stat-label">
                  <FiTrendingUp />
                  <span>P95 Duration</span>
                </div>
                <p className="stat-value">
                  {formatDuration(stats.traces?.p95_duration_ms || 0)}
                </p>
              </div>
              
              <div className="stat-card">
                <div className="stat-label">
                  <FiTrendingUp />
                  <span>P99 Duration</span>
                </div>
                <p className="stat-value">
                  {formatDuration(stats.traces?.p99_duration_ms || 0)}
                </p>
              </div>
            </div>

            {/* Traces by Service */}
            {stats.traces?.by_service && stats.traces.by_service.length > 0 && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                <h4 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  Traces by Service
                </h4>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Traces</th>
                      <th>Spans</th>
                      <th>Error Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.traces.by_service.map((service, idx) => (
                      <tr key={idx}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                            <FiServer style={{ color: 'var(--color-primary)' }} />
                            {service.service}
                          </div>
                        </td>
                        <td>{formatNumber(service.traces)}</td>
                        <td>{formatNumber(service.spans)}</td>
                        <td>{service.error_rate?.toFixed(2) || '0.00'}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Agent Stats Section */}
          <div className="stats-section">
            <div className="stats-section-header">
              <FiServer className="section-icon" />
              <h3>Agent Statistics</h3>
              <HelpIcon text="Internal agent metrics including queue size, message processing, and dropped messages" position="right" />
            </div>
            
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">
                  <FiActivity />
                  <span>Queue Size</span>
                </div>
                <p className="stat-value">
                  {formatNumber(stats.agent?.queue_size || 0)}
                </p>
              </div>
              
              <div className="stat-card">
                <div className="stat-label">
                  <FiTrendingUp />
                  <span>Incoming Messages</span>
                </div>
                <p className="stat-value">
                  {formatNumber(stats.agent?.incoming_total || 0)}
                </p>
              </div>
              
              <div className="stat-card">
                <div className="stat-label">
                  <FiAlertCircle />
                  <span>Dropped Messages</span>
                </div>
                <p className="stat-value">
                  {formatNumber(stats.agent?.dropped_total || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Database Size Section */}
          <div className="stats-section">
            <div className="stats-section-header">
              <FiDatabase className="section-icon" />
              <h3>Database Size</h3>
              <HelpIcon text="ClickHouse database storage usage and table sizes" position="right" />
            </div>
            
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">
                  <FiHardDrive />
                  <span>Total Size</span>
                </div>
                <p className="stat-value">
                  {stats.database?.total_size_readable || '0 B'}
                </p>
              </div>
            </div>

            {/* Tables */}
            {stats.database?.tables && stats.database.tables.length > 0 && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                <h4 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  Table Sizes
                </h4>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Size</th>
                      <th>Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.database.tables.map((table, idx) => (
                      <tr key={idx}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                            <FiDatabase style={{ color: 'var(--color-primary)' }} />
                            {table.name}
                          </div>
                        </td>
                        <td>{table.size_readable || '0 B'}</td>
                        <td>{formatNumber(table.rows)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Stats
