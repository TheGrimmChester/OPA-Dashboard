import React, { useState, useMemo, useCallback } from 'react'
import { FiCpu, FiClock, FiHardDrive, FiGlobe, FiChevronRight, FiChevronDown, FiCode, FiFile } from 'react-icons/fi'
import TraceTabFilters from './TraceTabFilters'
import './ExecutionStackTree.css'

function ExecutionStackTree({ callStack }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [filters, setFilters] = useState({ enabled: false, thresholds: {} })
  const [loadedChildren, setLoadedChildren] = useState(new Map()) // Cache of loaded children by parent_id

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

  // Build flat node map and root nodes - lazy loading approach
  const { nodeMap, rootNodes } = useMemo(() => {
    if (!callStack || (Array.isArray(callStack) && callStack.length === 0)) {
      return { nodeMap: new Map(), rootNodes: [] }
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

    // Create map and identify roots
    normalizedNodes.forEach(node => {
      map.set(node.call_id, node)
      if (!node.parent_id || node.parent_id === '') {
        roots.push(node)
      }
    })

    // Sort root nodes by depth or original order
    roots.sort((a, b) => {
      if (a.depth !== undefined && b.depth !== undefined) {
        return a.depth - b.depth
      }
      return 0
    })

    return { nodeMap: map, rootNodes: roots }
  }, [callStack, normalizeNode])

  // Check if a node has children (without loading them)
  const hasChildren = useCallback((nodeId) => {
    // Quick check: iterate through nodeMap to see if any node has this as parent
    for (const node of nodeMap.values()) {
      if (node.parent_id === nodeId) {
        return true
      }
    }
    return false
  }, [nodeMap])

  // Get children for a specific node (lazy loading)
  const getChildren = useCallback((parentId) => {
    // Check cache first
    if (loadedChildren.has(parentId)) {
      return loadedChildren.get(parentId)
    }

    // Find all nodes with this parent_id
    const children = []
    nodeMap.forEach(node => {
      if (node.parent_id === parentId) {
        children.push({
          ...node,
          _hasChildren: hasChildren(node.call_id)
        })
      }
    })

    // Sort children by depth
    children.sort((a, b) => {
      if (a.depth !== undefined && b.depth !== undefined) {
        return a.depth - b.depth
      }
      return 0
    })

    // Cache the result
    setLoadedChildren(prev => {
      const newMap = new Map(prev)
      newMap.set(parentId, children)
      return newMap
    })

    return children
  }, [nodeMap, hasChildren, loadedChildren])

  // Build tree structure with lazy-loaded children
  const treeData = useMemo(() => {
    // Initially only return root nodes
    return rootNodes.map(node => ({
      ...node,
      _hasChildren: hasChildren(node.call_id)
    }))
  }, [rootNodes, hasChildren])

  // Filter tree data based on thresholds (only applies to root nodes initially)
  const filteredTreeData = useMemo(() => {
    if (!filters.enabled || !treeData || treeData.length === 0) {
      return treeData
    }

    const thresholds = filters.thresholds || {}
    const shouldIncludeNode = (node) => {
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
    }

    return treeData.filter(shouldIncludeNode)
  }, [treeData, filters])

  const toggleNode = useCallback((callId) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(callId)) {
      newExpanded.delete(callId)
    } else {
      // When expanding, load children if not already loaded
      newExpanded.add(callId)
      if (!loadedChildren.has(callId)) {
        getChildren(callId)
      }
    }
    setExpandedNodes(newExpanded)
  }, [expandedNodes, loadedChildren, getChildren])

  const expandAll = useCallback(() => {
    // Note: expandAll will still need to load all children, which may be slow for large trees
    // For now, we'll just expand what's visible - full expand all would require loading everything
    const allVisibleNodeIds = new Set()
    const collectVisibleIds = (nodes) => {
      nodes.forEach(node => {
        if (hasChildren(node.call_id)) {
          allVisibleNodeIds.add(node.call_id)
          // Load children to make them visible
          if (!loadedChildren.has(node.call_id)) {
            getChildren(node.call_id)
          }
          // Recursively collect from loaded children
          const children = loadedChildren.get(node.call_id) || []
          collectVisibleIds(children)
        }
      })
    }
    collectVisibleIds(filteredTreeData)
    setExpandedNodes(allVisibleNodeIds)
  }, [filteredTreeData, hasChildren, loadedChildren, getChildren])

  const collapseAll = () => {
    setExpandedNodes(new Set())
  }

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

  return (
    <div className="execution-stack-tree">
      <TraceTabFilters
        onFiltersChange={setFilters}
        availableFilters={['duration', 'memory', 'network', 'cpu']}
      />
      <div className="execution-stack-tree-header">
        <h2>Execution Stack Tree</h2>
        <div className="execution-stack-tree-controls">
          <button onClick={expandAll} className="control-btn">
            Expand All
          </button>
          <button onClick={collapseAll} className="control-btn">
            Collapse All
          </button>
        </div>
      </div>
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
            loadedChildren={loadedChildren}
          />
        ))}
      </div>
    </div>
  )
}

function StackTreeNode({ node, expandedNodes, onToggle, depth, formatBytes, formatMemory, formatDuration, getChildren, hasChildren, loadedChildren }) {
  const nodeHasChildren = hasChildren ? hasChildren(node.call_id) : (node._hasChildren !== undefined ? node._hasChildren : false)
  const isExpanded = expandedNodes.has(node.call_id)
  const displayName = node.class ? `${node.class}::${node.function}` : node.function
  const functionTypeLabel = node.function_type === 1 ? 'internal' : node.function_type === 2 ? 'method' : 'user'

  // Get children when expanded (lazy load)
  const children = isExpanded && nodeHasChildren && getChildren 
    ? (loadedChildren.get(node.call_id) || getChildren(node.call_id))
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
              loadedChildren={loadedChildren}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default ExecutionStackTree

