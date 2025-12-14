import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiRefreshCw, FiPause, FiPlay, FiRadio, FiArrowLeft, FiHardDrive } from 'react-icons/fi'
import { redisService } from '../services/redisApi'
import HelpIcon from '../components/HelpIcon'
import LoadingSpinner from '../components/LoadingSpinner'
import TimeRangePicker from '../components/TimeRangePicker'
import FilterBuilder from '../components/FilterBuilder'
import ShareButton from '../components/ShareButton'
import './LiveRedis.css'

function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function LiveRedis() {
  const [isPaused, setIsPaused] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [refreshInterval, setRefreshInterval] = useState(10000) // 10 seconds
  const refreshIntervalRef = useRef(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [operations, setOperations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [total, setTotal] = useState(0)
  const [services, setServices] = useState([])
  
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
    const fetchServices = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/services`)
        const data = await response.json()
        const serviceNames = (data.services || []).map(s => s.service)
        setServices(serviceNames)
      } catch (err) {
        console.error('Error fetching services:', err)
      }
    }
    fetchServices()
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

  const fetchOperations = useCallback(async (isRefresh = false) => {
    if (isPaused && !isRefresh) return
    
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)
      
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
      
      const data = await redisService.listOperations(params)
      setOperations(data.operations || [])
      setTotal(data.total || data.operations?.length || 0)
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching Redis operations')
      console.error('Fetch Redis operations error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [service, timeRange, limit, offset, filter, sortBy, sortOrder, isPaused])

  useEffect(() => {
    fetchOperations()
  }, [fetchOperations])

  // Handle external refresh trigger
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0 && !loading && !isPaused) {
      fetchOperations(true)
    }
  }, [refreshTrigger, fetchOperations, loading, isPaused])

  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
    setLastRefresh(Date.now())
    fetchOperations(true)
  }, [fetchOperations])

  useEffect(() => {
    if (isPaused) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
      return
    }

    // Initial refresh
    handleRefresh()

    // Set up auto-refresh interval
    refreshIntervalRef.current = setInterval(() => {
      handleRefresh()
    }, refreshInterval)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [isPaused, refreshInterval, handleRefresh])

  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

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

  if (loading && operations.length === 0) {
    return <LoadingSpinner message="Loading Redis operations..." />
  }

  return (
    <div className="live-redis">
      <div className="live-redis-header">
        <div className="live-redis-header-left">
          <Link to="/live" className="back-link">
            <FiArrowLeft /> Back to Live Dashboard
          </Link>
          <div className="live-header-title">
            <FiRadio className="page-icon" />
            <h1>Live Redis</h1>
            <HelpIcon 
              text="Real-time Redis operation monitoring with auto-refresh. Updates every 10 seconds to show the latest Redis command performance metrics and execution statistics." 
              position="right" 
            />
          </div>
          <div className="connection-status">
            <div className={`status-indicator ${!isPaused ? 'connected' : 'paused'}`} />
            <span>{isPaused ? 'Paused' : 'Live'}</span>
            {!isPaused && lastRefresh && (
              <span className="last-refresh">Last refresh: {formatTimeAgo(lastRefresh)}</span>
            )}
          </div>
        </div>
        <div className="live-redis-header-right">
          <button 
            className={`btn ${isPaused ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
          >
            {isPaused ? <FiPlay /> : <FiPause />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          <button 
            className="btn btn-secondary"
            onClick={handleRefresh}
            title="Manual refresh"
          >
            <FiRefreshCw />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="live-redis-content">
        <div className="redis-analysis-filters">
          <div className="filter-group">
            <label>Time Range:</label>
            <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          </div>
          <div className="filter-group">
            <label>Service:</label>
            <select 
              value={service} 
              onChange={(e) => {
                setService(e.target.value)
                setOffset(0)
              }}
              className="filter-select"
            >
              <option value="">All Services</option>
              {services.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="filter-group filter-group-full">
            <label>Filter:</label>
            <FilterBuilder
              value={filter}
              onChange={(newFilter) => {
                setFilter(newFilter)
                setOffset(0)
              }}
              placeholder="e.g., service:api, redis.duration_ms:>10"
            />
          </div>
          {refreshing && <span className="refresh-indicator">🔄 Refreshing...</span>}
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="redis-operations-list">
          <div className="redis-operations-header">
            <h2>Redis Operations <HelpIcon text="List of Redis operations with performance metrics grouped by command and key." position="right" /></h2>
            <div className="redis-operations-info">
              Showing {operations.length} of {total} operation{total !== 1 ? 's' : ''}
              {total > 0 && (
                <span className="page-range">
                  {' '}({offset + 1}-{Math.min(offset + operations.length, total)})
                </span>
              )}
            </div>
          </div>
          {operations.length === 0 && !loading ? (
            <div className="empty-state">
              <FiHardDrive className="empty-icon" />
              <p>No Redis operations found</p>
            </div>
          ) : (
            <div className="redis-table-container">
              <table className="redis-operations-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('command')} className="sortable">
                      Command {sortBy === 'command' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('key')} className="sortable">
                      Key {sortBy === 'key' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('execution_count')} className="sortable">
                      Executions {sortBy === 'execution_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('avg_duration')} className="sortable">
                      Avg Duration {sortBy === 'avg_duration' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>P95 Duration</th>
                    <th>P99 Duration</th>
                    <th>Max Duration</th>
                    <th>Hit/Miss</th>
                    <th onClick={() => handleSort('last_created_at')} className="sortable">
                      Last Seen {sortBy === 'last_created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {operations.map((op, idx) => (
                    <tr key={idx}>
                      <td><code className="command-cell">{op.command || 'N/A'}</code></td>
                      <td className="key-cell">{op.key || 'N/A'}</td>
                      <td>{op.execution_count?.toLocaleString() || 0}</td>
                      <td>{formatDuration(op.avg_duration)}</td>
                      <td>{formatDuration(op.p95_duration)}</td>
                      <td>{formatDuration(op.p99_duration)}</td>
                      <td>{formatDuration(op.max_duration)}</td>
                      <td>
                        {op.hit_count !== undefined && op.miss_count !== undefined ? (
                          <div className="hit-miss-stats">
                            <span className="hit-count">{op.hit_count}</span>
                            <span className="separator">/</span>
                            <span className="miss-count">{op.miss_count}</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td>{op.last_created_at ? new Date(op.last_created_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {total > limit && (
            <div className="pagination">
              <button 
                className="btn btn-secondary"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
              >
                Previous
              </button>
              <span className="page-info">
                Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
              </span>
              <button 
                className="btn btn-secondary"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LiveRedis
