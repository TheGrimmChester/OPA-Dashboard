import React, { useState, useMemo } from 'react'
import {
  FiInfo,
  FiGitBranch,
  FiDatabase,
  FiGlobe,
  FiZap,
  FiHardDrive,
  FiCode,
  FiTag,
  FiActivity,
  FiServer,
  FiLayers,
  FiFileText
} from 'react-icons/fi'
import CallGraph from './CallGraph'
import FlameGraph from './FlameGraph'
import ExecutionStackTree from './ExecutionStackTree'
import LogCorrelation from './LogCorrelation'
import JsonTreeViewer from './JsonTreeViewer'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import MetricComparisonCard from './comparison/MetricComparisonCard'
import SqlComparisonTable from './comparison/SqlComparisonTable'
import HttpComparisonTable from './comparison/HttpComparisonTable'
import CacheComparisonTable from './comparison/CacheComparisonTable'
import RedisComparisonTable from './comparison/RedisComparisonTable'
import TagComparisonView from './comparison/TagComparisonView'
import {
  calculateOverallMetrics,
  extractSqlQueries,
  extractHttpRequests,
  extractCacheOperations,
  extractRedisOperations,
  extractStackTraces,
  extractTags,
  extractDumps,
  compareMetrics,
  compareSqlQueries,
  compareHttpRequests,
  compareCacheOperations,
  compareRedisOperations,
  compareTags,
} from '../utils/comparisonUtils'
import './ProfileComparison.css'

const API_URL = import.meta.env.VITE_API_URL || ''

// Helper to get node signature for matching
function getNodeSignature(node) {
  const className = node.class || node.Class || ''
  const functionName = node.function || node.Function || node.name || ''
  return className ? `${className}::${functionName}` : functionName
}

// Match nodes between two call stacks by signature
function matchNodes(oldStack, newStack) {
  const oldMap = new Map()
  const newMap = new Map()
  
  const buildMap = (nodes, map, depth = 0) => {
    nodes.forEach(node => {
      const sig = getNodeSignature(node)
      if (!map.has(sig)) {
        map.set(sig, [])
      }
      map.get(sig).push({ node, depth })
      
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        buildMap(node.children, map, depth + 1)
      }
    })
  }
  
  buildMap(oldStack, oldMap)
  buildMap(newStack, newMap)
  
  return { oldMap, newMap }
}

// Calculate differences between two nodes
function calculateDifferences(oldNode, newNode) {
  const oldDuration = oldNode.duration_ms || oldNode.DurationMs || oldNode.duration || 0
  const newDuration = newNode.duration_ms || newNode.DurationMs || newNode.duration || 0
  const oldCpu = oldNode.cpu_ms || oldNode.CPUMs || oldNode.cpu || 0
  const newCpu = newNode.cpu_ms || newNode.CPUMs || newNode.cpu || 0
  const oldMemory = oldNode.memory_delta || oldNode.MemoryDelta || 0
  const newMemory = newNode.memory_delta || newNode.MemoryDelta || 0
  const oldNetwork = (oldNode.network_bytes_sent || oldNode.NetworkBytesSent || 0) + 
                    (oldNode.network_bytes_received || oldNode.NetworkBytesReceived || 0)
  const newNetwork = (newNode.network_bytes_sent || newNode.NetworkBytesSent || 0) + 
                    (newNode.network_bytes_received || newNode.NetworkBytesReceived || 0)
  const oldSQL = (oldNode.sql_queries || oldNode.SQLQueries || []).length
  const newSQL = (newNode.sql_queries || newNode.SQLQueries || []).length
  
  const durationDiff = oldDuration > 0 ? ((newDuration - oldDuration) / oldDuration) * 100 : 0
  const cpuDiff = oldCpu > 0 ? ((newCpu - oldCpu) / oldCpu) * 100 : 0
  const memoryDiff = oldMemory !== 0 ? ((newMemory - oldMemory) / Math.abs(oldMemory)) * 100 : 0
  const networkDiff = oldNetwork > 0 ? ((newNetwork - oldNetwork) / oldNetwork) * 100 : 0
  const sqlDiff = oldSQL > 0 ? ((newSQL - oldSQL) / oldSQL) * 100 : (newSQL > 0 ? 100 : 0)
  
  return {
    duration: { old: oldDuration, new: newDuration, diff: durationDiff },
    cpu: { old: oldCpu, new: newCpu, diff: cpuDiff },
    memory: { old: oldMemory, new: newMemory, diff: memoryDiff },
    network: { old: oldNetwork, new: newNetwork, diff: networkDiff },
    sql: { old: oldSQL, new: newSQL, diff: sqlDiff },
  }
}

