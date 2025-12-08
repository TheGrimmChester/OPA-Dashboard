import React, { useState, useEffect } from 'react'
import { FiFileText, FiAlertCircle, FiInfo, FiAlertTriangle } from 'react-icons/fi'
import axios from 'axios'
import './LogCorrelation.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function LogCorrelation({ traceId, spanId = null }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, error, warn, info, debug

  useEffect(() => {
    if (traceId) {
      fetchLogs()
    }
  }, [traceId, spanId])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const url = spanId 
        ? `${API_URL}/api/traces/${traceId}/logs?span_id=${spanId}`
        : `${API_URL}/api/traces/${traceId}/logs`
      
      const response = await axios.get(url)
      setLogs(response.data.logs || [])
    } catch (err) {
      console.error('Error fetching logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const getLevelIcon = (level) => {
    switch (level.toLowerCase()) {
      case 'error':
        return <FiAlertCircle className="log-icon error" />
      case 'warn':
      case 'warning':
        return <FiAlertTriangle className="log-icon warn" />
      case 'info':
        return <FiInfo className="log-icon info" />
      default:
        return <FiFileText className="log-icon debug" />
    }
  }

  const getLevelColor = (level) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'error'
      case 'warn':
      case 'warning':
        return 'warn'
      case 'info':
        return 'info'
      default:
        return 'debug'
    }
  }

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true
    return log.level.toLowerCase() === filter.toLowerCase()
  })

  if (loading) {
    return <div className="LogCorrelation">Loading logs...</div>
  }

  return (
    <div className="LogCorrelation">
      <div className="logs-header">
        <div className="header-title">
          <FiFileText className="header-icon" />
          <h3>Correlated Logs ({logs.length})</h3>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="log-filter"
        >
          <option value="all">All Levels</option>
          <option value="error">Error</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="logs-empty">
          <p>No logs found for this trace</p>
        </div>
      ) : (
        <div className="logs-list">
          {filteredLogs.map(log => (
            <div key={log.id} className={`log-entry log-${getLevelColor(log.level)}`}>
              <div className="log-header">
                <div className="log-level">
                  {getLevelIcon(log.level)}
                  <span className="level-text">{log.level.toUpperCase()}</span>
                </div>
                <div className="log-timestamp">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
              <div className="log-message">{log.message}</div>
              {log.fields && Object.keys(log.fields).length > 0 && (
                <details className="log-fields">
                  <summary>Fields</summary>
                  <pre>{JSON.stringify(log.fields, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default LogCorrelation

