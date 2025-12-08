import React, { useMemo, useState, useRef, useEffect } from 'react'
import TraceTabFilters from './TraceTabFilters'
import './FlameGraph.css'

// Helper functions for formatting
function formatDuration(ms) {
  if (ms < 1) return `${Math.round(ms * 1000)}µs`
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatMemory(bytes) {
  if (bytes === 0) return '0B'
  const absBytes = Math.abs(bytes)
  if (absBytes < 1024) return `${bytes}B`
  if (absBytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  if (absBytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

function formatBytes(bytes) {
  if (bytes === 0) return '0B'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

function FlameGraph({ callStack, width = 800, height = 600 }) {
  const [hoveredNode, setHoveredNode] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panX, setPanX] = useState(0)
  const [selectedMetric, setSelectedMetric] = useState('duration')
  const [filters, setFilters] = useState({ enabled: false, thresholds: {} })
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const containerRef = useRef(null)
  const svgRef = useRef(null)
  
  // Helper functions for metrics
  const getMetricValue = (node, metric) => {
    switch (metric) {
      case 'duration':
        return node.duration_ms || node.DurationMs || node.duration || 0
      case 'cpu':
        return node.cpu_ms || node.CPUMs || node.cpu || 0
      case 'memory':
        return Math.abs(node.memory_delta || node.MemoryDelta || 0)
      case 'network':
        const sent = node.network_bytes_sent || node.NetworkBytesSent || 0
        const received = node.network_bytes_received || node.NetworkBytesReceived || 0
        return sent + received
      default:
        return node.duration_ms || node.DurationMs || node.duration || 0
    }
  }
  
  const getMetricLabel = (metric) => {
    switch (metric) {
      case 'duration': return 'Duration'
      case 'cpu': return 'CPU'
      case 'memory': return 'Memory'
      case 'network': return 'Network'
      default: return 'Duration'
    }
  }
  
  const formatMetricValue = (value, metric) => {
    switch (metric) {
      case 'duration':
      case 'cpu':
        return formatDuration(value)
      case 'memory':
        return formatMemory(value)
      case 'network':
        return formatBytes(value)
      default:
        return formatDuration(value)
    }
  }

  // Convert call stack to flame graph data structure
  const flameData = useMemo(() => {
    if (!callStack || (Array.isArray(callStack) && callStack.length === 0)) {
      return null
    }

    // Build tree structure from call stack
    // The call stack can be either:
    // 1. A flat array of nodes (old format) - need to build tree from parent_id
    // 2. A tree structure with nested children (new format) - already a tree
    const buildTree = (nodes) => {
      if (!Array.isArray(nodes) || nodes.length === 0) {
        return null
      }

      // Count total nodes recursively for debugging
      const countNodes = (nodeList) => {
        let count = 0
        const countNode = (node) => {
          count++
          if (node.children && Array.isArray(node.children)) {
            node.children.forEach(countNode)
          }
        }
        nodeList.forEach(countNode)
        return count
      }

      // Check if nodes already have children (tree structure)
      const hasNestedChildren = nodes.some(node => 
        node.children && Array.isArray(node.children) && node.children.length > 0
      )

      if (hasNestedChildren) {
        // Already a tree structure - just convert format
        const convertNode = (node) => {
          return {
            id: node.call_id || node.CallID || node.id || Math.random().toString(),
            name: node.function || node.Function || node.name || 'unknown',
            class: node.class || node.Class || '',
            file: node.file || node.File || '',
            line: node.line || node.Line || 0,
            duration: node.duration_ms || node.DurationMs || 0,
            cpu: node.cpu_ms || node.CPUMs || 0,
            depth: node.depth || node.Depth || 0,
            children: (node.children || []).map(convertNode),
          }
        }
        const result = nodes.map(convertNode)
        const totalNodes = countNodes(result)
        console.log(`[FlameGraph] Tree structure detected: ${nodes.length} root nodes, ${totalNodes} total nodes`)
        return result
      }

      // Flat array - need to build tree from parent_id
      // First, flatten all nodes including nested children
      const flattenNodes = (nodeList) => {
        const flat = []
        const processNode = (node) => {
          flat.push(node)
          if (node.children && Array.isArray(node.children)) {
            node.children.forEach(processNode)
          }
        }
        nodeList.forEach(processNode)
        return flat
      }

      const allNodes = flattenNodes(nodes)

      // Find root nodes (nodes without parent_id)
      const rootNodes = allNodes.filter(node => !node.parent_id || node.parent_id === '')

      // Build tree recursively
      const buildNode = (node) => {
        const children = allNodes.filter(n => 
          (n.parent_id || n.ParentID) === (node.call_id || node.CallID || node.id)
        )

        return {
          id: node.call_id || node.CallID || node.id || Math.random().toString(),
          name: node.function || node.Function || node.name || 'unknown',
          class: node.class || node.Class || '',
          file: node.file || node.File || '',
          line: node.line || node.Line || 0,
          duration: node.duration_ms || node.DurationMs || 0,
          cpu: node.cpu_ms || node.CPUMs || 0,
          memory_delta: node.memory_delta || node.MemoryDelta || 0,
          network_bytes_sent: node.network_bytes_sent || node.NetworkBytesSent || 0,
          network_bytes_received: node.network_bytes_received || node.NetworkBytesReceived || 0,
          depth: node.depth || node.Depth || 0,
          children: children.map(buildNode),
        }
      }

      return rootNodes.map(buildNode)
    }

    return buildTree(callStack)
  }, [callStack])

  // Filter flame data based on thresholds
  const filteredFlameData = useMemo(() => {
    if (!flameData || !filters.enabled) return flameData
    
    const thresholds = filters.thresholds || {}
    const filterNode = (node) => {
      const duration = node.duration || 0
      
      // Check duration threshold
      if (thresholds.duration !== undefined && duration < thresholds.duration) {
        // Filter children first
        const filteredChildren = node.children
          ? node.children.map(filterNode).filter(child => child !== null)
          : []
        
        // If has filtered children, keep node but with filtered children
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren }
        }
        
        return null
      }
      
      // Filter children recursively
      const filteredChildren = node.children
        ? node.children.map(filterNode).filter(child => child !== null)
        : []
      
      return {
        ...node,
        children: filteredChildren
      }
    }
    
    return flameData.map(filterNode).filter(node => node !== null)
  }, [flameData, filters])

  // Calculate layout for flame graph
  const layout = useMemo(() => {
    const dataToUse = filteredFlameData || flameData
    if (!dataToUse || dataToUse.length === 0) return null

    let maxDepth = 0
    let totalMetric = 0

    const calculateStats = (nodes, depth = 0) => {
      nodes.forEach(node => {
        maxDepth = Math.max(maxDepth, depth)
        const metricValue = getMetricValue(node, selectedMetric)
        totalMetric = Math.max(totalMetric, metricValue)
        if (node.children && node.children.length > 0) {
          calculateStats(node.children, depth + 1)
        }
      })
    }

    calculateStats(dataToUse)

    const barHeight = 30
    const scaledHeight = Math.max(height, (maxDepth + 1) * barHeight + 40)
    const scaleX = totalMetric > 0 ? (width - 40) / totalMetric : 1

    return {
      maxDepth,
      totalMetric,
      barHeight,
      height: scaledHeight,
      scaleX,
    }
  }, [filteredFlameData, flameData, width, height, selectedMetric])

  const renderNode = (node, x, y, depth) => {
    if (!layout) return null

    // Get metric value for this node
    const metricValue = getMetricValue(node, selectedMetric)
    
    // Minimum width for bars to ensure text visibility (60px minimum, or actual width if larger)
    const minBarWidth = 60
    const nodeWidth = Math.max(minBarWidth, metricValue * layout.scaleX)
    const nodeHeight = layout.barHeight
    const nodeY = y + (depth * (nodeHeight + 2))

    const isHovered = hoveredNode === node.id
    const isSelected = selectedNode === node.id

    // Color based on selected metric with better contrast
    const colorIntensity = layout.totalMetric > 0 
      ? Math.min(255, Math.floor((metricValue / layout.totalMetric) * 255))
      : 0
    // Use a more vibrant color scheme with better contrast
    const r = Math.min(255, colorIntensity + 50)
    const g = Math.max(100, 255 - colorIntensity)
    const b = Math.max(100, 200 - Math.floor(colorIntensity / 2))
    const backgroundColor = `rgb(${r}, ${g}, ${b})`
    
    // Calculate text color based on background brightness for better contrast
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    const textColor = brightness > 128 ? '#000000' : '#ffffff'

    const elements = []

    // Truncate function name if too long for the bar width
    const maxChars = Math.floor((nodeWidth - 8) / 6) // Approximate chars per pixel
    const displayName = node.name.length > maxChars 
      ? node.name.substring(0, Math.max(0, maxChars - 3)) + '...'
      : node.name

    elements.push(
      <g key={node.id}>
        <rect
          x={x}
          y={nodeY}
          width={nodeWidth}
          height={nodeHeight}
          fill={backgroundColor}
          stroke={isSelected ? '#007bff' : (isHovered ? '#0056b3' : '#ddd')}
          strokeWidth={isSelected ? 2 : 1}
          onMouseEnter={(e) => {
            setHoveredNode(node.id)
            if (svgRef.current && containerRef.current) {
              const svgRect = svgRef.current.getBoundingClientRect()
              const containerRect = containerRef.current.getBoundingClientRect()
              setMousePosition({
                x: e.clientX - containerRect.left,
                y: e.clientY - containerRect.top
              })
            }
          }}
          onMouseMove={(e) => {
            if (svgRef.current && containerRef.current) {
              const containerRect = containerRef.current.getBoundingClientRect()
              setMousePosition({
                x: e.clientX - containerRect.left,
                y: e.clientY - containerRect.top
              })
            }
          }}
          onMouseLeave={() => setHoveredNode(null)}
          onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
          className="flame-node"
        />
        {nodeWidth >= minBarWidth && (
          <>
            {/* Background for text for better visibility */}
            <rect
              x={x + 2}
              y={nodeY + 2}
              width={Math.min(nodeWidth - 4, displayName.length * 6 + 4)}
              height={nodeHeight - 4}
              fill="rgba(255, 255, 255, 0.85)"
              stroke="rgba(0, 0, 0, 0.1)"
              strokeWidth="0.5"
              rx="2"
              ry="2"
              className="flame-node-text-bg"
            />
            <text
              x={x + 4}
              y={nodeY + nodeHeight / 2}
              dy="0.35em"
              fontSize="11"
              fontWeight="600"
              fill={textColor}
              className="flame-node-text"
              title={node.name !== displayName ? node.name : undefined}
            >
              {displayName}
            </text>
          </>
        )}
      </g>
    )

    // Render children
    let childX = x
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        const childElements = renderNode(child, childX, y, depth + 1)
        if (childElements) {
          elements.push(...childElements)
        }
        const childMetricValue = getMetricValue(child, selectedMetric)
        childX += childMetricValue * layout.scaleX
      })
    }

    return elements
  }

  const dataToUse = filteredFlameData || flameData
  if (!dataToUse || dataToUse.length === 0) {
    return (
      <div className="flame-graph-empty">
        No call stack data available for flame graph
      </div>
    )
  }

  if (!layout) {
    return <div className="flame-graph-empty">Calculating layout...</div>
  }

  return (
    <div className="flame-graph-container" ref={containerRef}>
      <TraceTabFilters
        onFiltersChange={setFilters}
        availableFilters={['duration']}
      />
      <div className="flame-graph-header">
        <h3>Flame Graph - {getMetricLabel(selectedMetric)}</h3>
        <div className="flame-graph-controls">
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="metric-selector"
          >
            <option value="duration">Duration</option>
            <option value="cpu">CPU</option>
            <option value="memory">Memory</option>
            <option value="network">Network</option>
          </select>
          <button onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}>
            Zoom Out
          </button>
          <button onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))}>
            Zoom In
          </button>
          <button onClick={() => {
            setZoomLevel(1)
            setPanX(0)
            setSelectedNode(null)
          }}>
            Reset
          </button>
        </div>
      </div>
      <div className="flame-graph-content" ref={containerRef}>
        <svg
          ref={svgRef}
          width={width}
          height={layout.height}
          viewBox={`0 0 ${width} ${layout.height}`}
          style={{
            transform: `scale(${zoomLevel}) translate(${panX}px, 0px)`,
            transformOrigin: 'top left',
          }}
          className="flame-graph-svg"
        >
          {dataToUse.map((node, idx) => {
            const elements = renderNode(node, 20, 20, 0)
            return elements
          })}
        </svg>
        {hoveredNode && (
          <div 
            className="flame-graph-tooltip"
            style={{
              left: `${mousePosition.x + 10}px`,
              top: `${mousePosition.y + 10}px`,
            }}
          >
            <div className="tooltip-content">
              {(() => {
                const findNode = (nodes, id) => {
                  for (const node of nodes) {
                    if (node.id === id) return node
                    if (node.children) {
                      const found = findNode(node.children, id)
                      if (found) return found
                    }
                  }
                  return null
                }
                const node = findNode(dataToUse, hoveredNode)
                if (!node) return null
                const metricValue = getMetricValue(node, selectedMetric)
                return (
                  <>
                    <div><strong>Function:</strong> {node.name}</div>
                    {node.class && <div><strong>Class:</strong> {node.class}</div>}
                    {node.file && <div><strong>File:</strong> {node.file}</div>}
                    <div><strong>{getMetricLabel(selectedMetric)}:</strong> {formatMetricValue(metricValue, selectedMetric)}</div>
                    <div><strong>Duration:</strong> {formatDuration(node.duration)}</div>
                    {node.cpu > 0 && <div><strong>CPU:</strong> {formatDuration(node.cpu)}</div>}
                    {node.memory_delta !== 0 && (
                      <div><strong>Memory:</strong> {formatMemory(node.memory_delta)}</div>
                    )}
                    {(node.network_bytes_sent > 0 || node.network_bytes_received > 0) && (
                      <div>
                        <strong>Network:</strong> {formatBytes(node.network_bytes_sent + node.network_bytes_received)}
                        {node.network_bytes_sent > 0 && node.network_bytes_received > 0 && (
                          <span> (↑{formatBytes(node.network_bytes_sent)} ↓{formatBytes(node.network_bytes_received)})</span>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FlameGraph

