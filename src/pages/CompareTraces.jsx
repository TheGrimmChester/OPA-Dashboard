import React, { useState, useEffect } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { FiArrowLeft, FiShuffle, FiDownload, FiRefreshCw, FiGitBranch, FiClock } from 'react-icons/fi'
import axios from 'axios'
import ProfileComparison from '../components/ProfileComparison'
import CohortCompare from '../components/CohortCompare'
import CallgraphWindowCompare from '../components/CallgraphWindowCompare'
import CopyToClipboard from '../components/CopyToClipboard'
import ShareButton from '../components/ShareButton'
import { useApi } from '../hooks/useApi'
import {
  Panel, DataTable, EntityHeader, StatusPill, SegmentedControl,
  DeltaIndicator, EmptyState, ErrorState,
} from '../components/ui'
import { fmtMs, fmtBytes, fmtNum } from '../theme/format'
import { calculateOverallMetrics } from '../utils/comparisonUtils'

const API_URL = import.meta.env.VITE_API_URL || ''

// Root span helpers for header chips.
function rootSpan(trace) {
  return trace?.spans?.find((s) => !s.parent_id) || trace?.spans?.[0] || null
}
function isError(trace) {
  const st = rootSpan(trace)?.status
  return st === 'error' || st === '0'
}

// Metric rows for the side-by-side diff table. `invert` = more-is-worse.
const METRIC_ROWS = [
  { key: 'duration', label: 'Duration', fmt: fmtMs, invert: true, color: 'var(--chart-1)' },
  { key: 'cpu', label: 'CPU time', fmt: fmtMs, invert: true, color: 'var(--chart-1)' },
  { key: 'memory', label: 'Memory', fmt: fmtBytes, invert: true },
  { key: 'spans', label: 'Spans', fmt: fmtNum, invert: false },
  { key: 'sqlQueries', label: 'SQL queries', fmt: fmtNum, invert: true, color: 'var(--chart-2)' },
  { key: 'httpRequests', label: 'HTTP requests', fmt: fmtNum, invert: true, color: 'var(--chart-4)' },
  { key: 'redisOperations', label: 'Redis ops', fmt: fmtNum, invert: true, color: 'var(--chart-3)' },
  { key: 'cacheOperations', label: 'Cache ops', fmt: fmtNum, invert: true, color: 'var(--chart-5)' },
  { key: 'networkSent', label: 'Bytes sent', fmt: fmtBytes, invert: true, color: 'var(--chart-1)' },
  { key: 'networkReceived', label: 'Bytes received', fmt: fmtBytes, invert: true, color: 'var(--chart-2)' },
]

