import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { 
  FiArrowLeft, 
  FiShuffle, 
  FiCopy, 
  FiShare2,
  FiInfo,
  FiBarChart2,
  FiLayers,
  FiGitBranch,
  FiDatabase,
  FiCode,
  FiGlobe,
  FiTag,
  FiCheckCircle,
  FiAlertCircle,
  FiServer,
  FiClock,
  FiActivity,
  FiZap,
  FiHardDrive,
  FiFileText,
  FiTerminal,
  FiChevronLeft,
  FiChevronRight
} from 'react-icons/fi'
import axios from 'axios'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import SqlQueryViewer from '../components/SqlQueryViewer'
import StackTraceViewer from '../components/StackTraceViewer'
import FlameGraph from '../components/FlameGraph'
import CallGraph from '../components/CallGraph'
import ExecutionStackTree from '../components/ExecutionStackTree'
import LogCorrelation from '../components/LogCorrelation'
import ShareButton from '../components/ShareButton'
import CopyToClipboard from '../components/CopyToClipboard'
import LoadingSpinner from '../components/LoadingSpinner'
import TraceTabFilters from '../components/TraceTabFilters'
import JsonTreeViewer from '../components/JsonTreeViewer'
import HelpIcon from '../components/HelpIcon'
import './TraceView.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function TraceView() {
  const { traceId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [trace, setTrace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview')
  const [logCount, setLogCount] = useState(0)
  const [dumpFormat, setDumpFormat] = useState({}) // Format per dump: 'json' or 'tree'
  const [sqlFilters, setSqlFilters] = useState({ enabled: false, thresholds: {} })
  const [networkFilters, setNetworkFilters] = useState({ enabled: false, thresholds: {} })
  const [cacheFilters, setCacheFilters] = useState({ enabled: false, thresholds: {} })
  const [redisFilters, setRedisFilters] = useState({ enabled: false, thresholds: {} })
  const [stacksFilters, setStacksFilters] = useState({ enabled: false, thresholds: {} })
  const tabsContainerRef = useRef(null)
  const [showLeftScroll, setShowLeftScroll] = useState(false)
  const [showRightScroll, setShowRightScroll] = useState(false)
  const [visibleTagsCount, setVisibleTagsCount] = useState(50)
  const [isLoadingMoreTags, setIsLoadingMoreTags] = useState(false)
  const tagsContainerRef = useRef(null)
  const tagsSentinelRef = useRef(null)

  useEffect(() => {
    if (!traceId) return

    const fetchTrace = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await axios.get(`${API_URL}/api/traces/${traceId}/full`)
        setTrace(response.data)
      } catch (err) {
        setError(err.response?.status === 404 ? 'Trace not found' : 'Error loading trace')
        console.error('Error fetching trace:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTrace()
  }, [traceId])

  // Fetch log count for the trace
  useEffect(() => {
    if (!traceId) return

    const fetchLogCount = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/traces/${traceId}/logs`)
        setLogCount(response.data.logs?.length || 0)
      } catch (err) {
        // If logs endpoint doesn't exist or fails, set count to 0
        setLogCount(0)
        console.error('Error fetching log count:', err)
      }
    }

    fetchLogCount()
  }, [traceId])

  // Sync activeTab to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (activeTab && activeTab !== 'overview') params.set('tab', activeTab)
    else params.delete('tab')
    
    setSearchParams(params, { replace: true })
  }, [activeTab, searchParams, setSearchParams])

  // Check scroll position and update indicators
  const checkScrollPosition = useCallback(() => {
    const container = tabsContainerRef.current
    if (!container) return
    
    const { scrollLeft, scrollWidth, clientWidth } = container
    setShowLeftScroll(scrollLeft > 0)
    setShowRightScroll(scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  // Scroll active tab into view
  useEffect(() => {
    if (!tabsContainerRef.current) return
    
    const activeTabElement = tabsContainerRef.current.querySelector('.tab.active')
    if (activeTabElement) {
      activeTabElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      })
    }
    
    // Check scroll position after a short delay to allow for scroll animation
    setTimeout(checkScrollPosition, 300)
  }, [activeTab])

  // Check scroll position on mount and resize
  useEffect(() => {
    checkScrollPosition()
    const container = tabsContainerRef.current
    if (container) {
      container.addEventListener('scroll', checkScrollPosition)
      window.addEventListener('resize', checkScrollPosition)
      return () => {
        container.removeEventListener('scroll', checkScrollPosition)
        window.removeEventListener('resize', checkScrollPosition)
      }
    }
  }, [trace, checkScrollPosition])

  // Compute callStack and rootSpan using useMemo before any early returns
  // This ensures stable references and follows Rules of Hooks
  const { rootSpan, callStack } = useMemo(() => {
    if (!trace || !trace.spans) {
      return { rootSpan: null, callStack: [] }
    }
    const root = trace.spans?.find(s => !s.parent_id) || trace.spans?.[0]
    // Check both stack_flat and stack, with stack_flat taking priority (like elsewhere in the code)
    const stack = (root?.stack_flat && Array.isArray(root.stack_flat) && root.stack_flat.length > 0)
      ? root.stack_flat
      : (root?.stack && Array.isArray(root.stack) && root.stack.length > 0 ? root.stack : [])
    return { rootSpan: root, callStack: stack }
  }, [trace])

  // Extract client IP from trace data
  const clientIp = useMemo(() => {
    if (!trace || !trace.spans) {
      return null
    }
    const rootSpan = trace.spans?.find(s => !s.parent_id) || trace.spans?.[0]
    if (rootSpan?.tags?.http_request?.ip) {
      return rootSpan.tags.http_request.ip
    }
    // Also check remote_addr as fallback
    if (rootSpan?.tags?.http_request?.remote_addr) {
      return rootSpan.tags.http_request.remote_addr
    }
    return null
  }, [trace])

  // Collect all tags using useMemo before any early returns
  // This ensures stable references and follows Rules of Hooks
  const allTags = useMemo(() => {
    if (!trace || !trace.spans) {
      return []
    }
    const tags = []
    const collectTags = (spans) => {
      spans.forEach(span => {
        if (span.tags && typeof span.tags === 'object' && Object.keys(span.tags).length > 0) {
          tags.push({
            span: span.name,
            spanId: span.span_id,
            tags: span.tags,
          })
        }
        if (span.children) {
          collectTags(span.children)
        }
      })
    }
    collectTags(trace.spans)
    return tags
  }, [trace])

  // Reset visible tags count when tags change
  // This must be before early returns to follow Rules of Hooks
  useEffect(() => {
    setVisibleTagsCount(50)
  }, [allTags.length])

  // Load more tags function
  const loadMoreTags = useCallback(() => {
    if (isLoadingMoreTags || visibleTagsCount >= allTags.length) {
      return
    }
    setIsLoadingMoreTags(true)
    setTimeout(() => {
      setVisibleTagsCount(prev => {
        const newCount = Math.min(prev + 50, allTags.length)
        setIsLoadingMoreTags(false)
        return newCount
      })
    }, 50)
  }, [allTags.length, visibleTagsCount, isLoadingMoreTags])

  // Intersection Observer for infinite scrolling tags
  // This must be before early returns to follow Rules of Hooks
  useEffect(() => {
    // Only set up observer when tags tab is active
    if (activeTab !== 'tags') {
      return
    }

    const sentinel = tagsSentinelRef.current
    if (!sentinel || allTags.length <= visibleTagsCount) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting) {
          loadMoreTags()
        }
      },
      {
        root: null, // Use viewport as root for better compatibility
        rootMargin: '100px',
        threshold: 0.01,
      }
    )

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      if (sentinel) {
        observer.observe(sentinel)
      }
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [allTags.length, visibleTagsCount, activeTab, loadMoreTags])

  // Fallback scroll handler for infinite scroll
  useEffect(() => {
    if (activeTab !== 'tags' || allTags.length <= visibleTagsCount) {
      return
    }

    const handleScroll = () => {
      if (isLoadingMoreTags || visibleTagsCount >= allTags.length) {
        return
      }

      const sentinel = tagsSentinelRef.current
      if (!sentinel) {
        return
      }

      const rect = sentinel.getBoundingClientRect()
      const windowHeight = window.innerHeight || document.documentElement.clientHeight
      
      // Load more when sentinel is within 200px of viewport
      if (rect.top <= windowHeight + 200) {
        loadMoreTags()
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [activeTab, allTags.length, visibleTagsCount, isLoadingMoreTags, loadMoreTags])

  // Scroll tabs left/right
  const scrollTabs = (direction) => {
    const container = tabsContainerRef.current
    if (!container) return
    
    const scrollAmount = 200
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    })
  }

  // Debug: log call stack to console
  // This useEffect must be called before any early returns to follow Rules of Hooks
  useEffect(() => {
    if (callStack.length > 0) {
      console.log('Call stack found:', callStack)
      console.log('Call stack length:', callStack.length)
    } else {
      console.log('Call stack is empty or not found')
      console.log('Root span:', rootSpan)
      console.log('Root span keys:', rootSpan ? Object.keys(rootSpan) : 'N/A')
    }
  }, [callStack, rootSpan])

  if (loading) {
    return <LoadingSpinner message="Loading trace..." />
  }

  if (error || !trace) {
    return (
      <div className="trace-view-error">
        <FiAlertCircle className="error-icon" />
        <h2>Error</h2>
        <p>{error || 'Trace not found'}</p>
        <Link to="/traces" className="back-link btn btn-secondary">
          <FiArrowLeft />
          <span>Back to Traces</span>
        </Link>
      </div>
    )
  }

  // Collect all SQL queries from spans (from span.sql and from call stack)
  const allSqlQueries = []
  
  // Helper function to recursively collect SQL queries from call stack
  const collectSQLFromStack = (stack) => {
    if (!Array.isArray(stack)) return []
    const queries = []
    stack.forEach(node => {
      // Collect SQL queries from this node
      if (node.sql_queries && Array.isArray(node.sql_queries) && node.sql_queries.length > 0) {
        queries.push(...node.sql_queries)
      }
      // Also check for SQLQueries (capitalized, from Go struct)
      if (node.SQLQueries && Array.isArray(node.SQLQueries) && node.SQLQueries.length > 0) {
        queries.push(...node.SQLQueries)
      }
      // Recursively collect from children
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        queries.push(...collectSQLFromStack(node.children))
      }
    })
    return queries
  }
  
  const collectSql = (spans) => {
    spans.forEach(span => {
      // Collect from direct span.sql field
      if (span.sql && Array.isArray(span.sql) && span.sql.length > 0) {
        span.sql.forEach(query => {
          allSqlQueries.push({
            span: span.name,
            spanId: span.span_id,
            query: query,
          })
        })
      }
      
      // Collect from call stack (stack or stack_flat)
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        const stackQueries = collectSQLFromStack(stackData)
        stackQueries.forEach(query => {
          allSqlQueries.push({
            span: span.name,
            spanId: span.span_id,
            query: query,
          })
        })
      }
      
      if (span.children) {
        collectSql(span.children)
      }
    })
  }
  if (trace.spans) {
    collectSql(trace.spans)
  }

  // Collect all stack traces
  const allStackTraces = []
  const collectStacks = (spans) => {
    spans.forEach(span => {
      // Use stack_flat if available (flat list of all calls), otherwise use stack (hierarchical)
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        // If using hierarchical stack, flatten it recursively
        const flatStack = span.stack_flat || flattenStackRecursive(span.stack)
        
        allStackTraces.push({
          span: span.name,
          spanId: span.span_id,
          stack: flatStack,
        })
      }
      if (span.children) {
        collectStacks(span.children)
      }
    })
  }
  
  // Helper function to recursively flatten hierarchical stack
  const flattenStackRecursive = (stack) => {
    if (!Array.isArray(stack)) return []
    const flat = []
    const flatten = (nodes) => {
      nodes.forEach(node => {
        // Create a copy without children
        const flatNode = {
          call_id: node.call_id || node.CallID || node.id,
          function: node.function || node.Function || node.name,
          class: node.class || node.Class,
          file: node.file || node.File,
          line: node.line || node.Line,
          duration_ms: node.duration_ms || node.DurationMs || node.duration,
          cpu_ms: node.cpu_ms || node.CPUMs || node.cpu,
          memory_delta: node.memory_delta || node.MemoryDelta,
          network_bytes_sent: node.network_bytes_sent || node.NetworkBytesSent,
          network_bytes_received: node.network_bytes_received || node.NetworkBytesReceived,
          parent_id: node.parent_id || node.ParentID,
          depth: node.depth || node.Depth,
          function_type: node.function_type || node.FunctionType,
          sql_queries: node.sql_queries || node.SQLQueries,
          http_requests: node.http_requests || node.HttpRequests,
          cache_operations: node.cache_operations || node.CacheOperations,
          redis_operations: node.redis_operations || node.RedisOperations,
        }
        flat.push(flatNode)
        // Recursively flatten children
        if (node.children && Array.isArray(node.children) && node.children.length > 0) {
          flatten(node.children)
        }
      })
    }
    flatten(stack)
    return flat
  }
  
  if (trace.spans) {
    collectStacks(trace.spans)
  }

  // Collect all network requests (from span.net and from call stack http_requests)
  const allNetworkRequests = []
  const collectHTTPFromStack = (stack) => {
    if (!Array.isArray(stack)) return []
    const requests = []
    stack.forEach(node => {
      // Collect HTTP requests from this node
      if (node.http_requests && Array.isArray(node.http_requests) && node.http_requests.length > 0) {
        requests.push(...node.http_requests)
      }
      if (node.HttpRequests && Array.isArray(node.HttpRequests) && node.HttpRequests.length > 0) {
        requests.push(...node.HttpRequests)
      }
      // Recursively collect from children
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        requests.push(...collectHTTPFromStack(node.children))
      }
    })
    return requests
  }
  const collectNetwork = (spans) => {
    spans.forEach(span => {
      // Collect from direct span.net field (legacy format)
      if (span.net && typeof span.net === 'object' && Object.keys(span.net).length > 0) {
        allNetworkRequests.push({
          span: span.name,
          spanId: span.span_id,
          net: span.net,
          type: 'legacy',
        })
      }
      
      // Collect from span.Http field (HTTP requests stored at span level)
      if (span.Http && Array.isArray(span.Http) && span.Http.length > 0) {
        span.Http.forEach(request => {
          allNetworkRequests.push({
            span: span.name,
            spanId: span.span_id,
            request: request,
            type: 'http',
          })
        })
      }
      // Also check lowercase 'http' for compatibility
      if (span.http && Array.isArray(span.http) && span.http.length > 0) {
        span.http.forEach(request => {
          allNetworkRequests.push({
            span: span.name,
            spanId: span.span_id,
            request: request,
            type: 'http',
          })
        })
      }
      
      // Collect from call stack (http_requests)
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        const stackRequests = collectHTTPFromStack(stackData)
        stackRequests.forEach(request => {
          allNetworkRequests.push({
            span: span.name,
            spanId: span.span_id,
            request: request,
            type: 'http',
          })
        })
      }
      
      if (span.children) {
        collectNetwork(span.children)
      }
    })
  }
  if (trace.spans) {
    collectNetwork(trace.spans)
  }

  // Collect all cache operations (APCu, Symfony Cache)
  const allCacheOperations = []
  const collectCacheFromStack = (stack) => {
    if (!Array.isArray(stack)) return []
    const operations = []
    stack.forEach(node => {
      // Collect cache operations from this node
      if (node.cache_operations && Array.isArray(node.cache_operations) && node.cache_operations.length > 0) {
        operations.push(...node.cache_operations)
      }
      if (node.CacheOperations && Array.isArray(node.CacheOperations) && node.CacheOperations.length > 0) {
        operations.push(...node.CacheOperations)
      }
      // Recursively collect from children
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        operations.push(...collectCacheFromStack(node.children))
      }
    })
    return operations
  }
  const collectCache = (spans) => {
    spans.forEach(span => {
      // First, collect cache operations directly from span level (from spans_full.cache field)
      if (span.cache && Array.isArray(span.cache) && span.cache.length > 0) {
        span.cache.forEach(op => {
          allCacheOperations.push({
            span: span.name,
            spanId: span.span_id,
            operation: op,
          })
        })
      }
      // Also check for CacheOperations (alternative field name)
      if (span.CacheOperations && Array.isArray(span.CacheOperations) && span.CacheOperations.length > 0) {
        span.CacheOperations.forEach(op => {
          allCacheOperations.push({
            span: span.name,
            spanId: span.span_id,
            operation: op,
          })
        })
      }
      
      // Collect from call stack (for cache operations stored in individual call nodes)
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        const stackOps = collectCacheFromStack(stackData)
        stackOps.forEach(op => {
          allCacheOperations.push({
            span: span.name,
            spanId: span.span_id,
            operation: op,
          })
        })
      }
      
      if (span.children) {
        collectCache(span.children)
      }
    })
  }
  if (trace.spans) {
    collectCache(trace.spans)
  }

  // Collect all Redis operations
  const allRedisOperations = []
  const collectRedisFromStack = (stack) => {
    if (!Array.isArray(stack)) return []
    const operations = []
    stack.forEach(node => {
      // Collect Redis operations from this node
      if (node.redis_operations && Array.isArray(node.redis_operations) && node.redis_operations.length > 0) {
        operations.push(...node.redis_operations)
      }
      if (node.RedisOperations && Array.isArray(node.RedisOperations) && node.RedisOperations.length > 0) {
        operations.push(...node.RedisOperations)
      }
      // Recursively collect from children
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        operations.push(...collectRedisFromStack(node.children))
      }
    })
    return operations
  }
  const collectRedis = (spans) => {
    spans.forEach(span => {
      // First, collect Redis operations directly from span level (from spans_full.redis field)
      if (span.redis && Array.isArray(span.redis) && span.redis.length > 0) {
        span.redis.forEach(op => {
          allRedisOperations.push({
            span: span.name,
            spanId: span.span_id,
            operation: op,
          })
        })
      }
      // Also check for RedisOperations (alternative field name)
      if (span.RedisOperations && Array.isArray(span.RedisOperations) && span.RedisOperations.length > 0) {
        span.RedisOperations.forEach(op => {
          allRedisOperations.push({
            span: span.name,
            spanId: span.span_id,
            operation: op,
          })
        })
      }
      
      // Collect from call stack (for Redis operations stored in individual call nodes)
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        const stackOps = collectRedisFromStack(stackData)
        stackOps.forEach(op => {
          allRedisOperations.push({
            span: span.name,
            spanId: span.span_id,
            operation: op,
          })
        })
      }
      
      if (span.children) {
        collectRedis(span.children)
      }
    })
  }
  if (trace.spans) {
    collectRedis(trace.spans)
  }

  // Note: allTags is now calculated using useMemo above, before early returns

  // Collect all dumps
  const allDumps = []
  const collectDumps = (spans) => {
    spans.forEach(span => {
      if (span.dumps && Array.isArray(span.dumps) && span.dumps.length > 0) {
        allDumps.push({
          span: span.name,
          spanId: span.span_id,
          dumps: span.dumps,
        })
      }
      if (span.children) {
        collectDumps(span.children)
      }
    })
  }
  if (trace.spans) {
    collectDumps(trace.spans)
  }

  const formatDuration = (ms) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const getDumpDisplayFormat = (spanIdx, dumpIdx) => {
    const key = `${spanIdx}-${dumpIdx}`
    return dumpFormat[key] || 'tree'
  }

  const setDumpDisplayFormatForKey = (spanIdx, dumpIdx, format) => {
    const key = `${spanIdx}-${dumpIdx}`
    setDumpFormat(prev => ({ ...prev, [key]: format }))
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

  return (
    <div className="trace-view">
      <div className="trace-view-header">
        <div className="trace-view-header-left">
          <Link to="/traces" className="back-link btn btn-ghost">
            <FiArrowLeft />
            <span>Back to Traces</span>
          </Link>
          <div className="trace-title-section">
            <FiActivity className="trace-icon" />
            <h1>Trace: <code>{traceId}</code></h1>
            <HelpIcon text="Detailed view of a single trace. Explore spans, SQL queries, network requests, stack traces, and more." position="right" />
          </div>
        </div>
        <div className="trace-view-header-right">
          <Link 
            to="/compare" 
            className="btn btn-primary compare-link"
            state={{ trace1Id: traceId }}
          >
            <FiShuffle />
            <span>Compare Traces</span>
          </Link>
          <CopyToClipboard text={traceId} label="Copy Trace ID" />
          <ShareButton />
        </div>
      </div>

      <div className="trace-view-info card">
        <div className="info-item">
          <FiServer className="info-icon" />
          <div className="info-content">
            <strong>Service <HelpIcon text="The service that generated this trace" position="right" /></strong>
            <span>{trace.spans?.[0]?.service || 'N/A'}</span>
          </div>
        </div>
        <div className="info-item">
          <FiLayers className="info-icon" />
          <div className="info-content">
            <strong>Total Spans <HelpIcon text="Number of individual operations (spans) in this trace" position="right" /></strong>
            <span>{trace.spans?.length || 0}</span>
          </div>
        </div>
        <div className="info-item">
          <FiClock className="info-icon" />
          <div className="info-content">
            <strong>Duration <HelpIcon text="Total execution time of the trace" position="right" /></strong>
            <span>{formatDuration(trace.spans?.[0]?.duration_ms || 0)}</span>
          </div>
        </div>
        <div className="info-item">
          {trace.spans?.[0]?.status === 'error' || trace.spans?.[0]?.status === '0' ? (
            <FiAlertCircle className="info-icon error" />
          ) : (
            <FiCheckCircle className="info-icon success" />
          )}
          <div className="info-content">
            <strong>Status</strong>
            <span className={`status-badge ${trace.spans?.[0]?.status === 'error' || trace.spans?.[0]?.status === '0' ? 'error' : 'ok'}`}>
              {trace.spans?.[0]?.status === 'error' || trace.spans?.[0]?.status === '0' ? (
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
          </div>
        </div>
      </div>

      <div className={`trace-view-tabs-wrapper ${showLeftScroll ? 'show-left' : ''} ${showRightScroll ? 'show-right' : ''}`}>
        {showLeftScroll && (
          <button
            className="tab-scroll-button tab-scroll-left"
            onClick={() => scrollTabs('left')}
            aria-label="Scroll tabs left"
          >
            <FiChevronLeft />
          </button>
        )}
        <div 
          className="trace-view-tabs"
          ref={tabsContainerRef}
          onScroll={checkScrollPosition}
        >
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <FiInfo className="tab-icon" />
            <span>Overview</span>
            <HelpIcon text="General information about the trace including statistics and summary" position="right" />
          </button>
        {callStack.length > 0 && (
        <button
            className={`tab ${activeTab === 'stacktree' ? 'active' : ''}`}
            onClick={() => setActiveTab('stacktree')}
        >
            <FiActivity className="tab-icon" />
            <span>Execution Stack Tree</span>
            <HelpIcon text="Hierarchical tree view of function calls showing execution flow and timing" position="right" />
        </button>
        )}
        {callStack.length > 0 && (
          <>
            <button
              className={`tab ${activeTab === 'flame' ? 'active' : ''}`}
              onClick={() => setActiveTab('flame')}
            >
              <FiLayers className="tab-icon" />
              <span>Flame Graph</span>
              <HelpIcon text="Visual representation of function call hierarchy and execution time. Width represents time spent." position="right" />
            </button>
            <button
              className={`tab ${activeTab === 'callgraph' ? 'active' : ''}`}
              onClick={() => setActiveTab('callgraph')}
            >
              <FiGitBranch className="tab-icon" />
              <span>Call Graph</span>
              <HelpIcon text="Graph visualization showing relationships between function calls" position="right" />
            </button>
          </>
        )}
        {allSqlQueries.length > 0 && (
          <button
            className={`tab ${activeTab === 'sql' ? 'active' : ''}`}
            onClick={() => setActiveTab('sql')}
          >
            <FiDatabase className="tab-icon" />
            <span>SQL Queries</span>
            <span className="tab-badge">{allSqlQueries.length}</span>
            <HelpIcon text="View all SQL queries executed during the trace with execution details" position="right" />
          </button>
        )}
        {allStackTraces.length > 0 && (
          <button
            className={`tab ${activeTab === 'stacks' ? 'active' : ''}`}
            onClick={() => setActiveTab('stacks')}
          >
            <FiCode className="tab-icon" />
            <span>Stack Traces</span>
            <span className="tab-badge">{allStackTraces.length}</span>
            <HelpIcon text="View detailed stack traces showing function call sequences" position="right" />
          </button>
        )}
        {allNetworkRequests.filter(r => r.type === 'http').length > 0 && (
          <button
            className={`tab ${activeTab === 'network' ? 'active' : ''}`}
            onClick={() => setActiveTab('network')}
          >
            <FiGlobe className="tab-icon" />
            <span>HTTP/cURL</span>
            <span className="tab-badge">{allNetworkRequests.filter(r => r.type === 'http').length}</span>
            <HelpIcon text="View HTTP requests and cURL commands executed during the trace" position="right" />
          </button>
        )}
        {allCacheOperations.length > 0 && (
          <button
            className={`tab ${activeTab === 'cache' ? 'active' : ''}`}
            onClick={() => setActiveTab('cache')}
          >
            <FiZap className="tab-icon" />
            <span>Cache</span>
            <span className="tab-badge">{allCacheOperations.length}</span>
            <HelpIcon text="View cache operations (APCu, Symfony Cache, etc.) with hit/miss information and cache type" position="right" />
          </button>
        )}
        {allRedisOperations.length > 0 && (
          <button
            className={`tab ${activeTab === 'redis' ? 'active' : ''}`}
            onClick={() => setActiveTab('redis')}
          >
            <FiHardDrive className="tab-icon" />
            <span>Redis</span>
            <span className="tab-badge">{allRedisOperations.length}</span>
            <HelpIcon text="View Redis operations executed during the trace" position="right" />
          </button>
        )}
        <button
          className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <FiFileText className="tab-icon" />
          <span>Logs</span>
          {logCount > 0 && <span className="tab-badge">{logCount}</span>}
          <HelpIcon text="View correlated log entries for this trace" position="right" />
        </button>
        {allDumps.length > 0 && (
          <button
            className={`tab ${activeTab === 'dumps' ? 'active' : ''}`}
            onClick={() => setActiveTab('dumps')}
          >
            <FiCode className="tab-icon" />
            <span>Dumps</span>
            <span className="tab-badge">{allDumps.reduce((sum, item) => sum + item.dumps.length, 0)}</span>
            <HelpIcon text="View variable dumps and debugging information captured during execution" position="right" />
          </button>
        )}
        {allTags.length > 0 && (
          <button
            className={`tab ${activeTab === 'tags' ? 'active' : ''}`}
            onClick={() => setActiveTab('tags')}
          >
            <FiTag className="tab-icon" />
            <span>Tags</span>
            <span className="tab-badge">{allTags.length}</span>
            <HelpIcon text="View metadata tags associated with spans including HTTP request/response data" position="right" />
          </button>
        )}
        </div>
        {showRightScroll && (
          <button
            className="tab-scroll-button tab-scroll-right"
            onClick={() => scrollTabs('right')}
            aria-label="Scroll tabs right"
          >
            <FiChevronRight />
          </button>
        )}
      </div>

      <div className="trace-view-content">
        {activeTab === 'overview' && (
          <div className="trace-overview">
            <h2>Trace Overview</h2>
            <div className="overview-grid">
              <div className="overview-card">
                <h3>General Information</h3>
                <dl>
                  <dt>Trace ID</dt>
                  <dd>{traceId}</dd>
                  <dt>Service</dt>
                  <dd>{trace.spans?.[0]?.service || 'N/A'}</dd>
                  <dt>Total Spans</dt>
                  <dd>{trace.spans?.length || 0}</dd>
                  <dt>Duration</dt>
                  <dd>{formatDuration(trace.spans?.[0]?.duration_ms || 0)}</dd>
                  <dt>Status</dt>
                  <dd>
                    <span className={`status-badge ${trace.spans?.[0]?.status === 'error' || trace.spans?.[0]?.status === '0' ? 'error' : 'ok'}`}>
                      {trace.spans?.[0]?.status === 'error' || trace.spans?.[0]?.status === '0' ? 'Error' : 'OK'}
                    </span>
                  </dd>
                  {clientIp && (
                    <>
                      <dt>Client IP</dt>
                      <dd><code>{clientIp}</code></dd>
                    </>
                  )}
                </dl>
              </div>
              <div className="overview-card">
                <h3>Statistics</h3>
                <dl>
                  <dt>SQL Queries</dt>
                  <dd>{allSqlQueries.length}</dd>
                  <dt>HTTP Requests (cURL)</dt>
                  <dd>{allNetworkRequests.filter(r => r.type === 'http').length}</dd>
                  <dt>Cache Operations</dt>
                  <dd>{allCacheOperations.length}</dd>
                  <dt>Redis Operations</dt>
                  <dd>{allRedisOperations.length}</dd>
                  <dt>Stack Traces</dt>
                  <dd>{allStackTraces.length}</dd>
                  <dt>Tags</dt>
                  <dd>{allTags.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'flame' && (
          <div className="trace-flame">
            {callStack.length > 0 ? (
              <FlameGraph callStack={callStack} width={1200} height={600} />
            ) : (
              <div className="trace-flame-empty">
                No call stack data available. Stack length: {callStack.length}
              </div>
            )}
          </div>
        )}

        {activeTab === 'callgraph' && (
          <div className="trace-callgraph">
            {callStack.length > 0 ? (
              <CallGraph callStack={callStack} width={1200} height={800} />
            ) : (
              <div className="trace-callgraph-empty">
                No call stack data available. Stack length: {callStack.length}
              </div>
            )}
          </div>
        )}

        {activeTab === 'stacktree' && (
          <div className="trace-stacktree">
            {callStack.length > 0 ? (
              <ExecutionStackTree callStack={callStack} />
            ) : (
              <div className="trace-stacktree-empty">
                No call stack data available. Stack length: {callStack.length}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sql' && (
          <div className="trace-sql">
            <TraceTabFilters
              onFiltersChange={setSqlFilters}
              availableFilters={['duration']}
            />
            <h2>SQL Queries</h2>
            {allSqlQueries
              .filter((item) => {
                if (!sqlFilters.enabled) return true
                const duration = item.query?.duration_ms || item.query?.duration || 0
                return duration >= (sqlFilters.thresholds.duration || 0)
              })
              .map((item, idx) => (
              <div key={idx} className="sql-query-item">
                <div className="sql-query-header">
                  <h3>Query {idx + 1} - {item.span}</h3>
                  <span className="span-id">Span: {item.spanId}</span>
                </div>
                <SqlQueryViewer query={item.query} />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'stacks' && (
          <div className="trace-stacks">
            <TraceTabFilters
              onFiltersChange={setStacksFilters}
              availableFilters={['duration']}
            />
            <h2>Stack Traces</h2>
            {allStackTraces
              .filter((item) => {
                if (!stacksFilters.enabled) return true
                // Filter by max duration in stack if available
                const maxDuration = item.stack?.reduce((max, node) => {
                  const duration = node.duration_ms || node.DurationMs || node.duration || 0
                  return Math.max(max, duration)
                }, 0) || 0
                return maxDuration >= (stacksFilters.thresholds.duration || 0)
              })
              .map((item, idx) => (
              <div key={idx} className="stack-trace-item">
                <div className="stack-trace-header">
                  <h3>Stack Trace {idx + 1} - {item.span}</h3>
                  <span className="span-id">Span: {item.spanId}</span>
                </div>
                <StackTraceViewer stack={item.stack} />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'network' && allNetworkRequests.filter(r => r.type === 'http').length > 0 && (
          <div className="trace-network">
            <TraceTabFilters
              onFiltersChange={setNetworkFilters}
              availableFilters={['duration', 'network']}
            />
            <h2>HTTP Requests (cURL)</h2>
            <div className="network-table-container">
              <table className="network-table">
                <thead>
                  <tr>
                    <th>Span</th>
                    <th>Span ID</th>
                    <th>Method</th>
                    <th>URL</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Bytes Sent</th>
                    <th>Bytes Received</th>
                    <th>Timing</th>
                    <th>Details</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {allNetworkRequests
                    .filter(r => r.type === 'http' && r.request)
                    .filter((item) => {
                      if (!networkFilters.enabled) return true
                      const duration = item.request?.duration_ms || 0
                      // Use fallback values when bytes_sent/bytes_received are 0
                      // Priority: curl_bytes_* > bytes_* > request_size/response_size
                      const bytesSent = item.request?.curl_bytes_sent || 
                                       item.request?.bytes_sent || 
                                       item.request?.request_size || 
                                       0
                      const bytesReceived = item.request?.curl_bytes_received || 
                                           item.request?.bytes_received || 
                                           item.request?.response_size || 
                                           0
                      const totalBytes = bytesSent + bytesReceived
                      return duration >= (networkFilters.thresholds.duration || 0) &&
                             totalBytes >= (networkFilters.thresholds.network || 0)
                    })
                    .map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.span}</td>
                      <td className="span-id-cell">{item.spanId}</td>
                      <td><code>{item.request.method || 'GET'}</code></td>
                      <td className="url-cell">
                        {item.request.url || item.request.uri || 'N/A'}
                        {item.request.query_string && (
                          <div className="query-string"><code>?{item.request.query_string}</code></div>
                        )}
                        {(item.request.request_headers_raw || item.request.response_headers_raw) && (
                          <details className="headers-details">
                            <summary>Headers</summary>
                            {item.request.request_headers_raw && (
                              <div className="request-headers-section">
                                <strong>Request:</strong>
                                <pre>{item.request.request_headers_raw}</pre>
                              </div>
                            )}
                            {item.request.response_headers_raw && (
                              <div className="response-headers-section">
                                <strong>Response:</strong>
                                <pre>{item.request.response_headers_raw}</pre>
                              </div>
                            )}
                          </details>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${item.request.status_code >= 400 ? 'error' : item.request.status_code >= 300 ? 'warning' : 'ok'}`}>
                          {item.request.status_code || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <div className="duration-main">{formatDuration(item.request.duration_ms || 0)}</div>
                        {item.request.total_time_ms && (
                          <div className="network-timing">
                            <small>Total: {formatDuration(item.request.total_time_ms)}</small>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="bytes-info">
                          {item.request.curl_bytes_sent !== undefined ? (
                            <>
                              <div><strong>cURL:</strong> {(item.request.curl_bytes_sent / 1024).toFixed(2)} KB</div>
                              {item.request.system_bytes_sent !== undefined && item.request.system_bytes_sent !== item.request.curl_bytes_sent && (
                                <div><small>System: {(item.request.system_bytes_sent / 1024).toFixed(2)} KB</small></div>
                              )}
                            </>
                          ) : (
                            <div>
                              {(() => {
                                // Use request_size as fallback when bytes_sent is 0
                                const bytesSent = item.request.bytes_sent || 0;
                                const displayBytes = (bytesSent === 0 && item.request.request_size) 
                                  ? item.request.request_size 
                                  : bytesSent;
                                return displayBytes > 0 ? `${(displayBytes / 1024).toFixed(2)} KB` : '0';
                              })()}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="bytes-info">
                          {item.request.curl_bytes_received !== undefined ? (
                            <>
                              <div><strong>cURL:</strong> {(item.request.curl_bytes_received / 1024).toFixed(2)} KB</div>
                              {item.request.system_bytes_received !== undefined && item.request.system_bytes_received !== item.request.curl_bytes_received && (
                                <div><small>System: {(item.request.system_bytes_received / 1024).toFixed(2)} KB</small></div>
                              )}
                            </>
                          ) : (
                            <div>
                              {(() => {
                                // Use response_size as fallback when bytes_received is 0
                                const bytesReceived = item.request.bytes_received || 0;
                                const displayBytes = (bytesReceived === 0 && item.request.response_size) 
                                  ? item.request.response_size 
                                  : bytesReceived;
                                return displayBytes > 0 ? `${(displayBytes / 1024).toFixed(2)} KB` : '0';
                              })()}
                            </div>
                          )}
                          {item.request.response_size && 
                           item.request.response_size !== item.request.curl_bytes_received && 
                           item.request.response_size !== item.request.bytes_received && 
                           item.request.bytes_received !== 0 && (
                            <div><small>Size: {(item.request.response_size / 1024).toFixed(2)} KB</small></div>
                          )}
                        </div>
                      </td>
                      <td>
                        <details className="timing-details">
                          <summary>Timing Breakdown</summary>
                          <div className="timing-breakdown">
                            {item.request.dns_time_ms && (
                              <div className="timing-item">
                                <strong>DNS Lookup:</strong> {formatDuration(item.request.dns_time_ms)}
                              </div>
                            )}
                            {item.request.connect_time_ms && (
                              <div className="timing-item">
                                <strong>Connect:</strong> {formatDuration(item.request.connect_time_ms)}
                              </div>
                            )}
                            {item.request.pretransfer_time_ms && (
                              <div className="timing-item">
                                <strong>Pre-Transfer:</strong> {formatDuration(item.request.pretransfer_time_ms)}
                              </div>
                            )}
                            {item.request.starttransfer_time_ms && (
                              <div className="timing-item">
                                <strong>Start Transfer:</strong> {formatDuration(item.request.starttransfer_time_ms)}
                              </div>
                            )}
                            {item.request.total_time_ms && (
                              <div className="timing-item">
                                <strong>Total Time:</strong> {formatDuration(item.request.total_time_ms)}
                              </div>
                            )}
                            {item.request.network_time_ms && (
                              <div className="timing-item">
                                <strong>Network Time:</strong> {formatDuration(item.request.network_time_ms)}
                              </div>
                            )}
                          </div>
                        </details>
                      </td>
                      <td>
                        <details className="request-details">
                          <summary>View Details</summary>
                          <div className="request-details-content">
                            {item.request.effective_url && item.request.effective_url !== item.request.url && (
                              <div className="detail-row">
                                <strong>Effective URL:</strong> {item.request.effective_url}
                              </div>
                            )}
                            {item.request.content_type && (
                              <div className="detail-row">
                                <strong>Content Type:</strong> {item.request.content_type}
                              </div>
                            )}
                            {item.request.redirect_count !== undefined && item.request.redirect_count > 0 && (
                              <div className="detail-row">
                                <strong>Redirects:</strong> {item.request.redirect_count}
                                {item.request.redirect_url && (
                                  <div><small>→ {item.request.redirect_url}</small></div>
                                )}
                              </div>
                            )}
                            {item.request.ssl_verify_result !== undefined && item.request.ssl_verify_result !== 0 && (
                              <div className="detail-row">
                                <strong>SSL Verify Result:</strong> {item.request.ssl_verify_result}
                              </div>
                            )}
                            {item.request.uri && (
                              <div className="detail-row">
                                <strong>URI Path:</strong> {item.request.uri}
                              </div>
                            )}
                            {item.request.query_string && (
                              <div className="detail-row">
                                <strong>Query String:</strong> <code>{item.request.query_string}</code>
                              </div>
                            )}
                            {item.request.request_body && (
                              <div className="detail-row">
                                <strong>Request Body:</strong>
                                <details className="body-details">
                                  <summary>View Body ({item.request.request_body.length} bytes)</summary>
                                  <pre className="body-content">{item.request.request_body}</pre>
                                </details>
                              </div>
                            )}
                            {item.request.response_body && (
                              <div className="detail-row">
                                <strong>Response Body:</strong>
                                <details className="body-details">
                                  <summary>View Body ({item.request.response_body.length} bytes)</summary>
                                  <pre className="body-content">{item.request.response_body}</pre>
                                </details>
                              </div>
                            )}
                            {(item.request.request_headers_raw || item.request.response_headers_raw) && (
                              <div className="detail-row">
                                <strong>Headers:</strong>
                                <details className="headers-details">
                                  <summary>View Headers</summary>
                                  {item.request.request_headers_raw && (
                                    <div className="request-headers-section">
                                      <strong>Request Headers:</strong>
                                      <pre>{item.request.request_headers_raw}</pre>
                                    </div>
                                  )}
                                  {item.request.response_headers_raw && (
                                    <div className="response-headers-section">
                                      <strong>Response Headers:</strong>
                                      <pre>{item.request.response_headers_raw}</pre>
                                    </div>
                                  )}
                                </details>
                              </div>
                            )}
                          </div>
                        </details>
                      </td>
                      <td className="error-cell">{item.request.error || '-'}</td>
                    </tr>
                  ))}
                  {allNetworkRequests.filter(r => r.type === 'legacy').map((item, idx) => (
                    <tr key={`legacy-${idx}`}>
                      <td>{item.span}</td>
                      <td className="span-id-cell">{item.spanId}</td>
                      <td colSpan="9">
                        <pre>{JSON.stringify(item.net, null, 2)}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'cache' && (
          <div className="trace-cache">
            <TraceTabFilters
              onFiltersChange={setCacheFilters}
              availableFilters={['duration', 'memory']}
            />
            <h2>Cache Operations</h2>
            <div className="cache-table-container">
              <table className="cache-table">
                <thead>
                  <tr>
                    <th>Span</th>
                    <th>Span ID</th>
                    <th>Cache Type</th>
                    <th>Operation</th>
                    <th>Key</th>
                    <th>Hit/Miss</th>
                    <th>Duration</th>
                    <th>Data Size</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {allCacheOperations
                    .filter((item) => {
                      if (!cacheFilters.enabled) return true
                      const duration = item.operation?.duration_ms || 0
                      const dataSize = item.operation?.data_size || 0
                      return duration >= (cacheFilters.thresholds.duration || 0) &&
                             dataSize >= (cacheFilters.thresholds.memory || 0)
                    })
                    .map((item, idx) => {
                      const cacheType = item.operation?.cache_type || item.operation?.CacheType || 'unknown'
                      const cacheTypeLabel = cacheType === 'apcu' ? 'APCu' : 
                                           cacheType === 'symfony' ? 'Symfony Cache' : 
                                           cacheType.charAt(0).toUpperCase() + cacheType.slice(1)
                      return (
                      <tr key={idx}>
                        <td>{item.span}</td>
                        <td className="span-id-cell">{item.spanId}</td>
                        <td>
                          <span className="cache-type-badge">
                            {cacheTypeLabel}
                          </span>
                        </td>
                        <td><code className="operation-cell">{item.operation.operation || 'N/A'}</code></td>
                        <td className="key-cell">{item.operation.key || 'N/A'}</td>
                        <td>
                          {item.operation.hit !== undefined ? (
                            <span className={`hit-miss-badge ${item.operation.hit ? 'hit' : 'miss'}`}>
                              {item.operation.hit ? 'HIT' : 'MISS'}
                            </span>
                          ) : '-'}
                        </td>
                        <td>
                          <div className="duration-main">{formatDuration(item.operation.duration_ms || 0)}</div>
                          {item.operation.duration && (
                            <div className="duration-detail">
                              <small>{(item.operation.duration * 1000).toFixed(3)}ms</small>
                            </div>
                          )}
                        </td>
                        <td>{item.operation.data_size ? formatBytes(item.operation.data_size) : '-'}</td>
                        <td>
                          {item.operation.timestamp ? (
                            <div className="timestamp-cell">
                              {new Date(item.operation.timestamp * 1000).toLocaleTimeString()}
                            </div>
                          ) : '-'}
                        </td>
                      </tr>
                    )})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'redis' && (
          <div className="trace-redis">
            <TraceTabFilters
              onFiltersChange={setRedisFilters}
              availableFilters={['duration']}
            />
            <h2>Redis Operations</h2>
            <div className="redis-table-container">
              <table className="redis-table">
                <thead>
                  <tr>
                    <th>Span</th>
                    <th>Span ID</th>
                    <th>Command</th>
                    <th>Key</th>
                    <th>Host</th>
                    <th>Port</th>
                    <th>Hit/Miss</th>
                    <th>Duration</th>
                    <th>Timestamp</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {allRedisOperations
                    .filter((item) => {
                      if (!redisFilters.enabled) return true
                      const duration = item.operation?.duration_ms || 0
                      return duration >= (redisFilters.thresholds.duration || 0)
                    })
                    .map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.span}</td>
                      <td className="span-id-cell">{item.spanId}</td>
                      <td><code className="command-cell">{item.operation.command || 'N/A'}</code></td>
                      <td className="key-cell">{item.operation.key || 'N/A'}</td>
                      <td>{item.operation.host || '-'}</td>
                      <td>{item.operation.port || '-'}</td>
                      <td>
                        {item.operation.hit !== undefined ? (
                          <span className={`hit-miss-badge ${item.operation.hit ? 'hit' : 'miss'}`}>
                            {item.operation.hit ? 'HIT' : 'MISS'}
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        <div className="duration-main">{formatDuration(item.operation.duration_ms || 0)}</div>
                        {item.operation.duration && (
                          <div className="duration-detail">
                            <small>{(item.operation.duration * 1000).toFixed(3)}ms</small>
                          </div>
                        )}
                      </td>
                      <td>
                        {item.operation.timestamp ? (
                          <div className="timestamp-cell">
                            {new Date(item.operation.timestamp * 1000).toLocaleTimeString()}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="error-cell">{item.operation.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'tags' && (
          <div className="trace-tags">
            <h2>Tags {allTags.length > 50 && <span className="tags-count-badge">({allTags.length} total, showing {Math.min(visibleTagsCount, allTags.length)})</span>}</h2>
            <div className="tags-container" ref={tagsContainerRef}>
              {allTags.slice(0, visibleTagsCount).map((item, idx) => {
                // Extract CLI args and HTTP request/response from tags
                const cliArgs = item.tags.cli
                const httpRequest = item.tags.http_request
                const httpResponse = item.tags.http_response
                const otherTags = Object.fromEntries(
                  Object.entries(item.tags).filter(([key]) => 
                    !['cli', 'http_request', 'http_response'].includes(key)
                  )
                )
                
                return (
                <div key={idx} className="tags-item">
                  <div className="tags-header">
                    <h3>{item.span}</h3>
                    <span className="span-id">Span: {item.spanId}</span>
                  </div>
                  
                  {/* CLI Arguments Section */}
                  {cliArgs && (
                    <div className="tags-section cli-section">
                      <h4><FiTerminal /> CLI Command</h4>
                      {typeof cliArgs === 'object' && cliArgs.script && (
                        <div className="cli-details">
                          <div className="cli-script">
                            <strong>Script:</strong> <code>{cliArgs.script}</code>
                          </div>
                          {cliArgs.args && Array.isArray(cliArgs.args) && cliArgs.args.length > 0 && (
                            <div className="cli-args">
                              <strong>Arguments:</strong>
                              <ul>
                                {cliArgs.args.map((arg, argIdx) => (
                                  <li key={argIdx}><code>{String(arg)}</code></li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* HTTP Request Section */}
                  {httpRequest && (
                    <div className="tags-section http-request-section">
                      <h4><FiGlobe /> HTTP Request</h4>
                      {typeof httpRequest === 'object' && (
                        <div className="http-details">
                          {httpRequest.scheme && (
                            <div><strong>Scheme:</strong> <code>{httpRequest.scheme}</code></div>
                          )}
                          {httpRequest.host && (
                            <div><strong>Host:</strong> <code>{httpRequest.host}</code></div>
                          )}
                          {httpRequest.method && (
                            <div><strong>Method:</strong> <code>{httpRequest.method}</code></div>
                          )}
                          {httpRequest.uri && (
                            <div><strong>URI:</strong> <code>{httpRequest.uri}</code></div>
                          )}
                          {httpRequest.query_string && (
                            <div><strong>Query String (Arguments):</strong> <code>{httpRequest.query_string}</code></div>
                          )}
                          {httpRequest.request_size && (
                            <div><strong>Request Size:</strong> <code>{formatBytes(Number(httpRequest.request_size))}</code> <span className="size-detail">({httpRequest.request_size} bytes)</span></div>
                          )}
                          {httpRequest.request_headers && typeof httpRequest.request_headers === 'object' && (
                            <div className="http-headers">
                              <strong>Request Headers:</strong>
                              <pre>{JSON.stringify(httpRequest.request_headers, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* HTTP Response Section */}
                  {httpResponse && (
                    <div className="tags-section http-response-section">
                      <h4><FiServer /> HTTP Response</h4>
                      {typeof httpResponse === 'object' && (
                        <div className="http-details">
                          {httpResponse.status_code && (
                            <div><strong>Status Code:</strong> <code>{httpResponse.status_code}</code></div>
                          )}
                          {httpResponse.response_size && (
                            <div><strong>Response Size:</strong> <code>{formatBytes(Number(httpResponse.response_size))}</code> <span className="size-detail">({httpResponse.response_size} bytes)</span></div>
                          )}
                          {httpResponse.headers && typeof httpResponse.headers === 'object' && (
                            <div className="http-headers">
                              <strong>Response Headers:</strong>
                              <pre>{JSON.stringify(httpResponse.headers, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Other Tags */}
                  {Object.keys(otherTags).length > 0 && (
                    <div className="tags-list">
                      {Object.entries(otherTags).map(([key, value]) => (
                        <div key={key} className="tag-item">
                          <strong>{key}:</strong> {String(value)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )
              })}
              {allTags.length > visibleTagsCount && (
                <div ref={tagsSentinelRef} className="tags-sentinel">
                  {isLoadingMoreTags && (
                    <div className="tags-loading-more">
                      <LoadingSpinner message="Loading more tags..." />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="trace-logs">
            <LogCorrelation traceId={traceId} />
          </div>
        )}

        {activeTab === 'dumps' && (
          <div className="trace-dumps">
            <h2>Variable Dumps</h2>
            {allDumps.map((item, spanIdx) => (
              <div key={spanIdx} className="dumps-item">
                <div className="dumps-header">
                  <h3>{item.span}</h3>
                  <span className="span-id">Span: {item.spanId}</span>
                </div>
                <div className="dumps-list">
                  {item.dumps.map((dump, dumpIdx) => {
                    const displayFormat = getDumpDisplayFormat(spanIdx, dumpIdx)
                    const parsedData = parseDumpData(dump.data)
                    
                    // Get JSON string representation for raw JSON view
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
                    <div key={dumpIdx} className="dump-entry">
                      <div className="dump-meta">
                        <span className="dump-file">{dump.file || 'unknown'}</span>
                        <span className="dump-line">Line {dump.line || '?'}</span>
                        {dump.timestamp && (
                          <span className="dump-timestamp">
                            {new Date(dump.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                          <div className="dump-format-toggle">
                            <button
                              className={`format-btn ${displayFormat === 'tree' ? 'active' : ''}`}
                              onClick={() => setDumpDisplayFormatForKey(spanIdx, dumpIdx, 'tree')}
                            >
                              Tree
                            </button>
                            <button
                              className={`format-btn ${displayFormat === 'json' ? 'active' : ''}`}
                              onClick={() => setDumpDisplayFormatForKey(spanIdx, dumpIdx, 'json')}
                            >
                              JSON
                            </button>
                          </div>
                      </div>
                      <div className="dump-content">
                          {displayFormat === 'tree' ? (
                            <div className="dump-tree">
                              {parsedData !== null ? (
                                <JsonTreeViewer data={parsedData} />
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TraceView

