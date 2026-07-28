import React, { useState, useMemo, useCallback, useRef } from 'react'
import { FiCpu, FiClock, FiHardDrive, FiGlobe, FiChevronRight, FiChevronDown, FiCode, FiFile } from 'react-icons/fi'
import TraceTabFilters from './TraceTabFilters'
import { VIZ_V2_ENABLED } from '../utils/chartTheme'
import './ExecutionStackTree.css'

// Row virtualization tuning (only used when VIZ_V2 is enabled).
const ROW_HEIGHT = 44        // fixed windowed-row height in px
const OVERSCAN = 6           // extra rows rendered above/below the viewport
const VIEWPORT_MAX = 640     // max scroll-container height in px
const ROW_DEPTH_INDENT = 24  // matches the paddingLeft depth multiplier below
const ROW_BASE_WIDTH = 480   // min room for name/file/metrics at depth 0

function ExecutionStackTree({ callStack }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [filters, setFilters] = useState({ enabled: false, thresholds: {} })
  const [sortOrder, setSortOrder] = useState('newest') // 'newest' | 'oldest'

  // Normalize nodes - handle both flat and hierarchical structures
  const normalizeNode = useCallback((node) => {
    return {
      call_id: node.call_id || node.CallID || node.id || Math.random().toString(),
      function: node.function || node.Function || node.name || 'unknown',
      class: node.class || node.Class || '',
      file: node.file || node.File || '',
      line: node.line || node.Line || 0,
      duration_ms: node.duration_ms || node.DurationMs || node.duration || 0,
      cpu_ms: node.cpu_ms || node.CPUMs || node.cpu || 0,
      memory_delta: node.memory_delta || node.MemoryDelta || 0,
      network_bytes_sent: node.network_bytes_sent || node.NetworkBytesSent || 0,
      network_bytes_received: node.network_bytes_received || node.NetworkBytesReceived || 0,
      parent_id: node.parent_id || node.ParentID || null,
      depth: node.depth || node.Depth || 0,
      function_type: node.function_type || node.FunctionType || 0,
      _hasChildren: undefined, // Will be computed lazily
    }
  }, [])

  // Build flat node map, root nodes, and a parentId -> children[] index
  const { nodeMap, rootNodes, childrenMap } = useMemo(() => {
    if (!callStack || (Array.isArray(callStack) && callStack.length === 0)) {
      return { nodeMap: new Map(), rootNodes: [], childrenMap: new Map() }
    }

    // Flatten hierarchical structure if needed
    const flattenStack = (nodes) => {
      const flat = []
      const processNode = (node) => {
        flat.push(node)
        if (node.children && Array.isArray(node.children) && node.children.length > 0) {
          node.children.forEach(processNode)
        }
      }
      nodes.forEach(processNode)
      return flat
    }

    // Check if already hierarchical
    const hasNestedChildren = callStack.some(node => 
      node.children && Array.isArray(node.children) && node.children.length > 0
    )

    // Get flat array of all nodes
    const allNodesFlat = hasNestedChildren ? flattenStack(callStack) : callStack

    // Normalize all nodes and create map
    const normalizedNodes = allNodesFlat.map(normalizeNode)
    const map = new Map()
    const roots = []
    const childIndex = new Map()

    // Create map, identify roots, and index children by parent_id (O(n))
    normalizedNodes.forEach(node => {
      map.set(node.call_id, node)
      if (!node.parent_id || node.parent_id === '') {
        roots.push(node)
      } else {
        const siblings = childIndex.get(node.parent_id)
        if (siblings) {
          siblings.push(node)
        } else {
          childIndex.set(node.parent_id, [node])
        }
      }
    })

    // Stable child sort by depth (matches previous getChildren ordering),
    // then optionally reversed so the most recent call at each level shows first.
    const byDepth = (a, b) => {
      if (a.depth !== undefined && b.depth !== undefined) {
        return a.depth - b.depth
      }
      return 0
    }
    const applyOrder = (siblings) => {
      siblings.sort(byDepth)
      if (sortOrder === 'newest') siblings.reverse()
      return siblings
    }
    childIndex.forEach(applyOrder)
    applyOrder(roots)

    return { nodeMap: map, rootNodes: roots, childrenMap: childIndex }
  }, [callStack, normalizeNode, sortOrder])

  // Filter function - shared for both root nodes and children
  const shouldIncludeNode = useCallback((node) => {
    if (!filters.enabled) {
      return true
    }

    const thresholds = filters.thresholds || {}
    
    // Check duration threshold
    if (thresholds.duration !== undefined && node.duration_ms < thresholds.duration) {
      return false
    }
    
    // Check memory threshold (absolute value)
    if (thresholds.memory !== undefined && Math.abs(node.memory_delta) < thresholds.memory) {
      return false
    }
    
    // Check network threshold (total bytes)
    const totalNetwork = (node.network_bytes_sent || 0) + (node.network_bytes_received || 0)
    if (thresholds.network !== undefined && totalNetwork < thresholds.network) {
      return false
    }
    
    // Check CPU threshold
    if (thresholds.cpu !== undefined && node.cpu_ms < thresholds.cpu) {
      return false
    }
    
    return true
  }, [filters])

  // Check if a node has (visible) children - O(1) lookup in the precomputed index.
  // When a filter is active, only count children that pass the filter, so we don't
  // show an expand chevron for a subtree that would render empty.
  const hasChildren = useCallback((nodeId) => {
    const children = childrenMap.get(nodeId)
    if (!children || children.length === 0) {
      return false
    }
    if (!filters.enabled) {
      return true
    }
    return children.some(shouldIncludeNode)
  }, [childrenMap, filters.enabled, shouldIncludeNode])

  // Get children for a specific node - pure O(1) lookup, no state mutation.
  const getChildren = useCallback((parentId) => {
    const children = childrenMap.get(parentId)
    if (!children || children.length === 0) {
      return []
    }

    // Apply filters (shouldIncludeNode is a no-op when filters are disabled)
    return children
      .filter(shouldIncludeNode)
      .map(node => ({
        ...node,
        _hasChildren: hasChildren(node.call_id)
      }))
  }, [childrenMap, hasChildren, shouldIncludeNode])

  // Build tree structure with lazy-loaded children
  const treeData = useMemo(() => {
    // Initially only return root nodes
    return rootNodes.map(node => ({
      ...node,
      _hasChildren: hasChildren(node.call_id)
    }))
  }, [rootNodes, hasChildren])

  // Filter tree data based on thresholds (applies to root nodes)
  const filteredTreeData = useMemo(() => {
    if (!treeData || treeData.length === 0) {
      return treeData
    }

    return treeData.filter(shouldIncludeNode)
  }, [treeData, shouldIncludeNode])

  const toggleNode = useCallback((callId) => {
    setExpandedNodes(prev => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(callId)) {
        newExpanded.delete(callId)
      } else {
        newExpanded.add(callId)
      }
      return newExpanded
    })
  }, [])

  const expandAll = useCallback(() => {
    const allVisibleNodeIds = new Set()
    const collectVisibleIds = (nodes) => {
      nodes.forEach(node => {
        if (hasChildren(node.call_id)) {
          allVisibleNodeIds.add(node.call_id)
          // Recurse using the freshly computed children, not stale state
          collectVisibleIds(getChildren(node.call_id))
        }
      })
    }
    collectVisibleIds(filteredTreeData)
    setExpandedNodes(allVisibleNodeIds)
  }, [filteredTreeData, hasChildren, getChildren])

  const collapseAll = () => {
    setExpandedNodes(new Set())
  }

  // --- Row virtualization (VIZ_V2, on by default) -------------------------
  // Flatten the currently-visible rows (respecting expand state AND active
  // filters) into a linear list so we can window it. This walks the same
  // O(1) childrenMap via getChildren(), so filtering/expand semantics match
  // the recursive renderer exactly.
  const scrollRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)

  const flatRows = useMemo(() => {
    if (!VIZ_V2_ENABLED) return []
    const rows = []
    const walk = (nodes, depth) => {
      for (const node of nodes) {
        const expandable = hasChildren(node.call_id)
        rows.push({ node, depth, expandable })
        if (expandable && expandedNodes.has(node.call_id)) {
          walk(getChildren(node.call_id), depth + 1)
        }
      }
    }
    walk(filteredTreeData, 0)
    return rows
  }, [filteredTreeData, expandedNodes, hasChildren, getChildren])

  const handleScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const formatMemory = (bytes) => {
    if (bytes === 0) return '0 B'
    const abs = Math.abs(bytes)
    const sign = bytes < 0 ? '-' : '+'
    if (abs < 1024) return `${sign}${abs} B`
    if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(2)} KB`
    return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`
  }

  const formatDuration = (ms) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }


  if (!filteredTreeData || filteredTreeData.length === 0) {
    return (
      <div className="execution-stack-tree">
        <TraceTabFilters
          onFiltersChange={setFilters}
          availableFilters={['duration', 'memory', 'network', 'cpu']}
        />
      <div className="execution-stack-tree-empty">
          <p>
            {filters.enabled 
              ? 'No nodes match the current filter criteria' 
              : 'No execution stack data available'}
          </p>
        </div>
      </div>
    )
  }

  // Windowed slice (only meaningful when VIZ_V2 is enabled; cheap no-op otherwise)
  const total = flatRows.length
  const viewportHeight = Math.min(VIEWPORT_MAX, Math.max(total, 1) * ROW_HEIGHT)
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN)
  const visibleSlice = flatRows.slice(startIndex, endIndex)

  // Deepest rows need more horizontal room than the viewport; grow the
  // sizer div to fit so the scroll container scrolls horizontally instead
  // of crushing paddingLeft-indented rows down to nothing.
  const maxRowDepth = total > 0 ? Math.max(...flatRows.map(r => r.depth)) : 0
  const rowContentWidth = maxRowDepth * ROW_DEPTH_INDENT + 8 + ROW_BASE_WIDTH

  return (
    <div className="execution-stack-tree">
      <TraceTabFilters
        onFiltersChange={setFilters}
        availableFilters={['duration', 'memory', 'network', 'cpu']}
      />
      <div className="execution-stack-tree-header">
        <h2>Execution Stack Tree</h2>
        <div className="execution-stack-tree-controls">
          <select
            className="control-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            aria-label="Sort order"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button onClick={expandAll} className="control-btn">
            Expand All
          </button>
          <button onClick={collapseAll} className="control-btn">
            Collapse All
          </button>
        </div>
      </div>
      {/* Large traces: hand-rolled row windowing (no extra deps). Flatten the
          visible rows, then render only the slice inside the scroll viewport
          plus a small overscan. On by default via VIZ_V2_ENABLED; deployers
          can opt back into the full recursive render with VITE_VIZ_V2=false. */}
      {VIZ_V2_ENABLED ? (
        <div
          className="execution-stack-tree-content execution-stack-tree-content--virtual"
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ height: viewportHeight, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}
        >
          <div style={{ height: total * ROW_HEIGHT, minWidth: rowContentWidth, position: 'relative' }}>
            {visibleSlice.map(({ node, depth, expandable }, i) => {
              const index = startIndex + i
              return (
                <FlatStackRow
                  key={node.call_id || index}
                  node={node}
                  depth={depth}
                  expandable={expandable}
                  isExpanded={expandedNodes.has(node.call_id)}
                  onToggle={toggleNode}
                  top={index * ROW_HEIGHT}
                  height={ROW_HEIGHT}
                  formatBytes={formatBytes}
                  formatMemory={formatMemory}
                  formatDuration={formatDuration}
                />
              )
            })}
          </div>
        </div>
      ) : (
        <div className="execution-stack-tree-content">
          {filteredTreeData.map((node, idx) => (
            <StackTreeNode
              key={node.call_id || idx}
              node={node}
              expandedNodes={expandedNodes}
              onToggle={toggleNode}
              depth={0}
              formatBytes={formatBytes}
              formatMemory={formatMemory}
              formatDuration={formatDuration}
              getChildren={getChildren}
              hasChildren={hasChildren}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StackTreeNode({ node, expandedNodes, onToggle, depth, formatBytes, formatMemory, formatDuration, getChildren, hasChildren }) {
  const nodeHasChildren = hasChildren ? hasChildren(node.call_id) : (node._hasChildren !== undefined ? node._hasChildren : false)
  const isExpanded = expandedNodes.has(node.call_id)
  const displayName = node.class ? `${node.class}::${node.function}` : node.function
  const functionTypeLabel = node.function_type === 1 ? 'internal' : node.function_type === 2 ? 'method' : 'user'

  // Get children when expanded - pure O(1) lookup, no state mutation during render
  const children = isExpanded && nodeHasChildren && getChildren
    ? getChildren(node.call_id)
    : []

  return (
    <div className="stack-tree-node">
      <div 
        className="stack-tree-node-content"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        <div className="stack-tree-node-main">
          {nodeHasChildren && (
            <button
              className="stack-tree-expand-btn"
              onClick={() => onToggle(node.call_id)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
            </button>
          )}
          {!nodeHasChildren && <div className="stack-tree-spacer" />}
          
          <div className="stack-tree-node-info">
            <div className="stack-tree-node-name">
              <FiCode className="stack-tree-icon" />
              <strong>{displayName}</strong>
              {node.file && (
                <span className="stack-tree-file-info">
                  <FiFile className="stack-tree-icon-small" />
                  {node.file.split('/').pop()}
                  {node.line > 0 && `:${node.line}`}
                </span>
              )}
              <span className={`stack-tree-function-type ${functionTypeLabel}`}>
                {functionTypeLabel}
              </span>
            </div>
            
            <div className="stack-tree-node-metrics">
              <div className="stack-tree-metric">
                <FiClock className="stack-tree-metric-icon" />
                <span className="stack-tree-metric-label">Duration:</span>
                <span className="stack-tree-metric-value">{formatDuration(node.duration_ms)}</span>
              </div>
              
              {node.cpu_ms > 0 && (
                <div className="stack-tree-metric">
                  <FiCpu className="stack-tree-metric-icon" />
                  <span className="stack-tree-metric-label">CPU:</span>
                  <span className="stack-tree-metric-value">{formatDuration(node.cpu_ms)}</span>
                </div>
              )}
              
              {node.memory_delta !== 0 && (
                <div className="stack-tree-metric">
                  <FiHardDrive className="stack-tree-metric-icon" />
                  <span className="stack-tree-metric-label">Memory:</span>
                  <span className={`stack-tree-metric-value ${node.memory_delta < 0 ? 'negative' : 'positive'}`}>
                    {formatMemory(node.memory_delta)}
                  </span>
                </div>
              )}
              
              {(node.network_bytes_sent > 0 || node.network_bytes_received > 0) && (
                <div className="stack-tree-metric network-metric">
                  <FiGlobe className="stack-tree-metric-icon" />
                  <span className="stack-tree-metric-label">Network:</span>
                  <span className="stack-tree-metric-value">
                    {node.network_bytes_sent > 0 && (
                      <span className="network-sent">↑ {formatBytes(node.network_bytes_sent)}</span>
                    )}
                    {node.network_bytes_sent > 0 && node.network_bytes_received > 0 && (
                      <span> / </span>
                    )}
                    {node.network_bytes_received > 0 && (
                      <span className="network-received">↓ {formatBytes(node.network_bytes_received)}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {nodeHasChildren && isExpanded && children.length > 0 && (
        <div className="stack-tree-children">
          {children.map((child, idx) => (
            <StackTreeNode
              key={child.call_id || idx}
              node={child}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              depth={depth + 1}
              formatBytes={formatBytes}
              formatMemory={formatMemory}
              formatDuration={formatDuration}
              getChildren={getChildren}
              hasChildren={hasChildren}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Compact, fixed-height row used by the windowed renderer. Renders the same
// information as StackTreeNode but on a single constrained line so every row is
// exactly ROW_HEIGHT tall (a prerequisite for scrollTop-based windowing).
function FlatStackRow({ node, depth, expandable, isExpanded, onToggle, top, height, formatBytes, formatMemory, formatDuration }) {
  const displayName = node.class ? `${node.class}::${node.function}` : node.function
  const functionTypeLabel = node.function_type === 1 ? 'internal' : node.function_type === 2 ? 'method' : 'user'

  return (
    <div
      className="stack-tree-node-content stack-tree-node-content--virtual"
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height,
        paddingLeft: `${depth * 24 + 8}px`,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <div className="stack-tree-node-main" style={{ minWidth: 0, width: '100%' }}>
        {expandable ? (
          <button
            className="stack-tree-expand-btn"
            onClick={() => onToggle(node.call_id)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
          </button>
        ) : (
          <div className="stack-tree-spacer" />
        )}

        <div className="stack-tree-node-info" style={{ minWidth: 0 }}>
          <div className="stack-tree-node-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <FiCode className="stack-tree-icon" />
            <strong>{displayName}</strong>
            {node.file && (
              <span className="stack-tree-file-info">
                <FiFile className="stack-tree-icon-small" />
                {node.file.split('/').pop()}
                {node.line > 0 && `:${node.line}`}
              </span>
            )}
            <span className={`stack-tree-function-type ${functionTypeLabel}`}>
              {functionTypeLabel}
            </span>
            <span className="stack-tree-metric" style={{ marginLeft: 'auto' }}>
              <FiClock className="stack-tree-metric-icon" />
              <span className="stack-tree-metric-value">{formatDuration(node.duration_ms)}</span>
            </span>
            {node.cpu_ms > 0 && (
              <span className="stack-tree-metric">
                <FiCpu className="stack-tree-metric-icon" />
                <span className="stack-tree-metric-value">{formatDuration(node.cpu_ms)}</span>
              </span>
            )}
            {node.memory_delta !== 0 && (
              <span className="stack-tree-metric">
                <FiHardDrive className="stack-tree-metric-icon" />
                <span className={`stack-tree-metric-value ${node.memory_delta < 0 ? 'negative' : 'positive'}`}>
                  {formatMemory(node.memory_delta)}
                </span>
              </span>
            )}
            {(node.network_bytes_sent > 0 || node.network_bytes_received > 0) && (
              <span className="stack-tree-metric network-metric">
                <FiGlobe className="stack-tree-metric-icon" />
                <span className="stack-tree-metric-value">
                  {node.network_bytes_sent > 0 && (
                    <span className="network-sent">↑ {formatBytes(node.network_bytes_sent)}</span>
                  )}
                  {node.network_bytes_sent > 0 && node.network_bytes_received > 0 && <span> / </span>}
                  {node.network_bytes_received > 0 && (
                    <span className="network-received">↓ {formatBytes(node.network_bytes_received)}</span>
                  )}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExecutionStackTree

