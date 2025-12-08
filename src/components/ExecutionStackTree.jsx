import React, { useState, useMemo } from 'react'
import { FiCpu, FiClock, FiHardDrive, FiGlobe, FiChevronRight, FiChevronDown, FiCode, FiFile } from 'react-icons/fi'
import TraceTabFilters from './TraceTabFilters'
import './ExecutionStackTree.css'

function ExecutionStackTree({ callStack }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [filters, setFilters] = useState({ enabled: false, thresholds: {} })

  // Build tree structure from call stack
  const treeData = useMemo(() => {
    if (!callStack || (Array.isArray(callStack) && callStack.length === 0)) {
      return []
    }

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
        network_bytes_sent: node.network_bytes_sent || node.NetworkBytesSent || 0,
        network_bytes_received: node.network_bytes_received || node.NetworkBytesReceived || 0,
        parent_id: node.parent_id || node.ParentID || null,
        depth: node.depth || node.Depth || 0,
        function_type: node.function_type || node.FunctionType || 0,
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
    const hasNestedChildren = callStack.some(node => 
      node.children && Array.isArray(node.children) && node.children.length > 0
    )

    let allNodes
    if (hasNestedChildren) {
      // Already hierarchical - use it directly but normalize
      const buildNormalizedTree = (nodes) => {
        return nodes.map(node => {
          const normalized = normalizeNode(node)
          if (node.children && Array.isArray(node.children) && node.children.length > 0) {
            normalized.children = buildNormalizedTree(node.children)
          } else {
            normalized.children = []
          }
          return normalized
        })
      }
      return buildNormalizedTree(callStack)
    } else {
      // Flat array - build tree from parent_id relationships
      allNodes = callStack.map(normalizeNode)

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

      // Sort children by depth or original order
      const sortChildren = (node) => {
        if (node.children.length > 0) {
          node.children.sort((a, b) => {
            if (a.depth !== undefined && b.depth !== undefined) {
              return a.depth - b.depth
            }
            return 0
          })
          node.children.forEach(sortChildren)
        }
      }
      rootNodes.forEach(sortChildren)

      return rootNodes.length > 0 ? rootNodes : []
    }
  }, [callStack])

  // Filter tree data based on thresholds
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

    const filterNode = (node) => {
      // If node doesn't meet criteria, exclude it and all its children
      if (!shouldIncludeNode(node)) {
        return null
      }

      // Filter children recursively
      const filteredChildren = node.children
        ? node.children.map(filterNode).filter(child => child !== null)
        : []

      // Return node with filtered children
      return {
        ...node,
        children: filteredChildren
      }
    }

    return treeData.map(filterNode).filter(node => node !== null)
  }, [treeData, filters])

  const toggleNode = (callId) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(callId)) {
      newExpanded.delete(callId)
    } else {
      newExpanded.add(callId)
    }
    setExpandedNodes(newExpanded)
  }

  const expandAll = () => {
    const allNodeIds = new Set()
    const collectIds = (nodes) => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          allNodeIds.add(node.call_id)
          collectIds(node.children)
        }
      })
    }
    collectIds(treeData)
    setExpandedNodes(allNodeIds)
  }

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
          />
        ))}
      </div>
    </div>
  )
}

function StackTreeNode({ node, expandedNodes, onToggle, depth, formatBytes, formatMemory, formatDuration }) {
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = expandedNodes.has(node.call_id)
  const displayName = node.class ? `${node.class}::${node.function}` : node.function
  const functionTypeLabel = node.function_type === 1 ? 'internal' : node.function_type === 2 ? 'method' : 'user'

  return (
    <div className="stack-tree-node">
      <div 
        className="stack-tree-node-content"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        <div className="stack-tree-node-main">
          {hasChildren && (
            <button
              className="stack-tree-expand-btn"
              onClick={() => onToggle(node.call_id)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
            </button>
          )}
          {!hasChildren && <div className="stack-tree-spacer" />}
          
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
      
      {hasChildren && isExpanded && (
        <div className="stack-tree-children">
          {node.children.map((child, idx) => (
            <StackTreeNode
              key={child.call_id || idx}
              node={child}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              depth={depth + 1}
              formatBytes={formatBytes}
              formatMemory={formatMemory}
              formatDuration={formatDuration}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default ExecutionStackTree

