import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { FiChevronRight, FiChevronDown } from 'react-icons/fi'
import './JsonTreeViewer.css'

// Generate unique path for each node
let nodeIdCounter = 0

function JsonTreeViewer({ data, level = 0, path = 'root', expandedNodes, onToggleNode, autoExpandLevels = 2 }) {
  const nodeId = path
  const isExpanded = expandedNodes ? expandedNodes.has(nodeId) : (level < autoExpandLevels)
  
  const handleToggle = useCallback(() => {
    if (onToggleNode) {
      onToggleNode(nodeId)
    }
  }, [nodeId, onToggleNode])

  if (data === null) {
    return <span className="json-null">null</span>
  }

  if (data === undefined) {
    return <span className="json-undefined">undefined</span>
  }

  if (typeof data === 'boolean') {
    return <span className="json-boolean">{data ? 'true' : 'false'}</span>
  }

  if (typeof data === 'number') {
    return <span className="json-number">{data}</span>
  }

  if (typeof data === 'string') {
    return <span className="json-string">"{data}"</span>
  }

  if (Array.isArray(data)) {
    const hasItems = data.length > 0

    return (
      <div className="json-node">
        <div className="json-node-header">
          {hasItems && (
            <button
              className="json-expand-btn"
              onClick={handleToggle}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
            </button>
          )}
          {!hasItems && <span className="json-spacer" />}
          <span className="json-bracket">[</span>
          <span className="json-count">{data.length}</span>
          <span className="json-bracket">]</span>
          {!hasItems && <span className="json-bracket">[]</span>}
        </div>
        {hasItems && isExpanded && (
          <div className="json-node-children">
            {data.map((item, index) => (
              <div key={index} className="json-array-item">
                <span className="json-key">{index}:</span>
                <JsonTreeViewer 
                  data={item} 
                  level={level + 1} 
                  path={`${path}[${index}]`}
                  expandedNodes={expandedNodes}
                  onToggleNode={onToggleNode}
                  autoExpandLevels={autoExpandLevels}
                />
              </div>
            ))}
            <div className="json-node-footer">
              <span className="json-bracket">]</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data)
    const hasKeys = keys.length > 0

    return (
      <div className="json-node">
        <div className="json-node-header">
          {hasKeys && (
            <button
              className="json-expand-btn"
              onClick={handleToggle}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
            </button>
          )}
          {!hasKeys && <span className="json-spacer" />}
          <span className="json-bracket">{'{'}</span>
          {hasKeys && <span className="json-count">{keys.length} {keys.length === 1 ? 'key' : 'keys'}</span>}
          {!hasKeys && <span className="json-bracket">{'}'}</span>}
        </div>
        {hasKeys && isExpanded && (
          <div className="json-node-children">
            {keys.map((key) => (
              <div key={key} className="json-object-item">
                <span className="json-key">"{key}":</span>
                <JsonTreeViewer 
                  data={data[key]} 
                  level={level + 1} 
                  path={`${path}.${key}`}
                  expandedNodes={expandedNodes}
                  onToggleNode={onToggleNode}
                  autoExpandLevels={autoExpandLevels}
                />
              </div>
            ))}
            <div className="json-node-footer">
              <span className="json-bracket">{'}'}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return <span className="json-unknown">{String(data)}</span>
}

// Wrapper component with expand/collapse all controls
function JsonTreeViewerWrapper({ data, globalExpandState = null, showControls = true }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  
  // Collect all node paths
  const allNodePaths = useMemo(() => {
    const paths = new Set()
    
    const collectPaths = (obj, currentPath = 'root') => {
      if (Array.isArray(obj)) {
        paths.add(currentPath)
        obj.forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            collectPaths(item, `${currentPath}[${index}]`)
          }
        })
      } else if (typeof obj === 'object' && obj !== null) {
        paths.add(currentPath)
        Object.keys(obj).forEach(key => {
          const value = obj[key]
          if (typeof value === 'object' && value !== null) {
            collectPaths(value, `${currentPath}.${key}`)
          }
        })
      }
    }
    
    if (data) {
      collectPaths(data)
    }
    
    return paths
  }, [data])

  // Sync with global expand state
  useEffect(() => {
    if (globalExpandState === 'all') {
      setExpandedNodes(new Set(allNodePaths))
    } else if (globalExpandState === 'none') {
      setExpandedNodes(new Set())
    }
    // If globalExpandState is null, allow individual control
  }, [globalExpandState, allNodePaths])

  const expandAll = useCallback(() => {
    setExpandedNodes(new Set(allNodePaths))
  }, [allNodePaths])

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set())
  }, [])

  const toggleNode = useCallback((nodeId) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }, [])

  return (
    <div className="json-tree-wrapper">
      {showControls && (
        <div className="json-tree-controls">
          <button onClick={expandAll} className="json-control-btn">
            Expand All
          </button>
          <button onClick={collapseAll} className="json-control-btn">
            Collapse All
          </button>
        </div>
      )}
      <div className="json-tree-content">
        <JsonTreeViewer 
          data={data} 
          expandedNodes={expandedNodes}
          onToggleNode={toggleNode}
        />
      </div>
    </div>
  )
}

export default JsonTreeViewerWrapper

