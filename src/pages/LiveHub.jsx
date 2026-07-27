import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FiRadio, FiPause, FiPlay, FiActivity, FiDatabase, FiHardDrive, FiGlobe, FiShare2, FiCode } from 'react-icons/fi'
import { usePolling } from '../hooks/useApi'
import { Panel, DataTable, Tabs, StatusPill, HealthDot, Badge, InlineBar, SegmentedControl } from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtAgo, latencyStatus, errorRateStatus } from '../theme/format'

const TABS = [
  { value: 'traces', label: 'Traces', icon: <FiActivity size={13} />, path: '/api/traces', params: { limit: 25, sort: 'created_at', order: 'desc' }, key: 'traces' },
  { value: 'sql', label: 'SQL', icon: <FiDatabase size={13} />, path: '/api/sql/queries', params: { limit: 25 }, key: 'queries' },
  { value: 'redis', label: 'Redis', icon: <FiHardDrive size={13} />, path: '/api/redis/operations', params: { limit: 25 }, key: 'operations' },
  { value: 'http', label: 'HTTP', icon: <FiGlobe size={13} />, path: '/api/http-calls', params: { limit: 25 }, key: 'http_calls' },
  { value: 'dumps', label: 'Dumps', icon: <FiCode size={13} />, path: '/api/dumps', params: { limit: 100 }, key: 'dumps' },
  { value: 'map', label: 'Service Map', icon: <FiShare2 size={13} />, path: '/api/service-map', params: {}, key: 'edges' },
]

const INTERVALS = [
  { value: 2000, label: '2s' }, { value: 5000, label: '5s' }, { value: 15000, label: '15s' }, { value: 30000, label: '30s' },
]

export default function LiveHub() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Deep-link support: /live?tab=dumps (also how the legacy /live-dumps route lands here).
  const requested = searchParams.get('tab')
  const [tab, setTab] = useState(TABS.some((t) => t.value === requested) ? requested : 'traces')
  const [paused, setPaused] = useState(false)
  const [intervalMs, setIntervalMs] = useState(5000)
  const active = TABS.find((t) => t.value === tab)

  const { data, loading, error } = usePolling(active.path, intervalMs, active.params, { paused })
  const rows = (data?.[active.key]) || []

  // Drill a live row into the matching filtered Trace Explorer (or a detail view).
  const toTraces = (filter) => navigate('/traces?' + new URLSearchParams({ filter }).toString())
  const handleRowClick = (r) => {
    if (tab === 'traces' || tab === 'dumps') return navigate(`/traces/${r.trace_id}`)
    if (tab === 'sql') {
      if (r.fingerprint) return navigate(`/sql/${encodeURIComponent(r.fingerprint)}`)
      if (r.query_fingerprint) return toTraces(`query_fingerprint:"${r.query_fingerprint}"`)
      return
    }
    if (tab === 'http') {
      const url = r.url || r.request_uri
      if (url) return toTraces(`http.url:"${url}"`)
      return
    }
    if (tab === 'redis') {
      if (r.command) return toTraces(`redis.command:"${r.command}"`)
      return
    }
  }

  const columnsByTab = {
    traces: [
      { key: 'trace_id', header: 'Trace', mono: true, render: (r) => <span className="cell-strong opa-mono">{String(r.trace_id).slice(0, 16)}</span> },
      { key: 'service', header: 'Service', render: (r) => <span className="opa-row"><HealthDot tone={r.status === 'error' ? 'error' : 'ok'} />{r.service}</span> },
      { key: 'duration_ms', header: 'Duration', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span> },
      { key: 'span_count', header: 'Spans', num: true },
      { key: 'status', header: 'Status', render: (r) => <StatusPill tone={r.status === 'error' ? 'error' : 'ok'}>{r.status || 'ok'}</StatusPill> },
      { key: 'created_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.created_at)}</span> },
    ],
    sql: [
      { key: 'fingerprint', header: 'Query', render: (r) => <span className="opa-mono" style={{ color: 'var(--tier-db)', display: 'block', maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fingerprint}</span> },
      { key: 'execution_count', header: 'Calls', num: true, render: (r) => fmtNum(r.execution_count) },
      { key: 'avg_duration', header: 'Avg', num: true, render: (r) => fmtMs(r.avg_duration) },
      { key: 'p95_duration', header: 'p95', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.p95_duration)})` }}>{fmtMs(r.p95_duration)}</span> },
      { key: 'last_created_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.last_created_at)}</span> },
    ],
    redis: [
      { key: 'command', header: 'Cmd', render: (r) => <Badge>{r.command}</Badge> },
      { key: 'key', header: 'Key', mono: true, render: (r) => <span className="opa-mono">{r.key || '—'}</span> },
      { key: 'execution_count', header: 'Calls', num: true, render: (r) => fmtNum(r.execution_count) },
      { key: 'avg_duration', header: 'Avg', num: true, render: (r) => fmtMs(r.avg_duration) },
      { key: 'hit', header: 'Hit rate', num: true, sortValue: (r) => (r.hit_count / Math.max(1, r.hit_count + r.miss_count)), render: (r) => {
        const tot = (r.hit_count || 0) + (r.miss_count || 0); const hr = tot ? (r.hit_count / tot) * 100 : 0
        return <span style={{ color: hr >= 90 ? 'var(--ok)' : hr >= 70 ? 'var(--warn)' : 'var(--error)' }}>{fmtPct(hr, 0)}</span>
      } },
    ],
    http: [
      { key: 'method', header: 'Method', render: (r) => <Badge>{r.method}</Badge> },
      { key: 'url', header: 'URL', render: (r) => <span className="opa-mono" style={{ display: 'block', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url || r.request_uri}</span> },
      { key: 'call_count', header: 'Calls', num: true, render: (r) => fmtNum(r.call_count) },
      { key: 'avg_duration', header: 'Avg', num: true, render: (r) => fmtMs(r.avg_duration) },
      { key: 'error_rate', header: 'Err %', num: true, render: (r) => <span style={{ color: `var(--${errorRateStatus(r.error_rate)})` }}>{fmtPct(r.error_rate)}</span> },
    ],
    dumps: [
      { key: 'span_start_ts', header: 'When', num: true, width: 90, render: (r) => <span className="opa-muted">{fmtAgo(r.span_start_ts)}</span> },
      { key: 'service', header: 'Service', render: (r) => <span className="opa-row"><HealthDot tone="neutral" />{r.service}</span> },
      { key: 'span_name', header: 'Span', render: (r) => <span className="opa-muted">{r.span_name || '—'}</span> },
      { key: 'location', header: 'Location', sortable: false, render: (r) => <span className="opa-muted opa-mono">{r.file ? `${String(r.file).split('/').pop()}${r.line ? ':' + r.line : ''}` : '—'}</span> },
      { key: 'dump', header: 'Dump', sortable: false, render: (r) => {
        const preview = r.text || (r.data != null ? (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)) : '')
        return <span className="opa-mono" style={{ display: 'block', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tier-app)' }}>{preview || '—'}</span>
      } },
    ],
    map: [
      { key: 'from', header: 'From → To', render: (r) => <span className="opa-mono">{r.from} <span className="opa-muted">→</span> {r.dependency_target || r.to}</span> },
      { key: 'host', header: 'Host:Port', render: (r) => <span className="opa-muted opa-mono">{r.host ? `${r.host}${r.port ? ':' + r.port : ''}` : '—'}</span> },
      { key: 'call_count', header: 'Calls', num: true, render: (r) => fmtNum(r.call_count) },
      { key: 'p95_latency_ms', header: 'p95', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.p95_latency_ms)})` }}>{fmtMs(r.p95_latency_ms)}</span> },
      { key: 'error_rate', header: 'Err %', num: true, render: (r) => <span style={{ color: `var(--${errorRateStatus(r.error_rate)})` }}>{fmtPct(r.error_rate)}</span> },
    ],
  }

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title"><span className="opa-row"><HealthDot tone="ok" pulse={!paused} /> Live</span></h1>
          <div className="opa-page-sub">Streaming activity · one refresh engine across all tabs</div>
        </div>
        <div className="opa-row">
          <SegmentedControl options={INTERVALS} value={intervalMs} onChange={setIntervalMs} />
          <button className="opa-btn" onClick={() => setPaused((p) => !p)}>
            {paused ? <><FiPlay size={13} /> Resume</> : <><FiPause size={13} /> Pause</>}
          </button>
        </div>
      </div>

      <Tabs tabs={TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} value={tab} onChange={setTab} />

      <Panel
        title={active.label}
        icon={<FiRadio />}
        flush
        loading={loading && rows.length === 0}
        error={error}
        empty={!loading && rows.length === 0}
        emptyText="No recent activity in this stream"
        actions={<span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>{paused ? 'paused' : `refreshing every ${intervalMs / 1000}s`} · {rows.length} rows</span>}
      >
        <DataTable
          columns={columnsByTab[tab]}
          rows={rows}
          rowKey={(r, i) => r.id || r.trace_id || `${r.fingerprint || r.command || r.url || r.from}-${i}`}
          onRowClick={tab === 'map' ? undefined : handleRowClick}
        />
      </Panel>
    </div>
  )
}
