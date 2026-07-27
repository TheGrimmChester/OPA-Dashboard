import React from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { FiGitBranch, FiArrowLeft, FiActivity, FiClock, FiAlertTriangle, FiHardDrive, FiExternalLink } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill } from '../components/ui'
import { fmtMs, fmtBytes, fmtNum, fmtPct, fmtAgo, latencyStatus, errorRateStatus, tierColor } from '../theme/format'
import './SqlQueryDetail.css'

export default function HttpEndpointDetail() {
  const { endpoint: rawEndpoint } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const endpoint = decodeURIComponent(rawEndpoint || '')

  // Aggregate stats for this endpoint, handed over from the External HTTP list
  // via router state (accurate rollups over the full range — not the 25-row
  // sample below). Absent on a direct/bookmarked load; the page still works.
  const agg = location.state?.agg || null

  // A param shaped like "GET /path" filters by route path; a bare value is a
  // full URL. Wrap DSL values in double quotes to tolerate spaces/slashes.
  const m = endpoint.match(/^([A-Z]+)\s+(\/.*)$/)
  const method = m ? m[1] : (agg?.method || '')

  // The External-HTTP list mixes outbound calls (recorded in the http[] array,
  // matched by http.url) and inbound web requests (recorded as the span's
  // url_path). When we have the aggregate row, OR both so the sample traces
  // resolve regardless of direction; otherwise derive from the URL param.
  let filter
  if (agg) {
    const parts = []
    if (agg.url) parts.push(`http.url:"${agg.url}"`)
    const path = String(agg.request_uri || agg.uri || '').split('?')[0]
    if (path) parts.push(`url_path:"${path}"`)
    filter = parts.join(' OR ')
  }
  if (!filter) filter = m ? `url_path:"${m[2]}"` : `http.url:"${endpoint}"`

  // Sample traces that hit this endpoint — the drill from a listed endpoint to
  // the individual traces behind it.
  const t = useApi('/api/traces', { filter, limit: 25 })
  const traces = t.data?.traces || []

  const traceColumns = [
    {
      key: 'trace_id', header: 'Trace', width: 130, mono: true,
      render: (r) => String(r.trace_id || '').slice(0, 16),
      sortValue: (r) => r.trace_id,
    },
    { key: 'service', header: 'Service', render: (r) => r.service || '—', sortValue: (r) => r.service },
    {
      key: 'duration_ms', header: 'Duration', num: true,
      render: (r) => <span style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span>,
    },
    {
      key: 'status', header: 'Status', align: 'center',
      render: (r) => {
        const s = String(r.status || '').toLowerCase()
        return <StatusPill tone={s === 'error' ? 'error' : s === 'ok' ? 'ok' : 'neutral'}>{r.status || 'unknown'}</StatusPill>
      },
      sortValue: (r) => r.status,
    },
    {
      key: 'created_at', header: 'When', num: true,
      render: (r) => <span className="opa-muted">{fmtAgo(r.created_at)}</span>,
      sortValue: (r) => Date.parse(r.created_at) || 0,
    },
  ]

  const bandwidth = agg ? (agg.total_bytes_sent || 0) + (agg.total_bytes_received || 0) : 0

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="opa-page-title opa-mono" style={{ wordBreak: 'break-word' }}>
            {method && <StatusPill tone="neutral">{method}</StatusPill>}{' '}
            {endpoint || '—'}
          </h1>
          <div className="opa-page-sub">HTTP endpoint{agg?.service ? ` · ${agg.service}` : ''}</div>
        </div>
        <div className="opa-entity-meta opa-row" style={{ gap: 'var(--sp-3)' }}>
          <button
            className="opa-btn"
            onClick={() => navigate('/traces?' + new URLSearchParams({ filter }).toString())}
            title="Open every matching trace in the Trace Explorer"
          >
            <FiExternalLink size={12} /> View all matching traces
          </button>
          <Link to="/http" className="opa-sqlq-back">
            <FiArrowLeft size={12} /> back to External HTTP
          </Link>
        </div>
      </div>

      {/* Aggregate KPIs (from the list row) — accurate rollups over the range. */}
      {agg && (
        <div className="opa-grid cols-4">
          <KpiTile label="Calls" icon={<FiActivity size={12} />} value={fmtNum(agg.call_count)} unit="calls" status="neutral" />
          <KpiTile label="Avg latency" icon={<FiClock size={12} />} value={fmtMs(agg.avg_duration)} status={latencyStatus(agg.avg_duration)}
            footer={agg.max_duration != null && <span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>max {fmtMs(agg.max_duration)}</span>} />
          <KpiTile label="Error rate" icon={<FiAlertTriangle size={12} />} value={fmtPct(agg.error_rate || 0)} status={errorRateStatus(agg.error_rate || 0)}
            footer={agg.error_count != null && <span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>{fmtNum(agg.error_count)} errors</span>} />
          <KpiTile label="Bandwidth" icon={<FiHardDrive size={12} />} value={fmtBytes(bandwidth)} status="neutral"
            footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>
              <span style={{ color: tierColor('http') }}>↑{fmtBytes(agg.total_bytes_sent)}</span> · <span style={{ color: tierColor('app') }}>↓{fmtBytes(agg.total_bytes_received)}</span>
            </span>} />
        </div>
      )}

      {/* Sample traces — the traces behind this endpoint */}
      <Panel
        title="Sample traces" icon={<FiGitBranch />} flush
        loading={t.loading} error={t.error}
        empty={!t.loading && traces.length === 0}
        emptyText="No sample traces recorded for this endpoint"
        actions={traces.length > 0 && (
          <span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>showing {traces.length} most recent</span>
        )}
      >
        <DataTable
          columns={traceColumns}
          rows={traces}
          rowKey={(r) => r.trace_id}
          onRowClick={(r) => r.trace_id && navigate(`/traces/${encodeURIComponent(r.trace_id)}`)}
          emptyText="No sample traces recorded for this endpoint"
        />
      </Panel>
    </div>
  )
}
