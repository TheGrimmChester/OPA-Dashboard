import React, { useState, useEffect } from 'react'
import { FiGlobe, FiTrendingUp, FiClock, FiAlertCircle } from 'react-icons/fi'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import HelpIcon from './HelpIcon'
import './RumDashboard.css'

const RumDashboard = () => {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('24h')

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [timeRange])

  const fetchMetrics = async () => {
    try {
      const response = await axios.get('/api/rum/metrics', {
        params: {
          from: getTimeFrom(timeRange)
        }
      })
      setMetrics(response.data)
    } catch (error) {
      console.error('Failed to fetch RUM metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  const getTimeFrom = (range) => {
    const now = new Date()
    switch (range) {
      case '1h':
        return new Date(now - 60 * 60 * 1000).toISOString()
      case '6h':
        return new Date(now - 6 * 60 * 60 * 1000).toISOString()
      case '24h':
        return new Date(now - 24 * 60 * 60 * 1000).toISOString()
      case '7d':
        return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
      default:
        return new Date(now - 24 * 60 * 60 * 1000).toISOString()
    }
  }

  if (loading) {
    return <div className="rum-dashboard-loading">Loading RUM metrics...</div>
  }

  if (!metrics) {
    return <div className="rum-dashboard-empty">No RUM data available</div>
  }

  return (
    <div className="rum-dashboard">
      <div className="rum-dashboard-header">
        <h2><FiGlobe /> Real User Monitoring <HelpIcon text="Real User Monitoring (RUM) tracks actual user experience metrics from browser sessions. Monitor page load times, DOM ready times, and user interactions." position="right" /></h2>
        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
          <option value="1h">Last Hour</option>
          <option value="6h">Last 6 Hours</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
        </select>
      </div>

      <div className="rum-metrics-grid">
        <div className="rum-metric-card">
          <div className="rum-metric-label">Page Load Time</div>
          <div className="rum-metric-value">
            {metrics.avg_page_load_time ? `${metrics.avg_page_load_time.toFixed(0)}ms` : 'N/A'}
          </div>
          <div className="rum-metric-trend">
            <FiTrendingUp /> Average
          </div>
        </div>

        <div className="rum-metric-card">
          <div className="rum-metric-label">DOM Ready Time</div>
          <div className="rum-metric-value">
            {metrics.avg_dom_ready_time ? `${metrics.avg_dom_ready_time.toFixed(0)}ms` : 'N/A'}
          </div>
          <div className="rum-metric-trend">
            <FiClock /> Average
          </div>
        </div>

        <div className="rum-metric-card">
          <div className="rum-metric-label">Page Views</div>
          <div className="rum-metric-value">
            {metrics.total_page_views || 0}
          </div>
          <div className="rum-metric-trend">
            <FiGlobe /> Total
          </div>
        </div>

        <div className="rum-metric-card">
          <div className="rum-metric-label">JavaScript Errors</div>
          <div className="rum-metric-value error">
            {metrics.total_errors || 0}
          </div>
          <div className="rum-metric-trend">
            <FiAlertCircle /> Total
          </div>
        </div>
      </div>

      {metrics.timeline && metrics.timeline.length > 0 && (
        <div className="rum-chart-container">
          <h3>Page Load Time Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="avg_load_time" stroke="#8884d8" name="Avg Load Time (ms)" />
              <Line type="monotone" dataKey="p95_load_time" stroke="#82ca9d" name="P95 Load Time (ms)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default RumDashboard

