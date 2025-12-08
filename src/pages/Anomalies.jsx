import React, { useState, useEffect } from 'react'
import { FiAlertTriangle, FiRefreshCw, FiFilter } from 'react-icons/fi'
import axios from 'axios'
import './Anomalies.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function Anomalies() {
  const [anomalies, setAnomalies] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    service: '',
    severity: '',
  })

  useEffect(() => {
    fetchAnomalies()
  }, [filters])

  const fetchAnomalies = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.service) params.append('service', filters.service)
      if (filters.severity) params.append('severity', filters.severity)
      
      const response = await axios.get(`${API_URL}/api/anomalies?${params.toString()}`)
      setAnomalies(response.data.anomalies || [])
    } catch (err) {
      console.error('Error fetching anomalies:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyze = async (service) => {
    try {
      await axios.post(`${API_URL}/api/anomalies/analyze`, {
        service: service || '',
        time_window: '24h',
      })
      fetchAnomalies()
    } catch (err) {
      console.error('Error analyzing:', err)
      alert('Failed to analyze anomalies')
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return '#c62828'
      case 'high':
        return '#f57c00'
      case 'medium':
        return '#fbc02d'
      case 'low':
        return '#388e3c'
      default:
        return '#757575'
    }
  }

  if (loading && anomalies.length === 0) {
    return <div className="Anomalies">Loading anomalies...</div>
  }

  return (
    <div className="Anomalies">
      <div className="anomalies-header">
        <div className="header-title">
          <FiAlertTriangle className="header-icon" />
          <h2>Anomaly Detection</h2>
          {!loading && (
            <span className="anomalies-count">
              ({anomalies.length} anomal{anomalies.length !== 1 ? 'ies' : 'y'})
            </span>
          )}
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => handleAnalyze()}
        >
          <FiRefreshCw /> Analyze All Services
        </button>
      </div>

      <div className="anomalies-filters">
        <div className="filter-group">
          <label>Service</label>
          <input
            type="text"
            value={filters.service}
            onChange={(e) => setFilters({ ...filters, service: e.target.value })}
            placeholder="Filter by service"
          />
        </div>
        <div className="filter-group">
          <label>Severity</label>
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
          >
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div className="anomalies-list">
        {anomalies.length === 0 ? (
          <div className="empty-state">
            <FiAlertTriangle className="empty-icon" />
            <p>No anomalies detected</p>
            <button 
              className="btn btn-primary"
              onClick={() => handleAnalyze()}
            >
              Run Analysis
            </button>
          </div>
        ) : (
          anomalies.map(anomaly => (
            <div key={anomaly.id} className="anomaly-card">
              <div className="anomaly-header">
                <div className="anomaly-severity" style={{ borderLeftColor: getSeverityColor(anomaly.severity) }}>
                  <span className="severity-badge" style={{ backgroundColor: getSeverityColor(anomaly.severity) }}>
                    {anomaly.severity}
                  </span>
                  <div>
                    <h3>{anomaly.service} - {anomaly.metric}</h3>
                    <p className="anomaly-type">Type: {anomaly.type}</p>
                  </div>
                </div>
                <div className="anomaly-score">
                  <div className="score-value">{(anomaly.score * 100).toFixed(1)}%</div>
                  <div className="score-label">Anomaly Score</div>
                </div>
              </div>
              
              <div className="anomaly-details">
                <div className="detail-item">
                  <strong>Value:</strong> {anomaly.value.toFixed(2)}
                </div>
                <div className="detail-item">
                  <strong>Expected:</strong> {anomaly.expected.toFixed(2)}
                </div>
                <div className="detail-item">
                  <strong>Deviation:</strong> {((anomaly.value - anomaly.expected) / anomaly.expected * 100).toFixed(1)}%
                </div>
                <div className="detail-item">
                  <strong>Detected:</strong> {new Date(anomaly.detected_at).toLocaleString()}
                </div>
              </div>

              {anomaly.metadata && (
                <div className="anomaly-metadata">
                  <details>
                    <summary>Metadata</summary>
                    <pre>{JSON.stringify(anomaly.metadata, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Anomalies

