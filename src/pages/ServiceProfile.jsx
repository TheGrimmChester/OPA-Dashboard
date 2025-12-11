import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { Network } from 'vis-network'
import { FiRefreshCw } from 'react-icons/fi'
import LoadingSpinner from '../components/LoadingSpinner'
import TimeRangePicker from '../components/TimeRangePicker'
import './ServiceProfile.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
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

function ServiceProfile() {
  const { serviceName } = useParams()
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('24h')
  const containerRef = useRef(null)
  const networkRef = useRef(null)

  const loadServiceGraph = useCallback(async () => {
    if (!serviceName) return

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
      
      // Fetch service map data
      const response = await axios.get(`${API_URL}/api/service-map?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': orgId,
          'X-Project-ID': projId,
        },
      })
      
      const nodesData = Array.isArray(response.data?.nodes) ? response.data.nodes : []
      const edgesData = Array.isArray(response.data?.edges) ? response.data.edges : []
      
      // Filter to only show edges connected to the selected service
      const serviceEdges = edgesData.filter(edge => 
        edge.from === serviceName || edge.to === serviceName
      )
      
      // Get all unique services from edges
      const serviceSet = new Set([serviceName])
      serviceEdges.forEach(edge => {
        serviceSet.add(edge.from)
        serviceSet.add(edge.to)
      })
      
      // Filter nodes to only include connected services
      const serviceNodes = nodesData.filter(node => {
        const nodeService = node.service || node.id
        return serviceSet.has(nodeService)
      })
      
      // Ensure the main service node exists
      const mainServiceExists = serviceNodes.some(node => (node.service || node.id) === serviceName)
      if (!mainServiceExists) {
        serviceNodes.push({
          id: serviceName,
          service: serviceName,
          health_status: 'healthy',
          node_type: 'service'
        })
      }
      
      setNodes(serviceNodes)
      setEdges(serviceEdges)
    } catch (error) {
      console.error('Failed to load service graph:', error)
      setNodes([])
      setEdges([])
    } finally {
      setLoading(false)
    }
  }, [serviceName, timeRange])

  useEffect(() => {
    loadServiceGraph()
    const interval = setInterval(loadServiceGraph, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [loadServiceGraph])

  // Transform data for vis-network
  const graphData = React.useMemo(() => {
    // Calculate max values for scaling
    const maxCallCount = Math.max(...edges.map(e => e.call_count || 0), 1)
    const maxLatency = Math.max(...edges.map(e => e.avg_latency_ms || 0), 1)

    // Create vis-network nodes
    const visNodes = nodes.map(node => {
      const serviceName = node.service || node.id
      const isMainService = serviceName === serviceName
      const healthStatus = node.health_status || 'healthy'
      
      // Main service gets different styling
      const color = isMainService ? '#2196f3' : (healthStatus === 'healthy' ? '#4caf50' : healthStatus === 'degraded' ? '#ff9800' : '#f44336')
      
      // Calculate node size based on connections
      const connectionCount = edges.filter(e => 
        e.from === nodeService || e.to === nodeService
      ).length
      const nodeSize = isMainService ? 50 : Math.max(30, Math.min(60, 30 + connectionCount * 3))

      return {
        id: nodeService,
        label: nodeService.length > 25 ? nodeService.substring(0, 25) + '...' : nodeService,
        title: `${nodeService}\nStatus: ${healthStatus}`,
        color: {
          background: color,
          border: '#ffffff',
          highlight: {
            background: color,
            border: '#4a9eff',
          },
        },
        font: {
          size: isMainService ? 16 : 14,
          color: '#ffffff',
          face: 'Arial, sans-serif',
          bold: isMainService,
        },
        shape: 'box',
        size: nodeSize,
        borderWidth: isMainService ? 3 : 2,
      }
    })

    // Create vis-network edges with data labels
    const visEdges = edges.map((edge, idx) => {
      const latency = edge.avg_latency_ms || 0
      const errorRate = edge.error_rate || 0
      const callCount = edge.call_count || 0
      
      // Create edge label with key metrics
      const label = `${formatDuration(latency)} | ${errorRate.toFixed(1)}% | ${callCount.toLocaleString()}`
      
      // Color based on error rate
      const color = errorRate > 10 ? '#f44336' : errorRate > 5 ? '#ff9800' : '#4caf50'
      
      // Calculate edge width based on call count
      const width = Math.max(2, Math.min(8, 2 + (callCount / maxCallCount) * 6))
      
      return {
        id: `edge-${idx}`,
        from: edge.from,
        to: edge.to,
        label: label,
        title: `${edge.from} → ${edge.to}\nAvg Latency: ${formatDuration(latency)}\nError Rate: ${errorRate.toFixed(2)}%\nCall Count: ${callCount.toLocaleString()}\nP95 Latency: ${formatDuration(edge.p95_latency_ms || 0)}\nP99 Latency: ${formatDuration(edge.p99_latency_ms || 0)}\nThroughput: ${(edge.throughput || 0).toFixed(2)} req/s`,
        color: {
          color: color,
          highlight: '#4a9eff',
          hover: '#4a9eff',
        },
        width: width,
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 1.2,
            type: 'arrow',
          },
        },
        smooth: {
          type: 'curvedCW',
          roundness: 0.3,
        },
        font: {
          size: 11,
          color: '#333',
          face: 'Arial, sans-serif',
          align: 'middle',
          background: 'rgba(255, 255, 255, 0.8)',
          strokeWidth: 2,
          strokeColor: '#ffffff',
        },
      }
    })

    return { nodes: visNodes, edges: visEdges }
  }, [nodes, edges, serviceName])

  // Initialize vis-network
  useEffect(() => {
    if (!containerRef.current || graphData.nodes.length === 0) {
      return
    }

    if (networkRef.current) {
      networkRef.current.destroy()
      networkRef.current = null
    }

    const data = {
      nodes: graphData.nodes,
      edges: graphData.edges,
    }

    const options = {
      layout: {
        improvedLayout: true,
      },
      physics: {
        enabled: true,
        stabilization: {
          iterations: 200,
          fit: true,
        },
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.3,
          springLength: 200,
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
          size: 14,
          color: '#ffffff',
          face: 'Arial, sans-serif',
        },
        shapeProperties: {
          borderRadius: 4,
        },
        margin: 10,
      },
      edges: {
        smooth: {
          type: 'curvedCW',
          roundness: 0.3,
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
          size: 11,
          color: '#333',
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

    setTimeout(() => {
      network.fit({ animation: { duration: 300 } })
      // Center on main service
      const mainServiceNode = graphData.nodes.find(n => n.id === serviceName)
      if (mainServiceNode) {
        network.focus(serviceName, {
          scale: 1.2,
          animation: true,
        })
      }
    }, 100)

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy()
        networkRef.current = null
      }
    }
  }, [graphData, serviceName])

  if (loading && nodes.length === 0) {
    return <LoadingSpinner message="Loading service graph..." />
  }

  return (
    <div className="ServiceProfile">
      <div className="service-profile-header">
        <div className="service-profile-header-left">
          <Link to="/services" className="back-link">← Back to Services</Link>
          <h1>{serviceName}</h1>
        </div>
        <div className="service-profile-header-right">
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          <button onClick={loadServiceGraph} className="refresh-btn">
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      <div className="service-graph-container">
        {nodes.length === 0 ? (
          <div className="empty-state">
            <p>No dependencies found for this service.</p>
            <p>Make some requests to generate service dependencies.</p>
          </div>
        ) : (
          <div ref={containerRef} className="service-graph" />
        )}
      </div>

      <div className="service-graph-legend">
        <h3>Legend</h3>
        <div className="legend-section">
          <h4>Edge Labels</h4>
          <p>Format: <strong>Latency | Error Rate | Call Count</strong></p>
          <p>Example: <strong>125ms | 2.5% | 1,234</strong></p>
        </div>
        <div className="legend-section">
          <h4>Edge Colors</h4>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#4caf50' }}></span>
            <span>Error Rate &lt; 5%</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ff9800' }}></span>
            <span>Error Rate 5-10%</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#f44336' }}></span>
            <span>Error Rate &gt; 10%</span>
          </div>
        </div>
        <div className="legend-section">
          <h4>Node Colors</h4>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#2196f3' }}></span>
            <span>Selected Service</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#4caf50' }}></span>
            <span>Healthy Service</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ff9800' }}></span>
            <span>Degraded Service</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#f44336' }}></span>
            <span>Down Service</span>
          </div>
        </div>
        <div className="legend-note">
          <p>Edge thickness indicates call volume</p>
          <p>Hover over edges to see detailed metrics</p>
        </div>
      </div>
    </div>
  )
}

export default ServiceProfile
