import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiAlertTriangle, FiRefreshCw, FiFilter } from 'react-icons/fi'
import axios from 'axios'
import FilterBuilder from '../components/FilterBuilder'
import TimeRangePicker from '../components/TimeRangePicker'
import './Anomalies.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function Anomalies() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [anomalies, setAnomalies] = useState([])
  const [loading, setLoading] = useState(true)
  const filterQuery = searchParams.get('filter') || ''
  const [filter, setFilter] = useState(filterQuery)
  const [timeRange, setTimeRange] = useState(searchParams.get('timeRange') || '24h')

  const getTimeRangeParams = () => {
    const now = new Date()
    let from
    
    switch (timeRange) {
      case '1h':
        from = new Date(now.getTime() - 3600000).toISOString().slice(0, 19).replace('T', ' ')
        break
      case '6h':
        from = new Date(now.getTime() - 21600000).toISOString().slice(0, 19).replace('T', ' ')
        break
      case '24h':
        from = new Date(now.getTime() - 86400000).toISOString().slice(0, 19).replace('T', ' ')
        break
      case '7d':
        from = new Date(now.getTime() - 604800000).toISOString().slice(0, 19).replace('T', ' ')
        break
      case '30d':
        from = new Date(now.getTime() - 2592000000).toISOString().slice(0, 19).replace('T', ' ')
        break
      default:
        from = new Date(now.getTime() - 86400000).toISOString().slice(0, 19).replace('T', ' ')
    }
    
    return { from }
  }

  useEffect(() => {
    fetchAnomalies()
  }, [filter, timeRange])

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (filter) params.set('filter', filter)
    else params.delete('filter')
    
    if (timeRange && timeRange !== '24h') params.set('timeRange', timeRange)
    else params.delete('timeRange')
    
    setSearchParams(params, { replace: true })
  }, [filter, timeRange, searchParams, setSearchParams])

  const fetchAnomalies = async () => {
    setLoading(true)
    try {
      const { from } = getTimeRangeParams()
      const params = new URLSearchParams()
      
      if (filter) {
        params.append('filter', filter)
      }
      if (from) {
        params.append('from', from)
      }
      
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
          <label>Time Range:</label>
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
        </div>
        <div className="filter-group filter-group-full">
          <label>Filter:</label>
          <FilterBuilder
            value={filter}
            onChange={setFilter}
            placeholder="e.g., service:api, severity:critical, (service:api AND severity:high)"
          />
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

