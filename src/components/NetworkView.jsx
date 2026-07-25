import React, { useState, useEffect } from 'react'
import { FiGlobe, FiRefreshCw, FiAlertCircle } from 'react-icons/fi'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import axios from 'axios'
import HelpIcon from './HelpIcon'
import {
  gridProps,
  axisProps,
  axisLabel,
  tooltipProps,
  legendProps,
  semanticColors,
  gradientId,
  VIZ_V2_ENABLED,
} from '../utils/chartTheme'
import './NetworkView.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function NetworkView({ autoRefresh = true }) {
  const [networkData, setNetworkData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchNetworkMetrics()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      fetchNetworkMetrics()
    }, 5000) // Refresh every 5s
    
    return () => clearInterval(interval)
  }, [autoRefresh])

  const fetchNetworkMetrics = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const response = await axios.get(`${API_URL}/api/metrics/network`)
      const metrics = response.data.metrics || []
      setNetworkData(metrics.map(m => ({
        time: m.time,
        bytesSent: m.bytes_sent || 0,
        bytesReceived: m.bytes_received || 0,
        latency: m.avg_latency || 0,
        requestCount: m.request_count || 0,
      })))
    } catch (err) {
      setError('Error fetching network metrics')
      console.error('Network metrics error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const formatBytes = (bytes) => {
    const b = Number(bytes) || 0
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  return (
    <div className="NetworkView">
      <div className="network-header">
        <div className="header-title-section">
          <FiGlobe className="header-icon" />
          <h2>Network Metrics</h2>
          <HelpIcon text="Monitor network traffic, latency, and bandwidth usage across all services. Track bytes sent/received and network performance over time." position="right" />
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
      
      {loading && networkData.length === 0 && <div className="loading">Loading network metrics...</div>}
      
      <div className="network-charts">
        <div className="chart-container">
          <h3>Bytes Transferred <HelpIcon text="Total bytes sent and received over the network. Track bandwidth usage over time." position="right" /></h3>
          <ResponsiveContainer width="100%" height={300}>
            {VIZ_V2_ENABLED ? (
              /* Bandwidth volume -> stacked filled Areas */
              <AreaChart data={networkData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <defs>
                  <linearGradient id={gradientId('bytesSent')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={semanticColors.bytesSent} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={semanticColors.bytesSent} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id={gradientId('bytesReceived')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={semanticColors.bytesReceived} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={semanticColors.bytesReceived} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="time" />
                <YAxis {...axisProps} tickFormatter={formatBytes} width={80} />
                <Tooltip
                  {...tooltipProps}
                  formatter={(value, name) => [formatBytes(value), name]}
                />
                <Legend {...legendProps} />
                <Area
                  type="monotone"
                  dataKey="bytesSent"
                  stackId="bytes"
                  stroke={semanticColors.bytesSent}
                  strokeWidth={2}
                  fill={`url(#${gradientId('bytesSent')})`}
                  name="Bytes Sent"
                />
                <Area
                  type="monotone"
                  dataKey="bytesReceived"
                  stackId="bytes"
                  stroke={semanticColors.bytesReceived}
                  strokeWidth={2}
                  fill={`url(#${gradientId('bytesReceived')})`}
                  name="Bytes Received"
                />
              </AreaChart>
            ) : (
              <LineChart data={networkData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="bytesSent" stroke="#8884d8" name="Bytes Sent" />
                <Line type="monotone" dataKey="bytesReceived" stroke="#82ca9d" name="Bytes Received" />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Latency <HelpIcon text="Network latency (response time) in milliseconds. Lower values indicate better network performance." position="right" /></h3>
          <ResponsiveContainer width="100%" height={300}>
            {VIZ_V2_ENABLED ? (
              /* Latency -> Line */
              <LineChart data={networkData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="time" />
                <YAxis {...axisProps} unit=" ms" label={axisLabel('Latency (ms)')} width={80} />
                <Tooltip
                  {...tooltipProps}
                  formatter={(value) => [`${Number(value).toFixed(2)} ms`, 'Latency']}
                />
                <Legend {...legendProps} />
                <Line type="monotone" dataKey="latency" stroke={semanticColors.latency} strokeWidth={2} dot={false} name="Latency (ms)" />
              </LineChart>
            ) : (
              <LineChart data={networkData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="latency" stroke="#ff7300" name="Latency (ms)" />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {VIZ_V2_ENABLED && (
          <div className="chart-container">
            <h3>Request Count <HelpIcon text="Number of network requests observed in each interval." position="right" /></h3>
            <ResponsiveContainer width="100%" height={300}>
              {/* Discrete counts -> Bar */}
              <BarChart data={networkData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="time" />
                <YAxis {...axisProps} allowDecimals={false} label={axisLabel('Requests')} width={70} />
                <Tooltip
                  {...tooltipProps}
                  formatter={(value) => [`${Number(value).toLocaleString()}`, 'Requests']}
                />
                <Legend {...legendProps} />
                <Bar dataKey="requestCount" fill={semanticColors.requests} name="Requests" radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      
      <div className="network-stats">
        <div className="stat-card">
          <div className="stat-label">Total Bytes Sent <HelpIcon text="Cumulative total of all bytes sent over the network" position="right" /></div>
          <div className="stat-value">
            {networkData.reduce((sum, d) => sum + d.bytesSent, 0).toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Bytes Received <HelpIcon text="Cumulative total of all bytes received over the network" position="right" /></div>
          <div className="stat-value">
            {networkData.reduce((sum, d) => sum + d.bytesReceived, 0).toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Average Latency <HelpIcon text="Average network response time across all requests" position="right" /></div>
          <div className="stat-value">
            {networkData.length > 0
              ? (networkData.reduce((sum, d) => sum + d.latency, 0) / networkData.length).toFixed(2)
              : 0}ms
          </div>
        </div>
      </div>
    </div>
  )
}

export default NetworkView

