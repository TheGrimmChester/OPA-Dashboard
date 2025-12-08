import React, { useEffect, useRef, useState, useMemo } from 'react'
import { Network } from 'vis-network'
import TraceTabFilters from './TraceTabFilters'
import './CallGraph.css'

// Metric type for different graph views
const METRIC_TYPES = ['wall_time', 'io_wait', 'cpu', 'memory', 'network']

// Helper function to normalize node data (handle both camelCase and snake_case, convert duration units)
function normalizeNode(node) {
  // Convert duration from milliseconds to seconds if needed (Blackfire uses seconds)
  const duration = node.duration_ms || node.DurationMs || node.duration || 0
  const durationInSeconds = duration > 1000 ? duration / 1000 : duration // Assume > 1000 is ms
  
  return {
    id: node.id || node.call_id || node.CallID,
    function: node.function || node.Function || node.name || 'unknown',
    class: node.class || node.Class,
    file: node.file || node.File,
    line: node.line || node.Line,
    duration: durationInSeconds,
    memory_delta: node.memory_delta || node.MemoryDelta || 0,
    cpu_time: node.cpu_ms ? node.cpu_ms / 1000 : (node.CPUMs ? node.CPUMs / 1000 : (node.cpu_time || node.cpu)),
    io_wait_time: node.io_wait_time || node.io_wait,
    wall_time: node.wall_time || node.wall_time_ms ? node.wall_time_ms / 1000 : durationInSeconds,
    bytes_sent_delta: node.bytes_sent_delta || node.network_bytes_sent || node.NetworkBytesSent,
    bytes_received_delta: node.bytes_received_delta || node.network_bytes_received || node.NetworkBytesReceived,
    function_type: node.function_type !== undefined ? node.function_type : (node.FunctionType !== undefined ? node.FunctionType : -1),
    children: node.children || []
  }
}

// Format duration (expects milliseconds)
function formatDuration(ms) {
  if (ms < 1) return `${Math.round(ms * 1000)}µs`
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// Format memory (bytes)
function formatMemory(bytes) {
  if (bytes === 0) return '0B'
  if (Math.abs(bytes) < 1024) return `${bytes}B`
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  if (Math.abs(bytes) < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

// Format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0B'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

// Get function type color
function getFunctionTypeColor(functionType) {
  switch (functionType) {
    case 0: return '#4caf50' // Green for user functions
    case 1: return '#ff9800' // Orange for internal functions
    case 2: return '#2196f3' // Blue for methods
    default: return '#757575' // Gray for unknown
  }
}

// Get function type label
function getFunctionTypeLabel(functionType) {
  switch (functionType) {
    case 0: return 'User Function'
    case 1: return 'Internal Function'
    case 2: return 'Method'
    default: return 'Unknown'
  }
}

// Get metric value from node (inclusive - includes children)
function getMetricValue(node, metric) {
  switch (metric) {
    case 'wall_time':
      return node.wall_time ?? node.duration ?? 0
    case 'io_wait':
      return node.io_wait_time ?? 0
    case 'cpu':
      return node.cpu_time ?? (node.duration ?? 0)
    case 'memory':
      return Math.abs(node.memory_delta ?? 0)
    case 'network':
      return (node.bytes_sent_delta ?? 0) + (node.bytes_received_delta ?? 0)
    default:
      return node.duration ?? 0
  }
}

// Get self/exclusive metric value (excludes children) - relative to parent
function getSelfMetricValue(node, metric) {
  // For memory, handle signed values differently
  if (metric === 'memory') {
    // Get inclusive memory delta (signed)
    const inclusiveMemory = node.memory_delta ?? 0
    
    // Subtract children's memory deltas (signed)
    let childrenMemory = 0
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        childrenMemory += (child.memory_delta ?? 0)
      })
    }
    
    // Self memory = inclusive - children (can be negative)
    const selfMemory = inclusiveMemory - childrenMemory
    return Math.abs(selfMemory) // Return absolute value for display
  }
  
  // For other metrics, use standard calculation
  const inclusiveValue = getMetricValue(node, metric)
  
  // Subtract children's values to get self/exclusive value
  let childrenValue = 0
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      childrenValue += getMetricValue(child, metric)
    })
  }
  
  // Self value = inclusive - children (but never negative)
  return Math.max(0, inclusiveValue - childrenValue)
}

// Calculate total metric using self/exclusive values (not inclusive)
function calculateTotalMetric(callTree, metric) {
  const calculate = (nodes) => {
    let total = 0
    nodes.forEach(node => {
      // Use self/exclusive metric, not inclusive
      total += getSelfMetricValue(node, metric)
      if (node.children && node.children.length > 0) {
        total += calculate(node.children)
      }
    })
    return total
  }
  return calculate(callTree)
}

// Get metric label
function getMetricLabel(metric) {
  switch (metric) {
    case 'wall_time': return 'Wall Time'
    case 'io_wait': return 'I/O Wait'
    case 'cpu': return 'CPU'
    case 'memory': return 'Memory'
    case 'network': return 'Network'
    default: return 'Duration'
  }
}

// Format metric value
function formatMetricValue(value, metric) {
  switch (metric) {
    case 'wall_time':
    case 'io_wait':
    case 'cpu':
      return formatDuration(value * 1000) // Convert seconds to milliseconds
    case 'memory':
      return formatMemory(value)
    case 'network':
      return formatBytes(value)
    default:
      return formatDuration(value * 1000)
  }
}

// Get function signature
function getFunctionSignature(node) {
  return node.class ? `${node.class}::${node.function}` : node.function
}

// Count internal calls
function countInternalCalls(children) {
  const callCounts = new Map()
  if (!children || children.length === 0) return callCounts
  
  children.forEach(child => {
    const signature = getFunctionSignature(child)
    callCounts.set(signature, (callCounts.get(signature) || 0) + 1)
  })
  
  return callCounts
}

