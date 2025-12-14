import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiGlobe, FiRefreshCw, FiChevronLeft, FiChevronRight, FiX, FiClock, FiAlertCircle, FiTrendingUp, FiServer, FiArrowUp, FiArrowDown } from 'react-icons/fi'
import { httpService } from '../services/httpApi'
import ShareButton from '../components/ShareButton'
import LoadingSpinner from '../components/LoadingSpinner'
import TimeRangePicker from '../components/TimeRangePicker'
import HelpIcon from '../components/HelpIcon'
import FilterBuilder from '../components/FilterBuilder'
import axios from 'axios'
import './HttpAnalysis.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function HttpAnalysis({ autoRefresh = true }) {
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [httpCalls, setHttpCalls] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [total, setTotal] = useState(0)
  const [totalCalls, setTotalCalls] = useState(0)
  const [selectedCall, setSelectedCall] = useState(null)
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false)
  const limitParam = searchParams.get('limit')
  const offsetParam = searchParams.get('offset')
  const [limit, setLimit] = useState(limitParam ? parseInt(limitParam, 10) : 50)
  const [offset, setOffset] = useState(offsetParam ? parseInt(offsetParam, 10) : 0)
  const [service, setService] = useState(searchParams.get('service') || '')
  const [timeRange, setTimeRange] = useState(searchParams.get('timeRange') || '24h')
  const filterQuery = searchParams.get('filter') || ''
  const [filter, setFilter] = useState(filterQuery)
  const sortByParam = searchParams.get('sortBy')
  const sortOrderParam = searchParams.get('sortOrder')
  const [sortBy, setSortBy] = useState(sortByParam || 'last_created_at')
  const [sortOrder, setSortOrder] = useState(sortOrderParam || 'desc')

  // Fetch available services
  useEffect(() => {
    axios.get(`${API_URL}/api/services`)
      .then(res => {
        const serviceNames = (res.data.services || []).map(s => s.service)
        setServices(serviceNames)
      })
      .catch(err => console.error('Error fetching services:', err))
  }, [])

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

  const fetchHttpCalls = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setError(null)
    
    try {
      const { from, to } = getTimeRangeParams()
      const params = {
        from,
        to,
        limit,
        offset,
        sort: sortBy,
        order: sortOrder,
      }
      
      if (service) params.service = service
      if (filter) params.filter = filter
      
      const data = await httpService.listHttpCalls(params)
      setHttpCalls(data.http_calls || [])
      setTotal(data.total || data.http_calls?.length || 0)
      setTotalCalls(data.total_calls || 0)
    } catch (err) {
      let errorMessage = 'Error fetching HTTP calls'
      if (err.response?.status === 400) {
        errorMessage = err.response?.data?.error || err.response?.data?.message || 'Invalid filter query. Please check your filter syntax.'
        // If it's a filter error, suggest clearing the filter
        if (filter && errorMessage.includes('filter')) {
          errorMessage += ' Try clearing or fixing the filter.'
        }
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error
      } else if (err.message) {
        errorMessage = err.message
      }
      setError(errorMessage)
      console.error('Fetch HTTP calls error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [service, timeRange, limit, offset, filter, sortBy, sortOrder])

  useEffect(() => {
    fetchHttpCalls()
  }, [fetchHttpCalls])

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      fetchHttpCalls(true)
    }, 5000) // Refresh every 5s
    
    return () => clearInterval(interval)
  }, [autoRefresh, fetchHttpCalls])
  
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
    setOffset(0)
  }

  useEffect(() => {
    setOffset(0)
  }, [service, timeRange, filter])

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (service) params.set('service', service)
    else params.delete('service')
    
    if (timeRange && timeRange !== '24h') params.set('timeRange', timeRange)
    else params.delete('timeRange')
    
    if (filter) params.set('filter', filter)
    else params.delete('filter')
    
    if (limit !== 50) params.set('limit', limit.toString())
    else params.delete('limit')
    
    if (offset !== 0) params.set('offset', offset.toString())
    else params.delete('offset')
    
    if (sortBy !== 'last_created_at') params.set('sortBy', sortBy)
    else params.delete('sortBy')
    
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder)
    else params.delete('sortOrder')
    
    setSearchParams(params, { replace: true })
  }, [service, timeRange, filter, limit, offset, sortBy, sortOrder, searchParams, setSearchParams])

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return 'N/A'
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const stripQueryParams = (uriOrUrl) => {
    if (!uriOrUrl) return uriOrUrl
    // Remove query parameters (everything after ?)
    const queryIndex = uriOrUrl.indexOf('?')
    if (queryIndex !== -1) {
      return uriOrUrl.substring(0, queryIndex)
    }
    return uriOrUrl
  }

  const cleanUri = (uri) => {
    if (!uri) return uri
    // Remove /index.php prefix if present
    if (uri.startsWith('/index.php')) {
      return uri.length === 10 ? '/' : uri.substring(10)
    }
    return uri
  }

  const getMethodColor = (method) => {
    const methodUpper = (method || 'GET').toUpperCase()
    switch (methodUpper) {
      case 'GET': return 'method-get'
      case 'POST': return 'method-post'
      case 'PUT': return 'method-put'
      case 'DELETE': return 'method-delete'
      case 'PATCH': return 'method-patch'
      default: return 'method-other'
    }
  }

  if (loading && !httpCalls.length) {
    return <LoadingSpinner message="Loading HTTP requests..." />
  }

  return (
    <div className="http-analysis">
      <div className="http-analysis-header">
        <h1>HTTP Requests <HelpIcon text="Analyze HTTP request performance and execution patterns. View grouped requests by URI and method with metrics like call count, duration, errors, and bandwidth usage." position="right" /></h1>
        <ShareButton />
      </div>

      <div className="http-analysis-filters">
        <div className="filter-group">
          <label>Time Range:</label>
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
        </div>
        <div className="filter-group filter-group-full">
          <label>Filter:</label>
          <FilterBuilder
            value={filter}
            onChange={(newFilter) => {
              setFilter(newFilter)
              // Extract service from filter if present, or remove it if not
              // Match service:value where value can contain word characters, hyphens, dots, etc.
              // The filter parser allows values with hyphens, so we need to match until whitespace or logical operators
              const serviceMatch = newFilter.match(/\bservice:([^\s()]+?)(?:\s+(?:AND|OR|NOT|$)|$)/i) || 
                                   newFilter.match(/\bservice:([^\s()]+)$/i)
              if (serviceMatch && serviceMatch[1]) {
                const newService = serviceMatch[1].trim()
                // Only update if we have a valid service name (not empty, not just operators)
                if (newService && !/^(AND|OR|NOT|>|<|>=|<=|!=|LIKE|IN)$/i.test(newService) && newService !== service) {
                  setService(newService)
                }
              } else if (service && !newFilter.match(/\bservice:/i)) {
                // Service was removed from filter, clear it
                setService('')
              }
            }}
            placeholder="e.g., service:api, status_code:500, (service:api AND http.method:POST)"
          />
        </div>
        {refreshing && <span className="refresh-indicator">🔄 Refreshing...</span>}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="http-calls-list">
        <div className="http-calls-header">
          <div className="http-calls-info">
            {totalCalls > 0 && (
              <span className="total-calls">Total: {totalCalls.toLocaleString()} calls</span>
            )}
            <span className="showing-info">
              {httpCalls.length} of {total} request{total !== 1 ? 's' : ''}
              {total > 0 && (
                <span className="page-range">
                  {' '}({offset + 1}-{Math.min(offset + httpCalls.length, total)})
                </span>
              )}
            </span>
          </div>
        </div>
        {httpCalls.length === 0 && !loading ? (
          <div className="empty-state">No HTTP requests found</div>
        ) : (
          <>
            <div className="http-calls-table-container">
              <table className="http-calls-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Method</th>
                    <th style={{ minWidth: '250px' }}>URI/Endpoint</th>
                    <th onClick={() => handleSort('service')} className="sortable" style={{ width: '120px', textAlign: 'left', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                        <span>Service</span>
                        {sortBy === 'service' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('call_count')} className="sortable" style={{ width: '80px', textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Count</span>
                        {sortBy === 'call_count' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('avg_duration')} className="sortable" style={{ width: '90px', textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Avg</span>
                        {sortBy === 'avg_duration' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th style={{ width: '80px', textAlign: 'right' }}>Min</th>
                    <th style={{ width: '80px', textAlign: 'right' }}>Max</th>
                    <th onClick={() => handleSort('error_count')} className="sortable" style={{ width: '80px', textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Errors</span>
                        {sortBy === 'error_count' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('error_rate')} className="sortable" style={{ width: '80px', textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Rate</span>
                        {sortBy === 'error_rate' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Sent</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Recv</th>
                    <th onClick={() => handleSort('last_created_at')} className="sortable" style={{ width: '120px', textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Last Created</span>
                        {sortBy === 'last_created_at' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {httpCalls.map((call, idx) => (
                    <tr 
                      key={idx}
                      className={selectedCall === idx ? 'selected' : ''}
                      onClick={() => {
                        setSelectedCall(idx)
                        setIsDetailsPanelOpen(true)
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className={`method-badge ${getMethodColor(call.method)}`}>
                          {call.method || 'GET'}
                        </span>
                      </td>
                      <td className="url-cell">
                        <code>{stripQueryParams(call.request_uri || call.uri || call.url) || 'N/A'}</code>
                      </td>
                      <td className="service-cell" title={call.service || 'N/A'}>{call.service || 'N/A'}</td>
                      <td style={{ textAlign: 'right' }}>{call.call_count?.toLocaleString() || 0}</td>
                      <td style={{ textAlign: 'right' }}>{formatDuration(call.avg_duration)}</td>
                      <td style={{ textAlign: 'right' }}>{formatDuration(call.min_duration)}</td>
                      <td style={{ textAlign: 'right' }}>{formatDuration(call.max_duration)}</td>
                      <td className={call.error_count > 0 ? 'error' : ''} style={{ textAlign: 'right' }}>
                        {call.error_count?.toLocaleString() || 0}
                      </td>
                      <td className={call.error_rate > 0 ? 'error' : ''} style={{ textAlign: 'right' }}>
                        {call.error_rate ? `${call.error_rate.toFixed(2)}%` : '0%'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {formatBytes(call.total_bytes_sent != null ? Number(call.total_bytes_sent) : 0)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {formatBytes(call.total_bytes_received != null ? Number(call.total_bytes_received) : 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.85em' }}>
                        {call.last_created_at ? new Date(call.last_created_at).toLocaleString() : 'N/A'}
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

      {/* Details Panel */}
      {isDetailsPanelOpen && selectedCall !== null && httpCalls[selectedCall] && (
        <div className={`http-details-panel ${isDetailsPanelOpen ? 'open' : ''}`}>
          {(() => {
            const call = httpCalls[selectedCall]
            return (
              <>
                {/* Header */}
                <div className="details-header">
                  <div className="details-header-content">
                    <div className="details-header-icon">
                      <FiGlobe />
                    </div>
                    <div className="details-header-info">
                      <h3>
                        <span className={`method-badge ${getMethodColor(call.method)}`}>
                          {call.method || 'GET'}
                        </span>
                        {' '}
                        {stripQueryParams(call.request_uri || call.uri || call.url) || 'N/A'}
                      </h3>
                      {call.service && (
                        <div className="details-service">
                          <FiServer /> {call.service}
                        </div>
                      )}
                    </div>
                    <button 
                      className="details-close"
                      onClick={() => {
                        setIsDetailsPanelOpen(false)
                        setSelectedCall(null)
                      }}
                      title="Close"
                      aria-label="Close details panel"
                    >
                      <FiX />
                    </button>
                  </div>
                </div>

                {/* Content Area - Scrollable */}
                <div className="details-scrollable">
                  {/* Request Information */}
                  <div className="details-section">
                    <div className="details-section-title">Request Information</div>
                    <div className="metric-grid">
                      <div className="metric-card">
                        <div className="metric-icon-wrapper">
                          <FiGlobe />
                        </div>
                        <div className="metric-info">
                          <div className="metric-label">URI</div>
                          <div className="metric-value">
                            <code style={{ fontSize: '0.85em', wordBreak: 'break-all' }}>
                              {stripQueryParams(call.request_uri || call.url || call.uri) || 'N/A'}
                            </code>
                          </div>
                        </div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-icon-wrapper">
                          <FiServer />
                        </div>
                        <div className="metric-info">
                          <div className="metric-label">Service</div>
                          <div className="metric-value">{call.service || 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div className="details-section">
                    <div className="details-section-title">Performance</div>
                    <div className="metric-grid">
                      <div className="metric-card">
                        <div className="metric-icon-wrapper">
                          <FiTrendingUp />
                        </div>
                        <div className="metric-info">
                          <div className="metric-label">Call Count</div>
                          <div className="metric-value">{call.call_count?.toLocaleString() || 0}</div>
                        </div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-icon-wrapper">
                          <FiClock />
                        </div>
                        <div className="metric-info">
                          <div className="metric-label">Average Duration</div>
                          <div className="metric-value">{formatDuration(call.avg_duration)}</div>
                          <div className="metric-subtext">
                            Min: {formatDuration(call.min_duration)} | Max: {formatDuration(call.max_duration)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reliability */}
                  <div className="details-section">
                    <div className="details-section-title">Reliability</div>
                    <div className="metric-grid">
                      <div className="metric-card">
                        <div className="metric-icon-wrapper">
                          <FiAlertCircle />
                        </div>
                        <div className="metric-info">
                          <div className="metric-label">Error Count</div>
                          <div className="metric-value" style={{ color: call.error_count > 0 ? '#ef4444' : '#22c55e' }}>
                            {call.error_count?.toLocaleString() || 0}
                          </div>
                          <div className="metric-subtext">
                            Error Rate: {call.error_rate ? `${call.error_rate.toFixed(2)}%` : '0%'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bandwidth */}
                  <div className="details-section">
                    <div className="details-section-title">Bandwidth</div>
                    <div className="metric-grid">
                      <div className="metric-card">
                        <div className="metric-icon-wrapper">
                          <FiTrendingUp />
                        </div>
                        <div className="metric-info">
                          <div className="metric-label">Total Bytes Sent</div>
                          <div className="metric-value">{formatBytes(call.total_bytes_sent != null ? Number(call.total_bytes_sent) : 0)}</div>
                        </div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-icon-wrapper">
                          <FiTrendingUp />
                        </div>
                        <div className="metric-info">
                          <div className="metric-label">Total Bytes Received</div>
                          <div className="metric-value">{formatBytes(call.total_bytes_received != null ? Number(call.total_bytes_received) : 0)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

export default HttpAnalysis

