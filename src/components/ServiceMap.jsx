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
      const token = localStorage.getItem('auth_token')
      const response = await axios.get(`${API_URL}/api/service-map`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': localStorage.getItem('organization_id') || 'default-org',
          'X-Project-ID': localStorage.getItem('project_id') || 'default-project',
        },
      })
      setNodes(response.data.nodes || [])
      setEdges(response.data.edges || [])
    } catch (error) {
      console.error('Failed to load service map:', error)
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

  // Simple force-directed layout
  const calculateLayout = () => {
    const width = 800
    const height = 600
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 3

    const nodeMap = new Map()
    nodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / nodes.length
      nodeMap.set(node.service, {
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      })
    })

    return { nodeMap, width, height }
  }

  const { nodeMap, width, height } = calculateLayout()

  if (loading) {
    return <div className="service-map-loading">Loading service map...</div>
  }

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
          <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            {/* Draw edges */}
            {edges.map((edge, idx) => {
              const fromNode = nodeMap.get(edge.from)
              const toNode = nodeMap.get(edge.to)
              if (!fromNode || !toNode) return null

              const color = getHealthColor(edge.health_status)
              return (
                <line
                  key={idx}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.6}
                  markerEnd="url(#arrowhead)"
                  onMouseEnter={() => setSelectedEdge(edge)}
                  onMouseLeave={() => setSelectedEdge(null)}
                  className="service-edge"
                />
              )
            })}

            {/* Arrow marker */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#666" />
              </marker>
            </defs>

            {/* Draw nodes */}
            {Array.from(nodeMap.values()).map((node) => {
              const color = getHealthColor(node.health_status)
              return (
                <g key={node.service}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={30}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={2}
                    onMouseEnter={() => setSelectedNode(node)}
                    onMouseLeave={() => setSelectedNode(null)}
                    className="service-node"
                  />
                  <text
                    x={node.x}
                    y={node.y + 5}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="12"
                    fontWeight="bold"
                  >
                    {node.service.length > 10 ? node.service.substring(0, 10) + '...' : node.service}
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
                <h3>Service: {selectedNode.service}</h3>
                <p>Status: <span style={{ color: getHealthColor(selectedNode.health_status) }}>
                  {selectedNode.health_status}
                </span></p>
              </div>
            )}
            {selectedEdge && (
              <div>
                <h3>Dependency: {selectedEdge.from} → {selectedEdge.to}</h3>
                <p>Avg Latency: {selectedEdge.avg_latency_ms?.toFixed(2)}ms</p>
                <p>Error Rate: {selectedEdge.error_rate?.toFixed(2)}%</p>
                <p>Call Count: {selectedEdge.call_count?.toLocaleString()}</p>
                <p>Status: <span style={{ color: getHealthColor(selectedEdge.health_status) }}>
                  {selectedEdge.health_status}
                </span></p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ServiceMap

