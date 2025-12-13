import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { 
  FiGlobe, 
  FiRefreshCw, 
  FiAlertCircle,
  FiServer,
  FiPause,
  FiPlay,
  FiX,
  FiClock,
  FiTrendingUp,
  FiDownload,
  FiUpload,
  FiCode,
  FiFileText,
  FiChevronRight,
  FiLink
} from 'react-icons/fi'
import axios from 'axios'
import LoadingSpinner from '../components/LoadingSpinner'
import HelpIcon from '../components/HelpIcon'
import './LiveHttp.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function LiveHttp() {
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [httpRequests, setHttpRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [services, setServices] = useState([])
  const autoScrollParam = searchParams.get('autoScroll')
  const [autoScroll, setAutoScroll] = useState(autoScrollParam !== null ? autoScrollParam === 'true' : true)
  const [isPaused, setIsPaused] = useState(searchParams.get('isPaused') === 'true')
  const serviceFilter = searchParams.get('service') || ''
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const containerRef = useRef(null)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false)

  // Fetch services
  useEffect(() => {
    axios.get(`${API_URL}/api/services`)
      .then(res => {
        const serviceNames = (res.data.services || []).map(s => s.service)
        setServices(serviceNames)
      })
      .catch(err => console.error('Error fetching services:', err))
  }, [])

  // Fetch historical HTTP requests
  const fetchHttpRequests = useCallback(async () => {
    setLoading(true)
    try {
      // Get time range (last 24 hours)
      const now = new Date()
      const from = new Date(now.getTime() - 86400000).toISOString().slice(0, 19).replace('T', ' ')
      const to = now.toISOString().slice(0, 19).replace('T', ' ')
      
      const params = new URLSearchParams({
        limit: '100',
        from,
        to,
      })
      
      if (serviceFilter) {
        params.append('service', serviceFilter)
      }
      
      const response = await axios.get(`${API_URL}/api/http-calls?${params}`)
      const calls = response.data.http_calls || []
      
      // Convert aggregated calls to request format
      // Since we only have aggregated data, we'll create representative requests
      const requests = calls.flatMap((call, index) => {
        // Create a representative request for each aggregated call
        // Use a timestamp that's recent but spread out
        const timestamp = now.getTime() - (index * 60000) // Spread over time
        // Use request_uri if available (contains actual path), otherwise use uri/url
        let uri = call.request_uri || call.uri || call.url || ''
        // If it's a full URL, extract just the path
        if (uri && !uri.startsWith('/')) {
          try {
            const urlObj = new URL(uri)
            uri = urlObj.pathname + urlObj.search
          } catch (e) {
            // Not a valid URL, use as-is
          }
        }
        const url = call.url || ''
        
        // Estimate error count based on error_rate
        const errorCount = call.error_count || 0
        const callCount = call.call_count || 1
        const hasErrors = errorCount > 0
        
        // Create a representative request (use average values)
        return [{
          id: `historical-${call.url}-${call.method}-${timestamp}-${index}`,
          trace_id: '',
          span_id: '',
          service: call.service || '',
          method: call.method || 'GET',
          uri: uri,
          request_uri: call.request_uri || uri,
          url: url,
          status_code: hasErrors ? 500 : 200, // Use 500 if there were errors, otherwise 200
          duration_ms: call.avg_duration || 0,
          timestamp: timestamp,
          request_headers: {},
          response_headers: {},
          request_body: null,
          response_body: null,
          bytes_sent: call.total_bytes_sent ? Math.round(call.total_bytes_sent / callCount) : 0,
          bytes_received: call.total_bytes_received ? Math.round(call.total_bytes_received / callCount) : 0,
          query_string: '',
        }]
      })
      
      // Sort by timestamp descending (newest first)
      requests.sort((a, b) => b.timestamp - a.timestamp)
      
      setHttpRequests(requests)
      setError(null)
    } catch (err) {
      setError('Error fetching HTTP requests')
      console.error('Error fetching HTTP requests:', err)
    } finally {
      setLoading(false)
    }
  }, [serviceFilter])

  // Load historical requests on mount
  useEffect(() => {
    fetchHttpRequests()
  }, [fetchHttpRequests])

  // WebSocket connection
  useEffect(() => {
    let isMounted = true
    let connectionAttempted = false
    const currentWsRef = { current: null }
    
    const connectWebSocket = () => {
      // Prevent duplicate connection attempts
      if (connectionAttempted && currentWsRef.current && (currentWsRef.current.readyState === WebSocket.CONNECTING || currentWsRef.current.readyState === WebSocket.OPEN)) {
        return
      }
      
      connectionAttempted = true
      
      // Close existing connection if any (but not if it's the same one we're about to create)
      if (currentWsRef.current && currentWsRef.current.readyState !== WebSocket.CLOSED) {
        try {
          currentWsRef.current.close(1000, 'Reconnecting')
        } catch (e) {
          // Ignore errors when closing
        }
        currentWsRef.current = null
      }
      
      try {
        // Construct WebSocket URL
        let wsUrl
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
        currentWsRef.current = ws
        wsRef.current = ws

        ws.onopen = () => {
          if (!isMounted || currentWsRef.current !== ws) {
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
          if (isPaused || !isMounted || currentWsRef.current !== ws) {
            return
          }
          
          try {
            const message = JSON.parse(event.data)
            if (message.channel === 'http' && message.data) {
              const httpData = message.data
              
              // Debug: log all available fields to see what we have
              console.log('[LiveHttp] Received HTTP data - Full object:', JSON.stringify(httpData, null, 2))
              console.log('[LiveHttp] Available fields:', Object.keys(httpData))
              console.log('[LiveHttp] URI-related fields:', {
                uri: httpData.uri,
                url: httpData.url,
                request_uri: httpData.request_uri,
                path_info: httpData.path_info,
                'http_request object': httpData.http_request,
                'http_request?.uri': httpData.http_request?.uri,
                'http_request?.request_uri': httpData.http_request?.request_uri,
                'http_request?.path_info': httpData.http_request?.path_info,
              })
              
              // Apply filters
              if (serviceFilter && httpData.service !== serviceFilter) {
                return
              }
              
              const requestId = `${httpData.trace_id}-${httpData.span_id}-${httpData.timestamp || Date.now()}`
              
              // Use request_uri if available (contains actual path), otherwise fall back to uri/url
              // Based on ClickHouse data: uri contains "/index.php", request_uri contains actual path
              let uri = httpData.http_request?.request_uri || httpData.request_uri || httpData.http_request?.uri || httpData.uri || httpData.url || ''
              if (uri && !uri.startsWith('/') && !uri.startsWith('http')) {
                // If it looks like a full URL, extract just the path
                try {
                  const urlObj = new URL(uri)
                  uri = urlObj.pathname + urlObj.search
                } catch (e) {
                  // Not a valid URL, use as-is
                }
              }
              
              const newRequest = {
                id: requestId,
                trace_id: httpData.trace_id || '',
                span_id: httpData.span_id || '',
                service: httpData.service || '',
                method: httpData.method || 'GET',
                uri: uri,
                request_uri: httpData.http_request?.request_uri || httpData.request_uri || uri,
                url: httpData.url || '',
                status_code: httpData.status_code || 200,
                duration_ms: httpData.duration_ms || 0,
                timestamp: httpData.timestamp ? httpData.timestamp * 1000 : Date.now(),
                request_headers: httpData.request_headers || {},
                response_headers: httpData.response_headers || {},
                request_body: httpData.request_body || null,
                response_body: httpData.response_body || null,
                bytes_sent: httpData.bytes_sent || 0,
                bytes_received: httpData.bytes_received || httpData.response_size || 0,
                query_string: httpData.query_string || '',
              }
              
              setHttpRequests(prev => {
                // Avoid duplicates
                const exists = prev.find(r => r.id === requestId)
                if (exists) return prev
                
                // Add to beginning (newest first)
                const updated = [newRequest, ...prev]
                // Keep only last 1000 requests
                return updated.slice(0, 1000)
              })
              
              // Auto-scroll if enabled
              if (autoScroll && containerRef.current) {
                containerRef.current.scrollTop = 0
              }
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err)
          }
        }

        ws.onerror = (error) => {
          // Only log if this is still our active connection
          if (currentWsRef.current === ws) {
            console.error('WebSocket error:', error)
            setWsConnected(false)
          }
        }

        ws.onclose = (event) => {
          // Only handle close if this is still our active connection
          if (currentWsRef.current !== ws) {
            return
          }
          
          if (!isMounted) {
            return
          }
          
          console.log('WebSocket disconnected', event.code !== 1000 ? `(code: ${event.code})` : '')
          setWsConnected(false)
          currentWsRef.current = null
          wsRef.current = null
          
          // Only reconnect if it wasn't a clean close and we're not already reconnecting
          if (event.code !== 1000 && !reconnectTimeoutRef.current && isMounted) {
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMounted && !reconnectTimeoutRef.current) {
                reconnectTimeoutRef.current = null
                connectionAttempted = false
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

    // Small delay to avoid React strict mode double-mount issues
    const connectTimeout = setTimeout(() => {
      if (isMounted) {
        connectWebSocket()
      }
    }, 100)
    
    // Cleanup
    return () => {
      isMounted = false
      clearTimeout(connectTimeout)
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      if (currentWsRef.current) {
        try {
          const state = currentWsRef.current.readyState
          // Only close if connection is open or connecting
          if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
            currentWsRef.current.close(1000, 'Component unmounting')
          }
        } catch (e) {
          // Ignore errors
        }
        currentWsRef.current = null
      }
      wsRef.current = null
    }
  }, [isPaused, serviceFilter, autoScroll])

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [httpRequests, autoScroll])

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (autoScroll) params.set('autoScroll', 'true')
    else params.delete('autoScroll')
    if (isPaused) params.set('isPaused', 'true')
    else params.delete('isPaused')
    if (serviceFilter) params.set('service', serviceFilter)
    else params.delete('service')
    setSearchParams(params, { replace: true })
  }, [autoScroll, isPaused, serviceFilter, searchParams, setSearchParams])

  const getStatusColor = (statusCode) => {
    if (!statusCode) return 'unknown'
    if (statusCode >= 500) return 'error'
    if (statusCode >= 400) return 'warning'
    if (statusCode >= 300) return 'info'
    return 'success'
  }

  const getMethodColor = (method) => {
    const m = (method || 'GET').toUpperCase()
    switch (m) {
      case 'GET': return 'get'
      case 'POST': return 'post'
      case 'PUT': return 'put'
      case 'DELETE': return 'delete'
      case 'PATCH': return 'patch'
      default: return 'other'
    }
  }

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

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString() + '.' + date.getMilliseconds().toString().padStart(3, '0')
  }

  const stripQueryParams = (uriOrUrl) => {
    if (!uriOrUrl) return uriOrUrl
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

  const handleRequestClick = (request) => {
    setSelectedRequest(request)
    setIsDetailsPanelOpen(true)
  }

  if (loading && httpRequests.length === 0) {
    return <LoadingSpinner message="Loading HTTP requests..." />
  }

  return (
    <div className="live-http">
      <div className="live-http-header">
        <div className="header-left">
          <h1>
            <FiGlobe /> Live HTTP Requests
            <HelpIcon text="Monitor incoming and outgoing HTTP requests in real-time. View request/response headers, bodies, and performance metrics." position="right" />
          </h1>
          <div className="connection-status">
            <span className={`status-indicator ${wsConnected ? 'connected' : 'disconnected'}`}></span>
            {wsConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="header-right">
          <button
            className={`btn btn-icon ${isPaused ? '' : 'active'}`}
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <FiPlay /> : <FiPause />}
          </button>
          <button
            className={`btn btn-icon ${autoScroll ? 'active' : ''}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
          >
            <FiRefreshCw />
          </button>
          <button
            className="btn btn-icon"
            onClick={fetchHttpRequests}
            title="Refresh"
          >
            <FiRefreshCw />
          </button>
        </div>
      </div>

      <div className="live-http-filters">
        <div className="filter-group">
          <label>Service:</label>
          <select
            value={serviceFilter}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams)
              if (e.target.value) {
                params.set('service', e.target.value)
              } else {
                params.delete('service')
              }
              setSearchParams(params, { replace: true })
            }}
            className="filter-select"
          >
            <option value="">All Services</option>
            {services.map((svc) => (
              <option key={svc} value={svc}>{svc}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="live-http-content">
        <div className="http-requests-list" ref={containerRef}>
          {httpRequests.length === 0 ? (
            <div className="empty-state">
              <FiGlobe />
              <p>No HTTP requests found</p>
              <p className="empty-hint">Requests will appear here as they are received</p>
            </div>
          ) : (
            <div className="requests-table">
              <div className="table-header">
                <div className="col-time">Time</div>
                <div className="col-method">Method</div>
                <div className="col-uri">URI</div>
                <div className="col-service">Service</div>
                <div className="col-status">Status</div>
                <div className="col-duration">Duration</div>
                <div className="col-size">Size</div>
              </div>
              <div className="table-body">
                {httpRequests.map((request) => (
                  <div
                    key={request.id}
                    className={`request-row ${selectedRequest?.id === request.id ? 'selected' : ''}`}
                    onClick={() => handleRequestClick(request)}
                  >
                    <div className="col-time">{formatTimestamp(request.timestamp)}</div>
                    <div className="col-method">
                      <span className={`method-badge ${getMethodColor(request.method)}`}>
                        {request.method || 'GET'}
                      </span>
                    </div>
                    <div className="col-uri" title={request.url || request.uri}>
                      <code>{stripQueryParams(request.request_uri || request.uri || request.url) || 'N/A'}</code>
                    </div>
                    <div className="col-service">{request.service || 'N/A'}</div>
                    <div className="col-status">
                      <span className={`status-badge ${getStatusColor(request.status_code)}`}>
                        {request.status_code || 'N/A'}
                      </span>
                    </div>
                    <div className="col-duration">{formatDuration(request.duration_ms)}</div>
                    <div className="col-size">
                      {request.bytes_sent > 0 && <span className="size-sent">{formatBytes(request.bytes_sent)}↑</span>}
                      {request.bytes_received > 0 && <span className="size-recv">{formatBytes(request.bytes_received)}↓</span>}
                      {request.bytes_sent === 0 && request.bytes_received === 0 && '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Details Panel */}
        {selectedRequest && (
          <div className={`http-details-panel ${isDetailsPanelOpen ? 'open' : ''}`}>
            <div className="details-header">
              <div className="details-header-content">
                <div className="details-header-icon">
                  <FiGlobe />
                </div>
                <div className="details-header-info">
                  <h3>
                    <span className={`method-badge ${getMethodColor(selectedRequest.method)}`}>
                      {selectedRequest.method || 'GET'}
                    </span>
                    {' '}
                    {stripQueryParams(selectedRequest.request_uri || selectedRequest.uri || selectedRequest.url) || 'N/A'}
                  </h3>
                  <div className="details-service">
                    <FiServer /> {selectedRequest.service || 'N/A'}
                  </div>
                </div>
                <button
                  className="details-close"
                  onClick={() => {
                    setIsDetailsPanelOpen(false)
                    setSelectedRequest(null)
                  }}
                  title="Close"
                >
                  <FiX />
                </button>
              </div>
            </div>

            <div className="details-scrollable">
              {/* Overview */}
              <div className="details-section">
                <div className="details-section-title">Overview</div>
                <div className="metric-grid">
                  <div className="metric-card">
                    <div className="metric-icon-wrapper">
                      <FiClock />
                    </div>
                    <div className="metric-info">
                      <div className="metric-label">Duration</div>
                      <div className="metric-value">{formatDuration(selectedRequest.duration_ms)}</div>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-icon-wrapper">
                      <span className={`status-badge ${getStatusColor(selectedRequest.status_code)}`}>
                        {selectedRequest.status_code || 'N/A'}
                      </span>
                    </div>
                    <div className="metric-info">
                      <div className="metric-label">Status Code</div>
                      <div className="metric-value">{selectedRequest.status_code || 'N/A'}</div>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-icon-wrapper">
                      <FiUpload />
                    </div>
                    <div className="metric-info">
                      <div className="metric-label">Bytes Sent</div>
                      <div className="metric-value">{formatBytes(selectedRequest.bytes_sent)}</div>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-icon-wrapper">
                      <FiDownload />
                    </div>
                    <div className="metric-info">
                      <div className="metric-label">Bytes Received</div>
                      <div className="metric-value">{formatBytes(selectedRequest.bytes_received)}</div>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-icon-wrapper">
                      <FiClock />
                    </div>
                    <div className="metric-info">
                      <div className="metric-label">Timestamp</div>
                      <div className="metric-value">{new Date(selectedRequest.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                  {selectedRequest.trace_id && (
                    <div className="metric-card">
                      <div className="metric-icon-wrapper">
                        <FiLink />
                      </div>
                      <div className="metric-info">
                        <div className="metric-label">Trace ID</div>
                        <div className="metric-value">
                          <Link to={`/traces/${selectedRequest.trace_id}`} target="_blank">
                            {selectedRequest.trace_id}
                            <FiChevronRight />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Request Details */}
              <div className="details-section">
                <div className="details-section-title">Request</div>
                <div className="details-subsection">
                  <div className="subsection-header">
                    <FiFileText /> URL
                  </div>
                  <div className="subsection-content">
                    <code className="full-url">{selectedRequest.url || selectedRequest.uri || 'N/A'}</code>
                  </div>
                </div>
                {selectedRequest.query_string && (
                  <div className="details-subsection">
                    <div className="subsection-header">
                      <FiCode /> Query String
                    </div>
                    <div className="subsection-content">
                      <code>{selectedRequest.query_string}</code>
                    </div>
                  </div>
                )}
                {selectedRequest.request_headers && Object.keys(selectedRequest.request_headers).length > 0 && (
                  <div className="details-subsection">
                    <div className="subsection-header">
                      <FiFileText /> Request Headers
                    </div>
                    <div className="subsection-content">
                      <pre>{JSON.stringify(selectedRequest.request_headers, null, 2)}</pre>
                    </div>
                  </div>
                )}
                {selectedRequest.request_body && (
                  <div className="details-subsection">
                    <div className="subsection-header">
                      <FiFileText /> Request Body
                    </div>
                    <div className="subsection-content">
                      <pre>{typeof selectedRequest.request_body === 'string' 
                        ? selectedRequest.request_body 
                        : JSON.stringify(selectedRequest.request_body, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Response Details */}
              <div className="details-section">
                <div className="details-section-title">Response</div>
                {selectedRequest.response_headers && Object.keys(selectedRequest.response_headers).length > 0 && (
                  <div className="details-subsection">
                    <div className="subsection-header">
                      <FiFileText /> Response Headers
                    </div>
                    <div className="subsection-content">
                      <pre>{JSON.stringify(selectedRequest.response_headers, null, 2)}</pre>
                    </div>
                  </div>
                )}
                {selectedRequest.response_body && (
                  <div className="details-subsection">
                    <div className="subsection-header">
                      <FiFileText /> Response Body
                    </div>
                    <div className="subsection-content">
                      <pre>{typeof selectedRequest.response_body === 'string' 
                        ? selectedRequest.response_body 
                        : JSON.stringify(selectedRequest.response_body, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveHttp

