import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { 
  FiFileText, 
  FiRefreshCw, 
  FiAlertCircle,
  FiActivity,
  FiServer,
  FiLink,
  FiPause,
  FiPlay,
  FiInfo,
  FiAlertTriangle,
  FiXCircle
} from 'react-icons/fi'
import axios from 'axios'
import LoadingSpinner from '../components/LoadingSpinner'
import FilterBuilder from '../components/FilterBuilder'
import './LiveLogs.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function LiveLogs() {
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [services, setServices] = useState([])
  const autoScrollParam = searchParams.get('autoScroll')
  const [autoScroll, setAutoScroll] = useState(autoScrollParam !== null ? autoScrollParam === 'true' : true)
  const [hasMore, setHasMore] = useState(true)
  const [nextCursor, setNextCursor] = useState(null)
  const isPausedParam = searchParams.get('isPaused')
  const [isPaused, setIsPaused] = useState(isPausedParam === 'true')
  const levelFilter = searchParams.get('level') || 'all'
  const serviceFilter = searchParams.get('service') || ''
  const filterQuery = searchParams.get('filter') || ''
  // Initialize filter with level/service if they exist but filter doesn't
  const initialFilter = filterQuery || (levelFilter !== 'all' ? `level:${levelFilter}` : '') + (serviceFilter ? (levelFilter !== 'all' ? ' AND ' : '') + `service:${serviceFilter}` : '')
  const [filter, setFilter] = useState(initialFilter)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const containerRef = useRef(null)
  const sentinelRef = useRef(null)
  const isLoadingMoreRef = useRef(false)

  // Helper functions for log levels (from LogCorrelation)
  const getLevelIcon = (level) => {
    switch (level.toLowerCase()) {
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

  const getLevelColor = (level) => {
    switch (level.toLowerCase()) {
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

  // Fetch logs with cursor-based pagination
  const fetchLogs = useCallback(async (cursor = null, append = false) => {
    if (isLoadingMoreRef.current && append) return
    
    if (append) {
      setLoadingMore(true)
      isLoadingMoreRef.current = true
    } else {
      setLoading(true)
    }
    
    try {
      const params = new URLSearchParams({
        limit: '100',
        all: '1',
      })
      
      if (cursor) {
        params.append('cursor', cursor.toString())
      }
      
      if (filter) {
        params.append('filter', filter)
      } else {
        // Backward compatibility: use level/service if filter not set
        if (levelFilter && levelFilter !== 'all') {
          params.append('level', levelFilter)
        }
        if (serviceFilter) {
          params.append('service', serviceFilter)
        }
      }
      
      const response = await axios.get(`${API_URL}/api/logs?${params}`)
      const fetchedLogs = response.data.logs || []
      const hasMoreData = response.data.has_more || false
      const newCursor = response.data.next_cursor || null
      
      // Extract unique services from logs
      const uniqueServices = new Set()
      fetchedLogs.forEach(log => {
        if (log.service) {
          uniqueServices.add(log.service)
        }
      })
      setServices(prev => {
        const combined = new Set([...prev, ...Array.from(uniqueServices)])
        return Array.from(combined).sort()
      })
      
      if (append) {
        // Append to existing logs, avoiding duplicates
        setLogs(prevLogs => {
          const existingIds = new Set(prevLogs.map(l => l.id))
          const uniqueNewLogs = fetchedLogs.filter(l => !existingIds.has(l.id))
          return [...prevLogs, ...uniqueNewLogs]
        })
      } else {
        // Replace all logs
        setLogs(fetchedLogs)
      }
      
      setHasMore(hasMoreData)
      setNextCursor(newCursor)
      setError(null)
    } catch (err) {
      setError('Error fetching logs')
      console.error('Error fetching logs:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      isLoadingMoreRef.current = false
    }
  }, [filter, levelFilter, serviceFilter])

  // Sync autoScroll, isPaused, and filters to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (!autoScroll) params.set('autoScroll', 'false')
    else params.delete('autoScroll')
    
    if (isPaused) params.set('isPaused', 'true')
    else params.delete('isPaused')
    
    if (filter) params.set('filter', filter)
    else params.delete('filter')
    
    // Keep level/service for backward compatibility, but prefer filter
    if (!filter) {
      if (levelFilter && levelFilter !== 'all') params.set('level', levelFilter)
      else params.delete('level')
      
      if (serviceFilter) params.set('service', serviceFilter)
      else params.delete('service')
    } else {
      params.delete('level')
      params.delete('service')
    }
    
    setSearchParams(params, { replace: true })
  }, [autoScroll, isPaused, filter, levelFilter, serviceFilter, searchParams, setSearchParams])

  // Load more logs when scrolling to bottom
  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || !nextCursor || isLoadingMoreRef.current) {
      return
    }
    
    fetchLogs(nextCursor, true)
  }, [hasMore, loadingMore, nextCursor, fetchLogs])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && hasMore && !loadingMore && !isLoadingMoreRef.current) {
          loadMore()
        }
      },
      {
        root: containerRef.current,
        rootMargin: '100px',
        threshold: 0.1,
      }
    )

    observer.observe(sentinelRef.current)

    return () => {
      observer.disconnect()
    }
  }, [hasMore, loadingMore, loadMore])

  // Initial fetch of historical logs (runs on mount and when filters change)
  useEffect(() => {
    fetchLogs()
  }, [filter, levelFilter, serviceFilter]) // Re-fetch when filters change

  // WebSocket connection
  useEffect(() => {
    // Don't connect if paused
    if (isPaused) {
      // Close existing connection when pausing
      if (wsRef.current) {
        try {
          const state = wsRef.current.readyState
          if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
            wsRef.current.close(1000, 'Paused')
          }
        } catch (e) {
          // Ignore errors
        }
        wsRef.current = null
      }
      setWsConnected(false)
      return () => {
        // Cleanup on pause
      }
    }
    
    let isMounted = true
    let connectionAttempted = false
    
    // Prevent multiple connections (React Strict Mode double-render protection)
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return () => {
        isMounted = false
      }
    }
    
    const connectWebSocket = () => {
      // Prevent duplicate connection attempts
      if (connectionAttempted && wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
        return
      }
      
      connectionAttempted = true
      
      // Close existing connection if any (but not if it's the same one we're about to create)
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        try {
          wsRef.current.close(1000, 'Reconnecting')
        } catch (e) {
          // Ignore errors when closing
        }
        wsRef.current = null
      }
      
      try {
        // Construct WebSocket URL
        let wsUrl
        const API_URL = import.meta.env.VITE_API_URL
        const WS_PORT = import.meta.env.VITE_WS_PORT || '8082'
        if (API_URL && API_URL.trim() !== '') {
          // If API_URL is set, use it
          const wsProtocol = API_URL.startsWith('https') ? 'wss:' : 'ws:'
          const wsHost = API_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')
          wsUrl = `${wsProtocol}//${wsHost}/ws`
        } else {
          // If API_URL is not set (dev mode), use host.docker.internal or localhost with WS_PORT
          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          // Try to detect if we're in Docker and use host.docker.internal, otherwise use localhost
          const wsHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? `localhost:${WS_PORT}` 
            : `host.docker.internal:${WS_PORT}`
          wsUrl = `${wsProtocol}//${wsHost}/ws`
        }
        
        console.log('Connecting to WebSocket:', wsUrl)
        
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          if (!isMounted) {
            ws.close()
            return
          }
          console.log('WebSocket connected')
          setWsConnected(true)
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
          }
        }

        ws.onmessage = (event) => {
          // Ignore messages when paused
          if (isPaused) {
            return
          }
          
          try {
            const message = JSON.parse(event.data)
            if (message.channel === 'logs' && message.data) {
              const { trace_id, span_id, service, level, message: logMessage, timestamp, fields } = message.data
              
              // Apply filters (for WebSocket messages, we check filter string or fallback to level/service)
              // Note: Full filter parsing would require importing filterParser, but for WebSocket
              // we'll do simple checks. The main filtering happens in fetchLogs via API.
              if (filter) {
                // Simple filter check for WebSocket messages
                // For complex filters, rely on API filtering
                const lowerFilter = filter.toLowerCase()
                if (lowerFilter.includes('level:')) {
                  const levelMatch = lowerFilter.match(/level:(\w+)/i)
                  if (levelMatch) {
                    const filterLevel = levelMatch[1].toLowerCase()
                    const logLevel = level?.toLowerCase() || ''
                    if (filterLevel === 'critical') {
                      if (logLevel !== 'critical' && logLevel !== 'crit') {
                        return
                      }
                    } else if (logLevel !== filterLevel) {
                      return
                    }
                  }
                }
                if (lowerFilter.includes('service:')) {
                  const serviceMatch = lowerFilter.match(/service:(\w+)/i)
                  if (serviceMatch && service !== serviceMatch[1]) {
                    return
                  }
                }
              } else {
                // Backward compatibility: use level/service filters
                if (levelFilter && levelFilter !== 'all') {
                  const logLevel = level?.toLowerCase() || ''
                  const filterLevel = levelFilter.toLowerCase()
                  if (filterLevel === 'critical') {
                    if (logLevel !== 'critical' && logLevel !== 'crit') {
                      return
                    }
                  } else if (logLevel !== filterLevel) {
                    return
                  }
                }
                
                if (serviceFilter && service !== serviceFilter) {
                  return
                }
              }
              
              // Create log entry
              const logTimestamp = timestamp ? timestamp * 1000 : Date.now()
              const logID = `${trace_id}-${span_id || 'none'}-${logTimestamp}`
              
              const newLog = {
                id: logID,
                trace_id,
                span_id: span_id || '',
                service,
                level,
                message: logMessage,
                timestamp: logTimestamp,
                fields: fields || {},
              }
              
              // Add service to services list if new
              if (service && !services.includes(service)) {
                setServices(prev => {
                  const updated = [...prev, service].sort()
                  return updated
                })
              }
              
              // Prepend new log to the list (newest first)
              setLogs(prevLogs => {
                // Avoid duplicates by checking IDs
                const existingIds = new Set(prevLogs.map(l => l.id))
                if (existingIds.has(logID)) {
                  return prevLogs
                }
                
                // Combine and sort by timestamp descending
                const combined = [newLog, ...prevLogs]
                combined.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                
                return combined
              })
              
              // Auto-scroll to top if enabled
              if (autoScroll && containerRef.current) {
                containerRef.current.scrollTop = 0
              }
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err)
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          setWsConnected(false)
        }

        ws.onclose = (event) => {
          if (!isMounted) return
          
          console.log('WebSocket disconnected', event.code !== 1000 ? `(code: ${event.code})` : '')
          setWsConnected(false)
          wsRef.current = null
          
          // Only reconnect if it wasn't a clean close and we're not already reconnecting
          if (event.code !== 1000 && !reconnectTimeoutRef.current && isMounted) {
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMounted && !reconnectTimeoutRef.current) {
                reconnectTimeoutRef.current = null
                connectWebSocket()
              }
            }, 3000)
          }
        }
      } catch (err) {
        console.error('Error creating WebSocket:', err)
        setWsConnected(false)
      }
    }

    // Connect WebSocket (historical logs are already loaded by the separate useEffect)
    connectWebSocket()

    // Cleanup
    return () => {
      isMounted = false
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      if (wsRef.current) {
        try {
          const state = wsRef.current.readyState
          // Only close if connection is open or connecting
          if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
            wsRef.current.close(1000, 'Component unmounting')
          }
        } catch (e) {
          // Ignore errors
        }
        wsRef.current = null
      }
    }
  }, [autoScroll, fetchLogs, isPaused, filter, levelFilter, serviceFilter, services])

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const handleRefresh = () => {
    setNextCursor(null)
    setHasMore(true)
    fetchLogs()
  }


  if (loading) {
    return <LoadingSpinner message="Loading logs..." />
  }

  return (
    <div className="live-logs">
      <div className="live-logs-header">
        <div className="live-logs-header-left">
          <FiFileText className="page-icon" />
          <h1>Live Logs</h1>
          <div className="connection-status">
            <div className={`status-indicator ${wsConnected ? 'connected' : 'disconnected'}`} />
            <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        <div className="live-logs-header-right">
          <div className="live-logs-filters">
            <div className="filter-group filter-group-full">
              <label>Filter:</label>
              <FilterBuilder
                value={filter}
                onChange={setFilter}
                placeholder="e.g., level:error, service:api, (level:error AND service:api)"
              />
            </div>
          </div>
          <button 
            className={`btn ${isPaused ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume real-time updates' : 'Pause real-time updates'}
          >
            {isPaused ? <FiPlay /> : <FiPause />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          <button 
            className="btn btn-secondary"
            onClick={handleRefresh}
            title="Refresh logs"
            disabled={loading}
          >
            <FiRefreshCw />
            <span>Refresh</span>
          </button>
          <label className="auto-scroll-toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>Auto-scroll</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      <div className="logs-stats">
        <span>Total logs: {logs.length}</span>
        {logs.length > 0 && (
          <span>Latest: {formatTimestamp(logs[0]?.timestamp)}</span>
        )}
        {hasMore && <span className="has-more-indicator">More available</span>}
        {isPaused && (
          <span className="paused-indicator">
            <FiPause className="icon" />
            Updates paused
          </span>
        )}
      </div>

      <div className="logs-container" ref={containerRef}>
        {logs.length === 0 ? (
          <div className="empty-state">
            <FiFileText className="empty-icon" />
            <p>No logs found. Logs will appear here as they are generated.</p>
          </div>
        ) : (
          <>
            {logs.map((log) => (
              <div key={log.id} className={`log-entry log-${getLevelColor(log.level)}`}>
                <div className="log-header">
                  <div className="log-header-left">
                    <div className="log-service">
                      <FiServer className="icon" />
                      <span>{log.service}</span>
                    </div>
                    {log.trace_id && (
                      <div className="log-trace">
                        <FiLink className="icon" />
                        <Link to={`/traces/${log.trace_id}`} className="trace-link">
                          {log.trace_id.substring(0, 8)}...
                        </Link>
                      </div>
                    )}
                    {log.span_id && (
                      <div className="log-span">
                        <FiActivity className="icon" />
                        <span>{log.span_id.substring(0, 8)}...</span>
                      </div>
                    )}
                  </div>
                  <div className="log-header-right">
                    <div className="log-level">
                      {getLevelIcon(log.level)}
                      <span className="level-text">{log.level?.toUpperCase() || 'UNKNOWN'}</span>
                    </div>
                    <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
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
            
            {/* Sentinel element for infinite scroll */}
            <div ref={sentinelRef} className="load-more-sentinel">
              {loadingMore && (
                <div className="loading-more">
                  <FiRefreshCw className="spinning" />
                  <span>Loading more logs...</span>
                </div>
              )}
              {!hasMore && logs.length > 0 && (
                <div className="no-more">
                  <span>No more logs to load</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default LiveLogs
