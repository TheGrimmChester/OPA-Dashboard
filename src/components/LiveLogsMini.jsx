import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { 
  FiFileText, 
  FiServer,
  FiLink,
  FiActivity,
  FiExternalLink,
  FiInfo,
  FiAlertTriangle,
  FiXCircle,
  FiAlertCircle
} from 'react-icons/fi'
import './LiveLogsMini.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function getLevelIcon(level) {
  switch (level?.toLowerCase()) {
    case 'critical':
    case 'crit':
      return <FiXCircle className="log-icon critical" />
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

function getLevelColor(level) {
  switch (level?.toLowerCase()) {
    case 'critical':
    case 'crit':
      return 'critical'
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

function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

function LiveLogsMini({ isPaused, onRefresh }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchLogs = useCallback(async () => {
    if (isPaused) return
    
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams({
        limit: '20',
        all: '1',
      })
      
      const response = await axios.get(`${API_URL}/api/logs?${params}`)
      const fetchedLogs = response.data.logs || []
      
      setLogs(fetchedLogs.slice(0, 20))
    } catch (err) {
      console.error('Error fetching logs:', err)
      setError('Error fetching logs')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [isPaused])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    if (onRefresh) {
      fetchLogs()
    }
  }, [onRefresh, fetchLogs])

  if (loading && logs.length === 0) {
    return (
      <div className="live-logs-mini">
        <div className="mini-header">
          <h3>Live Logs</h3>
          <Link to="/live-logs" className="view-all-link">
            View Full <FiExternalLink />
          </Link>
        </div>
        <div className="mini-content loading">
          <FiFileText className="loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="live-logs-mini">
        <div className="mini-header">
          <h3>Live Logs</h3>
          <Link to="/live-logs" className="view-all-link">
            View Full <FiExternalLink />
          </Link>
        </div>
        <div className="mini-content error">
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="live-logs-mini">
      <div className="mini-header">
        <h3>Live Logs</h3>
        <Link to="/live-logs" className="view-all-link">
          View Full <FiExternalLink />
        </Link>
      </div>
      <div className="mini-content">
        {logs.length === 0 ? (
          <div className="empty-state">
            <FiFileText className="empty-icon" />
            <p>No logs found</p>
          </div>
        ) : (
          <div className="logs-list">
            {logs.map((log) => (
              <div key={log.id} className={`log-entry log-${getLevelColor(log.level)}`}>
                <div className="log-header-mini">
                  <div className="log-level-mini">
                    {getLevelIcon(log.level)}
                    <span className="level-text">{log.level?.toUpperCase() || 'UNKNOWN'}</span>
                  </div>
                  <span className="log-timestamp-mini">{formatTimestamp(log.timestamp)}</span>
                </div>
                <div className="log-service-mini">
                  <FiServer className="icon" />
                  <span>{log.service}</span>
                </div>
                <div className="log-message-mini">{log.message}</div>
                {log.trace_id && (
                  <Link to={`/traces/${log.trace_id}`} className="trace-link-mini">
                    <FiLink className="icon" />
                    View Trace
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveLogsMini
