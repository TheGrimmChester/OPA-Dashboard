import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { 
  FiTerminal, 
  FiServer,
  FiActivity,
  FiLink,
  FiExternalLink,
  FiChevronDown,
  FiChevronRight
} from 'react-icons/fi'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import JsonTreeViewer from './JsonTreeViewer'
import './LiveDumpsMini.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

function parseDumpData(data) {
  if (!data) return null
  
  try {
    if (typeof data === 'string') {
      return JSON.parse(data)
    }
    return data
  } catch (e) {
    return data
  }
}

function toggleDump(dumpId, expandedDumps, setExpandedDumps) {
  const newExpanded = new Set(expandedDumps)
  if (newExpanded.has(dumpId)) {
    newExpanded.delete(dumpId)
  } else {
    newExpanded.add(dumpId)
  }
  setExpandedDumps(newExpanded)
}

function LiveDumpsMini({ isPaused, onRefresh, onDataStatusChange }) {
  const [dumps, setDumps] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [expandedDumps, setExpandedDumps] = useState(new Set())
  const [dumpExpandedNodes, setDumpExpandedNodes] = useState({}) // Map of dump.id -> Set of expanded nodes
  const [dumpDisplayFormat, setDumpDisplayFormat] = useState({}) // Map of dump.id -> 'tree' | 'json'

  const fetchDumps = useCallback(async (isRefresh = false) => {
    if (isPaused) return
    
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)
      
      const params = new URLSearchParams({
        limit: '10',
        all: '1',
      })
      
      const response = await axios.get(`${API_URL}/api/dumps?${params}`)
      const fetchedDumps = response.data.dumps || []
      const hasData = fetchedDumps.length > 0
      
      if (onDataStatusChange) {
        onDataStatusChange(hasData)
      }
      
      setDumps(fetchedDumps.slice(0, 10))
    } catch (err) {
      console.error('Error fetching dumps:', err)
      setError('Error fetching dumps')
      setDumps([])
      if (onDataStatusChange) {
        onDataStatusChange(false)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isPaused, onDataStatusChange])

  const hasMountedRef = useRef(false)
  
  useEffect(() => {
    if (!hasMountedRef.current && !isPaused) {
      hasMountedRef.current = true
      fetchDumps()
    }
  }, [isPaused, fetchDumps])

  useEffect(() => {
    if (onRefresh && onRefresh > 0 && !loading && hasMountedRef.current) {
      fetchDumps(true)
    }
  }, [onRefresh, fetchDumps, loading])

  if (loading && dumps.length === 0) {
    return (
      <div className="live-dumps-mini">
        <div className="mini-header">
          <h3>Live Dumps</h3>
          <Link to="/live-dumps" className="view-all-link">
            View Full <FiExternalLink />
          </Link>
        </div>
        <div className="mini-content loading">
          <FiTerminal className="loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="live-dumps-mini">
        <div className="mini-header">
          <h3>Live Dumps</h3>
          <Link to="/live-dumps" className="view-all-link">
            View Full <FiExternalLink />
          </Link>
        </div>
        <div className="mini-content error">
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="live-dumps-mini">
      <div className="mini-header">
        <h3>Live Dumps</h3>
        <Link to="/live-dumps" className="view-all-link">
          View Full <FiExternalLink />
        </Link>
      </div>
      <div className={`mini-content ${refreshing ? 'refreshing' : ''}`}>
        {refreshing && (
          <div className="refresh-overlay active">
            <div className="refresh-overlay-content">
              <FiTerminal className="loading-spinner" />
            </div>
          </div>
        )}
        {dumps.length === 0 ? (
          <div className="empty-state">
            <FiTerminal className="empty-icon" />
            <p>No dumps found</p>
          </div>
        ) : (
          <div className="dumps-list">
            {dumps.map((dump) => {
              const isExpanded = expandedDumps.has(dump.id)
              const parsedData = parseDumpData(dump.data)
              
              return (
                <div key={dump.id} className="dump-entry">
                  <div className="dump-header-mini">
                    <div className="dump-service-mini">
                      <FiServer className="icon" />
                      <span>{dump.service}</span>
                    </div>
                    <span className="dump-timestamp-mini">{formatTimestamp(dump.timestamp)}</span>
                  </div>
                  <div className="dump-span-mini">
                    <FiActivity className="icon" />
                    <span>{dump.span_name}</span>
                  </div>
                  {dump.trace_id && (
                    <Link to={`/traces/${dump.trace_id}`} className="trace-link-mini">
                      <FiLink className="icon" />
                      View Trace
                    </Link>
                  )}
                  {(dump.data || dump.text) && (
                    <div className="dump-data-section">
                      <button
                        className="dump-data-toggle"
                        onClick={() => toggleDump(dump.id, expandedDumps, setExpandedDumps)}
                      >
                        {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                        <span>Dump Data</span>
                      </button>
                      {isExpanded && (
                        <div className="dump-data-content">
                          {(() => {
                            // Prefer text if available
                            if (dump.text) {
                              return (
                                <div className="dump-data-text">
                                  {dump.text}
                                </div>
                              )
                            }
                            
                            // Get display format for this dump (default to 'json' for mini view)
                            const displayFormat = dumpDisplayFormat[dump.id] || 'json'
                            
                            // Prepare JSON string
                            const jsonString = dump.data 
                              ? (typeof dump.data === 'string' 
                                  ? (() => {
                                      try {
                                        return JSON.stringify(JSON.parse(dump.data), null, 2)
                                      } catch {
                                        return dump.data
                                      }
                                    })()
                                  : JSON.stringify(dump.data, null, 2))
                              : 'N/A'
                            
                            // Try to parse and display as JSON tree if it's an object/array
                            if (parsedData !== null && (typeof parsedData === 'object' || Array.isArray(parsedData))) {
                              return (
                                <>
                                  <div className="dump-format-toggle-mini">
                                    <button
                                      className={`format-btn-mini ${displayFormat === 'tree' ? 'active' : ''}`}
                                      onClick={() => setDumpDisplayFormat(prev => ({ ...prev, [dump.id]: 'tree' }))}
                                    >
                                      Tree
                                    </button>
                                    <button
                                      className={`format-btn-mini ${displayFormat === 'json' ? 'active' : ''}`}
                                      onClick={() => setDumpDisplayFormat(prev => ({ ...prev, [dump.id]: 'json' }))}
                                    >
                                      JSON
                                    </button>
                                  </div>
                                  {displayFormat === 'tree' ? (
                                    <div className="dump-tree-mini">
                                      <JsonTreeViewer 
                                        data={parsedData} 
                                        expandedNodes={dumpExpandedNodes[dump.id] || new Set()}
                                        onToggleNode={(nodeId) => {
                                          setDumpExpandedNodes(prev => {
                                            const newMap = { ...prev }
                                            if (!newMap[dump.id]) {
                                              newMap[dump.id] = new Set()
                                            }
                                            const nodeSet = new Set(newMap[dump.id])
                                            if (nodeSet.has(nodeId)) {
                                              nodeSet.delete(nodeId)
                                            } else {
                                              nodeSet.add(nodeId)
                                            }
                                            newMap[dump.id] = nodeSet
                                            return newMap
                                          })
                                        }}
                                        autoExpandLevels={0}
                                      />
                                    </div>
                                  ) : (
                                    <div className="dump-json-mini">
                                      <SyntaxHighlighter
                                        language="json"
                                        style={vscDarkPlus}
                                        customStyle={{
                                          margin: 0,
                                          padding: 'var(--spacing-xs)',
                                          background: 'var(--bg-tertiary)',
                                          borderRadius: 'var(--radius-sm)',
                                          fontSize: 'var(--font-size-xs)',
                                        }}
                                        PreTag="div"
                                      >
                                        {jsonString}
                                      </SyntaxHighlighter>
                                    </div>
                                  )}
                                </>
                              )
                            }
                            
                            // Fallback to string representation with syntax highlighting if it looks like JSON
                            const isJsonString = typeof dump.data === 'string' && (
                              (dump.data.trim().startsWith('{') && dump.data.trim().endsWith('}')) ||
                              (dump.data.trim().startsWith('[') && dump.data.trim().endsWith(']'))
                            )
                            
                            if (isJsonString) {
                              try {
                                const parsed = JSON.parse(dump.data)
                                const formatted = JSON.stringify(parsed, null, 2)
                                return (
                                  <div className="dump-json-mini">
                                    <SyntaxHighlighter
                                      language="json"
                                      style={vscDarkPlus}
                                      customStyle={{
                                        margin: 0,
                                        padding: 'var(--spacing-xs)',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: 'var(--font-size-xs)',
                                      }}
                                      PreTag="div"
                                    >
                                      {formatted}
                                    </SyntaxHighlighter>
                                  </div>
                                )
                              } catch {
                                // Not valid JSON, fall through to plain text
                              }
                            }
                            
                            return (
                              <div className="dump-data-text">
                                {dump.data ? (
                                  typeof dump.data === 'string' 
                                    ? dump.data 
                                    : JSON.stringify(dump.data, null, 2)
                                ) : 'No data'}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveDumpsMini
