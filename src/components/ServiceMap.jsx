import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import axios from 'axios'
import { Network } from 'vis-network'
import { 
  FiRefreshCw, 
  FiInfo, 
  FiZoomIn, 
  FiZoomOut, 
  FiMaximize2,
  FiFilter,
  FiSearch,
  FiX,
  FiDownload,
  FiLayers,
  FiGitBranch
} from 'react-icons/fi'
import HelpIcon from './HelpIcon'
import TimeRangePicker from './TimeRangePicker'
import './ServiceMap.css'

const API_URL = import.meta.env.VITE_API_URL || ''

// Helper functions
function formatDuration(ms) {
  if (ms < 1) return `${Math.round(ms * 1000)}µs`
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

function getHealthColor(status) {
  switch (status) {
    case 'healthy':
      return '#4caf50'
    case 'degraded':
      return '#ff9800'
    case 'down':
      return '#f44336'
    default:
      return '#9e9e9e'
  }
}

function getTimeRangeParams(range) {
  const now = new Date()
  let from, to
  
  switch (range) {
    case '1h':
      from = new Date(now.getTime() - 60 * 60 * 1000)
      break
    case '6h':
      from = new Date(now.getTime() - 6 * 60 * 60 * 1000)
      break
    case '24h':
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      break
    case '7d':
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case '30d':
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    default:
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  }
  
  to = now
  return {
    from: from.toISOString().slice(0, 19).replace('T', ' '),
    to: to.toISOString().slice(0, 19).replace('T', ' ')
  }
}

function ServiceMap() {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [viewMode, setViewMode] = useState('force') // 'force' or 'hierarchical'
  const [timeRange, setTimeRange] = useState('24h')
  const [showFilters, setShowFilters] = useState(false)
  const [healthFilter, setHealthFilter] = useState('all') // 'all', 'healthy', 'degraded', 'down'
  const [serviceSearch, setServiceSearch] = useState('')
  const [showIsolated, setShowIsolated] = useState(true)
  const [showExternalDeps, setShowExternalDeps] = useState(true)
  const [httpCalls, setHttpCalls] = useState([])
  const [loadingHttpCalls, setLoadingHttpCalls] = useState(false)
  const containerRef = useRef(null)
  const networkRef = useRef(null)

  // Load HTTP/cURL calls for a service
  const loadHttpCalls = useCallback(async (serviceName) => {
    if (!serviceName || serviceName.startsWith('db:') || serviceName.startsWith('http://') || serviceName.startsWith('https://') || serviceName.startsWith('redis://') || serviceName.startsWith('cache:')) {
      setHttpCalls([])
      return
    }

    try {
      setLoadingHttpCalls(true)
      const token = localStorage.getItem('auth_token')
      const orgIdRaw = localStorage.getItem('organization_id') || 'default-org'
      const projIdRaw = localStorage.getItem('project_id') || 'default-project'
      const orgId = orgIdRaw === 'all' ? 'default-org' : orgIdRaw
      const projId = projIdRaw === 'all' ? 'default-project' : projIdRaw
      
      const timeParams = getTimeRangeParams(timeRange)
      const params = new URLSearchParams({
        from: timeParams.from,
        to: timeParams.to,
        limit: '100'
      })
      
      const response = await axios.get(`${API_URL}/api/services/${encodeURIComponent(serviceName)}/http-calls?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': orgId,
          'X-Project-ID': projId,
        },
      })
      
      const httpCallsData = response.data?.http_calls || []
      setHttpCalls(httpCallsData)
    } catch (error) {
      console.error('Failed to load HTTP calls:', error)
      setHttpCalls([])
    } finally {
      setLoadingHttpCalls(false)
    }
  }, [timeRange])

  // Load HTTP calls when a service node is selected
  useEffect(() => {
    if (selectedNode && selectedNode.node_type === 'service') {
      const serviceName = selectedNode.service || selectedNode.id
      loadHttpCalls(serviceName)
    } else {
      setHttpCalls([])
    }
  }, [selectedNode, loadHttpCalls])

  // Load service map data
  const loadServiceMap = useCallback(async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('auth_token')
      const orgIdRaw = localStorage.getItem('organization_id') || 'default-org'
      const projIdRaw = localStorage.getItem('project_id') || 'default-project'
      const orgId = orgIdRaw === 'all' ? 'default-org' : orgIdRaw
      const projId = projIdRaw === 'all' ? 'default-project' : projIdRaw
      
      const timeParams = getTimeRangeParams(timeRange)
      const params = new URLSearchParams({
        from: timeParams.from,
        to: timeParams.to
      })
      
      const url = `${API_URL}/api/service-map?${params.toString()}`
      console.log('[ServiceMap] Fetching from:', url)
      console.log('[ServiceMap] Headers:', { orgId, projId })
      
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': orgId,
          'X-Project-ID': projId,
        },
      })
      
      console.log('[ServiceMap] Response:', response.data)
      
      // API returns { nodes: [...], edges: [...] } directly
      const nodesData = Array.isArray(response.data?.nodes) ? response.data.nodes : []
      const edgesData = Array.isArray(response.data?.edges) ? response.data.edges : []
      
      console.log('[ServiceMap] Parsed data:', { nodes: nodesData.length, edges: edgesData.length })
      
      if (nodesData.length === 0 && edgesData.length === 0) {
        console.warn('[ServiceMap] No data returned from API. Response:', response.data)
      }
      
      setNodes(nodesData)
      setEdges(edgesData)
    } catch (error) {
      console.error('Failed to load service map:', error)
      if (error.response) {
        console.error('Response status:', error.response.status)
        console.error('Response data:', error.response.data)
      }
      if (error.request) {
        console.error('Request made but no response:', error.request)
      }
      setNodes([])
      setEdges([])
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    loadServiceMap()
    const interval = setInterval(loadServiceMap, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [loadServiceMap])

  // Filter nodes and edges based on filters
  const filteredData = useMemo(() => {
    let filteredNodes = [...nodes]
    let filteredEdges = [...edges]

    // Health filter
    if (healthFilter !== 'all') {
      filteredNodes = filteredNodes.filter(node => node.health_status === healthFilter)
      filteredEdges = filteredEdges.filter(edge => edge.health_status === healthFilter)
    }

    // Service search filter
    if (serviceSearch) {
      const searchLower = serviceSearch.toLowerCase()
      filteredNodes = filteredNodes.filter(node => {
        const serviceName = (node.service || node.id || '').toLowerCase()
        return serviceName.includes(searchLower)
      })
      // Filter edges that connect to filtered nodes
      const filteredServiceSet = new Set(filteredNodes.map(n => n.service || n.id))
      filteredEdges = filteredEdges.filter(edge => 
        filteredServiceSet.has(edge.from) && filteredServiceSet.has(edge.to)
      )
    }

    // Isolated services filter
    if (!showIsolated) {
      const serviceSet = new Set()
      filteredEdges.forEach(edge => {
        serviceSet.add(edge.from)
        serviceSet.add(edge.to)
      })
      filteredNodes = filteredNodes.filter(node => {
        const serviceName = node.service || node.id
        return serviceSet.has(serviceName)
      })
    }

    // External dependencies filter
    if (!showExternalDeps) {
      filteredNodes = filteredNodes.filter(node => {
        const nodeType = node.node_type || getNodeTypeFromName(node.service || node.id)
        return nodeType === 'service'
      })
      // Also filter edges that connect to external dependencies
      const serviceSet = new Set(filteredNodes.map(n => n.service || n.id))
      filteredEdges = filteredEdges.filter(edge => 
        serviceSet.has(edge.from) && serviceSet.has(edge.to)
      )
    }

    return { nodes: filteredNodes, edges: filteredEdges }
  }, [nodes, edges, healthFilter, serviceSearch, showIsolated, showExternalDeps])

  // Helper function to detect node type from name (used in filter)
  const getNodeTypeFromName = (name) => {
    if (!name) return 'service'
    if (name.startsWith('db:') || (name.includes('://') && (name.startsWith('mysql://') || name.startsWith('postgresql://') || name.startsWith('postgres://') || name.startsWith('mariadb://') || name.startsWith('sqlite://')))) {
      return 'database'
    }
    if (name.startsWith('http://') || name.startsWith('https://')) return 'http'
    if (name.startsWith('redis://') || name === 'redis') return 'redis'
    if (name.startsWith('cache:') || name.startsWith('cache://')) return 'cache'
    return 'service'
  }

  // Transform data for vis-network
  const graphData = useMemo(() => {
    const { nodes: filteredNodes, edges: filteredEdges } = filteredData

    // Calculate max values for scaling
    const maxCallCount = Math.max(...filteredEdges.map(e => e.call_count || 0), 1)
    const maxLatency = Math.max(...filteredEdges.map(e => e.avg_latency_ms || 0), 1)
    const maxErrorRate = Math.max(...filteredEdges.map(e => e.error_rate || 0), 1)

    // Helper function to detect node type
    const getNodeType = (node) => {
      if (node.node_type) {
        return node.node_type
      }
      const serviceName = node.service || node.id || ''
      if (serviceName.startsWith('db:') || (serviceName.includes('://') && (serviceName.startsWith('mysql://') || serviceName.startsWith('postgresql://') || serviceName.startsWith('postgres://') || serviceName.startsWith('mariadb://') || serviceName.startsWith('sqlite://')))) {
        return 'database'
      } else if (serviceName.startsWith('http://') || serviceName.startsWith('https://')) {
        return 'http'
      } else if (serviceName.startsWith('redis://') || serviceName === 'redis') {
        return 'redis'
      } else if (serviceName.startsWith('cache:') || serviceName.startsWith('cache://')) {
        return 'cache'
      }
      return 'service'
    }

    // Helper function to get node color based on type
    const getNodeColor = (nodeType, healthStatus) => {
      if (nodeType === 'service') {
        return getHealthColor(healthStatus)
      }
      // Different colors for external dependencies
      switch (nodeType) {
        case 'database':
          return '#2196f3' // Blue
        case 'http':
          return '#4caf50' // Green
        case 'redis':
          return '#f44336' // Red
        case 'cache':
          return '#ff9800' // Orange
        default:
          return '#9e9e9e' // Gray
      }
    }

    // Helper function to get node shape based on type
    const getNodeShape = (nodeType) => {
      switch (nodeType) {
        case 'database':
          return 'database'
        case 'http':
          return 'icon'
        case 'redis':
          return 'diamond'
        case 'cache':
          return 'triangle'
        default:
          return 'box'
      }
    }

    // Create vis-network nodes
    const visNodes = filteredNodes.map(node => {
      const serviceName = node.service || node.id
      const healthStatus = node.health_status || 'unknown'
      const nodeType = getNodeType(node)
      const color = getNodeColor(nodeType, healthStatus)
      
      // Calculate node size based on importance (number of connections)
      const connectionCount = filteredEdges.filter(e => 
        e.from === serviceName || e.to === serviceName
      ).length
      // External dependencies are slightly smaller
      const baseSize = nodeType === 'service' ? 30 : 25
      const nodeSize = Math.max(baseSize, Math.min(80, baseSize + connectionCount * 5))

      // Format label for external dependencies
      let label = serviceName
      if (nodeType === 'database') {
        if (serviceName.startsWith('db:')) {
          label = serviceName.replace('db:', '')
        } else if (serviceName.includes('://')) {
          // Format: mysql://hostname or postgresql://hostname
          try {
            const url = new URL(serviceName)
            label = `${url.protocol.replace(':', '')}://${url.hostname}`
          } catch (e) {
            // If URL parsing fails, try to extract hostname manually
            const parts = serviceName.split('://')
            if (parts.length === 2) {
              const hostPart = parts[1].split('/')[0]
              label = `${parts[0]}://${hostPart}`
            } else {
              label = serviceName
            }
          }
        }
      } else if (nodeType === 'http') {
        try {
          const url = new URL(serviceName)
          label = url.hostname
        } catch (e) {
          label = serviceName
        }
      } else if (nodeType === 'redis' && serviceName.startsWith('redis://')) {
        label = serviceName.replace('redis://', '')
      } else if (nodeType === 'cache' && serviceName.startsWith('cache:')) {
        label = serviceName.replace('cache:', '')
      }
      
      if (label.length > 20) {
        label = label.substring(0, 20) + '...'
      }

      return {
        id: serviceName,
        label: label,
        title: `${serviceName}\nType: ${nodeType}\nStatus: ${healthStatus}\nConnections: ${connectionCount}`,
        color: {
          background: color,
          border: '#ffffff',
          highlight: {
            background: color,
            border: '#4a9eff',
          },
        },
        font: {
          size: nodeType === 'service' ? 12 : 11,
          color: '#ffffff',
          face: 'Arial, sans-serif',
        },
        shape: getNodeShape(nodeType),
        size: nodeSize,
        borderWidth: 2,
        data: { ...node, node_type: nodeType },
      }
    })

    // Create vis-network edges
    const visEdges = filteredEdges.map((edge, idx) => {
      const healthStatus = edge.health_status || 'healthy'
      const color = getHealthColor(healthStatus)
      
      // Calculate edge width based on call count
      const callCount = edge.call_count || 0
      const width = Math.max(1, Math.min(8, 1 + (callCount / maxCallCount) * 7))
      
      // Create edge label with metrics
      const latency = edge.avg_latency_ms || 0
      const errorRate = edge.error_rate || 0
      const label = `${formatDuration(latency)} | ${errorRate.toFixed(1)}%`

      return {
        id: `edge-${idx}`,
        from: edge.from,
        to: edge.to,
        label: label,
        title: `${edge.from} → ${edge.to}\nAvg Latency: ${formatDuration(latency)}\nError Rate: ${errorRate.toFixed(2)}%\nCall Count: ${(callCount || 0).toLocaleString()}\nP95 Latency: ${formatDuration(edge.p95_latency_ms || 0)}\nP99 Latency: ${formatDuration(edge.p99_latency_ms || 0)}\nThroughput: ${(edge.throughput || 0).toFixed(2)} req/s\nTraffic: ${formatBytes((edge.bytes_sent || 0) + (edge.bytes_received || 0))}`,
        color: {
          color: color,
          highlight: '#4a9eff',
          hover: '#4a9eff',
        },
        width: width,
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 1.0,
            type: 'arrow',
          },
        },
        smooth: {
          type: 'curvedCW',
          roundness: 0.2,
        },
        font: {
          size: 10,
          color: '#666',
          face: 'Arial, sans-serif',
          align: 'middle',
        },
        data: edge,
      }
    })

    return { nodes: visNodes, edges: visEdges }
  }, [filteredData])

  // Initialize vis-network (only when viewMode changes or on mount)
  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    // If network already exists and only viewMode changed, destroy and recreate
    if (networkRef.current) {
      networkRef.current.destroy()
      networkRef.current = null
    }

    // Create new network with current data
    const data = {
      nodes: graphData.nodes,
      edges: graphData.edges,
    }

    const options = {
      layout: viewMode === 'hierarchical' ? {
        hierarchical: {
          direction: 'UD',
          sortMethod: 'hubsize',
          levelSeparation: 200,
          nodeSpacing: 150,
          treeSpacing: 300,
          blockShifting: true,
          edgeMinimization: true,
          parentCentralization: true,
          shakeTowards: 'leaves',
        },
      } : {
        improvedLayout: true,
      },
      physics: viewMode === 'hierarchical' ? {
        enabled: false,
      } : {
        enabled: true,
        stabilization: {
          iterations: 200,
          fit: true,
        },
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.3,
          springLength: 150,
          springConstant: 0.04,
          damping: 0.09,
        },
      },
      nodes: {
        borderWidth: 2,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.2)',
          size: 5,
          x: 2,
          y: 2,
        },
        font: {
          size: 12,
          color: '#ffffff',
          face: 'Arial, sans-serif',
        },
        shapeProperties: {
          borderRadius: 4,
        },
        margin: 10,
      },
      edges: {
        color: {
          color: '#b0b0b0',
          highlight: '#4a9eff',
          hover: '#4a9eff',
        },
        smooth: {
          type: 'curvedCW',
          roundness: 0.2,
        },
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 1.2,
            type: 'arrow',
            length: 15,
          },
        },
        selectionWidth: 3,
        font: {
          size: 10,
          color: '#666',
          face: 'Arial, sans-serif',
          align: 'middle',
        },
        labelHighlightBold: false,
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        zoomView: true,
        dragView: true,
        selectConnectedEdges: true,
      },
    }

    const network = new Network(containerRef.current, data, options)
    networkRef.current = network

    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0]
        const node = graphData.nodes.find((n) => n.id === nodeId)
        if (node) {
          setSelectedNode(node.data)
          setSelectedEdge(null)
          network.setSelection({ nodes: [nodeId] })
        }
      } else if (params.edges.length > 0) {
        const edgeId = params.edges[0]
        const edge = graphData.edges.find((e) => e.id === edgeId)
        if (edge) {
          setSelectedEdge(edge.data)
          setSelectedNode(null)
          network.setSelection({ edges: [edgeId] })
        }
      } else {
        setSelectedNode(null)
        setSelectedEdge(null)
        network.setSelection({ nodes: [], edges: [] })
      }
    })

    setTimeout(() => {
      network.fit({ animation: { duration: 300 } })
    }, 100)
    
    if (viewMode === 'hierarchical') {
      setTimeout(() => {
        network.fit({ animation: { duration: 300 } })
      }, 500)
    }

    return () => {
      // Cleanup: destroy network when component unmounts
      if (networkRef.current) {
        networkRef.current.destroy()
        networkRef.current = null
      }
    }
  }, [viewMode]) // Only recreate when viewMode changes

  // Update network data when graphData changes (but not viewMode)
  useEffect(() => {
    if (networkRef.current && containerRef.current) {
      const data = {
        nodes: graphData.nodes,
        edges: graphData.edges,
      }
      networkRef.current.setData(data)
      // Fit to view after data update (only if there are nodes)
      if (graphData.nodes.length > 0) {
        setTimeout(() => {
          if (networkRef.current) {
            networkRef.current.fit({ animation: { duration: 300 } })
          }
        }, 100)
      }
    }
  }, [graphData])

  // Zoom controls
  const handleZoomIn = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale()
      networkRef.current.moveTo({ scale: scale * 1.2 })
    }
  }

  const handleZoomOut = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale()
      networkRef.current.moveTo({ scale: scale * 0.8 })
    }
  }

  const handleFit = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: true })
    }
  }

  const handleExport = () => {
    if (networkRef.current) {
      const canvas = networkRef.current.getCanvas()
      const dataURL = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `service-map-${new Date().toISOString().slice(0, 10)}.png`
      link.href = dataURL
      link.click()
    }
  }

  if (loading && (!nodes || nodes.length === 0)) {
    return (
      <div className="service-map-container">
        <div className="service-map-loading">Loading service map...</div>
      </div>
    )
  }

  if (!loading && (!nodes || nodes.length === 0)) {
    return (
      <div className="service-map-container">
        <div className="service-map-header">
          <h2>Service Map <HelpIcon text="Visualize service dependencies and relationships. Nodes represent services, edges show communication between them." position="right" /></h2>
          <div className="service-map-controls">
            <TimeRangePicker value={timeRange} onChange={setTimeRange} />
            <button onClick={loadServiceMap} className="refresh-btn">
              <FiRefreshCw /> Refresh
            </button>
          </div>
        </div>
        <div className="service-map-content">
          <div className="empty-state">
            <h3>No Service Data Available</h3>
            <p>No service dependencies found for the selected time range.</p>
            <p>Try:</p>
            <ul>
              <li>Selecting a different time range (e.g., 7 days or 30 days)</li>
              <li>Making some requests to generate service dependencies</li>
              <li>Checking the browser console for API errors</li>
            </ul>
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>
              Check the browser console (F12) for detailed error messages.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="service-map-container">
      <div className="service-map-header">
        <h2>Service Map <HelpIcon text="Visualize service dependencies and relationships. Nodes represent services, edges show communication between them." position="right" /></h2>
        <div className="service-map-controls">
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          <button 
            onClick={() => setShowFilters(!showFilters)} 
            className={`control-btn ${showFilters ? 'active' : ''}`}
            title="Toggle Filters"
          >
            <FiFilter /> Filters
          </button>
          <button onClick={loadServiceMap} className="refresh-btn">
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      <div className="service-map-content">
        {/* Filter Panel */}
        {showFilters && (
          <div className="service-map-filters">
            <div className="filter-section">
              <h3>Filters</h3>
              <button 
                className="filter-close" 
                onClick={() => setShowFilters(false)}
                title="Close Filters"
              >
                <FiX />
              </button>
            </div>
            
            <div className="filter-group">
              <label>Health Status</label>
              <select 
                value={healthFilter} 
                onChange={(e) => setHealthFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">All</option>
                <option value="healthy">Healthy</option>
                <option value="degraded">Degraded</option>
                <option value="down">Down</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Search Service</label>
              <div className="search-input-wrapper">
                <FiSearch className="search-icon" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Search services..."
                  className="search-input"
                />
              </div>
            </div>

            <div className="filter-group">
              <label>
                <input
                  type="checkbox"
                  checked={showIsolated}
                  onChange={(e) => setShowIsolated(e.target.checked)}
                />
                Show Isolated Services
              </label>
            </div>

            <div className="filter-group">
              <label>
                <input
                  type="checkbox"
                  checked={showExternalDeps}
                  onChange={(e) => setShowExternalDeps(e.target.checked)}
                />
                Show External Dependencies
              </label>
            </div>

            <div className="filter-group">
              <label>Layout</label>
              <div className="layout-buttons">
                <button
                  className={`layout-btn ${viewMode === 'force' ? 'active' : ''}`}
                  onClick={() => setViewMode('force')}
                >
                  <FiGitBranch /> Force-Directed
                </button>
                <button
                  className={`layout-btn ${viewMode === 'hierarchical' ? 'active' : ''}`}
                  onClick={() => setViewMode('hierarchical')}
                >
                  <FiLayers /> Hierarchical
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Graph Container */}
        <div className="service-map-graph-wrapper">
          <div className="service-map-graph-controls">
            <button onClick={handleZoomIn} className="control-btn" title="Zoom In">
              <FiZoomIn />
            </button>
            <button onClick={handleZoomOut} className="control-btn" title="Zoom Out">
              <FiZoomOut />
            </button>
            <button onClick={handleFit} className="control-btn" title="Fit to Screen">
              <FiMaximize2 />
            </button>
            <button onClick={handleExport} className="control-btn" title="Export as PNG">
              <FiDownload />
            </button>
          </div>
          <div ref={containerRef} className="service-map-graph" />
        </div>

        {/* Details Panel */}
        <div className="service-map-details">
          {selectedNode && (
            <div>
              <h3>Service Details</h3>
              <div className="detail-section">
                <p>
                  <strong>Service:</strong> 
                  <span style={{ color: getHealthColor(selectedNode.health_status), marginLeft: '0.5rem' }}>
                    {selectedNode.service || selectedNode.id}
                  </span>
                </p>
                {selectedNode.node_type && selectedNode.node_type !== 'service' && (
                  <p>
                    <strong>Type:</strong>
                    <span 
                      className="type-badge"
                      style={{ 
                        marginLeft: '0.5rem',
                        textTransform: 'capitalize'
                      }}
                    >
                      {selectedNode.node_type}
                    </span>
                  </p>
                )}
                <p>
                  <strong>Status:</strong>
                  <span 
                    className="status-badge"
                    style={{ 
                      backgroundColor: getHealthColor(selectedNode.health_status) + '20',
                      color: getHealthColor(selectedNode.health_status),
                      marginLeft: '0.5rem'
                    }}
                  >
                    {selectedNode.health_status || 'unknown'}
                  </span>
                </p>
                {selectedNode.avg_duration && (
                  <p>
                    <strong>Avg Duration:</strong> {formatDuration(selectedNode.avg_duration)}ms
                  </p>
                )}
                {selectedNode.error_rate !== undefined && (
                  <p>
                    <strong>Error Rate:</strong> {selectedNode.error_rate.toFixed(2)}%
                  </p>
                )}
                {selectedNode.total_spans && (
                  <p>
                    <strong>Total Spans:</strong> {selectedNode.total_spans.toLocaleString()}
                  </p>
                )}
              </div>
              
              {/* HTTP/cURL Calls Section */}
              {selectedNode.node_type === 'service' && (
                <div className="detail-section" style={{ marginTop: '2rem' }}>
                  <h4 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    cURL Calls
                  </h4>
                  {loadingHttpCalls ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading cURL calls...</p>
                  ) : httpCalls.length > 0 ? (
                    <div className="http-calls-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {httpCalls.map((call, idx) => (
                        <div 
                          key={idx} 
                          className="http-call-item" 
                          style={{ 
                            marginBottom: '1rem', 
                            padding: '0.75rem', 
                            background: 'var(--bg-tertiary)', 
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-light)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span 
                              style={{ 
                                padding: '0.25rem 0.5rem', 
                                background: 'var(--color-primary)', 
                                color: 'var(--text-inverse)', 
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.75rem',
                                fontWeight: 600
                              }}
                            >
                              {call.method || 'GET'}
                            </span>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-all' }}>
                              {call.url}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <div>
                              <strong>Calls:</strong> {call.call_count?.toLocaleString() || 0}
                            </div>
                            <div>
                              <strong>Avg:</strong> {formatDuration(call.avg_duration || 0)}
                            </div>
                            {call.min_duration !== undefined && call.max_duration !== undefined && (
                              <>
                                <div>
                                  <strong>Min:</strong> {formatDuration(call.min_duration)}
                                </div>
                                <div>
                                  <strong>Max:</strong> {formatDuration(call.max_duration)}
                                </div>
                              </>
                            )}
                            <div>
                              <strong>Errors:</strong> {call.error_count?.toLocaleString() || 0} ({call.error_rate?.toFixed(1) || 0}%)
                            </div>
                            {(call.total_bytes_sent || call.total_bytes_received) && (
                              <div>
                                <strong>Traffic:</strong> {formatBytes((call.total_bytes_sent || 0) + (call.total_bytes_received || 0))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No cURL calls found for this service.</p>
                  )}
                </div>
              )}
            </div>
          )}
          {selectedEdge && (
            <div>
              <h3>Dependency Details</h3>
              <div className="detail-section">
                <p>
                  <strong>From:</strong> {selectedEdge.from}
                </p>
                <p>
                  <strong>To:</strong> {selectedEdge.to}
                </p>
                <p>
                  <strong>Avg Latency:</strong> {formatDuration(selectedEdge.avg_latency_ms || 0)}
                </p>
                {selectedEdge.p95_latency_ms && (
                  <p>
                    <strong>P95 Latency:</strong> {formatDuration(selectedEdge.p95_latency_ms)}
                  </p>
                )}
                {selectedEdge.p99_latency_ms && (
                  <p>
                    <strong>P99 Latency:</strong> {formatDuration(selectedEdge.p99_latency_ms)}
                  </p>
                )}
                <p>
                  <strong>Error Rate:</strong> {(selectedEdge.error_rate || 0).toFixed(2)}%
                </p>
                <p>
                  <strong>Call Count:</strong> {(selectedEdge.call_count || 0).toLocaleString()}
                </p>
                {selectedEdge.throughput && (
                  <p>
                    <strong>Throughput:</strong> {selectedEdge.throughput.toFixed(2)} req/s
                  </p>
                )}
                {(selectedEdge.bytes_sent || selectedEdge.bytes_received) && (
                  <p>
                    <strong>Traffic:</strong> {formatBytes((selectedEdge.bytes_sent || 0) + (selectedEdge.bytes_received || 0))}
                  </p>
                )}
                <p>
                  <strong>Status:</strong>
                  <span 
                    className="status-badge"
                    style={{ 
                      backgroundColor: getHealthColor(selectedEdge.health_status) + '20',
                      color: getHealthColor(selectedEdge.health_status),
                      marginLeft: '0.5rem'
                    }}
                  >
                    {selectedEdge.health_status || 'healthy'}
                  </span>
                </p>
              </div>
            </div>
          )}
          {!selectedNode && !selectedEdge && (
            <div className="details-placeholder">
              <p>Click on a service or dependency to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="service-map-legend">
        <h3>Legend</h3>
        <div className="legend-section">
          <h4>Health Status</h4>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#4caf50' }}></span>
            <span>Healthy</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ff9800' }}></span>
            <span>Degraded</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#f44336' }}></span>
            <span>Down</span>
          </div>
        </div>
        <div className="legend-section">
          <h4>Node Types</h4>
          <div className="legend-item">
            <span className="legend-color legend-shape-box" style={{ background: '#4caf50' }}></span>
            <span>Service</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-shape-database" style={{ background: '#2196f3' }}></span>
            <span>Database</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-shape-icon" style={{ background: '#4caf50' }}></span>
            <span>HTTP/cURL</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-shape-diamond" style={{ background: '#f44336' }}></span>
            <span>Redis</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-shape-triangle" style={{ background: '#ff9800' }}></span>
            <span>Cache</span>
          </div>
        </div>
        <div className="legend-note">
          <p>Edge thickness indicates call volume</p>
          <p>Node size indicates connection count</p>
        </div>
      </div>
    </div>
  )
}

export default ServiceMap
