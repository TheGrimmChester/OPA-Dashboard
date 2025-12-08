import React, { useState, useEffect } from 'react'
import { FiGlobe, FiRefreshCw, FiAlertCircle } from 'react-icons/fi'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import axios from 'axios'
import HelpIcon from './HelpIcon'
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
            <LineChart data={networkData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="bytesSent" stroke="#8884d8" name="Bytes Sent" />
              <Line type="monotone" dataKey="bytesReceived" stroke="#82ca9d" name="Bytes Received" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="chart-container">
          <h3>Latency <HelpIcon text="Network latency (response time) in milliseconds. Lower values indicate better network performance." position="right" /></h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={networkData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="latency" stroke="#ff7300" name="Latency (ms)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
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

