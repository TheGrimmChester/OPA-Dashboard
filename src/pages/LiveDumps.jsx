import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { 
  FiTerminal, 
  FiRefreshCw, 
  FiAlertCircle,
  FiActivity,
  FiServer,
  FiFileText,
  FiLink,
  FiPause,
  FiPlay
} from 'react-icons/fi'
import axios from 'axios'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import JsonTreeViewer from '../components/JsonTreeViewer'
import LoadingSpinner from '../components/LoadingSpinner'
import './LiveDumps.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function LiveDumps() {
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [dumps, setDumps] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [dumpFormat, setDumpFormat] = useState({}) // Format per dump: 'json' or 'tree'
  const [globalExpandState, setGlobalExpandState] = useState('all') // 'all', 'none', or null for individual control
  const autoScrollParam = searchParams.get('autoScroll')
  const [autoScroll, setAutoScroll] = useState(autoScrollParam !== null ? autoScrollParam === 'true' : true)
  const [hasMore, setHasMore] = useState(true)
  const [nextCursor, setNextCursor] = useState(null)
  const isPausedParam = searchParams.get('isPaused')
  const [isPaused, setIsPaused] = useState(isPausedParam === 'true')
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const containerRef = useRef(null)
  const sentinelRef = useRef(null)
  const isLoadingMoreRef = useRef(false)

  // Fetch dumps with cursor-based pagination
  const fetchDumps = useCallback(async (cursor = null, append = false) => {
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
      
      const response = await axios.get(`${API_URL}/api/dumps?${params}`)
      const fetchedDumps = response.data.dumps || []
      const hasMoreData = response.data.has_more || false
      const newCursor = response.data.next_cursor || null
      
      if (append) {
        // Append to existing dumps, avoiding duplicates
        setDumps(prevDumps => {
          const existingIds = new Set(prevDumps.map(d => d.id))
          const uniqueNewDumps = fetchedDumps.filter(d => !existingIds.has(d.id))
          return [...prevDumps, ...uniqueNewDumps]
        })
      } else {
        // Replace all dumps
        setDumps(fetchedDumps)
      }
      
      setHasMore(hasMoreData)
      setNextCursor(newCursor)
      setError(null)
    } catch (err) {
      setError('Error fetching dumps')
      console.error('Error fetching dumps:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      isLoadingMoreRef.current = false
    }
  }, [])

  // Sync autoScroll and isPaused to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (!autoScroll) params.set('autoScroll', 'false')
    else params.delete('autoScroll')
    
    if (isPaused) params.set('isPaused', 'true')
    else params.delete('isPaused')
    
    setSearchParams(params, { replace: true })
  }, [autoScroll, isPaused, searchParams, setSearchParams])

  // Load more dumps when scrolling to bottom
  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || !nextCursor || isLoadingMoreRef.current) {
      return
    }
    
    fetchDumps(nextCursor, true)
  }, [hasMore, loadingMore, nextCursor, fetchDumps])

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
            if (message.channel === 'dumps' && message.data) {
              const { trace_id, span_id, service, span_name, dumps: newDumps, timestamp } = message.data
              
              // Flatten dumps array into individual entries
              if (Array.isArray(newDumps)) {
                const flattenedDumps = newDumps.map((dump, idx) => {
                  const dumpTimestamp = dump.timestamp || timestamp || Date.now()
                  const dumpID = `${trace_id}-${span_id}-${dumpTimestamp}-${idx}`
                  
                  return {
                    id: dumpID,
                    trace_id,
                    span_id,
                    service,
                    span_name,
                    timestamp: dumpTimestamp,
                    file: dump.file || '',
                    line: dump.line || 0,
                    data: dump.data,
                    text: dump.text || '',
                  }
                })
                
                // Prepend new dumps to the list (newest first)
                setDumps(prevDumps => {
                  // Avoid duplicates by checking IDs
                  const existingIds = new Set(prevDumps.map(d => d.id))
                  const uniqueNewDumps = flattenedDumps.filter(d => !existingIds.has(d.id))
                  
                  // Combine and sort by timestamp descending
                  const combined = [...uniqueNewDumps, ...prevDumps]
                  combined.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                  
                  return combined
                })
                
                // Auto-scroll to top if enabled
                if (autoScroll && containerRef.current) {
                  containerRef.current.scrollTop = 0
                }
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

    // Initial fetch
    fetchDumps()
    
    // Connect WebSocket
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
  }, [autoScroll, fetchDumps, isPaused])

  const getDumpDisplayFormat = (dumpId) => {
    return dumpFormat[dumpId] || 'tree'
  }

  const setDumpDisplayFormat = (dumpId, format) => {
    setDumpFormat(prev => ({ ...prev, [dumpId]: format }))
  }

  const parseDumpData = (data) => {
    if (!data) return null
    
    try {
      if (typeof data === 'string') {
        return JSON.parse(data)
      }
      return data
    } catch (e) {
      return data
    }
  }

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const handleRefresh = () => {
    setNextCursor(null)
    setHasMore(true)
    fetchDumps()
  }

  if (loading) {
    return <LoadingSpinner message="Loading dumps..." />
  }

  return (
    <div className="live-dumps">
      <div className="live-dumps-header">
        <div className="live-dumps-header-left">
          <FiTerminal className="page-icon" />
          <h1>Live Dumps</h1>
          <div className="connection-status">
            <div className={`status-indicator ${wsConnected ? 'connected' : 'disconnected'}`} />
            <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        <div className="live-dumps-header-right">
          <div className="global-expand-controls">
            <button 
              className={`btn btn-sm ${globalExpandState === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setGlobalExpandState('all')}
              title="Expand all dumps"
            >
              Expand All
            </button>
            <button 
              className={`btn btn-sm ${globalExpandState === 'none' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setGlobalExpandState('none')}
              title="Collapse all dumps"
            >
              Collapse All
            </button>
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
            title="Refresh dumps"
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

      <div className="dumps-stats">
        <span>Total dumps: {dumps.length}</span>
        {dumps.length > 0 && (
          <span>Latest: {formatTimestamp(dumps[0]?.timestamp)}</span>
        )}
        {hasMore && <span className="has-more-indicator">More available</span>}
        {isPaused && (
          <span className="paused-indicator">
            <FiPause className="icon" />
            Updates paused
          </span>
        )}
      </div>

      <div className="dumps-container" ref={containerRef}>
        {dumps.length === 0 ? (
          <div className="empty-state">
            <FiTerminal className="empty-icon" />
            <p>No dumps found. Dumps will appear here as they are generated.</p>
          </div>
        ) : (
          <>
            {dumps.map((dump) => {
              const displayFormat = getDumpDisplayFormat(dump.id)
              const parsedData = parseDumpData(dump.data)
              
              const jsonString = dump.data 
                ? (typeof dump.data === 'string' 
                    ? (() => {
                        try {
                          return JSON.stringify(JSON.parse(dump.data), null, 2);
                        } catch {
                          return dump.data;
                        }
                      })()
                    : JSON.stringify(dump.data, null, 2))
                : 'N/A'

              return (
                <div key={dump.id} className="dump-entry">
                  <div className="dump-header">
                    <div className="dump-header-left">
                      <div className="dump-service">
                        <FiServer className="icon" />
                        <span>{dump.service}</span>
                      </div>
                      <div className="dump-span">
                        <FiActivity className="icon" />
                        <span>{dump.span_name}</span>
                      </div>
                      <div className="dump-trace">
                        <FiLink className="icon" />
                        <Link to={`/traces/${dump.trace_id}`} className="trace-link">
                          {dump.trace_id.substring(0, 8)}...
                        </Link>
                      </div>
                    </div>
                    <div className="dump-header-right">
                      <span className="dump-timestamp">{formatTimestamp(dump.timestamp)}</span>
                    </div>
                  </div>
                  
                  <div className="dump-meta">
                    <span className="dump-file">
                      <FiFileText className="icon" />
                      {dump.file || 'unknown'}
                    </span>
                    <span className="dump-line">Line {dump.line || '?'}</span>
                    <div className="dump-format-toggle">
                      <button
                        className={`format-btn ${displayFormat === 'tree' ? 'active' : ''}`}
                        onClick={() => setDumpDisplayFormat(dump.id, 'tree')}
                      >
                        Tree
                      </button>
                      <button
                        className={`format-btn ${displayFormat === 'json' ? 'active' : ''}`}
                        onClick={() => setDumpDisplayFormat(dump.id, 'json')}
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  
                  <div className="dump-content">
                    {displayFormat === 'tree' ? (
                      <div className="dump-tree">
                        {parsedData !== null ? (
                          <JsonTreeViewer 
                            data={parsedData} 
                            globalExpandState={globalExpandState}
                            showControls={false}
                          />
                        ) : (
                          <span className="json-unknown">N/A</span>
                        )}
                      </div>
                    ) : (
                      <div className="dump-json">
                        <SyntaxHighlighter
                          language="json"
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                            padding: 'var(--spacing-sm)',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 'var(--font-size-sm)',
                          }}
                          PreTag="div"
                        >
                          {jsonString}
                        </SyntaxHighlighter>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            
            {/* Sentinel element for infinite scroll */}
            <div ref={sentinelRef} className="load-more-sentinel">
              {loadingMore && (
                <div className="loading-more">
                  <FiRefreshCw className="spinning" />
                  <span>Loading more dumps...</span>
                </div>
              )}
              {!hasMore && dumps.length > 0 && (
                <div className="no-more">
                  <span>No more dumps to load</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default LiveDumps