// Format internal calls
function formatInternalCalls(callCounts, limit = 15) {
  if (callCounts.size === 0) return ''
  
  const sorted = Array.from(callCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
  
  const lines = sorted.map(([signature, count]) => {
    const shortSig = signature.length > 30 ? signature.substring(0, 27) + '...' : signature
    return `${shortSig} (${count}x)`
  })
  
  return lines.join('\n')
}

// Extract filename from file path
function extractFileName(filePath) {
  if (!filePath) return null
  
  const normalizedPath = filePath.replace(/\\/g, '/')
  const parts = normalizedPath.split('/')
  const fileName = parts[parts.length - 1]
  
  return fileName || null
}

// ClassGroup interface (as object structure)
// {
//   className: string | null,
//   fileName: string | null,
//   methods: Map<string, { node, callCount, totalDuration }>,
//   totalDuration: number,
//   totalMemoryDelta: number,
//   totalCpuTime?: number,
//   totalIoWaitTime?: number,
//   totalWallTime?: number,
//   totalNetworkBytes?: number,
//   functionType?: number,
//   depth: number
// }

// Group nodes by class, file, or function name
function groupNodesByClass(nodes, nodeDataMap) {
  const grouped = new Map()
  
  // Collect all included nodes
  const includedNodes = []
  nodeDataMap.forEach((nodeData, id) => {
    if (nodeData.shouldInclude) {
      includedNodes.push({ node: nodeData.node, depth: nodeData.depth })
    }
  })
  
  // Group by: 1) class name, 2) file name, 3) function name
  includedNodes.forEach(({ node, depth }) => {
    let groupKey
    let className = null
    let fileName = null
    
    if (node.class) {
      groupKey = node.class
      className = node.class
    } else if (node.file) {
      const extractedFileName = extractFileName(node.file)
      if (extractedFileName) {
        groupKey = extractedFileName
        fileName = extractedFileName
      } else {
        groupKey = node.function
      }
    } else {
      groupKey = node.function
    }
    
    const methodKey = node.function
    
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        className,
        fileName,
        methods: new Map(),
        totalDuration: 0,
        totalMemoryDelta: 0,
        totalCpuTime: 0,
        totalIoWaitTime: 0,
        totalWallTime: 0,
        totalNetworkBytes: 0,
        functionType: node.function_type,
        depth: depth,
      })
    }
    
    const group = grouped.get(groupKey)
    
    // Aggregate method data
    if (!group.methods.has(methodKey)) {
      group.methods.set(methodKey, {
        node,
        callCount: 0,
        totalDuration: 0,
      })
    }
    
    const method = group.methods.get(methodKey)
    method.callCount++
    
    // Calculate self/exclusive metrics (excluding children) - relative to parent
    const selfDuration = getSelfMetricValue(node, 'wall_time')
    const selfMemoryDelta = getSelfMetricValue(node, 'memory')
    const selfCpuTime = getSelfMetricValue(node, 'cpu')
    const selfIoWaitTime = getSelfMetricValue(node, 'io_wait')
    const selfWallTime = getSelfMetricValue(node, 'wall_time')
    const selfNetworkBytes = getSelfMetricValue(node, 'network')
    
    method.totalDuration += selfDuration
    
    // Aggregate group-level metrics using self/exclusive values (relative, not absolute)
    group.totalDuration += selfDuration
    group.totalMemoryDelta += selfMemoryDelta
    if (selfCpuTime > 0) {
      group.totalCpuTime = (group.totalCpuTime || 0) + selfCpuTime
    }
    if (selfIoWaitTime > 0) {
      group.totalIoWaitTime = (group.totalIoWaitTime || 0) + selfIoWaitTime
    }
    if (selfWallTime > 0) {
      group.totalWallTime = (group.totalWallTime || 0) + selfWallTime
    }
    group.totalNetworkBytes = (group.totalNetworkBytes || 0) + selfNetworkBytes
  })
  
  return grouped
}

// Find dominant method
function findDominantMethod(group) {
  if (group.methods.size === 0) return null
  
  let dominant = null
  let maxScore = 0
  
  group.methods.forEach((methodData, methodName) => {
    const durationScore = methodData.totalDuration * 0.7
    const callCountScore = methodData.callCount * (group.totalDuration / group.methods.size) * 0.3
    const score = durationScore + callCountScore
    
    if (score > maxScore) {
      maxScore = score
      dominant = {
        methodName,
        callCount: methodData.callCount,
        duration: methodData.totalDuration,
      }
    }
  })
  
  return dominant
}

// Format methods list
function formatMethodsList(group, dominantMethod, limit = 15) {
  if (group.methods.size === 0) return ''
  
  const methodsArray = Array.from(group.methods.entries())
    .map(([methodName, methodData]) => ({
      methodName,
      callCount: methodData.callCount,
      duration: methodData.totalDuration,
    }))
    .sort((a, b) => {
      if (dominantMethod && a.methodName === dominantMethod.methodName) return -1
      if (dominantMethod && b.methodName === dominantMethod.methodName) return 1
      return b.duration - a.duration
    })
    .slice(0, limit)
  
  const lines = methodsArray.map(({ methodName, callCount }) => {
    const isDominant = dominantMethod && methodName === dominantMethod.methodName
    const prefix = isDominant ? '▶ ' : '  '
    const methodDisplay = group.className 
      ? `${group.className}::${methodName}` 
      : methodName
    const shortName = methodDisplay.length > 28 ? methodDisplay.substring(0, 25) + '...' : methodDisplay
    return `${prefix}${shortName} (${callCount}x)`
  })
  
  return lines.join('\n')
}

// Get call stack path
function getCallStackPath(callTree, selectedNodeId, nodeDataMap) {
  if (!callTree || callTree.length === 0 || !selectedNodeId) {
    return []
  }

  const path = []
  let currentNodeId = selectedNodeId
  const visited = new Set()

  while (currentNodeId && !visited.has(currentNodeId)) {
    visited.add(currentNodeId)
    const nodeData = nodeDataMap.get(currentNodeId)
    if (nodeData) {
      path.unshift(nodeData.node)
      currentNodeId = nodeData.parentId
    } else {
      break
    }
  }

  return path
}

function CallGraph({ callStack, width = 1200, height = 800 }) {
  const containerRef = useRef(null)
  const networkRef = useRef(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedMetric, setSelectedMetric] = useState('wall_time')
  const [viewMode, setViewMode] = useState('hierarchical')
  const [durationFilters, setDurationFilters] = useState({ enabled: false, thresholds: {} })
  
  // Per-metric filter state
  const [metricFilters, setMetricFilters] = useState(() => {
    const defaultFilters = {
      minPercentage: 0.5,
      showInternalFunctions: true,
      showMethods: true,
      showUserFunctions: true,
    }
    const map = new Map()
    METRIC_TYPES.forEach(metric => {
      map.set(metric, { ...defaultFilters })
    })
    return map
  })
  
  // Get current metric's filters
  const currentFilters = metricFilters.get(selectedMetric) || {
    minPercentage: 0.5,
    showInternalFunctions: true,
    showMethods: true,
    showUserFunctions: true,
  }

  // Helper to update current metric's filters
  const updateCurrentFilters = (updates) => {
    const newFilters = new Map(metricFilters)
    const current = newFilters.get(selectedMetric) || currentFilters
    newFilters.set(selectedMetric, { ...current, ...updates })
    setMetricFilters(newFilters)
  }
  
  const setMinPercentage = (value) => updateCurrentFilters({ minPercentage: value })
  const setShowInternalFunctions = (value) => updateCurrentFilters({ showInternalFunctions: value })
  const setShowMethods = (value) => updateCurrentFilters({ showMethods: value })
  const setShowUserFunctions = (value) => updateCurrentFilters({ showUserFunctions: value })
  
  const minPercentage = currentFilters.minPercentage
  const showInternalFunctions = currentFilters.showInternalFunctions
  const showMethods = currentFilters.showMethods
  const showUserFunctions = currentFilters.showUserFunctions

  // Normalize call tree (handle data format differences)
  const normalizedCallTree = useMemo(() => {
    if (!callStack || callStack.length === 0) return []
    
    const normalizeRecursive = (node) => {
      const normalized = normalizeNode(node)
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        normalized.children = node.children.map(child => normalizeRecursive(child))
      } else {
        normalized.children = []
      }
      return normalized
    }
    
    let tree = callStack.map(node => normalizeRecursive(node))
    
    // Apply duration filter if enabled
    if (durationFilters.enabled && durationFilters.thresholds.duration !== undefined) {
      // Convert threshold from milliseconds to seconds (node duration is in seconds)
      const thresholdInSeconds = durationFilters.thresholds.duration / 1000
      const filterNode = (node) => {
        const duration = node.duration || 0
        if (duration < thresholdInSeconds) {
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
        return { ...node, children: filteredChildren }
      }
      tree = tree.map(filterNode).filter(node => node !== null)
    }
    
    return tree
  }, [callStack, durationFilters])

  // Calculate total metric value
  const totalMetricValue = useMemo(() => {
    return calculateTotalMetric(normalizedCallTree, selectedMetric)
  }, [normalizedCallTree, selectedMetric])

  // Build node data map for call stack path finding
  const nodeDataMap = useMemo(() => {
    const map = new Map()
    
    if (!normalizedCallTree || normalizedCallTree.length === 0) {
      return map
    }

    let normalizedTree
    if (normalizedCallTree.length === 1) {
      normalizedTree = normalizedCallTree
    } else {
      const syntheticRoot = {
        id: 'synthetic_root',
        function: 'Root',
        duration: normalizedCallTree.reduce((sum, node) => sum + (node.duration || 0), 0),
        memory_delta: normalizedCallTree.reduce((sum, node) => sum + (node.memory_delta || 0), 0),
        children: normalizedCallTree,
      }
      normalizedTree = [syntheticRoot]
    }

    let nodeIdCounter = 0
    const collectAllNodes = (node, parentId = null, depth = 0) => {
      const id = node.id || `node_${nodeIdCounter++}`
      
      if (!map.has(id)) {
        map.set(id, { node, parentId, depth })
      }
      
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          collectAllNodes(child, id, depth + 1)
        })
      }
    }

    normalizedTree.forEach(root => {
      collectAllNodes(root, null, 0)
    })

    return map
  }, [normalizedCallTree])

  // Calculate call stack path for selected node
  const callStackPathWithDepth = useMemo(() => {
    if (!normalizedCallTree || normalizedCallTree.length === 0 || nodeDataMap.size === 0) {
      return []
    }
    
    if (selectedNode) {
      let selectedNodeId = null
      const signature = selectedNode.class ? `${selectedNode.class}::${selectedNode.function}` : selectedNode.function
      
      nodeDataMap.forEach((data, id) => {
        const nodeSignature = data.node.class ? `${data.node.class}::${data.node.function}` : data.node.function
        if (nodeSignature === signature && 
            (!selectedNode.file || data.node.file === selectedNode.file) &&
            (!selectedNode.line || data.node.line === selectedNode.line)) {
          selectedNodeId = id
        }
      })

      if (selectedNodeId) {
        const path = getCallStackPath(normalizedCallTree, selectedNodeId, nodeDataMap)
        return path.map((node, index) => ({ node, depth: index }))
      }
      return []
    }
    
    // Show full call tree
    const flattenTree = (nodes, depth = 0) => {
      const result = []
      const traverse = (node, currentDepth) => {
        result.push({ node, depth: currentDepth })
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => traverse(child, currentDepth + 1))
        }
      }
      nodes.forEach(node => traverse(node, depth))
      return result
    }
    
    let normalizedTree
    if (normalizedCallTree.length === 1) {
      normalizedTree = normalizedCallTree
    } else {
      const syntheticRoot = {
        id: 'synthetic_root',
        function: 'Root',
        duration: normalizedCallTree.reduce((sum, node) => sum + (node.duration || 0), 0),
        memory_delta: normalizedCallTree.reduce((sum, node) => sum + (node.memory_delta || 0), 0),
        children: normalizedCallTree,
      }
      normalizedTree = [syntheticRoot]
    }
    
    return flattenTree(normalizedTree, 0)
  }, [normalizedCallTree, selectedNode, nodeDataMap])

  // Build graph data with three-pass approach
  const graphData = useMemo(() => {
    if (!normalizedCallTree || normalizedCallTree.length === 0) {
      return { nodes: [], edges: [], nodeDataMap: new Map() }
    }

    // Normalize call tree
    let normalizedTree
    if (normalizedCallTree.length === 1) {
      normalizedTree = normalizedCallTree
    } else {
      const totalDuration = normalizedCallTree.reduce((sum, node) => sum + (node.duration || 0), 0)
      const totalMemoryDelta = normalizedCallTree.reduce((sum, node) => sum + (node.memory_delta || 0), 0)
      const totalCpuTime = normalizedCallTree.reduce((sum, node) => sum + (node.cpu_time || 0), 0)
      const totalIoWaitTime = normalizedCallTree.reduce((sum, node) => sum + (node.io_wait_time || 0), 0)
      const totalWallTime = normalizedCallTree.reduce((sum, node) => sum + (node.wall_time || node.duration || 0), 0)
      const totalNetworkBytes = normalizedCallTree.reduce((sum, node) => 
        sum + (node.bytes_sent_delta || 0) + (node.bytes_received_delta || 0), 0)
      
      const syntheticRoot = {
        id: 'synthetic_root',
        function: 'Root',
        duration: totalDuration,
        memory_delta: totalMemoryDelta,
        cpu_time: totalCpuTime > 0 ? totalCpuTime : undefined,
        io_wait_time: totalIoWaitTime > 0 ? totalIoWaitTime : undefined,
        wall_time: totalWallTime > 0 ? totalWallTime : undefined,
        bytes_sent_delta: undefined,
        bytes_received_delta: undefined,
        children: normalizedCallTree,
      }
      normalizedTree = [syntheticRoot]
    }

    // PASS 1: Collect all node data
    const nodeDataMap = new Map()
    let nodeIdCounter = 0

    const collectAllNodes = (node, parentId = null, depth = 0) => {
      // Skip nodes with zero metric value (except for wall_time/cpu which may use duration fallback)
      const metricValue = getSelfMetricValue(node, selectedMetric)
      
      if (depth > 0 && metricValue === 0 && selectedMetric !== 'wall_time' && selectedMetric !== 'cpu') {
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            collectAllNodes(child, parentId, depth + 1)
          })
        }
        return
      }
      
      const id = node.id || `node_${nodeIdCounter++}`
      
      const functionType = node.function_type ?? -1
      const isInternal = functionType === 1
      const isMethod = functionType === 2
      const isUser = functionType === 0 || functionType === -1
      
      // Only filter by function type at individual node level, not by percentage
      // Percentage filtering will be applied to groups after grouping
      const shouldInclude = (depth === 0 || true) && // Always include for now, filter groups later
        ((isInternal && showInternalFunctions) ||
         (isMethod && showMethods) ||
         (isUser && showUserFunctions))
      
      if (!nodeDataMap.has(id)) {
        nodeDataMap.set(id, { node, parentId, depth, shouldInclude })
      }
      
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          collectAllNodes(child, id, depth + 1)
        })
      }
    }

    normalizedTree.forEach(root => {
      collectAllNodes(root, null, 0)
    })

    // PASS 2: Group nodes by class
    const classGroups = groupNodesByClass(normalizedCallTree, nodeDataMap)
    
    // Calculate total metric value from all groups (before filtering)
    let totalGroupMetricValue = 0
    classGroups.forEach((group, classKey) => {
      let groupMetricValue
      switch (selectedMetric) {
        case 'wall_time':
          groupMetricValue = group.totalWallTime ?? group.totalDuration
          break
        case 'io_wait':
          groupMetricValue = group.totalIoWaitTime ?? 0
          break
        case 'cpu':
          groupMetricValue = group.totalCpuTime ?? group.totalDuration
          break
        case 'memory':
          groupMetricValue = Math.abs(group.totalMemoryDelta)
          break
        case 'network':
          groupMetricValue = group.totalNetworkBytes ?? 0
          break
        default:
          groupMetricValue = group.totalDuration
      }
      totalGroupMetricValue += groupMetricValue
    })
    
    // Filter groups by percentage threshold (applied to groups, not individual nodes)
    const filteredClassGroups = new Map()
    classGroups.forEach((group, classKey) => {
      let groupMetricValue
      switch (selectedMetric) {
        case 'wall_time':
          groupMetricValue = group.totalWallTime ?? group.totalDuration
          break
        case 'io_wait':
          groupMetricValue = group.totalIoWaitTime ?? 0
          break
        case 'cpu':
          groupMetricValue = group.totalCpuTime ?? group.totalDuration
          break
        case 'memory':
          groupMetricValue = Math.abs(group.totalMemoryDelta)
          break
        case 'network':
          groupMetricValue = group.totalNetworkBytes ?? 0
          break
        default:
          groupMetricValue = group.totalDuration
      }
      
      const groupPercentage = totalGroupMetricValue > 0 ? (groupMetricValue / totalGroupMetricValue) * 100 : 0
      // Check if this is a root group - could be 'Root', 'synthetic_root', or match root node function names
      const isSyntheticRoot = classKey === 'Root' || 
                              classKey === 'synthetic_root' ||
                              (normalizedCallTree.length > 1 && normalizedCallTree.some(root => {
                                const rootGroupKey = root.class || (root.file ? extractFileName(root.file) : root.function)
                                return rootGroupKey === classKey
                              }))
      
      // Include root nodes always, and other groups if they meet the percentage threshold
      // Also include groups that are direct children of included groups (to maintain graph connectivity)
      if (isSyntheticRoot || groupPercentage >= minPercentage) {
        filteredClassGroups.set(classKey, group)
      }
    })
    
    // If we have very few groups (especially if only root), include top groups regardless of threshold
    // This helps when the root dominates the total metric value or when threshold is too high
    const rootKeys = Array.from(filteredClassGroups.keys()).filter(key => 
      key === 'Root' || key === 'synthetic_root' || 
      (normalizedCallTree.length > 1 && normalizedCallTree.some(root => {
        const rootGroupKey = root.class || (root.file ? extractFileName(root.file) : root.function)
        return rootGroupKey === key
      }))
    )
    const hasOnlyRoot = filteredClassGroups.size === rootKeys.length && rootKeys.length > 0
    const hasTooFewGroups = filteredClassGroups.size <= 2 // If we have 2 or fewer groups, show more
    
    if (hasOnlyRoot || hasTooFewGroups) {
      // Find the top groups by metric value and include them even if below threshold
      const sortedGroups = Array.from(classGroups.entries())
        .map(([key, group]) => {
          let groupMetricValue
          switch (selectedMetric) {
            case 'wall_time':
              groupMetricValue = group.totalWallTime ?? group.totalDuration
              break
            case 'io_wait':
              groupMetricValue = group.totalIoWaitTime ?? 0
              break
            case 'cpu':
              groupMetricValue = group.totalCpuTime ?? group.totalDuration
              break
            case 'memory':
              groupMetricValue = Math.abs(group.totalMemoryDelta)
              break
            case 'network':
              groupMetricValue = group.totalNetworkBytes ?? 0
              break
            default:
              groupMetricValue = group.totalDuration
          }
          const groupPercentage = totalGroupMetricValue > 0 ? (groupMetricValue / totalGroupMetricValue) * 100 : 0
          return { key, group, metricValue: groupMetricValue, percentage: groupPercentage }
        })
        .filter(({ key, percentage }) => {
          // Exclude root groups and groups with zero metric
          const isRoot = key === 'Root' || key === 'synthetic_root' ||
            (normalizedCallTree.length > 1 && normalizedCallTree.some(root => {
              const rootGroupKey = root.class || (root.file ? extractFileName(root.file) : root.function)
              return rootGroupKey === key
            }))
          return !isRoot && percentage > 0
        })
        .sort((a, b) => b.metricValue - a.metricValue)
      
      // Include top groups - always show at least top 5-10 groups when only root is visible
      // This ensures the graph is useful even when root dominates
      const minGroupsToShow = Math.min(10, sortedGroups.length)
      const groupsToInclude = sortedGroups.slice(0, minGroupsToShow)
      
      // Always include these groups regardless of percentage threshold
      groupsToInclude.forEach(({ key, group }) => {
        if (!filteredClassGroups.has(key)) {
          filteredClassGroups.set(key, group)
        }
      })
    }
    
    // Calculate total metric value from filtered groups only (for accurate percentages)
    let includedTotalMetricValue = 0
    filteredClassGroups.forEach((group, classKey) => {
      let groupMetricValue
      switch (selectedMetric) {
        case 'wall_time':
          groupMetricValue = group.totalWallTime ?? group.totalDuration
          break
        case 'io_wait':
          groupMetricValue = group.totalIoWaitTime ?? 0
          break
        case 'cpu':
          groupMetricValue = group.totalCpuTime ?? group.totalDuration
          break
        case 'memory':
          groupMetricValue = Math.abs(group.totalMemoryDelta)
          break
        case 'network':
          groupMetricValue = group.totalNetworkBytes ?? 0
          break
        default:
          groupMetricValue = group.totalDuration
      }
      // Sum up all filtered group values to get the total of included nodes
      includedTotalMetricValue += groupMetricValue
    })
    
    // PASS 3: Build graph nodes and edges
    const nodes = []
    const edges = []
    const nodeMap = new Map()
    const classGroupMap = new Map()

    // Build nodes for filtered class groups
    filteredClassGroups.forEach((group, classKey) => {
      let groupMetricValue
      switch (selectedMetric) {
        case 'wall_time':
          groupMetricValue = group.totalWallTime ?? group.totalDuration
          break
        case 'io_wait':
          groupMetricValue = group.totalIoWaitTime ?? 0
          break
        case 'cpu':
          groupMetricValue = group.totalCpuTime ?? group.totalDuration
          break
        case 'memory':
          groupMetricValue = Math.abs(group.totalMemoryDelta)
          break
        case 'network':
          groupMetricValue = group.totalNetworkBytes ?? 0
          break
        default:
          groupMetricValue = group.totalDuration
      }
      
      // Use includedTotalMetricValue instead of totalMetricValue for accurate percentages
      const percentage = includedTotalMetricValue > 0 ? (groupMetricValue / includedTotalMetricValue) * 100 : 0
      const isSyntheticRoot = classKey === 'Root'
      
      if (!isSyntheticRoot && groupMetricValue === 0 && selectedMetric !== 'wall_time' && selectedMetric !== 'cpu') {
        return
      }
      
      if (!isSyntheticRoot && totalMetricValue === 0) {
        return
      }
      
      const dominantMethod = findDominantMethod(group)
      
      let displayName
      if (group.className) {
        displayName = group.className
      } else if (group.fileName) {
        displayName = group.fileName
      } else {
        displayName = classKey
      }
      
      const shortDisplayName = displayName.length > 35 ? displayName.substring(0, 32) + '...' : displayName
      const metricValueStr = formatMetricValue(groupMetricValue, selectedMetric)
      const percentageStr = percentage.toFixed(1) + '%'
      const rootCount = normalizedCallTree.length
      
      const methodsList = formatMethodsList(group, dominantMethod, 15)
      
      let label = isSyntheticRoot
        ? `${displayName}\n${rootCount} root${rootCount > 1 ? 's' : ''}`
        : `${shortDisplayName}\n${metricValueStr} (${percentageStr})`
      
      if (methodsList) {
        label += '\n' + methodsList
      }
      
      const allChildren = []
      group.methods.forEach((methodData) => {
        if (methodData.node.children) {
          allChildren.push(...methodData.node.children)
        }
      })
      const internalCalls = countInternalCalls(allChildren)
      const internalCallsStr = formatInternalCalls(internalCalls, 15)
      
      if (internalCallsStr) {
        label += '\n' + internalCallsStr
      }

      const tooltipParts = [
        displayName,
        isSyntheticRoot ? `Synthetic root node grouping ${rootCount} root node(s)` : '',
        group.className ? `Class: ${group.className}` : '',
        group.fileName ? `File: ${group.fileName}` : '',
        `Functions/Methods: ${group.methods.size}`,
        `Total Calls: ${Array.from(group.methods.values()).reduce((sum, m) => sum + m.callCount, 0)}`,
        `Type: ${getFunctionTypeLabel(group.functionType)}`,
        `${getMetricLabel(selectedMetric)}: ${metricValueStr} (${percentage.toFixed(2)}%)`,
        `Total Duration: ${formatDuration(group.totalDuration * 1000)}`,
        `Total Memory: ${formatMemory(group.totalMemoryDelta)}`,
      ].filter(Boolean)
      
      if (group.totalCpuTime !== undefined) {
        tooltipParts.push(`Total CPU: ${formatDuration(group.totalCpuTime * 1000)}`)
      }
      if (group.totalIoWaitTime !== undefined) {
        tooltipParts.push(`Total IO Wait: ${formatDuration(group.totalIoWaitTime * 1000)}`)
      }
      if (group.totalWallTime !== undefined) {
        tooltipParts.push(`Total Wall Time: ${formatDuration(group.totalWallTime * 1000)}`)
      }
      if (group.totalNetworkBytes !== undefined && group.totalNetworkBytes > 0) {
        tooltipParts.push(`Total Network: ${formatBytes(group.totalNetworkBytes)}`)
      }

      if (dominantMethod) {
        tooltipParts.push(`Dominant Method: ${dominantMethod.methodName} (${dominantMethod.callCount}x, ${formatDuration(dominantMethod.duration * 1000)})`)
      }

      const color = isSyntheticRoot ? '#808080' : getFunctionTypeColor(group.functionType)
      const nodeSize = isSyntheticRoot ? 60 : Math.max(35, Math.min(100, 40 + (percentage * 1.0)))

      const graphNode = {
        id: classKey,
        label,
        title: tooltipParts.join('\n'),
        color: {
          background: color,
          border: '#505050',
          highlight: {
            background: color,
            border: '#4a9eff',
          },
        },
        font: {
          size: 11,
          face: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          color: '#ffffff',
        },
        shape: 'box',
        size: nodeSize,
        borderWidth: 1,
        data: {
          function: group.className || group.fileName || classKey,
          class: group.className || undefined,
          file: group.fileName || undefined,
          duration: group.totalDuration,
          memory_delta: group.totalMemoryDelta,
          cpu_time: group.totalCpuTime,
          io_wait_time: group.totalIoWaitTime,
          wall_time: group.totalWallTime,
          bytes_sent_delta: undefined,
          bytes_received_delta: undefined,
          depth: group.depth,
          percentage,
          function_type: group.functionType,
        },
      }

      nodes.push(graphNode)
      nodeMap.set(classKey, graphNode)
      classGroupMap.set(classKey, group)
    })

    // Sort nodes by percentage (descending) - biggest percentage first
    nodes.sort((a, b) => {
      // Keep root nodes at the top
      if (a.id === 'Root' || a.id === 'synthetic_root') return -1
      if (b.id === 'Root' || b.id === 'synthetic_root') return 1
      // Sort by percentage descending
      return b.data.percentage - a.data.percentage
    })

    // Build edges
    const classCallMap = new Map()
    
    const isRootKey = (key) => {
      return key === 'Root' || key === 'synthetic_root'
    }
    
    const buildClassCallMap = (node, lastValidParentKey = null) => {
      let currentClassKey
      if (node.class) {
        currentClassKey = node.class
      } else if (node.file) {
        const extractedFileName = extractFileName(node.file)
        currentClassKey = extractedFileName || node.function
      } else {
        currentClassKey = node.function
      }
      
      const isCurrentInGroup = filteredClassGroups.has(currentClassKey)
      
      if (isCurrentInGroup && lastValidParentKey && filteredClassGroups.has(lastValidParentKey)) {
        const parentGroup = filteredClassGroups.get(lastValidParentKey)
        const currentGroup = filteredClassGroups.get(currentClassKey)
        
        if (parentGroup && currentGroup) {
          const isValidEdge = 
            isRootKey(lastValidParentKey) ||
            (parentGroup.className && currentGroup.className) ||
            (parentGroup.className && currentGroup.fileName) ||
            (parentGroup.fileName && currentGroup.className) ||
            (parentGroup.fileName && currentGroup.fileName)
          
          if (isValidEdge) {
            if (!classCallMap.has(lastValidParentKey)) {
              classCallMap.set(lastValidParentKey, new Map())
            }
            const childMap = classCallMap.get(lastValidParentKey)
            childMap.set(currentClassKey, (childMap.get(currentClassKey) || 0) + 1)
          }
        }
      }
      
      let newLastValidParentKey = lastValidParentKey
      // Only update parent key if current group is in filtered groups
      if (isCurrentInGroup) {
        newLastValidParentKey = currentClassKey
      } else if (lastValidParentKey && !filteredClassGroups.has(lastValidParentKey)) {
        // If parent is not in filtered groups, don't pass it down
        newLastValidParentKey = null
      }
      
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          buildClassCallMap(child, newLastValidParentKey)
        })
      }
    }
    
    normalizedTree.forEach(root => {
      buildClassCallMap(root, root.id === 'synthetic_root' ? 'Root' : null)
    })
    
    classCallMap.forEach((childMap, parentClassKey) => {
      const parentGroup = classGroupMap.get(parentClassKey)
      const isParentRoot = isRootKey(parentClassKey)
      
      if (!parentGroup || (!isParentRoot && ((!parentGroup.className && !parentGroup.fileName) || !nodeMap.has(parentClassKey)))) return
      
      childMap.forEach((callCount, childClassKey) => {
        const childGroup = classGroupMap.get(childClassKey)
        const isChildRoot = isRootKey(childClassKey)
        
        if (!childGroup || 
            (!isChildRoot && ((!childGroup.className && !childGroup.fileName) || !nodeMap.has(childClassKey))) ||
            (parentClassKey === childClassKey && !isParentRoot)) return
        
        const edgeExists = edges.some(e => e.from === parentClassKey && e.to === childClassKey)
        if (edgeExists) return
        
        // Use self/exclusive metric value for percentage calculation (already calculated in group)
        let childGroupMetricValue
        switch (selectedMetric) {
          case 'wall_time':
            childGroupMetricValue = childGroup.totalWallTime ?? childGroup.totalDuration
            break
          case 'io_wait':
            childGroupMetricValue = childGroup.totalIoWaitTime ?? 0
            break
          case 'cpu':
            childGroupMetricValue = childGroup.totalCpuTime ?? childGroup.totalDuration
            break
          case 'memory':
            childGroupMetricValue = Math.abs(childGroup.totalMemoryDelta)
            break
          case 'network':
            childGroupMetricValue = childGroup.totalNetworkBytes ?? 0
            break
          default:
            childGroupMetricValue = childGroup.totalDuration
        }
        // Percentage is relative to included nodes total (for accurate percentages)
        const childPercentage = includedTotalMetricValue > 0 
          ? (childGroupMetricValue / includedTotalMetricValue) * 100 
          : 0
        const edgeWidth = Math.max(1, Math.min(3, 1 + (childPercentage / 10)))
        
        const callCountLabel = callCount > 1 ? `${callCount}x` : ''
          
        edges.push({
          from: parentClassKey,
          to: childClassKey,
          arrows: 'to',
          color: '#b0b0b0',
          width: edgeWidth,
          label: callCountLabel,
          smooth: { type: 'straight', roundness: 0 },
        })
      })
    })

    // Calculate levels for hierarchical layout
    const nodeLevels = new Map()
    
    const nodesWithIncomingEdges = new Set(edges.map(e => e.to))
    const rootNodes = nodes.filter(n => 
      n.id === 'Root' || n.id === 'synthetic_root' || !nodesWithIncomingEdges.has(n.id)
    )
    
    if (rootNodes.length === 0 && nodes.length > 0) {
      const minDepthNode = nodes.reduce((min, node) => 
        (node.data.depth ?? 0) < (min.data.depth ?? 0) ? node : min
      )
      rootNodes.push(minDepthNode)
    }
    
    rootNodes.forEach(root => {
      nodeLevels.set(root.id, 0)
    })
    
    const visited = new Set()
    const queue = []
    
    rootNodes.forEach(root => {
      queue.push({ nodeId: root.id, level: 0 })
      visited.add(root.id)
    })
    
    while (queue.length > 0) {
      const { nodeId, level } = queue.shift()
      const currentLevel = nodeLevels.get(nodeId) ?? level
      
      const childEdges = edges.filter(e => e.from === nodeId)
      
      childEdges.forEach(edge => {
        const childNodeId = edge.to
        const childLevel = currentLevel + 1
        const existingLevel = nodeLevels.get(childNodeId)
        
        if (existingLevel === undefined || childLevel < existingLevel) {
          nodeLevels.set(childNodeId, childLevel)
          
          if (!visited.has(childNodeId)) {
            visited.add(childNodeId)
            queue.push({ nodeId: childNodeId, level: childLevel })
          }
        }
      })
    }
    
    nodes.forEach(node => {
      if (!nodeLevels.has(node.id)) {
        const incomingEdges = edges.filter(e => e.to === node.id)
        if (incomingEdges.length > 0) {
          const parentLevels = incomingEdges.map(e => nodeLevels.get(e.from) ?? 999)
          const minParentLevel = Math.min(...parentLevels)
          nodeLevels.set(node.id, minParentLevel + 1)
        } else {
          nodeLevels.set(node.id, 999)
        }
      }
    })
    
    nodes.forEach(node => {
      const level = nodeLevels.get(node.id)
      if (level !== undefined) {
        node.level = level
      } else {
        const incomingEdges = edges.filter(e => e.to === node.id)
        if (incomingEdges.length > 0) {
          const parentLevels = incomingEdges.map(e => {
            const parentNode = nodes.find(n => n.id === e.from)
            return parentNode?.level ?? 0
          })
          const maxParentLevel = parentLevels.length > 0 ? Math.max(...parentLevels) : -1
          node.level = maxParentLevel + 1
        } else {
          node.level = 0
        }
      }
    })

    return { nodes, edges, nodeDataMap }
  }, [normalizedCallTree, totalMetricValue, minPercentage, showInternalFunctions, showMethods, showUserFunctions, selectedMetric])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!networkRef.current) return
      
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            handleZoomIn()
          }
          break
        case '-':
        case '_':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            handleZoomOut()
          }
          break
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            handleFit()
          }
          break
        case 'Escape':
          setSelectedNode(null)
          if (networkRef.current) {
            networkRef.current.setSelection({ nodes: [] })
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Initialize network
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
      layout: viewMode === 'hierarchical' ? {
        hierarchical: {
          direction: 'UD',
          sortMethod: 'hubsize', // Sort by node size (percentage) - biggest first
          levelSeparation: 500,
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
      } : viewMode === 'force' ? {
        enabled: true,
        stabilization: {
          iterations: 200,
          fit: true,
        },
        barnesHut: {
          gravitationalConstant: -3000,
          centralGravity: 0.3,
          springLength: 200,
          springConstant: 0.04,
          damping: 0.09,
        },
      } : {
        enabled: false,
      },
      nodes: {
        borderWidth: 2,
        shadow: {
          enabled: false,
        },
        font: {
          size: 12,
          color: '#ffffff',
          face: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        },
        shapeProperties: {
          borderRadius: 4,
        },
        margin: 8,
      },
      edges: {
        width: 2,
        color: {
          color: '#b0b0b0',
          highlight: '#4a9eff',
          hover: '#4a9eff',
        },
        smooth: {
          type: 'straight',
        },
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 1.0,
            type: 'arrow',
          },
        },
        selectionWidth: 3,
        font: {
          size: 11,
          color: '#d0d0d0',
          face: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          align: 'middle',
        },
        labelHighlightBold: false,
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        zoomView: true,
        dragView: true,
        selectConnectedEdges: false,
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
          network.setSelection({ nodes: [nodeId] })
          network.focus(nodeId, {
            scale: 1.2,
            animation: true,
          })
        }
      } else {
        setSelectedNode(null)
        network.setSelection({ nodes: [] })
      }
    })

    setTimeout(() => {
      network.fit({ animation: { duration: 300 } })
      network.setOptions(options)
    }, 100)
    
    if (viewMode === 'hierarchical') {
      setTimeout(() => {
        network.fit({ animation: { duration: 300 } })
      }, 500)
    }

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy()
        networkRef.current = null
      }
    }
  }, [graphData, viewMode, selectedNode])

  // Zoom controls
  const handleZoomIn = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale()
      networkRef.current.moveTo({ scale: scale * 1.2 })
    }
  }

  const handleZoomOut = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale()
      networkRef.current.moveTo({ scale: scale * 0.8 })
    }
  }

  const handleFit = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: true })
    }
  }

  const handleReset = () => {
    if (networkRef.current) {
      networkRef.current.moveTo({ position: { x: 0, y: 0 }, scale: 1 })
      setSelectedNode(null)
      networkRef.current.setSelection({ nodes: [] })
    }
  }

  if (!normalizedCallTree || normalizedCallTree.length === 0) {
    return (
      <div className="call-graph-empty">
        <div className="empty-icon">📊</div>
        <h3>No Call Graph Data</h3>
        <p>Call graph data is not available for this trace.</p>
      </div>
    )
  }

  return (
    <div className="call-graph-modern">
      <TraceTabFilters
        onFiltersChange={setDurationFilters}
        availableFilters={['duration']}
      />
      <div className="metric-tabs">
        {METRIC_TYPES.map((metric) => (
          <button
            key={metric}
            className={`metric-tab ${selectedMetric === metric ? 'active' : ''}`}
            onClick={() => setSelectedMetric(metric)}
          >
            {getMetricLabel(metric)}
          </button>
        ))}
      </div>
      
      <div className="call-graph-header-modern">
        <div className="header-left">
          <h3>Call Graph - {getMetricLabel(selectedMetric)}</h3>
          <span className="node-count">{graphData.nodes.length} nodes</span>
        </div>
        <div className="header-controls">
          <div className="control-group">
            <label>Min %</label>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={minPercentage}
              onChange={(e) => setMinPercentage(parseFloat(e.target.value))}
              className="slider"
            />
            <span className="slider-value">{minPercentage.toFixed(1)}%</span>
          </div>
          <div className="control-group">
            <label>Layout</label>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              className="layout-select"
            >
              <option value="hierarchical">Hierarchical</option>
              <option value="force">Force-Directed</option>
            </select>
          </div>
          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={showUserFunctions}
                onChange={(e) => setShowUserFunctions(e.target.checked)}
              />
              User Functions
            </label>
          </div>
          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={showInternalFunctions}
                onChange={(e) => setShowInternalFunctions(e.target.checked)}
              />
              Internal Functions
            </label>
          </div>
          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={showMethods}
                onChange={(e) => setShowMethods(e.target.checked)}
              />
              Methods
            </label>
          </div>
        </div>
        <div className="zoom-controls-modern">
          <button onClick={handleZoomIn} className="zoom-btn" title="Zoom In (Ctrl/Cmd +)">+</button>
          <button onClick={handleZoomOut} className="zoom-btn" title="Zoom Out (Ctrl/Cmd -)">−</button>
          <button onClick={handleFit} className="zoom-btn" title="Fit (Ctrl/Cmd 0)">⊞</button>
          <button onClick={handleReset} className="zoom-btn" title="Reset">⟲</button>
        </div>
      </div>

      <div className="call-graph-container-modern">
        <div className="call-stack-sidebar">
          <div className="call-stack-header">
            <h4>Call Stack</h4>
          </div>
          <div className="call-stack-content">
            {callStackPathWithDepth.length === 0 ? (
              <div className="call-stack-empty">
                {selectedNode ? (
                  <p>Call stack path not found</p>
                ) : (
                  <p>No call tree data available</p>
                )}
              </div>
            ) : (
              callStackPathWithDepth.map((item, index) => {
                const { node, depth } = item
                const signature = node.class ? `${node.class}::${node.function}` : node.function
                const isActive = selectedNode && 
                  selectedNode.function === node.function &&
                  selectedNode.class === node.class &&
                  (!selectedNode.file || selectedNode.file === node.file) &&
                  (!selectedNode.line || selectedNode.line === node.line)
                
                const handleClick = () => {
                  let nodeId = null
                  nodeDataMap.forEach((data, id) => {
                    const nodeSignature = data.node.class ? `${data.node.class}::${data.node.function}` : data.node.function
                    if (nodeSignature === signature &&
                        (!node.file || data.node.file === node.file) &&
                        (!node.line || data.node.line === node.line)) {
                      nodeId = id
                    }
                  })

                  if (nodeId) {
                    const matchingNode = graphData.nodes.find((n) => n.id === nodeId)
                    
                    if (matchingNode) {
                      setSelectedNode(matchingNode.data)
                      if (networkRef.current) {
                        networkRef.current.setSelection({ nodes: [nodeId] })
                        networkRef.current.focus(nodeId, {
                          scale: 1.2,
                          animation: true,
                        })
                      }
                    } else {
                      // Use self/exclusive metric value for percentage (relative, not absolute)
                      const nodeMetricValue = getSelfMetricValue(node, selectedMetric)
                      const percentage = totalMetricValue > 0 ? (nodeMetricValue / totalMetricValue) * 100 : 0
                      const nodeData = {
                        function: node.function,
                        class: node.class,
                        file: node.file,
                        line: node.line,
                        duration: node.duration || 0,
                        memory_delta: node.memory_delta || 0,
                        cpu_time: node.cpu_time,
                        io_wait_time: node.io_wait_time,
                        wall_time: node.wall_time,
                        bytes_sent_delta: node.bytes_sent_delta,
                        bytes_received_delta: node.bytes_received_delta,
                        depth: nodeDataMap.get(nodeId)?.depth || 0,
                        percentage,
                        function_type: node.function_type,
                      }
                      setSelectedNode(nodeData)
                    }
                  }
                }

                return (
                  <div
                    key={`${signature}-${index}-${node.file || ''}-${node.line || ''}`}
                    className={`call-stack-item ${isActive ? 'active' : ''}`}
                    onClick={handleClick}
                    title={signature}
                    style={{ paddingLeft: `${(depth * 20) + 12}px` }}
                  >
                    <div className="call-stack-item-signature">
                      <span className="call-stack-item-depth">{depth + 1}</span>
                      {node.class && <span className="class-name">{node.class}::</span>}
                      {node.function}
                    </div>
                    <div className="call-stack-item-meta">
                      <span>{formatDuration((node.duration || 0) * 1000)}</span>
                      {node.file && (
                        <span>{node.file}{node.line ? `:${node.line}` : ''}</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
        <div ref={containerRef} className="call-graph-canvas" />
        
        {selectedNode && (
          <div className="node-details-modern">
            <div className="details-header">
              <h4>Function Details</h4>
              <button onClick={() => setSelectedNode(null)} className="close-btn">×</button>
            </div>
            <div className="details-content">
              <div className="detail-item">
                <span className="detail-label">Function:</span>
                <span className="detail-value">
                  {selectedNode.class && <span className="class-name">{selectedNode.class}::</span>}
                  {selectedNode.function}
                </span>
              </div>
              {selectedNode.file && (
                <div className="detail-item">
                  <span className="detail-label">File:</span>
                  <span className="detail-value">{selectedNode.file}{selectedNode.line ? `:${selectedNode.line}` : ''}</span>
                </div>
              )}
              {selectedNode.function_type !== undefined && (
                <div className="detail-item">
                  <span className="detail-label">Type:</span>
                  <span className="detail-value">{getFunctionTypeLabel(selectedNode.function_type)}</span>
                </div>
              )}
              <div className="detail-item">
                <span className="detail-label">Duration:</span>
                <span className="detail-value">{formatDuration(selectedNode.duration * 1000)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Percentage:</span>
                <span className="detail-value">{selectedNode.percentage.toFixed(2)}%</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Memory Delta:</span>
                <span className={`detail-value ${selectedNode.memory_delta >= 0 ? 'memory-positive' : 'memory-negative'}`}>
                  {selectedNode.memory_delta >= 0 ? '+' : ''}{formatMemory(selectedNode.memory_delta)}
                </span>
              </div>
              {selectedNode.cpu_time !== undefined && (
                <div className="detail-item">
                  <span className="detail-label">CPU Time:</span>
                  <span className="detail-value">{formatDuration(selectedNode.cpu_time * 1000)}</span>
                </div>
              )}
              {selectedNode.io_wait_time !== undefined && (
                <div className="detail-item">
                  <span className="detail-label">IO Wait:</span>
                  <span className="detail-value">{formatDuration(selectedNode.io_wait_time * 1000)}</span>
                </div>
              )}
              {selectedNode.wall_time !== undefined && (
                <div className="detail-item">
                  <span className="detail-label">Wall Time:</span>
                  <span className="detail-value">{formatDuration(selectedNode.wall_time * 1000)}</span>
                </div>
              )}
              {(selectedNode.bytes_sent_delta !== undefined || selectedNode.bytes_received_delta !== undefined) && (
                <>
                  <div className="detail-item">
                    <span className="detail-label">Network Sent:</span>
                    <span className="detail-value">{formatBytes(selectedNode.bytes_sent_delta || 0)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Network Received:</span>
                    <span className="detail-value">{formatBytes(selectedNode.bytes_received_delta || 0)}</span>
                  </div>
                </>
              )}
              <div className="detail-item">
                <span className="detail-label">Depth:</span>
                <span className="detail-value">{selectedNode.depth}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CallGraph
