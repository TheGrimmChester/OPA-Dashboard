import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { 
  FiActivity, 
  FiRefreshCw, 
  FiTrash2, 
  FiClock, 
  FiServer, 
  FiCheckCircle, 
  FiAlertCircle,
  FiChevronLeft,
  FiChevronRight,
  FiArrowUp,
  FiArrowDown,
  FiExternalLink,
  FiShuffle
} from 'react-icons/fi'
import axios from 'axios'
import { format } from 'date-fns'
import { traceApi } from '../services/api'
import HelpIcon from './HelpIcon'
import './TraceList.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function TraceList({ onTraceSelect, filters, autoRefresh = true }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [traces, setTraces] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [total, setTotal] = useState(0)
  const limitParam = searchParams.get('limit')
  const offsetParam = searchParams.get('offset')
  const sortByParam = searchParams.get('sortBy')
  const sortOrderParam = searchParams.get('sortOrder')
  
  const [limit, setLimit] = useState(limitParam ? parseInt(limitParam, 10) : 50)
  const [offset, setOffset] = useState(offsetParam ? parseInt(offsetParam, 10) : 0)
  const [sortBy, setSortBy] = useState(sortByParam || 'time')
  const [sortOrder, setSortOrder] = useState(sortOrderParam || 'desc')
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTraces, setSelectedTraces] = useState(new Set())
  const [deleting, setDeleting] = useState(false)

  const handleTraceClick = (trace, e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (onTraceSelect) {
      onTraceSelect(trace)
    }
    navigate(`/traces/${trace.trace_id}`)
  }

  const fetchTraces = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        sort: sortBy,
        order: sortOrder,
      })
      
      if (filters?.service) params.append('service', filters.service)
      if (filters?.status) params.append('status', filters.status)
      if (filters?.from) params.append('from', filters.from)
      if (filters?.to) params.append('to', filters.to)
      if (filters?.min_duration) params.append('min_duration', filters.min_duration)
      if (filters?.max_duration) params.append('max_duration', filters.max_duration)
      
      // Ensure no trailing slash in API_URL
      const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL
      const response = await axios.get(`${baseUrl}/api/traces?${params}`)
      const traces = response.data.traces || []
      setTraces(traces)
      // Use traces.length as fallback if total is 0 or missing but we have traces
      const apiTotal = response.data.total || 0
      setTotal(apiTotal > 0 ? apiTotal : (traces.length > 0 ? traces.length : 0))
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching traces')
      console.error('Fetch traces error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [limit, offset, sortBy, sortOrder, filters])

  // Sync pagination and sorting to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (limit !== 50) params.set('limit', limit.toString())
    else params.delete('limit')
    
    if (offset !== 0) params.set('offset', offset.toString())
    else params.delete('offset')
    
    if (sortBy !== 'time') params.set('sortBy', sortBy)
    else params.delete('sortBy')
    
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder)
    else params.delete('sortOrder')
    
    setSearchParams(params, { replace: true })
  }, [limit, offset, sortBy, sortOrder, searchParams, setSearchParams])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [filters?.service, filters?.status, filters?.from, filters?.min_duration, filters?.max_duration])

  useEffect(() => {
    setLoading(true)
    fetchTraces()
  }, [fetchTraces])

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      fetchTraces()
    }, 5000) // 5 seconds
    
    return () => clearInterval(interval)
  }, [autoRefresh, fetchTraces])

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
    setOffset(0)
  }

  const handlePageChange = (newOffset) => {
    setOffset(newOffset)
  }

  const getStatusBadge = (status) => {
    const isError = status === 'error' || status === '0'
    return (
      <span className={`status-badge ${isError ? 'error' : 'ok'}`}>
        {isError ? (
          <>
            <FiAlertCircle className="status-icon" />
            Error
          </>
        ) : (
          <>
            <FiCheckCircle className="status-icon" />
            OK
          </>
        )}
      </span>
    )
  }

  const formatDuration = (ms) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr)
      return format(date, 'yyyy-MM-dd HH:mm:ss.SSS')
    } catch {
      return dateStr
    }
  }

  const handleDelete = async (traceId, e) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm('Are you sure you want to delete this trace? This action cannot be undone.')) {
      return
    }

    try {
      setDeleting(true)
      await traceApi.deleteTrace(traceId)
      
      // Remove from selected if it was selected
      const newSelected = new Set(selectedTraces)
      newSelected.delete(traceId)
      setSelectedTraces(newSelected)
      
      // Reload traces
      await fetchTraces()
    } catch (err) {
      alert('Failed to delete trace: ' + (err.response?.data?.error || err.message || 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedTraces.size === 0) return

    const count = selectedTraces.size
    const message = count === 1
      ? 'Are you sure you want to delete this trace? This action cannot be undone.'
      : `Are you sure you want to delete ${count} traces? This action cannot be undone.`

    if (!confirm(message)) {
      return
    }

    const traceIds = Array.from(selectedTraces)
    
    try {
      setDeleting(true)
      const result = await traceApi.deleteTraces(traceIds)
      
      // Clear selection
      setSelectedTraces(new Set())
      
      if (result.failed_count > 0) {
        const failedMessages = result.failed.map(f => `  • ${f.id}: ${f.error}`).join('\n')
        alert(
          `Deleted ${result.deleted_count} trace(s), but ${result.failed_count} failed:\n${failedMessages}`
        )
        // Reload traces even if some failed
        await fetchTraces()
      } else {
        // All succeeded - reload traces
        await fetchTraces()
      }
    } catch (err) {
      alert('Failed to delete traces: ' + (err.response?.data?.error || err.message || 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTraces(new Set(traces.map(t => t.trace_id)))
    } else {
      setSelectedTraces(new Set())
    }
  }

  const handleSelectTrace = (traceId, e) => {
    e.stopPropagation()
    const newSelected = new Set(selectedTraces)
    if (newSelected.has(traceId)) {
      newSelected.delete(traceId)
    } else {
      newSelected.add(traceId)
    }
    setSelectedTraces(newSelected)
  }

  const handleCompare = () => {
    if (selectedTraces.size === 2) {
      const traceIds = Array.from(selectedTraces)
      navigate('/compare', {
        state: {
          trace1Id: traceIds[0],
          trace2Id: traceIds[1]
        }
      })
    }
  }

  return (
    <div className="TraceList">
      <div className="trace-list-header">
        <div className="trace-list-header-left">
          <div className="header-title-section">
            <FiActivity className="header-icon" />
            <h2>Traces</h2>
            <HelpIcon text="Browse and search through collected traces. Click on a trace to view detailed information, or select multiple traces to compare or delete." position="right" />
          </div>
          {refreshing && (
            <div className="refresh-indicator">
              <FiRefreshCw className="spinning" />
              <span>Refreshing...</span>
            </div>
          )}
          <div className="trace-list-info">
            {total > 0 ? (
              <>
                Showing {traces.length} of {total} trace{total !== 1 ? 's' : ''}
                <span className="page-range">
                  {' '}({offset + 1}-{Math.min(offset + traces.length, total)})
                </span>
              </>
            ) : traces.length > 0 ? (
              <>Showing {traces.length} trace{traces.length !== 1 ? 's' : ''}</>
            ) : (
              <>No traces</>
            )}
          </div>
        </div>
        {selectedTraces.size > 0 && (
          <div className="trace-list-actions">
            {selectedTraces.size === 2 && (
              <button
                onClick={handleCompare}
                className="btn btn-primary compare-selected-button"
                title="Compare two selected traces side by side"
              >
                <FiShuffle />
                <span>Compare Traces</span>
                <HelpIcon text="Compare two selected traces side by side to identify differences" position="right" />
              </button>
            )}
            <button
              onClick={handleBatchDelete}
              className="btn btn-danger delete-selected-button"
              disabled={deleting}
              title="Delete selected traces"
            >
              <FiTrash2 />
              <span>Delete Selected ({selectedTraces.size})</span>
              <HelpIcon text="Permanently delete the selected traces. This action cannot be undone." position="right" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      {loading && traces.length === 0 ? (
        <div className="loading">Loading traces...</div>
      ) : (
        <>
          <div className={`trace-table-container ${refreshing ? 'refreshing' : ''}`}>
            {refreshing && (
              <div className="refresh-overlay active">
                <div className="refresh-overlay-content">
                  <FiRefreshCw className="spinning" />
                  <span>Refreshing...</span>
                </div>
              </div>
            )}
            <table className="trace-table">
              <thead>
                <tr>
                  <th className="trace-checkbox-header">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={selectedTraces.size === traces.length && traces.length > 0}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th onClick={() => handleSort('time')} className="sortable">
                    <div className="th-content">
                      <FiClock className="th-icon" />
                      <span>Start Time</span>
                      <HelpIcon text="When the trace started executing. Click to sort by time." position="right" />
                      {sortBy === 'time' && (
                        sortOrder === 'asc' ? <FiArrowUp className="sort-icon" /> : <FiArrowDown className="sort-icon" />
                      )}
                    </div>
                  </th>
                  <th>
                    <div className="th-content">
                      <FiActivity className="th-icon" />
                      <span>Trace ID</span>
                      <HelpIcon text="Unique identifier for the trace. Click to view trace details." position="right" />
                    </div>
                  </th>
                  <th>
                    <div className="th-content">
                      <FiServer className="th-icon" />
                      <span>Service</span>
                      <HelpIcon text="The service that generated this trace" position="right" />
                    </div>
                  </th>
                  <th onClick={() => handleSort('duration')} className="sortable">
                    <div className="th-content">
                      <FiClock className="th-icon" />
                      <span>Duration</span>
                      <HelpIcon text="Total execution time of the trace. Click to sort by duration." position="right" />
                      {sortBy === 'duration' && (
                        sortOrder === 'asc' ? <FiArrowUp className="sort-icon" /> : <FiArrowDown className="sort-icon" />
                      )}
                    </div>
                  </th>
                  <th>Status <HelpIcon text="Trace status: OK (successful) or Error (failed)" position="right" /></th>
                  <th>Spans <HelpIcon text="Number of individual operations (spans) in this trace" position="right" /></th>
                  <th>Actions <HelpIcon text="Actions available for this trace (delete, etc.)" position="right" /></th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => (
                  <tr 
                    key={trace.trace_id}
                    className={`trace-row smooth-list-item ${selectedTraces.has(trace.trace_id) ? 'trace-row-selected' : ''}`}
                    onClick={(e) => {
                      // Don't navigate if clicking on checkbox or delete button
                      if (e.target.type === 'checkbox' || e.target.closest('button')) {
                        return
                      }
                      handleTraceClick(trace, e)
                    }}
                  >
                    <td className="trace-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={selectedTraces.has(trace.trace_id)}
                        onChange={(e) => handleSelectTrace(trace.trace_id, e)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{formatDate(trace.start_ts)}</td>
                    <td className="trace-id">
                      <Link 
                        to={`/traces/${trace.trace_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="trace-id-link"
                      >
                        <code>{trace.trace_id}</code>
                        <FiExternalLink className="link-icon" />
                      </Link>
                    </td>
                    <td>
                      <div className="service-cell">
                        <FiServer className="service-icon" />
                        <span>{trace.service}</span>
                      </div>
                    </td>
                    <td>
                      <div className="duration-cell">
                        <FiClock className="duration-icon" />
                        <span>{formatDuration(trace.duration_ms)}</span>
                      </div>
                    </td>
                    <td>{getStatusBadge(trace.status)}</td>
                    <td>
                      <div className="spans-cell">
                        <FiActivity className="spans-icon" />
                        <span>{trace.span_count}</span>
                      </div>
                    </td>
                    <td className="trace-actions-cell" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleDelete(trace.trace_id, e)}
                        className="btn btn-ghost delete-button"
                        disabled={deleting}
                        title="Delete trace"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {traces.length === 0 && !loading && (
            <div className="empty-state">
              <FiActivity className="empty-icon" />
              <p>No traces found</p>
              <span className="empty-subtitle">Traces will appear here once collected</span>
            </div>
          )}

          <div className="pagination">
            <button 
              className="btn btn-secondary"
              onClick={() => handlePageChange(Math.max(0, offset - limit))}
              disabled={offset === 0 || loading}
            >
              <FiChevronLeft />
              <span>Previous</span>
            </button>
            <span className="page-info">
              {total > 0 ? (
                <>Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)} ({total} total)</>
              ) : traces.length > 0 ? (
                <>Showing all {traces.length} trace{traces.length !== 1 ? 's' : ''}</>
              ) : (
                <>No traces</>
              )}
            </span>
            <button 
              className="btn btn-secondary"
              onClick={() => handlePageChange(offset + limit)}
              disabled={offset + limit >= total || loading}
            >
              <span>Next</span>
              <FiChevronRight />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default TraceList

