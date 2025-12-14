import React, { useMemo, useState } from 'react'
import axios from 'axios'
import SqlQueryViewer from './SqlQueryViewer'
import StackTraceViewer from './StackTraceViewer'
import TraceTabFilters from './TraceTabFilters'
import './TraceWaterfall.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function TraceWaterfall({ trace, traceId }) {
  // Start with root nodes expanded by default
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [selectedNode, setSelectedNode] = useState(null)
  const [fullTrace, setFullTrace] = useState(trace)
  const [initialized, setInitialized] = useState(false)
  const [filters, setFilters] = useState({ enabled: false, thresholds: {} })

  // Fetch full trace if only traceId is provided
  React.useEffect(() => {
    if (traceId && !trace) {
      axios.get(`${API_URL}/api/traces/${traceId}/full`)
        .then(res => setFullTrace(res.data))
        .catch(err => console.error('Error fetching full trace:', err))
    }
  }, [traceId, trace])

  const traceData = fullTrace || trace

  // Extract and build call stack tree from execution stack
  const buildCallStackTree = useMemo(() => {
    if (!traceData?.spans) return null

    // Find root span (or first span) and extract its stack
    const rootSpan = traceData.spans.find(s => !s.parent_id) || traceData.spans[0]
    if (!rootSpan) return null

    // Get stack data - prefer stack_flat, fallback to stack
    const stackData = rootSpan.stack_flat && Array.isArray(rootSpan.stack_flat) && rootSpan.stack_flat.length > 0
      ? rootSpan.stack_flat
      : (rootSpan.stack && Array.isArray(rootSpan.stack) && rootSpan.stack.length > 0 ? rootSpan.stack : null)

    if (!stackData || stackData.length === 0) {
      // If no stack in root span, try to collect from all spans
      const allStacks = []
      traceData.spans.forEach(span => {
        const spanStack = span.stack_flat || span.stack
        if (spanStack && Array.isArray(spanStack) && spanStack.length > 0) {
          allStacks.push(...spanStack)
        }
      })
      if (allStacks.length === 0) return null
      return buildTreeFromStack(allStacks)
    }

    return buildTreeFromStack(stackData)
  }, [traceData])

  // Helper function to build tree from stack data
  function buildTreeFromStack(stackData) {
    if (!Array.isArray(stackData) || stackData.length === 0) return null

    // Normalize nodes - handle both flat and hierarchical structures
    const normalizeNode = (node) => {
      return {
        call_id: node.call_id || node.CallID || node.id || Math.random().toString(),
        function: node.function || node.Function || node.name || 'unknown',
        class: node.class || node.Class || '',
        file: node.file || node.File || '',
        line: node.line || node.Line || 0,
        duration_ms: node.duration_ms || node.DurationMs || node.duration || 0,
        cpu_ms: node.cpu_ms || node.CPUMs || node.cpu || 0,
        memory_delta: node.memory_delta || node.MemoryDelta || 0,
        parent_id: node.parent_id || node.ParentID || null,
        depth: node.depth || node.Depth || 0,
        start_ts: node.start_ts || node.StartTs || 0,
        end_ts: node.end_ts || node.EndTs || 0,
        sql_queries: node.sql_queries || node.SQLQueries || [],
        http_requests: node.http_requests || node.HttpRequests || [],
        cache_operations: node.cache_operations || node.CacheOperations || [],
        redis_operations: node.redis_operations || node.RedisOperations || [],
        children: node.children || [],
      }
    }

    // Flatten hierarchical structure if needed
    const flattenStack = (nodes) => {
      const flat = []
      const processNode = (node) => {
        const normalized = normalizeNode(node)
        flat.push(normalized)
        if (node.children && Array.isArray(node.children) && node.children.length > 0) {
          node.children.forEach(processNode)
        }
      }
      nodes.forEach(processNode)
      return flat
    }

    // Check if already hierarchical
    const hasNestedChildren = stackData.some(node => 
      node.children && Array.isArray(node.children) && node.children.length > 0
    )

    let allNodes
    if (hasNestedChildren) {
      // Already hierarchical - flatten first, then rebuild to ensure consistency
      allNodes = flattenStack(stackData)
    } else {
      // Flat array - normalize all nodes
      allNodes = stackData.map(normalizeNode)
    }

    // Build tree from parent_id relationships
    const nodeMap = new Map()
    const rootNodes = []

    // Create map of all nodes
    allNodes.forEach(node => {
      nodeMap.set(node.call_id, { ...node, children: [] })
    })

    // Build parent-child relationships
    allNodes.forEach(node => {
      const nodeObj = nodeMap.get(node.call_id)
      if (!node.parent_id || node.parent_id === '') {
        rootNodes.push(nodeObj)
      } else {
        const parent = nodeMap.get(node.parent_id)
        if (parent) {
          parent.children.push(nodeObj)
        } else {
          // Orphan node - add as root
          rootNodes.push(nodeObj)
        }
      }
    })

    // Sort children by start_ts or by original order
    const sortChildren = (node) => {
      if (node.children.length > 0) {
        node.children.sort((a, b) => {
          if (a.start_ts && b.start_ts) {
            return a.start_ts - b.start_ts
          }
          return 0
        })
        node.children.forEach(sortChildren)
      }
    }
    rootNodes.forEach(sortChildren)

    return rootNodes.length > 0 ? rootNodes : null
  }

  if (!traceData || !buildCallStackTree || buildCallStackTree.length === 0) {
    return <div className="waterfall-empty">No execution stack data to display</div>
  }

  // Collect all nodes for display
  const allNodes = []
  const collectNodes = (nodes, depth = 0, parentStart = null, parentId = null) => {
    nodes.forEach(node => {
      // Calculate relative start time if not available
      let startTime = node.start_ts
      if (!startTime && parentStart !== null) {
        // Estimate start time based on parent (rough approximation)
        startTime = parentStart
      }

      const nodeWithDepth = {
        ...node,
        depth,
        start_ts: startTime,
        end_ts: node.end_ts || (startTime ? startTime + (node.duration_ms || 0) : null),
        displayName: node.class ? `${node.class}::${node.function}` : node.function,
        parentId: parentId,
      }
      allNodes.push(nodeWithDepth)

      // Show children if node is expanded
      const isExpanded = expandedNodes.has(node.call_id)
      if (isExpanded && node.children && node.children.length > 0) {
        collectNodes(node.children, depth + 1, startTime, node.call_id)
      }
    })
  }
  collectNodes(buildCallStackTree)

  // Filter nodes based on thresholds
  const filteredNodes = useMemo(() => {
    if (!filters.enabled) return allNodes
    
    const thresholds = filters.thresholds || {}
    return allNodes.filter(node => {
      if (thresholds.duration !== undefined && (node.duration_ms || 0) < thresholds.duration) {
        return false
      }
      return true
    })
  }, [allNodes, filters])

  const parseTimestamp = (ts) => {
    if (typeof ts === 'number') return ts
    if (typeof ts === 'string') {
      const date = new Date(ts)
      return isNaN(date.getTime()) ? 0 : date.getTime()
    }
    return 0
  }

  // Calculate time range from filtered nodes
  const allStartTimes = filteredNodes.map(n => parseTimestamp(n.start_ts)).filter(t => t > 0)
  const allEndTimes = filteredNodes.map(n => parseTimestamp(n.end_ts || (n.start_ts ? n.start_ts + (n.duration_ms || 0) : 0))).filter(t => t > 0)

  const minTime = allStartTimes.length > 0 ? Math.min(...allStartTimes) : 0
  const maxTime = allEndTimes.length > 0 ? Math.max(...allEndTimes) : (minTime + Math.max(...filteredNodes.map(n => n.duration_ms || 0), 0))

  const getStatusColor = (node) => {
    // Determine status from node data - could check for errors in sql_queries, http_requests, etc.
    if (node.http_requests && Array.isArray(node.http_requests) && node.http_requests.length > 0) {
      const hasError = node.http_requests.some(req => {
        const status = req.status_code || req.statusCode
        return status && status >= 400
      })
      if (hasError) return '#dc3545'
    }
    return '#28a745'
  }

  const getLeft = (startTs) => {
    const start = parseTimestamp(startTs)
    if (maxTime === minTime || !start || start === 0) return 0
    return ((start - minTime) / (maxTime - minTime)) * 100
  }

  const getWidth = (node) => {
    const start = parseTimestamp(node.start_ts)
    const end = parseTimestamp(node.end_ts) || (start ? start + (node.duration_ms || 0) : 0)
    const duration = end - start
    if (maxTime === minTime || duration === 0) {
      // If no timing info, use duration_ms as fallback
      const fallbackDuration = node.duration_ms || 1
      return Math.max((fallbackDuration / (maxTime - minTime || 1)) * 100, 0.5)
    }
    return Math.max((duration / (maxTime - minTime)) * 100, 0.5)
  }

  const toggleExpand = (callId, e) => {
    if (e) {
      e.stopPropagation()
    }
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(callId)) {
      newExpanded.delete(callId)
    } else {
      newExpanded.add(callId)
    }
    setExpandedNodes(newExpanded)
  }

  const expandAll = () => {
    const allIds = new Set()
    const collectIds = (nodes) => {
      nodes.forEach(node => {
        if (node.call_id) {
          allIds.add(node.call_id)
        }
        if (node.children) {
          collectIds(node.children)
        }
      })
    }
    if (buildCallStackTree) {
      collectIds(buildCallStackTree)
    }
    setExpandedNodes(allIds)
  }

  const collapseAll = () => {
    const rootIds = new Set()
    if (buildCallStackTree) {
      buildCallStackTree.forEach(node => {
        if (node.call_id) {
          rootIds.add(node.call_id)
        }
      })
    }
    setExpandedNodes(rootIds)
  }

  const formatDuration = (ms) => {
    if (!ms || ms < 0) return '0ms'
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  return (
    <div className="TraceWaterfall">
      <TraceTabFilters
        onFiltersChange={setFilters}
        availableFilters={['duration']}
      />
      <div className="waterfall-header">
        <div className="waterfall-header-left">
          <h2>Execution Stack Waterfall</h2>
          <div className="trace-id-badge">{traceData.trace_id}</div>
        </div>
        <div className="waterfall-header-right">
          <div className="trace-info">
            <span className="info-badge">
              <span className="info-label">Service:</span>
              <span className="info-value">{traceData.spans[0]?.service || 'N/A'}</span>
            </span>
            <span className="info-badge">
              <span className="info-label">Calls:</span>
              <span className="info-value">{filteredNodes.length}{filters.enabled && filteredNodes.length !== allNodes.length ? ` / ${allNodes.length}` : ''}</span>
            </span>
            <span className="info-badge">
              <span className="info-label">Duration:</span>
              <span className="info-value">{formatDuration(maxTime - minTime)}</span>
            </span>
          </div>
          <div className="waterfall-controls">
            <button className="control-btn" onClick={expandAll} title="Expand All">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L8 14M2 8L14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <button className="control-btn" onClick={collapseAll} title="Collapse All">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 8L14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="waterfall-container">
        <div className="waterfall-timeline">
          {filteredNodes.map((node, idx) => {
            const left = getLeft(node.start_ts)
            const width = getWidth(node)
            const color = getStatusColor(node)
            const hasChildren = node.children && node.children.length > 0
            const isExpanded = expandedNodes.has(node.call_id)
            const isSelected = selectedNode?.call_id === node.call_id
            const indent = node.depth * 24
            
            return (
              <div
                key={node.call_id || idx}
                className={`waterfall-row ${isSelected ? 'selected' : ''} ${hasChildren ? 'has-children' : ''}`}
                style={{ 
                  paddingLeft: `${indent}px`,
                }}
              >
                {node.depth > 0 && (
                  <div className="row-connector" style={{ left: `${indent - 12}px` }} />
                )}
                <div className="row-content">
                  <div className="expand-control">
                    {hasChildren ? (
                      <button
                        className={`expand-btn ${isExpanded ? 'expanded' : ''}`}
                        onClick={(e) => toggleExpand(node.call_id, e)}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          {isExpanded ? (
                            <path 
                              d="M3 4.5L6 7.5L9 4.5" 
                              stroke="currentColor" 
                              strokeWidth="1.5" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                          ) : (
                            <path 
                              d="M4.5 3L7.5 6L4.5 9" 
                              stroke="currentColor" 
                              strokeWidth="1.5" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                          )}
                        </svg>
                      </button>
                    ) : (
                      <div className="expand-spacer" />
                    )}
                  </div>
                  <div className="row-label">
                    <span className="function-name" title={node.displayName}>
                      {node.displayName}
                    </span>
                    {node.file && (
                      <span className="file-info" title={`${node.file}:${node.line || 0}`}>
                        {node.file.split('/').pop()}:{node.line || 0}
                      </span>
                    )}
                  </div>
                  <div
                    className={`waterfall-bar ${isSelected ? 'selected' : ''}`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: color,
                    }}
                    onClick={() => setSelectedNode(node)}
                    title={`${node.displayName} - ${formatDuration(node.duration_ms)}`}
                  >
                    <div className="bar-content">
                      <span className="bar-label">{node.displayName}</span>
                      <span className="bar-duration">{formatDuration(node.duration_ms)}</span>
                    </div>
                    <div className="bar-gradient" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="waterfall-legend">
          <div className="legend-item">
            <span className="legend-color ok"></span>
            <span>OK</span>
          </div>
          <div className="legend-item">
            <span className="legend-color error"></span>
            <span>Error</span>
          </div>
          <div className="legend-item">
            <span className="legend-color unknown"></span>
            <span>Unknown</span>
          </div>
        </div>
      </div>

      {selectedNode && (
        <div className="span-details-panel">
          <div className="span-details-header">
            <h3>Call Stack Node Details</h3>
            <button onClick={() => setSelectedNode(null)} className="close-button">×</button>
          </div>
          <div className="span-details-content">
            <div className="detail-section">
              <div className="detail-row">
                <strong>Function:</strong> {selectedNode.displayName}
              </div>
              {selectedNode.class && (
                <div className="detail-row">
                  <strong>Class:</strong> {selectedNode.class}
                </div>
              )}
              {selectedNode.file && (
                <div className="detail-row">
                  <strong>File:</strong> {selectedNode.file}
                  {selectedNode.line && <span>:{selectedNode.line}</span>}
                </div>
              )}
              <div className="detail-row">
                <strong>Call ID:</strong> {selectedNode.call_id}
              </div>
              <div className="detail-row">
                <strong>Duration:</strong> {formatDuration(selectedNode.duration_ms)}
              </div>
              {selectedNode.cpu_ms && selectedNode.cpu_ms > 0 && (
                <div className="detail-row">
                  <strong>CPU Time:</strong> {formatDuration(selectedNode.cpu_ms)}
                </div>
              )}
              {selectedNode.memory_delta !== undefined && (
                <div className="detail-row">
                  <strong>Memory Delta:</strong> {selectedNode.memory_delta > 0 ? '+' : ''}{selectedNode.memory_delta} bytes
                </div>
              )}
              {selectedNode.depth !== undefined && (
                <div className="detail-row">
                  <strong>Stack Depth:</strong> {selectedNode.depth}
                </div>
              )}
            </div>

            {selectedNode.http_requests && Array.isArray(selectedNode.http_requests) && selectedNode.http_requests.length > 0 && (
              <div className="detail-section">
                <h4>HTTP Requests ({selectedNode.http_requests.length})</h4>
                {selectedNode.http_requests.map((req, idx) => (
                  <div key={idx} className="network-details">
                    {req.url && (
                      <div className="detail-row">
                        <strong>URL:</strong> {req.url}
                      </div>
                    )}
                    {req.method && (
                      <div className="detail-row">
                        <strong>Method:</strong> {req.method}
                      </div>
                    )}
                    {(req.status_code || req.statusCode) && (
                      <div className="detail-row">
                        <strong>Status Code:</strong> {req.status_code || req.statusCode}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedNode.sql_queries && Array.isArray(selectedNode.sql_queries) && selectedNode.sql_queries.length > 0 && (
              <div className="detail-section">
                <h4>SQL Queries ({selectedNode.sql_queries.length})</h4>
                {selectedNode.sql_queries.map((query, idx) => (
                  <div key={idx} className="sql-query-item">
                    <SqlQueryViewer query={query} />
                  </div>
                ))}
              </div>
            )}

            {selectedNode.cache_operations && Array.isArray(selectedNode.cache_operations) && selectedNode.cache_operations.length > 0 && (
              <div className="detail-section">
                <h4>Cache Operations ({selectedNode.cache_operations.length})</h4>
                <pre>{JSON.stringify(selectedNode.cache_operations, null, 2)}</pre>
              </div>
            )}

            {selectedNode.redis_operations && Array.isArray(selectedNode.redis_operations) && selectedNode.redis_operations.length > 0 && (
              <div className="detail-section">
                <h4>Redis Operations ({selectedNode.redis_operations.length})</h4>
                {selectedNode.redis_operations.map((op, idx) => (
                  <div key={idx} className="redis-operation-item">
                    <div className="redis-op-header">
                      <code className="redis-command">{op.command || 'N/A'}</code>
                      {op.key && (
                        <span className="redis-key">{op.key}</span>
                      )}
                    </div>
                    <div className="redis-op-details">
                      {op.duration_ms !== undefined && (
                        <div className="detail-row">
                          <strong>Duration:</strong> {formatDuration(op.duration_ms)}
                        </div>
                      )}
                      {op.hit !== undefined && (
                        <div className="detail-row">
                          <strong>Hit/Miss:</strong> 
                          <span className={`hit-miss-badge ${op.hit ? 'hit' : 'miss'}`}>
                            {op.hit ? 'HIT' : 'MISS'}
                          </span>
                        </div>
                      )}
                      {op.timestamp && (
                        <div className="detail-row">
                          <strong>Timestamp:</strong> {new Date(op.timestamp * 1000).toLocaleString()}
                        </div>
                      )}
                      {op.error && (
                        <div className="detail-row">
                          <strong>Error:</strong> <span className="error-text">{op.error}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedNode && (
        <div className="waterfall-details">
          <h3>Execution Stack Tree</h3>
          {buildCallStackTree.map((node, idx) => (
            <CallStackDetailTree 
              key={node.call_id || idx} 
              node={node} 
              expandedNodes={expandedNodes}
              onToggleExpand={toggleExpand}
              onSelect={setSelectedNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CallStackDetailTree({ node, expandedNodes, onToggleExpand, onSelect, depth = 0 }) {
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = expandedNodes.has(node.call_id)
  const displayName = node.class ? `${node.class}::${node.function}` : node.function

  return (
    <div className="span-detail-tree" style={{ marginLeft: `${depth * 20}px` }}>
      <div 
        className="span-detail-item"
        onClick={() => onSelect(node)}
      >
        <div className="detail-header">
          {hasChildren && (
            <button
              className="expand-button-small"
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand(node.call_id)
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          <strong>{displayName}</strong>
          {node.file && (
            <span className="detail-service">{node.file}:{node.line || 0}</span>
          )}
        </div>
        <div className="detail-info">
          <div>Duration: {node.duration_ms}ms</div>
          {node.cpu_ms && node.cpu_ms > 0 && <div>CPU: {node.cpu_ms}ms</div>}
          {node.depth !== undefined && <div>Depth: {node.depth}</div>}
        </div>
      </div>
      {hasChildren && isExpanded && node.children.map((child, idx) => (
        <CallStackDetailTree
          key={child.call_id || idx}
          node={child}
          expandedNodes={expandedNodes}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}

export default TraceWaterfall
