import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { FiRefreshCw, FiInfo } from 'react-icons/fi'
import HelpIcon from './HelpIcon'
import './ServiceMap.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function ServiceMap() {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const svgRef = useRef(null)

  useEffect(() => {
    loadServiceMap()
    const interval = setInterval(loadServiceMap, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const loadServiceMap = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('auth_token')
      // Use default values if 'all' is selected
      const orgIdRaw = localStorage.getItem('organization_id') || 'default-org'
      const projIdRaw = localStorage.getItem('project_id') || 'default-project'
      const orgId = orgIdRaw === 'all' ? 'default-org' : orgIdRaw
      const projId = projIdRaw === 'all' ? 'default-project' : projIdRaw
      
      console.log('Loading service map:', { API_URL, orgId, projId, hasToken: !!token })
      
      const response = await axios.get(`${API_URL}/api/service-map`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': orgId,
          'X-Project-ID': projId,
        },
      })
      
      console.log('ServiceMap API response:', response.data)
      
      // Handle both direct response.data and nested response.data.data
      const data = response.data?.data || response.data
      const nodesData = Array.isArray(data?.nodes) ? data.nodes : (Array.isArray(response.data?.nodes) ? response.data.nodes : [])
      const edgesData = Array.isArray(data?.edges) ? data.edges : (Array.isArray(response.data?.edges) ? response.data.edges : [])
      
      console.log('ServiceMap data parsed:', { 
        nodes: nodesData.length, 
        edges: edgesData.length,
        rawResponse: response.data,
        nodesData,
        edgesData 
      })
      
      // Always set the data, even if empty (so we can show the empty state correctly)
      setNodes(nodesData)
      setEdges(edgesData)
    } catch (error) {
      console.error('Failed to load service map:', error)
      if (error.response) {
        console.error('Response status:', error.response.status)
        console.error('Response data:', error.response.data)
      }
      setNodes([])
      setEdges([])
    } finally {
      setLoading(false)
    }
  }

  const getHealthColor = (status) => {
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

  if (loading) {
    return <div className="service-map-loading">Loading service map...</div>
  }

  if (!nodes || nodes.length === 0) {
    return (
      <div className="service-map-container">
        <div className="service-map-header">
          <h2>Service Map <HelpIcon text="Visualize service dependencies and relationships. Nodes represent services, edges show communication between them." position="right" /></h2>
          <button onClick={loadServiceMap} className="refresh-btn">
            <FiRefreshCw /> Refresh
          </button>
        </div>
        <div className="service-map-content">
          <p>No service data available. Make some requests to generate service dependencies.</p>
        </div>
      </div>
    )
  }

  // Improved layout with better spacing and responsiveness
  const calculateLayout = () => {
    // Use container dimensions or defaults
    const containerWidth = svgRef.current?.parentElement?.clientWidth || 1200
    const containerHeight = Math.max(600, window.innerHeight - 300)
    const width = Math.max(800, containerWidth - 40)
    const height = Math.max(600, containerHeight)
    
    const centerX = width / 2
    const centerY = height / 2
    const nodeCount = nodes.length
    const radius = Math.min(width, height) / 2.5

    const nodeMap = new Map()
    if (nodes && nodes.length > 0) {
      nodes.forEach((node, index) => {
        const angle = (2 * Math.PI * index) / nodeCount - Math.PI / 2 // Start from top
        const serviceName = node.service || node.id
        nodeMap.set(serviceName, {
          ...node,
          service: serviceName,
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        })
      })
    }

    return { nodeMap, width, height }
  }

  const { nodeMap, width, height } = calculateLayout()

  return (
    <div className="service-map-container">
      <div className="service-map-header">
        <h2>Service Map <HelpIcon text="Visualize service dependencies and relationships. Nodes represent services, edges show communication between them." position="right" /></h2>
        <button onClick={loadServiceMap} className="refresh-btn">
          <FiRefreshCw /> Refresh
        </button>
      </div>

      <div className="service-map-content">
        <div className="service-map-legend">
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

        <div className="service-map-graph">
          <svg 
            ref={svgRef} 
            width="100%" 
            height="100%" 
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            className="service-map-svg"
          >
            <defs>
              {/* Gradient definitions for nodes */}
              <linearGradient id="nodeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
              
              {/* Shadow filter */}
              <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                <feOffset dx="2" dy="2" result="offsetblur"/>
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.3"/>
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              
              {/* Arrow marker */}
              <marker
                id="arrowhead"
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <polygon 
                  points="0 0, 12 3, 0 6" 
                  fill="currentColor"
                  opacity="0.8"
                />
              </marker>
            </defs>
            
            {/* Draw edges with better visibility */}
            {(edges || []).map((edge, idx) => {
              const fromNode = nodeMap.get(edge.from)
              const toNode = nodeMap.get(edge.to)
              if (!fromNode || !toNode) return null

              const color = getHealthColor(edge.health_status)
              // Calculate edge path with slight curve for better visibility
              const dx = toNode.x - fromNode.x
              const dy = toNode.y - fromNode.y
              const distance = Math.sqrt(dx * dx + dy * dy)
              const curvature = Math.min(30, distance / 4)
              
              return (
                <g key={`edge-${idx}`}>
                  {/* Edge shadow */}
                  <line
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke="rgba(0,0,0,0.3)"
                    strokeWidth={5}
                    opacity={0.3}
                    markerEnd="url(#arrowhead)"
                  />
                  {/* Main edge */}
                  <line
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke={color}
                    strokeWidth={4}
                    opacity={0.8}
                    markerEnd="url(#arrowhead)"
                    onMouseEnter={() => setSelectedEdge(edge)}
                    onMouseLeave={() => setSelectedEdge(null)}
                    className="service-edge"
                    style={{ cursor: 'pointer' }}
                  />
                </g>
              )
            })}

            {/* Draw nodes with better styling */}
            {Array.from(nodeMap.values()).map((node) => {
              const color = getHealthColor(node.health_status)
              const isSelected = selectedNode?.service === node.service
              return (
                <g key={node.service} className="service-node-group">
                  {/* Node shadow */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? 50 : 40}
                    fill="rgba(0,0,0,0.2)"
                    filter="url(#nodeShadow)"
                    opacity={0.5}
                  />
                  {/* Node outer ring */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? 50 : 40}
                    fill="none"
                    stroke={color}
                    strokeWidth={3}
                    opacity={0.3}
                  />
                  {/* Node main circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? 45 : 35}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={isSelected ? 4 : 3}
                    onMouseEnter={() => setSelectedNode(node)}
                    onMouseLeave={() => setSelectedNode(null)}
                    className="service-node"
                    style={{ cursor: 'pointer' }}
                    filter="url(#nodeShadow)"
                  />
                  {/* Node gradient overlay */}
                  <circle
                    cx={node.x - 8}
                    cy={node.y - 8}
                    r={isSelected ? 20 : 15}
                    fill="url(#nodeGradient)"
                    opacity={0.6}
                  />
                  {/* Node label background */}
                  <rect
                    x={node.x - (node.service.length * 4.5)}
                    y={node.y + (isSelected ? 55 : 45)}
                    width={node.service.length * 9}
                    height={20}
                    fill="rgba(0,0,0,0.7)"
                    rx={4}
                  />
                  {/* Node label */}
                  <text
                    x={node.x}
                    y={node.y + (isSelected ? 60 : 50)}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={isSelected ? "14" : "12"}
                    fontWeight="600"
                    className="service-node-label"
                  >
                    {node.service.length > 15 ? node.service.substring(0, 15) + '...' : node.service}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Node/Edge details panel */}
        {(selectedNode || selectedEdge) && (
          <div className="service-map-details">
            {selectedNode && (
              <div>
                <h3>Service Details</h3>
                <p>
                  <strong>Service:</strong> 
                  <span style={{ color: getHealthColor(selectedNode.health_status), marginLeft: '0.5rem' }}>
                    {selectedNode.service}
                  </span>
                </p>
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
                    {selectedNode.health_status}
                  </span>
                </p>
              </div>
            )}
            {selectedEdge && (
              <div>
                <h3>Dependency Details</h3>
                <p>
                  <strong>From:</strong> {selectedEdge.from}
                </p>
                <p>
                  <strong>To:</strong> {selectedEdge.to}
                </p>
                <p>
                  <strong>Avg Latency:</strong> {selectedEdge.avg_latency_ms?.toFixed(2) || '0.00'}ms
                </p>
                <p>
                  <strong>Error Rate:</strong> {selectedEdge.error_rate?.toFixed(2) || '0.00'}%
                </p>
                <p>
                  <strong>Call Count:</strong> {selectedEdge.call_count?.toLocaleString() || '0'}
                </p>
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
                    {selectedEdge.health_status}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ServiceMap

