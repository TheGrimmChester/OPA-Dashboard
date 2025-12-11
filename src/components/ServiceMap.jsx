import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
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
  FiGitBranch,
  FiDatabase,
  FiGlobe,
  FiServer,
  FiActivity,
  FiTrendingUp,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiBarChart2,
  FiChevronRight
} from 'react-icons/fi'
import HelpIcon from './HelpIcon'
import TimeRangePicker from './TimeRangePicker'
import { useTenant } from '../contexts/TenantContext'
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

function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`
  return num.toString()
}

// Get CSS variable color values (matching index.css)
const COLORS = {
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  primary: '#3b82f6',
  primaryHover: '#4a9eff',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textTertiary: '#374151',
  bgSecondary: '#1e293b',
  bgTertiary: '#334155',
  borderLight: '#334155',
  white: '#ffffff',
}

function getHealthColor(status) {
  switch (status) {
    case 'healthy':
      return COLORS.success
    case 'degraded':
      return COLORS.warning
    case 'down':
      return COLORS.error
    default:
      return COLORS.textSecondary
  }
}

function getHealthIcon(status) {
  switch (status) {
    case 'healthy':
      return <FiCheckCircle className="health-icon healthy" />
    case 'degraded':
      return <FiAlertCircle className="health-icon degraded" />
    case 'down':
      return <FiAlertCircle className="health-icon down" />
    default:
      return <FiActivity className="health-icon unknown" />
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

const ServiceMap = ({ refreshTrigger }) => {
  const { organizationId, projectId } = useTenant()
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false)
  const [viewMode, setViewMode] = useState('force') // 'force' or 'hierarchical'
  const [timeRange, setTimeRange] = useState('24h')
  const [showFilters, setShowFilters] = useState(false)
  const [healthFilter, setHealthFilter] = useState('all')
  const [serviceSearch, setServiceSearch] = useState('')
  const [showIsolated, setShowIsolated] = useState(true)
  const [showExternalDeps, setShowExternalDeps] = useState(true)
  const [nodeTypeFilter, setNodeTypeFilter] = useState('all')
  const containerRef = useRef(null)
  const networkRef = useRef(null)

  // Load service map data
  const loadServiceMap = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh && nodes.length > 0) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      const token = localStorage.getItem('auth_token')
      // Use tenant context values, fallback to localStorage if not available
      // Preserve 'all' if that's what's selected
      const orgIdRaw = organizationId !== undefined && organizationId !== null 
        ? organizationId 
        : (localStorage.getItem('organization_id') || 'default-org')
      const projIdRaw = projectId !== undefined && projectId !== null 
        ? projectId 
        : (localStorage.getItem('project_id') || 'default-project')
      
      const timeParams = getTimeRangeParams(timeRange)
      const params = new URLSearchParams({
        from: timeParams.from,
        to: timeParams.to
      })
      
      // Only include headers when not "all" - when "all", backend returns all orgs/projects
      const headers = {
        Authorization: `Bearer ${token}`,
      }
      
      // Send "all" explicitly so backend knows to return all data
      if (orgIdRaw && orgIdRaw !== 'all') {
        headers['X-Organization-ID'] = orgIdRaw
      } else if (orgIdRaw === 'all') {
        headers['X-Organization-ID'] = 'all'
      }
      if (projIdRaw && projIdRaw !== 'all') {
        headers['X-Project-ID'] = projIdRaw
      } else if (projIdRaw === 'all') {
        headers['X-Project-ID'] = 'all'
      }
      
      const response = await axios.get(`${API_URL}/api/service-map?${params.toString()}`, {
        headers,
      })
      
      const nodesData = Array.isArray(response.data?.nodes) ? response.data.nodes : []
      const edgesData = Array.isArray(response.data?.edges) ? response.data.edges : []
      
      console.log('ServiceMap: Loaded data', { 
        nodesCount: nodesData.length, 
        edgesCount: edgesData.length,
        nodes: nodesData.map(n => ({ id: n.id, service: n.service, node_type: n.node_type })),
        edges: edgesData.map(e => ({ from: e.from, to: e.to, dependency_type: e.dependency_type }))
      })
      
      setNodes(nodesData)
      setEdges(edgesData)
    } catch (error) {
      console.error('Failed to load service map:', error)
      setNodes([])
      setEdges([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [timeRange, organizationId, projectId, nodes.length])

  useEffect(() => {
    loadServiceMap()
    const interval = setInterval(() => loadServiceMap(true), 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [loadServiceMap])

  // Handle external refresh trigger
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0 && !loading) {
      loadServiceMap(true)
    }
  }, [refreshTrigger, loadServiceMap, loading])

  // Filter nodes and edges
  const filteredData = useMemo(() => {
    let filteredNodes = [...nodes]
    let filteredEdges = [...edges]

    // Health filter
    if (healthFilter !== 'all') {
      filteredNodes = filteredNodes.filter(node => node.health_status === healthFilter)
      const filteredServiceSet = new Set(filteredNodes.map(n => n.service || n.id))
      filteredEdges = filteredEdges.filter(edge => 
        filteredServiceSet.has(edge.from) && filteredServiceSet.has(edge.to)
      )
    }

    // Service search filter
    if (serviceSearch) {
      const searchLower = serviceSearch.toLowerCase()
      filteredNodes = filteredNodes.filter(node => {
        const serviceName = (node.service || node.id || '').toLowerCase()
        return serviceName.includes(searchLower)
      })
      const filteredServiceSet = new Set(filteredNodes.map(n => n.service || n.id))
      filteredEdges = filteredEdges.filter(edge => 
        filteredServiceSet.has(edge.from) && filteredServiceSet.has(edge.to)
      )
    }

    // Node type filter
    if (nodeTypeFilter !== 'all') {
      filteredNodes = filteredNodes.filter(node => {
        const nodeType = node.node_type || 'service'
        return nodeType === nodeTypeFilter
      })
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
        const nodeType = node.node_type || 'service'
        return nodeType === 'service'
      })
      const filteredServiceSet = new Set(filteredNodes.map(n => n.service || n.id))
      filteredEdges = filteredEdges.filter(edge => 
        filteredServiceSet.has(edge.from) && filteredServiceSet.has(edge.to)
      )
    }

    return { nodes: filteredNodes, edges: filteredEdges }
  }, [nodes, edges, healthFilter, serviceSearch, showIsolated, showExternalDeps, nodeTypeFilter])

  // Transform data for vis-network with complete metrics
  const graphData = useMemo(() => {
    const { nodes: filteredNodes, edges: filteredEdges } = filteredData
    
    // Debug logging
    if (filteredNodes.length === 0 && filteredEdges.length === 0) {
      console.warn('ServiceMap: No filtered nodes or edges', { 
        originalNodes: nodes.length, 
        originalEdges: edges.length,
        filteredNodes: filteredNodes.length,
        filteredEdges: filteredEdges.length
      })
    }

    // Calculate max values for scaling
    const maxCallCount = Math.max(...filteredEdges.map(e => e.call_count || 0), 1)
    const maxLatency = Math.max(...filteredEdges.map(e => e.avg_latency_ms || 0), 1)

    // Helper function to detect node type
    const getNodeType = (node) => {
      if (node.node_type) return node.node_type
      const serviceName = node.service || node.id || ''
      if (serviceName.startsWith('db:') || serviceName.includes('://') && (serviceName.includes('mysql://') || serviceName.includes('postgres://'))) {
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

    // Helper function to get node color
    const getNodeColor = (nodeType, healthStatus) => {
      if (nodeType === 'service') {
        return getHealthColor(healthStatus)
      }
      switch (nodeType) {
        case 'database':
          return COLORS.primary
        case 'http':
          return COLORS.success
        case 'curl':
          return COLORS.warning
        case 'redis':
          return COLORS.error
        case 'cache':
          return COLORS.warning
        default:
          return COLORS.textSecondary
      }
    }

    // Helper function to get node shape
    const getNodeShape = (nodeType) => {
      switch (nodeType) {
        case 'database':
          return 'database'
        case 'http':
          return 'icon'
        case 'curl':
          return 'hexagon'
        case 'redis':
          return 'diamond'
        case 'cache':
          return 'triangle'
        default:
          return 'box'
      }
    }

    // Helper function to get node icon
    const getNodeIcon = (nodeType) => {
      switch (nodeType) {
        case 'database':
          return '🗄️'
        case 'http':
          return '🌐'
        case 'curl':
          return '🔗'
        case 'redis':
          return '⚡'
        case 'cache':
          return '💾'
        default:
          return '🖥️'
      }
    }

    // Identify connected nodes (nodes that appear in edges)
    const connectedServices = new Set()
    filteredEdges.forEach(edge => {
      connectedServices.add(edge.from)
      connectedServices.add(edge.to)
    })

    // Create vis-network nodes with complete metrics
    let isolatedIndex = 0
    const visNodes = filteredNodes.map(node => {
      const serviceName = node.service || node.id
      const healthStatus = node.health_status || 'unknown'
      const nodeType = getNodeType(node)
      const color = getNodeColor(nodeType, healthStatus)
      
      // Calculate node size based on importance
      const connectionCount = filteredEdges.filter(e => 
        e.from === serviceName || e.to === serviceName
      ).length
      const baseSize = nodeType === 'service' ? 40 : 30
      const nodeSize = Math.max(baseSize, Math.min(100, baseSize + connectionCount * 3))
      
      // Check if node is isolated (not in any edge)
      const isIsolated = !connectedServices.has(serviceName)

      // Format label with metrics
      let label = serviceName
      if (nodeType === 'database') {
        if (serviceName.startsWith('db:')) {
          label = serviceName.replace('db:', '')
        } else if (serviceName.includes('://')) {
          try {
            const url = new URL(serviceName)
            label = `${url.protocol.replace(':', '')}://${url.hostname}`
          } catch (e) {
            const parts = serviceName.split('://')
            if (parts.length === 2) {
              label = `${parts[0]}://${parts[1].split('/')[0]}`
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
      }
      
      if (label.length > 25) {
        label = label.substring(0, 22) + '...'
      }

      // Build title with complete metrics
      const title = `${serviceName}\n` +
        `Type: ${nodeType}\n` +
        `Status: ${healthStatus}\n` +
        `Connections: ${connectionCount}\n` +
        (node.total_spans ? `Spans: ${formatNumber(node.total_spans)}\n` : '') +
        (node.avg_duration ? `Avg Latency: ${formatDuration(node.avg_duration)}\n` : '') +
        (node.error_rate !== undefined ? `Error Rate: ${node.error_rate.toFixed(2)}%\n` : '') +
        (node.incoming_calls ? `Incoming: ${formatNumber(node.incoming_calls)}\n` : '') +
        (node.outgoing_calls ? `Outgoing: ${formatNumber(node.outgoing_calls)}\n` : '') +
        (node.throughput ? `Throughput: ${node.throughput.toFixed(2)} req/s\n` : '') +
        (node.total_traffic ? `Traffic: ${formatBytes(node.total_traffic)}` : '')

      const nodeConfig = {
        id: serviceName,
        label: label,
        title: title,
        color: {
          background: color,
          border: COLORS.white,
          highlight: {
            background: color,
            border: COLORS.primaryHover,
          },
        },
        font: {
          size: nodeType === 'service' ? 14 : 12,
          color: COLORS.white,
          face: 'Inter, -apple-system, sans-serif',
          bold: nodeType === 'service',
        },
        shape: getNodeShape(nodeType),
        size: nodeSize,
        borderWidth: healthStatus === 'down' ? 4 : healthStatus === 'degraded' ? 3 : 2,
        data: { ...node, node_type: nodeType },
      }
      
      // Position isolated nodes symmetrically around the edges to keep graph centered
      if (isIsolated) {
        nodeConfig.fixed = { x: true, y: true }
        // Arrange in a grid on the right side, centered vertically
        const cols = 3
        const spacing = 180
        const startX = 800  // Right side of main view
        const startY = -200  // Start above center, will balance below too
        const row = Math.floor(isolatedIndex / cols)
        const col = isolatedIndex % cols
        nodeConfig.x = startX + col * spacing
        nodeConfig.y = startY + row * spacing
        nodeConfig.opacity = 0.6  // Make them slightly transparent to indicate they're isolated
        isolatedIndex++
      }
      
      return nodeConfig
    })

    // Create vis-network edges with complete metrics
    const visEdges = filteredEdges.map((edge, idx) => {
      const healthStatus = edge.health_status || 'healthy'
      const color = getHealthColor(healthStatus)
      
      // Calculate edge width based on call count (thinner arrows)
      const callCount = edge.call_count || 0
      const width = Math.max(1, Math.min(4, 1 + (callCount / maxCallCount) * 3))
      
      // Create edge label with key metrics
      const latency = edge.avg_latency_ms || 0
      const errorRate = edge.error_rate || 0
      const label = `${formatDuration(latency)} | ${errorRate.toFixed(1)}% | ${formatNumber(callCount)}`

      // Build title with complete metrics
      const title = `${edge.from} → ${edge.to}\n` +
        `Avg Latency: ${formatDuration(latency)}\n` +
        (edge.min_latency_ms ? `Min: ${formatDuration(edge.min_latency_ms)}\n` : '') +
        (edge.max_latency_ms ? `Max: ${formatDuration(edge.max_latency_ms)}\n` : '') +
        (edge.p95_latency_ms ? `P95: ${formatDuration(edge.p95_latency_ms)}\n` : '') +
        (edge.p99_latency_ms ? `P99: ${formatDuration(edge.p99_latency_ms)}\n` : '') +
        `Error Rate: ${errorRate.toFixed(2)}%\n` +
        (edge.success_rate !== undefined ? `Success Rate: ${edge.success_rate.toFixed(2)}%\n` : '') +
        `Call Count: ${formatNumber(callCount)}\n` +
        (edge.throughput ? `Throughput: ${edge.throughput.toFixed(2)} req/s\n` : '') +
        (edge.bytes_sent || edge.bytes_received ? `Traffic: ${formatBytes((edge.bytes_sent || 0) + (edge.bytes_received || 0))}\n` : '') +
        (edge.dependency_type ? `Type: ${edge.dependency_type}` : '')

      return {
        id: `edge-${idx}`,
        from: edge.from,
        to: edge.to,
        label: label,
        title: title,
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
          roundness: 0.3,
        },
        dashes: healthStatus === 'degraded' || healthStatus === 'down',
        font: {
          size: 12,
          color: COLORS.white,
          face: 'Inter, -apple-system, sans-serif',
          align: 'top',
          vadjust: -25,
          background: 'rgba(30, 41, 59, 0.98)',
          strokeWidth: 3,
          strokeColor: COLORS.bgSecondary,
          bold: true,
        },
        data: edge,
      }
    })

    return { nodes: visNodes, edges: visEdges }
  }, [filteredData])

  // Initialize vis-network
  useEffect(() => {
    // Wait for container to be available
    if (!containerRef.current) {
      // Retry after a short delay if container isn't ready yet
      const timeoutId = setTimeout(() => {
        if (!containerRef.current) {
          console.warn('ServiceMap: containerRef still not available after delay')
        }
      }, 100)
      return () => clearTimeout(timeoutId)
    }

    if (networkRef.current) {
      networkRef.current.destroy()
      networkRef.current = null
    }

    const data = {
      nodes: graphData.nodes,
      edges: graphData.edges,
    }

    // Debug logging
    console.log('ServiceMap: Initializing network', {
      nodesCount: data.nodes?.length || 0,
      edgesCount: data.edges?.length || 0,
      hasContainer: !!containerRef.current,
      sampleNodes: data.nodes?.slice(0, 3).map(n => ({ id: n.id, label: n.label }))
    })

    // Ensure we have data before creating network
    if (!data.nodes || data.nodes.length === 0) {
      console.warn('ServiceMap: No nodes to render', { 
        graphDataNodes: graphData.nodes?.length || 0,
        graphDataEdges: graphData.edges?.length || 0,
        filteredDataNodes: filteredData.nodes?.length || 0,
        filteredDataEdges: filteredData.edges?.length || 0
      })
      return
    }

    const options = {
      layout: viewMode === 'hierarchical' ? {
        hierarchical: {
          direction: 'UD',
          sortMethod: 'hubsize',
          levelSeparation: 350,
          nodeSpacing: 300,
          treeSpacing: 500,
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
          iterations: 300,
          fit: true,
        },
        barnesHut: {
          gravitationalConstant: -5000,
          centralGravity: 0.3,
          springLength: 300,
          springConstant: 0.04,
          damping: 0.09,
        },
      },
      nodes: {
        borderWidth: 2,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.3)',
          size: 8,
          x: 3,
          y: 3,
        },
        font: {
          size: 14,
          color: COLORS.white,
          face: 'Inter, -apple-system, sans-serif',
        },
        shapeProperties: {
          borderRadius: 6,
        },
        margin: 20,
      },
      edges: {
        color: {
          color: COLORS.textSecondary,
          highlight: COLORS.primaryHover,
          hover: COLORS.primaryHover,
        },
        smooth: {
          type: 'curvedCW',
          roundness: 0.3,
        },
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 1.0,
            type: 'arrow',
          },
        },
        width: 2,
        length: 300,
        selectionWidth: 4,
        font: {
          size: 12,
          color: COLORS.white,
          face: 'Inter, -apple-system, sans-serif',
          align: 'top',
          vadjust: -25,
          background: 'rgba(30, 41, 59, 0.98)',
          strokeWidth: 3,
          strokeColor: COLORS.bgSecondary,
          bold: true,
        },
        labelHighlightBold: true,
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
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
          setIsDetailsPanelOpen(true)
          network.setSelection({ nodes: [nodeId], edges: [] })
        }
      } else {
        setSelectedNode(null)
        setIsDetailsPanelOpen(false)
        network.setSelection({ nodes: [], edges: [] })
      }
    })

    network.on('hoverNode', (params) => {
      network.setOptions({ 
        nodes: { 
          borderWidth: 4,
          shadow: { size: 12 }
        } 
      })
    }

    network.on('blurNode', () => {
      network.setOptions({ 
        nodes: { 
          borderWidth: 2,
          shadow: { size: 8 }
        } 
      })
    })

    setTimeout(() => {
      network.fit({ animation: { duration: 400 } })
    }, 200)
    
    if (viewMode === 'hierarchical') {
      setTimeout(() => {
        network.fit({ animation: { duration: 400 } })
      }, 600)
    }

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy()
        networkRef.current = null
      }
    }
  }, [viewMode, graphData])

  // Update network data when graphData changes
  useEffect(() => {
    if (networkRef.current && containerRef.current) {
      const data = {
        nodes: graphData.nodes,
        edges: graphData.edges,
      }
      networkRef.current.setData(data)
      if (graphData.nodes.length > 0) {
        setTimeout(() => {
          if (networkRef.current && networkRef.current.fit) {
            try {
              networkRef.current.fit({ animation: { duration: 400 } })
            } catch (err) {
              console.warn('ServiceMap: Failed to fit network after data update', err)
            }
          }
        }, 300)
      }
    }
  }, [graphData])

  // Zoom controls
  const handleZoomIn = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale()
      networkRef.current.moveTo({ scale: scale * 1.3, animation: true })
    }
  }

  const handleZoomOut = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale()
      networkRef.current.moveTo({ scale: scale * 0.7, animation: true })
    }
  }

  const handleFit = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: { duration: 400 } })
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
        <div className="service-map-loading">
          <FiActivity className="loading-spinner" />
          <p>Loading service map...</p>
        </div>
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
            <FiServer className="empty-icon" />
            <h3>No Service Data Available</h3>
            <p>No service dependencies found for the selected time range.</p>
            <p>Try:</p>
            <ul>
              <li>Selecting a different time range (e.g., 7 days or 30 days)</li>
              <li>Making some requests to generate service dependencies</li>
              <li>Checking that services are properly instrumented</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="service-map-container">
      <div className="service-map-header">
        <h2>
          <FiGlobe className="header-icon" />
          Service Map
          <HelpIcon text="Interactive service dependency map. Click nodes or edges to view detailed metrics. Use filters to focus on specific services or health statuses." position="right" />
        </h2>
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

      <div className={`service-map-content ${refreshing ? 'refreshing' : ''}`}>
        {refreshing && (
          <div className="refresh-overlay active">
            <div className="refresh-overlay-content">
              <FiRefreshCw className="spinning" />
              <span>Refreshing...</span>
            </div>
          </div>
        )}
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
                <option value="all">All Statuses</option>
                <option value="healthy">Healthy</option>
                <option value="degraded">Degraded</option>
                <option value="down">Down</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Node Type</label>
              <select 
                value={nodeTypeFilter} 
                onChange={(e) => setNodeTypeFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Types</option>
                <option value="service">Services</option>
                <option value="database">Databases</option>
                <option value="http">HTTP Services</option>
                <option value="curl">cURL</option>
                <option value="redis">Redis</option>
                <option value="cache">Cache</option>
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
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showIsolated}
                  onChange={(e) => setShowIsolated(e.target.checked)}
                />
                Show Isolated Services
              </label>
            </div>

            <div className="filter-group">
              <label className="checkbox-label">
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
        {isDetailsPanelOpen && (
        <div className={`service-map-details ${isDetailsPanelOpen ? 'open' : ''}`}>
          {selectedNode && (
            <>
              {/* Header */}
              <div className="details-header">
                <div className="details-header-content">
                  <div className="details-header-icon">
                    {selectedNode.node_type === 'service' && <FiServer />}
                    {selectedNode.node_type === 'database' && <FiDatabase />}
                    {selectedNode.node_type === 'http' && <FiGlobe />}
                    {selectedNode.node_type === 'curl' && <FiGlobe />}
                    {selectedNode.node_type === 'redis' && <FiActivity />}
                    {selectedNode.node_type === 'cache' && <FiBarChart2 />}
                  </div>
                  <div className="details-header-info">
                    <h3>{selectedNode.service || selectedNode.id}</h3>
                    {selectedNode.node_type && selectedNode.node_type !== 'service' && (
                      <span className="details-type-badge">{selectedNode.node_type}</span>
                    )}
                  </div>
                  <button 
                    className="details-close"
                    onClick={() => {
                      setIsDetailsPanelOpen(false)
                      setSelectedNode(null)
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
                {/* Health Status Section */}
                <div className="details-section">
                  <div className="details-section-title">Health & Status</div>
                  <div className="metric-grid">
                    <div className="metric-card health-card">
                      <div className="metric-icon-wrapper">
                        {getHealthIcon(selectedNode.health_status)}
                      </div>
                      <div className="metric-info">
                        <div className="metric-label">Health Status</div>
                        <div className="metric-value-large" style={{ color: getHealthColor(selectedNode.health_status || 'unknown') }}>
                          {selectedNode.health_status || 'unknown'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                {(selectedNode.total_spans !== undefined || selectedNode.avg_duration !== undefined || selectedNode.throughput !== undefined) && (
                  <div className="details-section">
                    <div className="details-section-title">Performance</div>
                    <div className="metric-grid">
                      {selectedNode.total_spans !== undefined && (
                        <div className="metric-card">
                          <div className="metric-icon-wrapper">
                            <FiActivity />
                          </div>
                          <div className="metric-info">
                            <div className="metric-label">Total Spans</div>
                            <div className="metric-value">{formatNumber(selectedNode.total_spans)}</div>
                          </div>
                        </div>
                      )}
                      {selectedNode.avg_duration !== undefined && (
                        <div className="metric-card">
                          <div className="metric-icon-wrapper">
                            <FiClock />
                          </div>
                          <div className="metric-info">
                            <div className="metric-label">Avg Duration</div>
                            <div className="metric-value">{formatDuration(selectedNode.avg_duration)}</div>
                            {selectedNode.min_duration !== undefined && selectedNode.max_duration !== undefined && (
                              <div className="metric-subtext">
                                {formatDuration(selectedNode.min_duration)} - {formatDuration(selectedNode.max_duration)}
                              </div>
                            )}
                            {selectedNode.p95_duration !== undefined && selectedNode.p99_duration !== undefined && (
                              <div className="metric-subtext">
                                P95: {formatDuration(selectedNode.p95_duration)} | P99: {formatDuration(selectedNode.p99_duration)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedNode.throughput !== undefined && selectedNode.throughput > 0 && (
                        <div className="metric-card">
                          <div className="metric-icon-wrapper">
                            <FiBarChart2 />
                          </div>
                          <div className="metric-info">
                            <div className="metric-label">Throughput</div>
                            <div className="metric-value">{selectedNode.throughput.toFixed(2)} req/s</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Error & Reliability */}
                {selectedNode.error_rate !== undefined && (
                  <div className="details-section">
                    <div className="details-section-title">Reliability</div>
                    <div className="metric-grid">
                      <div className="metric-card">
                        <div className="metric-icon-wrapper">
                          <FiAlertCircle />
                        </div>
                        <div className="metric-info">
                          <div className="metric-label">Error Rate</div>
                          <div className="metric-value" style={{ color: selectedNode.error_rate > 10 ? COLORS.error : selectedNode.error_rate > 5 ? COLORS.warning : COLORS.success }}>
                            {selectedNode.error_rate.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Traffic Metrics */}
                {(selectedNode.incoming_calls !== undefined || selectedNode.outgoing_calls !== undefined || selectedNode.total_traffic !== undefined) && (
                  <div className="details-section">
                    <div className="details-section-title">Traffic</div>
                    <div className="metric-grid">
                      {selectedNode.incoming_calls !== undefined && (
                        <div className="metric-card">
                          <div className="metric-icon-wrapper">
                            <FiTrendingUp />
                          </div>
                          <div className="metric-info">
                            <div className="metric-label">Incoming Calls</div>
                            <div className="metric-value">{formatNumber(selectedNode.incoming_calls)}</div>
                          </div>
                        </div>
                      )}
                      {selectedNode.outgoing_calls !== undefined && (
                        <div className="metric-card">
                          <div className="metric-icon-wrapper">
                            <FiTrendingUp />
                          </div>
                          <div className="metric-info">
                            <div className="metric-label">Outgoing Calls</div>
                            <div className="metric-value">{formatNumber(selectedNode.outgoing_calls)}</div>
                          </div>
                        </div>
                      )}
                      {selectedNode.total_traffic !== undefined && selectedNode.total_traffic > 0 && (
                        <div className="metric-card">
                          <div className="metric-icon-wrapper">
                            <FiActivity />
                          </div>
                          <div className="metric-info">
                            <div className="metric-label">Total Traffic</div>
                            <div className="metric-value">{formatBytes(selectedNode.total_traffic)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Button */}
                <div className="details-actions">
                  <Link 
                    to={`/traces?service=${encodeURIComponent(selectedNode.service || selectedNode.id)}`}
                    className="view-traces-link"
                  >
                    <FiActivity />
                    View Traces
                  </Link>
                </div>
              </div>
            </>
          )}

          {!selectedNode && (
            <div className="details-placeholder">
              <FiInfo className="placeholder-icon" />
              <p>Click on a service to view detailed metrics</p>
              <p className="placeholder-hint">
                Hover over nodes and edges to see quick metrics preview
              </p>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Legend */}
      <div className="service-map-legend">
        <h3>Legend</h3>
        <div className="legend-section">
          <h4>Health Status</h4>
          <div className="legend-item">
            <span className="legend-color" style={{ background: COLORS.success }}></span>
            <span>Healthy</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#f59e0b' }}></span>
            <span>Degraded</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: COLORS.error }}></span>
            <span>Down</span>
          </div>
        </div>
        <div className="legend-section">
          <h4>Node Types</h4>
          <div className="legend-item">
            <span className="legend-color legend-shape-box" style={{ background: '#10b981' }}></span>
            <span>Service</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-shape-database" style={{ background: COLORS.primary }}></span>
            <span>Database</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-shape-icon" style={{ background: '#10b981' }}></span>
            <span>HTTP Service</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-shape-hexagon" style={{ background: COLORS.warning }}></span>
            <span>cURL</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-shape-diamond" style={{ background: COLORS.error }}></span>
            <span>Redis</span>
          </div>
          <div className="legend-item">
            <span className="legend-color legend-shape-triangle" style={{ background: COLORS.warning }}></span>
            <span>Cache</span>
          </div>
        </div>
        <div className="legend-section">
          <h4>Edge Information</h4>
          <div className="legend-note">
            <p><strong>Label Format:</strong> Latency | Error Rate | Call Count</p>
            <p><strong>Width:</strong> Proportional to call volume</p>
            <p><strong>Color:</strong> Based on health status</p>
            <p><strong>Style:</strong> Dashed = Degraded/Down, Solid = Healthy</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ServiceMap
