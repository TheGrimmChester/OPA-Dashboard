import React, { useState, useEffect } from 'react'
import { FiAlertCircle, FiClock, FiFile, FiCode, FiChevronDown, FiChevronRight } from 'react-icons/fi'
import axios from 'axios'
import HelpIcon from './HelpIcon'
import './ErrorViewer.css'

const ErrorViewer = () => {
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedError, setSelectedError] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  useEffect(() => {
    fetchErrors()
    const interval = setInterval(fetchErrors, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const fetchErrors = async () => {
    try {
      const response = await axios.get('/api/errors', {
        params: {
          limit: 100,
          from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        }
      })
      setErrors(response.data.errors || [])
    } catch (error) {
      console.error('Failed to fetch errors:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleGroup = (groupId) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId)
    } else {
      newExpanded.add(groupId)
    }
    setExpandedGroups(newExpanded)
  }

  const formatTime = (timeStr) => {
    if (!timeStr) return 'N/A'
    return new Date(timeStr).toLocaleString()
  }

  if (loading) {
    return <div className="error-viewer-loading">Loading errors...</div>
  }

  return (
    <div className="error-viewer">
      <div className="error-viewer-header">
        <h2><FiAlertCircle /> Errors <HelpIcon text="View and analyze error occurrences across your services. See error messages, stack traces, and occurrence counts." position="right" /></h2>
        <button onClick={fetchErrors} className="refresh-btn">Refresh</button>
      </div>

      {errors.length === 0 ? (
        <div className="error-viewer-empty">No errors found</div>
      ) : (
        <div className="error-list">
          {errors.map((error, idx) => (
            <div key={idx} className="error-item">
              <div 
                className="error-item-header"
                onClick={() => toggleGroup(error.error_id)}
              >
                {expandedGroups.has(error.error_id) ? (
                  <FiChevronDown className="expand-icon" />
                ) : (
                  <FiChevronRight className="expand-icon" />
                )}
                <div className="error-info">
                  <div className="error-message">{error.error_message || error.name}</div>
                  <div className="error-meta">
                    <span><FiClock /> {formatTime(error.last_seen)}</span>
                    <span className="error-count">{error.count} occurrences</span>
                  </div>
                </div>
              </div>
              
              {expandedGroups.has(error.error_id) && (
                <div className="error-details">
                  <div className="error-detail-row">
                    <strong>Service:</strong> {error.service}
                  </div>
                  <div className="error-detail-row">
                    <strong>First Seen:</strong> {formatTime(error.first_seen)}
                  </div>
                  <div className="error-detail-row">
                    <strong>Last Seen:</strong> {formatTime(error.last_seen)}
                  </div>
                  <div className="error-detail-row">
                    <strong>Occurrences:</strong> {error.count}
                  </div>
                  {error.trace_id && (
                    <div className="error-detail-row">
                      <strong>Trace ID:</strong>{' '}
                      <a href={`/traces/${error.trace_id}`} target="_blank" rel="noopener noreferrer">
                        {error.trace_id}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ErrorViewer

