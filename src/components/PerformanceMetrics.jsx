import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiTrendingUp, FiRefreshCw, FiAlertCircle } from 'react-icons/fi'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import HelpIcon from './HelpIcon'
import './PerformanceMetrics.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function PerformanceMetrics({ autoRefresh = true }) {
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [timeRange, setTimeRange] = useState(searchParams.get('timeRange') || '24h')

  const fetchMetrics = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    
    try {
      const params = new URLSearchParams()
      if (timeRange === '1h') {
        params.append('from', new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' '))
        params.append('interval', '5 MINUTE')
      } else if (timeRange === '6h') {
        params.append('from', new Date(Date.now() - 21600000).toISOString().slice(0, 19).replace('T', ' '))
        params.append('interval', '30 MINUTE')
      } else {
        params.append('from', new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace('T', ' '))
        params.append('interval', '1 HOUR')
      }
      
      const response = await axios.get(`${API_URL}/api/metrics/performance?${params}`)
      setMetrics(response.data.metrics || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching performance metrics')
      console.error('Fetch performance metrics error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [timeRange])

  useEffect(() => {
    setLoading(true)
    fetchMetrics()
  }, [fetchMetrics])

  // Sync timeRange to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (timeRange && timeRange !== '24h') params.set('timeRange', timeRange)
    else params.delete('timeRange')
    
    setSearchParams(params, { replace: true })
  }, [timeRange, searchParams, setSearchParams])

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      fetchMetrics()
    }, 5000)
    
    return () => clearInterval(interval)
  }, [autoRefresh, fetchMetrics])

  const formatTime = (timeStr) => {
    try {
      const date = new Date(timeStr)
      if (timeRange === '1h') {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      }
      return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return timeStr
    }
  }

  return (
    <div className="PerformanceMetrics">
      <div className="metrics-header">
        <div className="header-title-section">
          <FiTrendingUp className="header-icon" />
          <h2>Performance Metrics</h2>
          <HelpIcon text="Monitor performance metrics over time with percentile analysis. Track duration percentiles, throughput, and error rates." position="right" />
        </div>
        <div className="metrics-controls">
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className="time-range-select"
            title="Select time range for metrics"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
          </select>
          {refreshing && <span className="refresh-indicator">🔄</span>}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && metrics.length === 0 ? (
        <div className="loading">Loading performance metrics...</div>
      ) : (
        <>
          <div className="metrics-charts">
            <div className="chart-container">
              <h3>Duration Percentiles <HelpIcon text="P50: 50% of requests complete within this time (median). P95: 95% of requests complete within this time. P99: 99% of requests complete within this time." position="right" /></h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={formatTime}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={formatTime}
                    formatter={(value) => `${value.toFixed(2)}ms`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="p50_duration" stroke="#8884d8" name="P50" />
                  <Line type="monotone" dataKey="p95_duration" stroke="#82ca9d" name="P95" />
                  <Line type="monotone" dataKey="p99_duration" stroke="#ff7300" name="P99" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-container">
              <h3>Throughput <HelpIcon text="Number of traces processed per second. Higher values indicate better system performance." position="right" /></h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={formatTime}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={formatTime}
                    formatter={(value) => value.toLocaleString()}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="throughput" stroke="#8884d8" name="Traces/sec" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-container">
              <h3>Error Rate <HelpIcon text="Percentage of traces that resulted in errors. Lower values indicate better system reliability." position="right" /></h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={formatTime}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={formatTime}
                    formatter={(value) => `${value.toFixed(2)}%`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="error_rate" stroke="#dc3545" name="Error Rate %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default PerformanceMetrics