// Determine change status (improvement, degradation, or no change)
function getChangeStatus(diffs, threshold = 5) {
  const significantChanges = []
  
  if (Math.abs(diffs.duration.diff) >= threshold) {
    significantChanges.push({
      metric: 'duration',
      type: diffs.duration.diff > 0 ? 'degradation' : 'improvement',
      value: diffs.duration.diff,
    })
  }
  if (Math.abs(diffs.cpu.diff) >= threshold) {
    significantChanges.push({
      metric: 'cpu',
      type: diffs.cpu.diff > 0 ? 'degradation' : 'improvement',
      value: diffs.cpu.diff,
    })
  }
  if (Math.abs(diffs.memory.diff) >= threshold) {
    significantChanges.push({
      metric: 'memory',
      type: diffs.memory.diff > 0 ? 'degradation' : 'improvement',
      value: diffs.memory.diff,
    })
  }
  if (Math.abs(diffs.network.diff) >= threshold) {
    significantChanges.push({
      metric: 'network',
      type: diffs.network.diff > 0 ? 'degradation' : 'improvement',
      value: diffs.network.diff,
    })
  }
  
  if (significantChanges.length === 0) return 'no-change'
  
  // If any degradation, return degradation (red)
  const hasDegradation = significantChanges.some(c => c.type === 'degradation')
  return hasDegradation ? 'degradation' : 'improvement'
}

// Create a diff call stack with color coding
function createDiffCallStack(oldStack, newStack, threshold = 5) {
  const { oldMap } = matchNodes(oldStack, newStack)
  
  const processNode = (newNode) => {
    const sig = getNodeSignature(newNode)
    const oldNodes = oldMap.get(sig) || []
    
    let diffNode = { ...newNode }
    
    if (oldNodes.length > 0) {
      const oldNode = oldNodes[0].node
      const diffs = calculateDifferences(oldNode, newNode)
      const status = getChangeStatus(diffs, threshold)
      
      diffNode._diffStatus = status
      diffNode._diffs = diffs
      diffNode._isNew = false
    } else {
      diffNode._diffStatus = 'new'
      diffNode._diffs = null
      diffNode._isNew = true
    }
    
    if (newNode.children && Array.isArray(newNode.children) && newNode.children.length > 0) {
      diffNode.children = newNode.children.map(child => processNode(child))
    }
    
    return diffNode
  }
  
  return newStack.map(root => processNode(root))
}

