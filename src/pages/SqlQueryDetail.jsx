import React from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  FiDatabase, FiActivity, FiClock, FiZap, FiTrendingUp, FiArrowLeft, FiCode, FiBarChart2, FiGitBranch,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, TimeSeriesChart, EntityHeader, EmptyState, DataTable,
} from '../components/ui'
import { fmtMs, fmtNum, fmtAgo, latencyStatus, statusColor } from '../theme/format'
import './SqlQueryDetail.css'

export default function SqlQueryDetail() {
  const { fingerprint: rawFingerprint } = useParams()
  const navigate = useNavigate()
  const fingerprint = decodeURIComponent(rawFingerprint || '')

  const q = useApi(
    `/api/sql/queries/${encodeURIComponent(fingerprint)}`,
    {},
    { noRange: true },
  )

  // Sample traces that ran this exact query fingerprint — the drill from
  // "this query costs X" to "here are the traces behind it".
  const t = useApi('/api/traces', { filter: `query_fingerprint:"${fingerprint}"`, limit: 25 })
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
      render: (r) => <span style={{ color: statusColor(latencyStatus(r.duration_ms)) }}>{fmtMs(r.duration_ms)}</span>,
    },
    {
      key: 'created_at', header: 'When', num: true,
      render: (r) => <span className="oui-text-muted">{fmtAgo(r.created_at)}</span>,
      sortValue: (r) => Date.parse(r.created_at) || 0,
    },
  ]

  const d = q.data || {}
  const example = d.example_query || fingerprint || ''
  const trends = (d.performance_trends || []).map((t) => ({
    time: (t.time || '').slice(11, 16),
    avg_duration: t.avg_duration,
    p95_duration: t.p95_duration,
  }))
  const hasTrends = trends.length > 0

  return (
    <div className="oui-stack">
      <EntityHeader
        title={fingerprint || '—'}
        mono
        subtitle="SQL query cost"
        badges={<span className="opa-sqlq-tier">SQL</span>}
        meta={
          <Link to="/sql" className="opa-sqlq-back">
            <FiArrowLeft size={12} /> back to Databases
          </Link>
        }
      />

      {/* Cost KPIs */}
      <div className="oui-grid is-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <KpiTile
          label="Executions" icon={<FiActivity size={12} />}
          value={fmtNum(d.total_executions || 0)} unit="runs" status="neutral"
        />
        <KpiTile
          label="Avg duration" icon={<FiClock size={12} />}
          value={fmtMs(d.avg_duration)} status={latencyStatus(d.avg_duration)}
        />
        <KpiTile
          label="p95 duration" icon={<FiZap size={12} />}
          value={fmtMs(d.p95_duration)} status={latencyStatus(d.p95_duration)}
        />
        <KpiTile
          label="p99 duration" icon={<FiTrendingUp size={12} />}
          value={fmtMs(d.p99_duration)} status={latencyStatus(d.p99_duration)}
        />
        <KpiTile
          label="Max duration" icon={<FiBarChart2 size={12} />}
          value={fmtMs(d.max_duration)} status={latencyStatus(d.max_duration)}
        />
      </div>

      {/* Example query */}
      <Panel title="Example query" icon={<FiCode />} loading={q.loading} error={q.error}
        empty={!q.loading && !example} emptyText="No example query recorded">
        <pre className="opa-sqlq-code">{example}</pre>
      </Panel>

      {/* Performance trend */}
      <Panel title="Performance trend" icon={<FiDatabase />} loading={q.loading} error={q.error}>
        {hasTrends ? (
          <TimeSeriesChart
            data={trends}
            xKey="time"
            series={[
              { key: 'avg_duration', name: 'Avg', color: 'var(--chart-1)', type: 'line' },
              { key: 'p95_duration', name: 'p95', color: 'var(--chart-2)', type: 'line' },
            ]}
            valueFmt={fmtMs}
            yFmt={fmtMs}
            height={260}
          />
        ) : (
          <EmptyState
            icon={<FiBarChart2 />}
            title="No trend data"
            hint="No performance samples were recorded for this query in the selected window."
          />
        )}
      </Panel>

      {/* Sample traces — the traces behind this query fingerprint */}
      <Panel
        title="Sample traces" icon={<FiGitBranch />} flush
        loading={t.loading} error={t.error}
        empty={!t.loading && traces.length === 0}
        emptyText="No sample traces recorded for this query"
      >
        <DataTable
          loading={t.loading}
          error={t.error}
          onRetry={t.reload}
          columns={traceColumns}
          rows={traces}
          rowKey={(r) => r.trace_id}
          onRowClick={(r) => r.trace_id && navigate(`/traces/${encodeURIComponent(r.trace_id)}`)}
          emptyText="No sample traces recorded for this query"
        />
      </Panel>
    </div>
  )
}