export default function CompareTraces() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const [trace1Id, setTrace1Id] = useState(searchParams.get('trace1') || '')
  const [trace2Id, setTrace2Id] = useState(searchParams.get('trace2') || '')
  const [trace1, setTrace1] = useState(null)
  const [trace2, setTrace2] = useState(null)
  const [loading1, setLoading1] = useState(false)
  const [loading2, setLoading2] = useState(false)
  const [error1, setError1] = useState(null)
  const [error2, setError2] = useState(null)
  const [viewMode, setViewMode] = useState(searchParams.get('mode') || 'diff')
  const [compareMode, setCompareMode] = useState(
    searchParams.get('cmp') === 'cohort' ? 'cohort'
      : searchParams.get('cmp') === 'callgraph' ? 'callgraph'
        : 'trace'
  )

  // Recent traces for input suggestions (same endpoint + params as before).
  const recent = useApi('/api/traces', { limit: 20 }, { noRange: true })
  const recentTraces = Array.isArray(recent.data)
    ? recent.data
    : (Array.isArray(recent.data?.traces) ? recent.data.traces : [])

  // Fetch trace 1
  const fetchTrace1 = async (id = null) => {
    const traceId = id || trace1Id
    if (!traceId || !traceId.trim()) {
      setTrace1(null)
      setError1(null)
      return
    }
    setLoading1(true)
    setError1(null)
    try {
      const response = await axios.get(`${API_URL}/api/traces/${traceId.trim()}/full`)
      setTrace1(response.data)
    } catch (err) {
      setError1(err.response?.status === 404 ? 'Trace not found' : 'Error loading trace')
      setTrace1(null)
      console.error('Error fetching trace 1:', err)
    } finally {
      setLoading1(false)
    }
  }

  // Fetch trace 2
  const fetchTrace2 = async (id = null) => {
    const traceId = id || trace2Id
    if (!traceId || !traceId.trim()) {
      setTrace2(null)
      setError2(null)
      return
    }
    setLoading2(true)
    setError2(null)
    try {
      const response = await axios.get(`${API_URL}/api/traces/${traceId.trim()}/full`)
      setTrace2(response.data)
    } catch (err) {
      setError2(err.response?.status === 404 ? 'Trace not found' : 'Error loading trace')
      setTrace2(null)
      console.error('Error fetching trace 2:', err)
    } finally {
      setLoading2(false)
    }
  }

  // Sync trace IDs and view mode to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (trace1Id) params.set('trace1', trace1Id)
    else params.delete('trace1')
    if (trace2Id) params.set('trace2', trace2Id)
    else params.delete('trace2')
    if (viewMode && viewMode !== 'diff') params.set('mode', viewMode)
    else params.delete('mode')
    if (compareMode === 'cohort') params.set('cmp', 'cohort')
    else if (compareMode === 'callgraph') params.set('cmp', 'callgraph')
    else params.delete('cmp')
    setSearchParams(params, { replace: true })
  }, [trace1Id, trace2Id, viewMode, compareMode, searchParams, setSearchParams])

  // Auto-load traces from URL params on mount
  useEffect(() => {
    const trace1FromUrl = searchParams.get('trace1')
    const trace2FromUrl = searchParams.get('trace2')
    if (trace1FromUrl && trace1FromUrl !== trace1Id) {
      setTrace1Id(trace1FromUrl)
      fetchTrace1(trace1FromUrl)
    }
    if (trace2FromUrl && trace2FromUrl !== trace2Id) {
      setTrace2Id(trace2FromUrl)
      fetchTrace2(trace2FromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  // Check if trace IDs were passed via location state
  useEffect(() => {
    if (location.state?.trace1Id) {
      setTrace1Id(location.state.trace1Id)
      fetchTrace1(location.state.trace1Id)
    }
    if (location.state?.trace2Id) {
      setTrace2Id(location.state.trace2Id)
      fetchTrace2(location.state.trace2Id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const m1 = trace1 ? calculateOverallMetrics(trace1) : null
  const m2 = trace2 ? calculateOverallMetrics(trace2) : null

  const diffColumns = [
    { key: 'label', header: 'Metric', render: (r) => <span className="cell-strong">{r.label}</span>, sortable: false },
    { key: 'a', header: 'Baseline (A)', num: true, sortable: false, render: (r) => (
      <span className="oui-mono" style={r.color ? { color: r.color } : undefined}>{r.fmt(m1?.[r.key] ?? 0)}</span>
    ) },
    { key: 'b', header: 'New (B)', num: true, sortable: false, render: (r) => (
      <span className="oui-mono" style={r.color ? { color: r.color } : undefined}>{r.fmt(m2?.[r.key] ?? 0)}</span>
    ) },
    { key: 'delta', header: 'Δ', num: true, sortable: false, render: (r) => (
      <DeltaIndicator current={m2?.[r.key] ?? 0} previous={m1?.[r.key] ?? 0} invert={r.invert} />
    ) },
  ]

  const bothLoaded = trace1 && trace2

  const renderSelector = (label, id, value, setValue, loading, error, fetchFn, trace, listId) => (
    <Panel
      title={label}
      icon={<FiShuffle />}
      actions={<span className="oui-text-muted" style={{ fontSize: 'var(--text-2xs)' }}>GET /api/traces/{'{id}'}/full</span>}
    >
      <div className="oui-row" style={{ gap: 'var(--space-2)' }}>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter trace ID"
          list={listId}
          className="opa-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <datalist id={listId}>
          {recentTraces.map((t, idx) => (
            <option key={idx} value={t.trace_id || t.id} />
          ))}
        </datalist>
        <button onClick={() => fetchFn()} disabled={loading || !value.trim()} className="opa-btn primary">
          {loading ? <><FiRefreshCw style={{ animation: 'spin 1s linear infinite' }} /> Loading</> : <><FiDownload /> Load</>}
        </button>
      </div>

      {error && <div style={{ marginTop: 'var(--space-3)' }}><ErrorState message={error} /></div>}

      {trace && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <EntityHeader
            title={value}
            subtitle={rootSpan(trace)?.service || 'unknown service'}
            badges={
              <>
                <StatusPill tone={isError(trace) ? 'error' : 'ok'}>{isError(trace) ? 'Error' : 'OK'}</StatusPill>
                <span className="opa-badge">{trace.spans?.length || 0} spans</span>
                <span className="opa-badge">{fmtMs(rootSpan(trace)?.duration_ms || 0)}</span>
              </>
            }
            actions={
              <div className="oui-row" style={{ gap: 'var(--space-2)' }}>
                <CopyToClipboard text={value} label="Copy ID" />
                <Link to={`/traces/${value}`} className="opa-btn ghost">View trace</Link>
              </div>
            }
          />
        </div>
      )}
    </Panel>
  )

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Compare</h1>
          <div className="opa-page-sub">
            {compareMode === 'cohort'
              ? 'Compare a transaction’s speed across runtimes, versions or services'
              : compareMode === 'callgraph'
                ? 'Population call-graph diff across two halves of the time range'
                : 'Side-by-side profile diff between two traces'}
          </div>
        </div>
        <div className="oui-row" style={{ gap: 'var(--space-2)' }}>
          <SegmentedControl
            options={[
              { value: 'trace', label: 'By trace' },
              { value: 'cohort', label: 'By cohort' },
              { value: 'callgraph', label: 'Call graph' },
            ]}
            value={compareMode}
            onChange={setCompareMode}
          />
          {compareMode === 'trace' && bothLoaded && <ShareButton />}
          <Link to="/traces" className="opa-btn ghost"><FiArrowLeft /> Back to Traces</Link>
        </div>
      </div>

      {compareMode === 'cohort' ? (
        <CohortCompare />
      ) : compareMode === 'callgraph' ? (
        <CallgraphWindowCompare />
      ) : (
      <>
      <div className="opa-grid cols-2">
        {renderSelector('Trace A · Baseline', 'trace1', trace1Id, setTrace1Id, loading1, error1, fetchTrace1, trace1, 'recent-traces-1')}
        {renderSelector('Trace B · New', 'trace2', trace2Id, setTrace2Id, loading2, error2, fetchTrace2, trace2, 'recent-traces-2')}
      </div>

      {bothLoaded ? (
        <>
          <Panel title="Metrics diff" icon={<FiGitBranch />} flush>
            <DataTable columns={diffColumns} rows={METRIC_ROWS} rowKey={(r) => r.key} />
          </Panel>

          <Panel
            title="Detailed comparison"
            icon={<FiShuffle />}
            actions={
              <SegmentedControl
                options={[
                  { value: 'diff', label: 'Difference' },
                  { value: 'side-by-side', label: 'Side by side' },
                ]}
                value={viewMode}
                onChange={setViewMode}
              />
            }
          >
            <ProfileComparison trace1={trace1} trace2={trace2} viewMode={viewMode} />
          </Panel>
        </>
      ) : (
        <Panel>
          <EmptyState
            icon={<FiShuffle />}
            title="Select two traces to compare"
            hint="Load a baseline and a new trace above to see the diff."
          />
          {recentTraces.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <div className="oui-text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)' }}>Recent traces</div>
              <div className="oui-row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {recentTraces.slice(0, 10).map((t, idx) => {
                  const traceId = t.trace_id || t.id
                  return (
                    <button
                      key={idx}
                      className="opa-btn ghost"
                      onClick={() => {
                        if (!trace1) {
                          setTrace1Id(traceId)
                          setTimeout(() => fetchTrace1(traceId), 0)
                        } else if (!trace2) {
                          setTrace2Id(traceId)
                          setTimeout(() => fetchTrace2(traceId), 0)
                        }
                      }}
                    >
                      <FiClock size={11} />
                      <span className="oui-mono">{String(traceId).substring(0, 16)}…</span>
                      <span className="oui-text-muted">{fmtMs(t.duration_ms || 0)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </Panel>
      )}
      </>
      )}
    </div>
  )
}
