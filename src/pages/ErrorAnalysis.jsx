import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { FiAlertCircle, FiRefreshCw, FiArrowLeft, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { errorService } from '../services/errorApi'
import StackTraceViewer from '../components/StackTraceViewer'
import ShareButton from '../components/ShareButton'
import LoadingSpinner from '../components/LoadingSpinner'
import TimeRangePicker from '../components/TimeRangePicker'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './ErrorAnalysis.css'

function ErrorAnalysis() {
  const { errorId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [errors, setErrors] = useState([])
  const [errorDetail, setErrorDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [total, setTotal] = useState(0)
  const limitParam = searchParams.get('limit')
  const offsetParam = searchParams.get('offset')
  const [limit, setLimit] = useState(limitParam ? parseInt(limitParam, 10) : 50)
  const [offset, setOffset] = useState(offsetParam ? parseInt(offsetParam, 10) : 0)
  const [service, setService] = useState(searchParams.get('service') || '')
  const [timeRange, setTimeRange] = useState(searchParams.get('timeRange') || '24h')

  const getTimeRangeParams = () => {
    const now = new Date()
    let from, to
    to = now.toISOString().slice(0, 19).replace('T', ' ')
    
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
    
    return { from, to }
  }

  const fetchErrors = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    
    try {
      const { from, to } = getTimeRangeParams()
      const params = {
        from,
        to,
        limit,
        offset,
      }
      
      if (service) params.service = service
      
      const data = await errorService.listErrors(params)
      setErrors(data.errors || [])
      setTotal(data.total || data.errors?.length || 0)
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching errors')
      console.error('Fetch errors error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [service, timeRange, limit, offset])

  const fetchErrorDetail = useCallback(async () => {
    if (!errorId) return
    
    setLoading(true)
    setError(null)
    
    try {
      const data = await errorService.getErrorDetails(errorId)
      setErrorDetail(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching error details')
      console.error('Fetch error detail error:', err)
    } finally {
      setLoading(false)
    }
  }, [errorId])

  useEffect(() => {
    if (errorId) {
      fetchErrorDetail()
    } else {
      fetchErrors()
    }
  }, [errorId, fetchErrorDetail, fetchErrors])

  useEffect(() => {
    if (!errorId) {
      setOffset(0)
    }
  }, [service, timeRange, errorId])

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (service) params.set('service', service)
    else params.delete('service')
    
    if (timeRange && timeRange !== '24h') params.set('timeRange', timeRange)
    else params.delete('timeRange')
    
    if (limit !== 50) params.set('limit', limit.toString())
    else params.delete('limit')
    
    if (offset !== 0) params.set('offset', offset.toString())
    else params.delete('offset')
    
    setSearchParams(params, { replace: true })
  }, [service, timeRange, limit, offset, searchParams, setSearchParams])

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleString()
    } catch {
      return dateStr
    }
  }

  const handleTraceClick = (traceId) => {
    navigate(`/traces/${traceId}`)
  }

  if (loading && !errors.length && !errorDetail) {
    return <LoadingSpinner message="Loading errors..." />
  }

  // Error detail view
  if (errorId && errorDetail) {
    return (
      <div className="error-analysis">
        <div className="error-analysis-header">
          <Link to="/errors" className="back-link">← Back to Errors</Link>
          <h1>Error Details</h1>
          <ShareButton />
        </div>

        <div className="error-detail">
          <div className="error-info">
            <h2>{errorDetail.error_message || errorDetail.message || 'Unknown Error'}</h2>
            <div className="error-meta">
              <div className="meta-item">
                <strong>Error ID:</strong> {errorId}
              </div>
              <div className="meta-item">
                <strong>Service:</strong> {errorDetail.service || 'N/A'}
              </div>
              <div className="meta-item">
                <strong>Count:</strong> {errorDetail.count?.toLocaleString() || 0}
              </div>
              <div className="meta-item">
                <strong>First Seen:</strong> {formatDate(errorDetail.first_seen)}
              </div>
              <div className="meta-item">
                <strong>Last Seen:</strong> {formatDate(errorDetail.last_seen)}
              </div>
            </div>
          </div>

          {errorDetail.stack_trace && (
            <div className="error-stack">
              <h3>Stack Trace</h3>
              <StackTraceViewer stack={errorDetail.stack_trace} />
            </div>
          )}

          {errorDetail.related_traces && errorDetail.related_traces.length > 0 && (
            <div className="related-traces">
              <h3>Related Traces</h3>
              <div className="traces-list">
                {errorDetail.related_traces.map((trace, idx) => (
                  <div
                    key={idx}
                    className="trace-item"
                    onClick={() => handleTraceClick(trace.trace_id)}
                  >
                    <div className="trace-id">{trace.trace_id}</div>
                    <div className="trace-time">{formatDate(trace.start_ts)}</div>
                    <div className="trace-duration">{trace.duration_ms?.toFixed(2)}ms</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errorDetail.trends && errorDetail.trends.length > 0 && (
            <div className="error-trends">
              <h3>Error Frequency Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={errorDetail.trends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#dc3545" name="Error Count" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Error list view
  return (
    <div className="error-analysis">
      <div className="error-analysis-header">
        <h1>Error Analysis</h1>
        <ShareButton />
      </div>

      <div className="error-analysis-filters">
        <div className="filter-group">
          <label>Service:</label>
          <input
            type="text"
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="Filter by service"
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label>Time Range:</label>
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
        </div>
        {refreshing && <span className="refresh-indicator">🔄 Refreshing...</span>}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="errors-list">
        <div className="errors-header">
          <h2>Errors</h2>
          <div className="errors-info">
            Showing {errors.length} of {total} error{total !== 1 ? 's' : ''}
            {total > 0 && (
              <span className="page-range">
                {' '}({offset + 1}-{Math.min(offset + errors.length, total)})
              </span>
            )}
          </div>
        </div>
        {errors.length === 0 && !loading ? (
          <div className="empty-state">No errors found</div>
        ) : (
          <>
            <div className="errors-table-container">
              <table className="errors-table">
                <thead>
                  <tr>
                    <th>Error Message</th>
                    <th>Service</th>
                    <th>Count</th>
                    <th>First Seen</th>
                    <th>Last Seen</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((err, idx) => (
                    <tr key={idx}>
                      <td className="error-message-cell">
                        <div className="error-message-preview">
                          {err.error_message || err.message || 'Unknown Error'}
                        </div>
                      </td>
                      <td>{err.service || 'N/A'}</td>
                      <td>{err.count?.toLocaleString() || 0}</td>
                      <td>{formatDate(err.first_seen)}</td>
                      <td>{formatDate(err.last_seen)}</td>
                      <td>
                        <button
                          className="view-details-btn"
                          onClick={() => navigate(`/errors/${encodeURIComponent(err.error_id || err.id || idx)}`)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > limit && (
              <div className="pagination">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0 || loading}
                >
                  <FiChevronLeft />
                  <span>Previous</span>
                </button>
                <span className="page-info">
                  Page {total > 0 ? Math.floor(offset / limit) + 1 : 0} of {total > 0 ? Math.ceil(total / limit) : 0}
                </span>
                <button 
                  className="btn btn-secondary"
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total || loading}
                >
                  <span>Next</span>
                  <FiChevronRight />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ErrorAnalysis

