import React, { useState, useEffect, useCallback } from 'react'
import {
  FiFileText, FiAlertCircle, FiInfo, FiAlertTriangle, FiXCircle, FiRefreshCw,
} from 'react-icons/fi'
import axios from 'axios'
import { Badge, Button, EmptyState, Select, Skeleton } from '@open-family/ui'
import './LogCorrelation.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const LEVEL_OPTIONS = [
  { value: 'all', label: 'All levels' },
  { value: 'critical', label: 'Critical' },
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warning' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
]

// A record with no level at all is a real shape from the ingest path, and
// `null.toLowerCase()` used to take the whole panel down with it.
function levelOf(log) {
  return String(log?.level || 'debug').toLowerCase()
}

function LogCorrelation({ traceId, spanId = null }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all') // all, critical, error, warn, info, debug

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = spanId
        ? `${API_URL}/api/traces/${traceId}/logs?span_id=${spanId}`
        : `${API_URL}/api/traces/${traceId}/logs`

      const response = await axios.get(url)
      setLogs(response.data.logs || [])
    } catch (err) {
      console.error('Error fetching logs:', err)
      // Without this the failed request rendered as "no logs found", which reads
      // as a fact about the trace rather than a fact about the request.
      setError(err?.message || 'The request did not complete.')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [traceId, spanId])

  useEffect(() => {
    if (traceId) {
      fetchLogs()
    }
  }, [traceId, spanId, fetchLogs])

  const getLevelIcon = (level) => {
    switch (level) {
      case 'critical':
      case 'crit':
        return <FiXCircle className="log-icon critical" aria-hidden="true" />
      case 'error':
        return <FiAlertCircle className="log-icon error" aria-hidden="true" />
      case 'warn':
      case 'warning':
        return <FiAlertTriangle className="log-icon warn" aria-hidden="true" />
      case 'info':
        return <FiInfo className="log-icon info" aria-hidden="true" />
      default:
        return <FiFileText className="log-icon debug" aria-hidden="true" />
    }
  }

  const getLevelColor = (level) => {
    switch (level) {
      case 'critical':
      case 'crit':
        return 'critical'
      case 'error':
        return 'error'
      case 'warn':
      case 'warning':
        return 'warn'
      case 'info':
        return 'info'
      default:
        return 'debug'
    }
  }

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true
    const logLevel = levelOf(log)
    const filterLevel = filter.toLowerCase()

    // Handle aliases for critical level
    if (filterLevel === 'critical') {
      return logLevel === 'critical' || logLevel === 'crit'
    }

    return logLevel === filterLevel
  })

  return (
    <div className="LogCorrelation">
      <div className="logs-header">
        <h3 className="logs-title">
          <FiFileText aria-hidden="true" />
          Correlated logs
          {!loading && !error && <Badge round>{logs.length}</Badge>}
        </h3>
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          options={LEVEL_OPTIONS}
          aria-label="Log level"
          disabled={loading || Boolean(error)}
        />
      </div>

      {/* Four states, and they look different. The previous version had one: an
          in-flight request and a failed one both printed "No logs found for this
          trace", which is a claim about the trace neither of them can make. */}
      {!traceId ? (
        <EmptyState
          inline
          title="No trace selected"
          description="Log correlation is keyed on a trace id, and none was passed to this panel."
        />
      ) : loading ? (
        <div className="logs-loading" aria-busy="true">
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : error ? (
        <EmptyState
          inline
          icon={<FiAlertCircle />}
          title="Logs failed to load"
          description={String(error)}
          actions={<Button icon={<FiRefreshCw />} onClick={fetchLogs}>Retry</Button>}
        />
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          inline
          title={logs.length === 0 ? 'No logs correlated to this trace' : 'No log at this level'}
          description={logs.length === 0
            ? 'Nothing was shipped with this trace id. Correlation needs the trace id on the log record itself.'
            : `${logs.length} log${logs.length === 1 ? '' : 's'} exist on this trace at other levels — widen the filter to see them.`}
        />
      ) : (
        <div className="logs-list">
          {filteredLogs.map(log => {
            const level = levelOf(log)
            return (
              <div key={log.id} className={`log-entry log-${getLevelColor(level)}`}>
                <div className="log-header">
                  <div className="log-level">
                    {getLevelIcon(level)}
                    <span className="level-text">{level.toUpperCase()}</span>
                  </div>
                  <div className="log-timestamp">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
                <div className="log-message">{log.message}</div>
                {log.fields && Object.keys(log.fields).length > 0 && (
                  <details className="log-fields">
                    <summary>Fields</summary>
                    <pre>{JSON.stringify(log.fields, null, 2)}</pre>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default LogCorrelation