// Format functions
function formatDuration(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatMemory(bytes) {
  if (bytes === 0) return '0B'
  if (Math.abs(bytes) < 1024) return `${bytes}B`
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  if (Math.abs(bytes) < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

function formatBytes(bytes) {
  if (bytes === 0) return '0B'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: FiInfo },
  { id: 'stacktree', label: 'Execution Stack Tree', icon: FiActivity },
  { id: 'flame', label: 'Flame Graph', icon: FiLayers },
  { id: 'callgraph', label: 'Call Graph', icon: FiGitBranch },
  { id: 'sql', label: 'SQL Queries', icon: FiDatabase },
  { id: 'http', label: 'HTTP Requests', icon: FiGlobe },
  { id: 'cache', label: 'Cache', icon: FiZap },
  { id: 'redis', label: 'Redis', icon: FiHardDrive },
  { id: 'stacks', label: 'Stack Traces', icon: FiCode },
  { id: 'tags', label: 'Tags', icon: FiTag },
  { id: 'logs', label: 'Logs', icon: FiFileText },
  { id: 'dumps', label: 'Dumps', icon: FiCode },
]

function ProfileComparison({ trace1, trace2, viewMode = 'diff' }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [threshold, setThreshold] = useState(5)
  
  // Extract call stacks from traces
  const callStack1 = useMemo(() => {
    if (!trace1 || !trace1.spans) return []
    const root = trace1.spans.find(s => !s.parent_id) || trace1.spans[0]
    return root?.stack || []
  }, [trace1])
  
  const callStack2 = useMemo(() => {
    if (!trace2 || !trace2.spans) return []
    const root = trace2.spans.find(s => !s.parent_id) || trace2.spans[0]
    return root?.stack || []
  }, [trace2])
  
  // Calculate overall metrics
  const metrics1 = useMemo(() => calculateOverallMetrics(trace1), [trace1])
  const metrics2 = useMemo(() => calculateOverallMetrics(trace2), [trace2])
  
  // Compare overall metrics
  const metricsComparison = useMemo(() => {
    if (!metrics1 || !metrics2) return null
    
    return {
      duration: compareMetrics(metrics1.duration, metrics2.duration),
      cpu: compareMetrics(metrics1.cpu, metrics2.cpu),
      memory: compareMetrics(metrics1.memory, metrics2.memory),
      networkSent: compareMetrics(metrics1.networkSent, metrics2.networkSent),
      networkReceived: compareMetrics(metrics1.networkReceived, metrics2.networkReceived),
      spans: compareMetrics(metrics1.spans, metrics2.spans),
      sqlQueries: compareMetrics(metrics1.sqlQueries, metrics2.sqlQueries),
      httpRequests: compareMetrics(metrics1.httpRequests, metrics2.httpRequests),
      cacheOperations: compareMetrics(metrics1.cacheOperations, metrics2.cacheOperations),
      redisOperations: compareMetrics(metrics1.redisOperations, metrics2.redisOperations),
      stackTraces: compareMetrics(metrics1.stackTraces, metrics2.stackTraces),
      tags: compareMetrics(metrics1.tags, metrics2.tags),
    }
  }, [metrics1, metrics2])
  
  // Extract and compare SQL queries
  const sqlQueries1 = useMemo(() => extractSqlQueries(trace1), [trace1])
  const sqlQueries2 = useMemo(() => extractSqlQueries(trace2), [trace2])
  const sqlComparison = useMemo(() => {
    if (sqlQueries1.length === 0 && sqlQueries2.length === 0) return null
    return compareSqlQueries(sqlQueries1, sqlQueries2)
  }, [sqlQueries1, sqlQueries2])
  
  // Extract and compare HTTP requests
  const httpRequests1 = useMemo(() => extractHttpRequests(trace1), [trace1])
  const httpRequests2 = useMemo(() => extractHttpRequests(trace2), [trace2])
  const httpComparison = useMemo(() => {
    if (httpRequests1.length === 0 && httpRequests2.length === 0) return null
    return compareHttpRequests(httpRequests1, httpRequests2)
  }, [httpRequests1, httpRequests2])
  
  // Extract and compare cache operations
  const cacheOps1 = useMemo(() => extractCacheOperations(trace1), [trace1])
  const cacheOps2 = useMemo(() => extractCacheOperations(trace2), [trace2])
  const cacheComparison = useMemo(() => {
    if (cacheOps1.length === 0 && cacheOps2.length === 0) return null
    return compareCacheOperations(cacheOps1, cacheOps2)
  }, [cacheOps1, cacheOps2])
  
  // Extract and compare Redis operations
  const redisOps1 = useMemo(() => extractRedisOperations(trace1), [trace1])
  const redisOps2 = useMemo(() => extractRedisOperations(trace2), [trace2])
  const redisComparison = useMemo(() => {
    if (redisOps1.length === 0 && redisOps2.length === 0) return null
    return compareRedisOperations(redisOps1, redisOps2)
  }, [redisOps1, redisOps2])
  
  // Extract and compare tags
  const tags1 = useMemo(() => extractTags(trace1), [trace1])
  const tags2 = useMemo(() => extractTags(trace2), [trace2])
  const tagsComparison = useMemo(() => {
    if (tags1.length === 0 && tags2.length === 0) return null
    return compareTags(tags1, tags2)
  }, [tags1, tags2])
  
  // Extract stack traces
  const stacks1 = useMemo(() => extractStackTraces(trace1), [trace1])
  const stacks2 = useMemo(() => extractStackTraces(trace2), [trace2])
  
  // Extract dumps
  const dumps1 = useMemo(() => extractDumps(trace1), [trace1])
  const dumps2 = useMemo(() => extractDumps(trace2), [trace2])
  
  // Get trace IDs for log correlation
  const trace1Id = trace1?.trace_id || trace1?.id || trace1?.spans?.[0]?.trace_id || trace1?.spans?.[0]?.traceId
  const trace2Id = trace2?.trace_id || trace2?.id || trace2?.spans?.[0]?.trace_id || trace2?.spans?.[0]?.traceId
  
  // Create diff call stack
  const diffCallStack = useMemo(() => {
    if (viewMode === 'diff' && callStack1.length > 0 && callStack2.length > 0) {
      return createDiffCallStack(callStack1, callStack2, threshold)
    }
    return []
  }, [callStack1, callStack2, viewMode, threshold])
  
  if (!trace1 || !trace2) {
    return (
      <div className="profile-comparison-empty">
        <p>Please select two traces to compare</p>
      </div>
    )
  }
  
  return (
    <div className="profile-comparison">
      <div className="comparison-header">
        <div className="comparison-controls">
          <div className="control-group">
            <label>Change Threshold:</label>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="slider"
            />
            <span className="slider-value">{threshold}%</span>
          </div>
        </div>
      </div>
      
      <div className="comparison-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon
          let badge = null
          let shouldShow = true
          
          // Conditionally show tabs based on data availability
          if (tab.id === 'stacktree' || tab.id === 'flame') {
            shouldShow = callStack1.length > 0 || callStack2.length > 0
          } else if (tab.id === 'callgraph') {
            shouldShow = callStack1.length > 0 || callStack2.length > 0
          } else if (tab.id === 'sql') {
            shouldShow = sqlComparison && (sqlComparison.total1 > 0 || sqlComparison.total2 > 0)
            if (shouldShow) {
              badge = sqlComparison.total1 + sqlComparison.total2
            }
          } else if (tab.id === 'http') {
            shouldShow = httpComparison && (httpComparison.total1 > 0 || httpComparison.total2 > 0)
            if (shouldShow) {
              badge = httpComparison.total1 + httpComparison.total2
            }
          } else if (tab.id === 'cache') {
            shouldShow = cacheComparison && (cacheComparison.total1 > 0 || cacheComparison.total2 > 0)
            if (shouldShow) {
              badge = cacheComparison.total1 + cacheComparison.total2
            }
          } else if (tab.id === 'redis') {
            shouldShow = redisComparison && (redisComparison.total1 > 0 || redisComparison.total2 > 0)
            if (shouldShow) {
              badge = redisComparison.total1 + redisComparison.total2
            }
          } else if (tab.id === 'stacks') {
            shouldShow = stacks1.length > 0 || stacks2.length > 0
            if (shouldShow) {
              badge = stacks1.length + stacks2.length
            }
          } else if (tab.id === 'tags') {
            shouldShow = tagsComparison && (tagsComparison.total1 > 0 || tagsComparison.total2 > 0)
            if (shouldShow) {
              badge = tagsComparison.total1 + tagsComparison.total2
            }
          } else if (tab.id === 'dumps') {
            const dumpsCount1 = dumps1.reduce((sum, item) => sum + item.dumps.length, 0)
            const dumpsCount2 = dumps2.reduce((sum, item) => sum + item.dumps.length, 0)
            shouldShow = dumpsCount1 > 0 || dumpsCount2 > 0
            if (shouldShow) {
              badge = dumpsCount1 + dumpsCount2
            }
          }
          // logs and overview are always shown
          
          if (!shouldShow) return null
          
          return (
            <button
              key={tab.id}
              className={`comparison-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className="tab-icon" />
              <span>{tab.label}</span>
              {badge !== null && badge > 0 && (
                <span className="tab-badge">{badge}</span>
              )}
            </button>
          )
        })}
      </div>
      
      <div className="comparison-content">
        {activeTab === 'overview' && metricsComparison && (
          <div className="overview-tab">
            <h2 className="tab-title">Overview Comparison</h2>
            <div className="metrics-grid">
              <MetricComparisonCard
                label="Duration"
                value1={metrics1.duration}
                value2={metrics2.duration}
                diff={metricsComparison.duration.diff}
                unit=""
                formatValue={formatDuration}
                icon={FiActivity}
              />
              <MetricComparisonCard
                label="CPU Time"
                value1={metrics1.cpu}
                value2={metrics2.cpu}
                diff={metricsComparison.cpu.diff}
                unit=""
                formatValue={formatDuration}
                icon={FiActivity}
              />
              <MetricComparisonCard
                label="Memory"
                value1={metrics1.memory}
                value2={metrics2.memory}
                diff={metricsComparison.memory.diff}
                unit=""
                formatValue={formatMemory}
                icon={FiServer}
              />
              <MetricComparisonCard
                label="Network Sent"
                value1={metrics1.networkSent}
                value2={metrics2.networkSent}
                diff={metricsComparison.networkSent.diff}
                unit=""
                formatValue={formatBytes}
                icon={FiGlobe}
              />
              <MetricComparisonCard
                label="Network Received"
                value1={metrics1.networkReceived}
                value2={metrics2.networkReceived}
                diff={metricsComparison.networkReceived.diff}
                unit=""
                formatValue={formatBytes}
                icon={FiGlobe}
              />
              <MetricComparisonCard
                label="Spans"
                value1={metrics1.spans}
                value2={metrics2.spans}
                diff={metricsComparison.spans.diff}
                unit=""
                formatValue={(v) => v}
                icon={FiLayers}
              />
              <MetricComparisonCard
                label="SQL Queries"
                value1={metrics1.sqlQueries}
                value2={metrics2.sqlQueries}
                diff={metricsComparison.sqlQueries.diff}
                unit=""
                formatValue={(v) => v}
                icon={FiDatabase}
              />
              <MetricComparisonCard
                label="HTTP Requests"
                value1={metrics1.httpRequests}
                value2={metrics2.httpRequests}
                diff={metricsComparison.httpRequests.diff}
                unit=""
                formatValue={(v) => v}
                icon={FiGlobe}
              />
              <MetricComparisonCard
                label="Cache Operations"
                value1={metrics1.cacheOperations}
                value2={metrics2.cacheOperations}
                diff={metricsComparison.cacheOperations.diff}
                unit=""
                formatValue={(v) => v}
                icon={FiZap}
              />
              <MetricComparisonCard
                label="Redis Operations"
                value1={metrics1.redisOperations}
                value2={metrics2.redisOperations}
                diff={metricsComparison.redisOperations.diff}
                unit=""
                formatValue={(v) => v}
                icon={FiHardDrive}
              />
              <MetricComparisonCard
                label="Stack Traces"
                value1={metrics1.stackTraces}
                value2={metrics2.stackTraces}
                diff={metricsComparison.stackTraces.diff}
                unit=""
                formatValue={(v) => v}
                icon={FiCode}
              />
              <MetricComparisonCard
                label="Tags"
                value1={metrics1.tags}
                value2={metrics2.tags}
                diff={metricsComparison.tags.diff}
                unit=""
                formatValue={(v) => v}
                icon={FiTag}
              />
            </div>
          </div>
        )}
        
        {activeTab === 'stacktree' && (
          <div className="stacktree-tab">
            {viewMode === 'side-by-side' ? (
              <div className="side-by-side-view">
                <div className="comparison-panel">
                  <h3>Trace 1 (Baseline)</h3>
                  {callStack1.length > 0 ? (
                    <ExecutionStackTree callStack={callStack1} />
                  ) : (
                    <div className="comparison-empty">
                      <p>No call stack data available</p>
                    </div>
                  )}
                </div>
                <div className="comparison-panel">
                  <h3>Trace 2 (New)</h3>
                  {callStack2.length > 0 ? (
                    <ExecutionStackTree callStack={callStack2} />
                  ) : (
                    <div className="comparison-empty">
                      <p>No call stack data available</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="diff-view">
                <h3>Trace 2 (New) - Execution Stack Tree</h3>
                {callStack2.length > 0 ? (
                  <ExecutionStackTree callStack={callStack2} />
                ) : (
                  <div className="comparison-empty">
                    <p>No call stack data available</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'flame' && (
          <div className="flame-tab">
            {viewMode === 'side-by-side' ? (
              <div className="side-by-side-view">
                <div className="comparison-panel">
                  <h3>Trace 1 (Baseline)</h3>
                  {callStack1.length > 0 ? (
                    <FlameGraph callStack={callStack1} width={600} height={600} />
                  ) : (
                    <div className="comparison-empty">
                      <p>No call stack data available</p>
                    </div>
                  )}
                </div>
                <div className="comparison-panel">
                  <h3>Trace 2 (New)</h3>
                  {callStack2.length > 0 ? (
                    <FlameGraph callStack={callStack2} width={600} height={600} />
                  ) : (
                    <div className="comparison-empty">
                      <p>No call stack data available</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="diff-view">
                <h3>Trace 2 (New) - Flame Graph</h3>
                {callStack2.length > 0 ? (
                  <FlameGraph callStack={callStack2} width={1200} height={600} />
                ) : (
                  <div className="comparison-empty">
                    <p>No call stack data available</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'callgraph' && (
          <div className="callgraph-tab">
            {viewMode === 'side-by-side' ? (
              <div className="side-by-side-view">
                <div className="comparison-panel">
                  <h3>Trace 1 (Baseline)</h3>
                  <CallGraph callStack={callStack1} width={600} height={600} />
                </div>
                <div className="comparison-panel">
                  <h3>Trace 2 (New)</h3>
                  <CallGraph callStack={callStack2} width={600} height={600} />
                </div>
              </div>
            ) : (
              <div className="diff-view">
                <h3>Difference View</h3>
                <div className="legend">
                  <div className="legend-item">
                    <span className="legend-color improvement"></span>
                    <span>Improvement (Green)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color degradation"></span>
                    <span>Degradation (Red)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color no-change"></span>
                    <span>No Change (Gray)</span>
                  </div>
                </div>
                {diffCallStack.length > 0 ? (
                  <CallGraph callStack={diffCallStack} width={1200} height={800} />
                ) : (
                  <div className="no-diff-data">
                    <p>No differences found or call stacks are empty</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'sql' && (
          <div className="sql-tab">
            <h2 className="tab-title">SQL Queries Comparison</h2>
            {sqlComparison ? (
              <SqlComparisonTable comparison={sqlComparison} />
            ) : (
              <div className="comparison-empty">
                <p>No SQL queries to compare</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'http' && (
          <div className="http-tab">
            <h2 className="tab-title">HTTP Requests Comparison</h2>
            {httpComparison ? (
              <HttpComparisonTable comparison={httpComparison} />
            ) : (
              <div className="comparison-empty">
                <p>No HTTP requests to compare</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'cache' && (
          <div className="cache-tab">
            <h2 className="tab-title">Cache Operations Comparison</h2>
            {cacheComparison ? (
              <CacheComparisonTable comparison={cacheComparison} />
            ) : (
              <div className="comparison-empty">
                <p>No cache operations to compare</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'redis' && (
          <div className="redis-tab">
            <h2 className="tab-title">Redis Operations Comparison</h2>
            {redisComparison ? (
              <RedisComparisonTable comparison={redisComparison} />
            ) : (
              <div className="comparison-empty">
                <p>No Redis operations to compare</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'stacks' && (
          <div className="stacks-tab">
            <h2 className="tab-title">Stack Traces Comparison</h2>
            <div className="stacks-comparison">
              <div className="stacks-summary">
                <div className="summary-item">
                  <span className="summary-label">Trace 1 Stack Traces:</span>
                  <span className="summary-value">{stacks1.length}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Trace 2 Stack Traces:</span>
                  <span className="summary-value">{stacks2.length}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Difference:</span>
                  <span className={`summary-value ${metricsComparison?.stackTraces.changeType || 'no-change'}`}>
                    {metricsComparison?.stackTraces ? 
                      `${metricsComparison.stackTraces.diff > 0 ? '+' : ''}${metricsComparison.stackTraces.diff.toFixed(1)}%` :
                      '0%'
                    }
                  </span>
                </div>
              </div>
              <div className="stacks-info">
                <p>Stack trace comparison shows the count difference. For detailed stack trace analysis, view individual traces.</p>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'tags' && (
          <div className="tags-tab">
            <h2 className="tab-title">Tags Comparison</h2>
            {tagsComparison ? (
              <TagComparisonView comparison={tagsComparison} />
            ) : (
              <div className="comparison-empty">
                <p>No tags to compare</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'logs' && (
          <div className="logs-tab">
            <h2 className="tab-title">Logs Comparison</h2>
            {viewMode === 'side-by-side' ? (
              <div className="side-by-side-view">
                <div className="comparison-panel">
                  <h3>Trace 1 (Baseline)</h3>
                  {trace1Id ? (
                    <LogCorrelation traceId={trace1Id} />
                  ) : (
                    <div className="comparison-empty">
                      <p>No trace ID available</p>
                    </div>
                  )}
                </div>
                <div className="comparison-panel">
                  <h3>Trace 2 (New)</h3>
                  {trace2Id ? (
                    <LogCorrelation traceId={trace2Id} />
                  ) : (
                    <div className="comparison-empty">
                      <p>No trace ID available</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="diff-view">
                <div className="comparison-panel">
                  <h3>Trace 1 (Baseline)</h3>
                  {trace1Id ? (
                    <LogCorrelation traceId={trace1Id} />
                  ) : (
                    <div className="comparison-empty">
                      <p>No trace ID available</p>
                    </div>
                  )}
                </div>
                <div className="comparison-panel">
                  <h3>Trace 2 (New)</h3>
                  {trace2Id ? (
                    <LogCorrelation traceId={trace2Id} />
                  ) : (
                    <div className="comparison-empty">
                      <p>No trace ID available</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'dumps' && (
          <div className="dumps-tab">
            <h2 className="tab-title">Variable Dumps Comparison</h2>
            {viewMode === 'side-by-side' ? (
              <div className="side-by-side-view">
                <div className="comparison-panel">
                  <h3>Trace 1 (Baseline)</h3>
                  {dumps1.length > 0 ? (
                    <div className="dumps-list">
                      {dumps1.map((item, spanIdx) => (
                        <div key={spanIdx} className="dumps-item">
                          <div className="dumps-header">
                            <h4>{item.span}</h4>
                            <span className="span-id">Span: {item.spanId}</span>
                          </div>
                          {item.dumps.map((dump, dumpIdx) => {
                            const parsedData = typeof dump.data === 'string' 
                              ? (() => {
                                  try {
                                    return JSON.parse(dump.data)
                                  } catch {
                                    return dump.data
                                  }
                                })()
                              : dump.data
                            const jsonString = typeof dump.data === 'string' 
                              ? (() => {
                                  try {
                                    return JSON.stringify(JSON.parse(dump.data), null, 2)
                                  } catch {
                                    return dump.data
                                  }
                                })()
                              : JSON.stringify(dump.data, null, 2)
                            
                            return (
                              <div key={dumpIdx} className="dump-entry">
                                <div className="dump-meta">
                                  <span className="dump-file">{dump.file || 'unknown'}</span>
                                  <span className="dump-line">Line {dump.line || '?'}</span>
                                </div>
                                <div className="dump-content">
                                  <JsonTreeViewer data={parsedData} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="comparison-empty">
                      <p>No dumps available</p>
                    </div>
                  )}
                </div>
                <div className="comparison-panel">
                  <h3>Trace 2 (New)</h3>
                  {dumps2.length > 0 ? (
                    <div className="dumps-list">
                      {dumps2.map((item, spanIdx) => (
                        <div key={spanIdx} className="dumps-item">
                          <div className="dumps-header">
                            <h4>{item.span}</h4>
                            <span className="span-id">Span: {item.spanId}</span>
                          </div>
                          {item.dumps.map((dump, dumpIdx) => {
                            const parsedData = typeof dump.data === 'string' 
                              ? (() => {
                                  try {
                                    return JSON.parse(dump.data)
                                  } catch {
                                    return dump.data
                                  }
                                })()
                              : dump.data
                            const jsonString = typeof dump.data === 'string' 
                              ? (() => {
                                  try {
                                    return JSON.stringify(JSON.parse(dump.data), null, 2)
                                  } catch {
                                    return dump.data
                                  }
                                })()
                              : JSON.stringify(dump.data, null, 2)
                            
                            return (
                              <div key={dumpIdx} className="dump-entry">
                                <div className="dump-meta">
                                  <span className="dump-file">{dump.file || 'unknown'}</span>
                                  <span className="dump-line">Line {dump.line || '?'}</span>
                                </div>
                                <div className="dump-content">
                                  <JsonTreeViewer data={parsedData} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="comparison-empty">
                      <p>No dumps available</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="diff-view">
                <div className="comparison-panel">
                  <h3>Trace 1 (Baseline)</h3>
                  {dumps1.length > 0 ? (
                    <div className="dumps-list">
                      {dumps1.map((item, spanIdx) => (
                        <div key={spanIdx} className="dumps-item">
                          <div className="dumps-header">
                            <h4>{item.span}</h4>
                            <span className="span-id">Span: {item.spanId}</span>
                          </div>
                          {item.dumps.map((dump, dumpIdx) => {
                            const parsedData = typeof dump.data === 'string' 
                              ? (() => {
                                  try {
                                    return JSON.parse(dump.data)
                                  } catch {
                                    return dump.data
                                  }
                                })()
                              : dump.data
                            
                            return (
                              <div key={dumpIdx} className="dump-entry">
                                <div className="dump-meta">
                                  <span className="dump-file">{dump.file || 'unknown'}</span>
                                  <span className="dump-line">Line {dump.line || '?'}</span>
                                </div>
                                <div className="dump-content">
                                  <JsonTreeViewer data={parsedData} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="comparison-empty">
                      <p>No dumps available</p>
                    </div>
                  )}
                </div>
                <div className="comparison-panel">
                  <h3>Trace 2 (New)</h3>
                  {dumps2.length > 0 ? (
                    <div className="dumps-list">
                      {dumps2.map((item, spanIdx) => (
                        <div key={spanIdx} className="dumps-item">
                          <div className="dumps-header">
                            <h4>{item.span}</h4>
                            <span className="span-id">Span: {item.spanId}</span>
                          </div>
                          {item.dumps.map((dump, dumpIdx) => {
                            const parsedData = typeof dump.data === 'string' 
                              ? (() => {
                                  try {
                                    return JSON.parse(dump.data)
                                  } catch {
                                    return dump.data
                                  }
                                })()
                              : dump.data
                            
                            return (
                              <div key={dumpIdx} className="dump-entry">
                                <div className="dump-meta">
                                  <span className="dump-file">{dump.file || 'unknown'}</span>
                                  <span className="dump-line">Line {dump.line || '?'}</span>
                                </div>
                                <div className="dump-content">
                                  <JsonTreeViewer data={parsedData} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="comparison-empty">
                      <p>No dumps available</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfileComparison
