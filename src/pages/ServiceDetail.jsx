import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FiActivity, FiClock, FiZap, FiAlertTriangle, FiTrendingUp, FiGlobe, FiList,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, DataTable, TimeSeriesChart, InlineBar, EntityHeader,
  Badge, HealthDot, LanguageBadge,
} from '../components/ui'
import {
  fmtMs, fmtNum, fmtPct, fmtBytes, tierColor, latencyStatus, errorRateStatus,
} from '../theme/format'
import './ServiceDetail.css'

export default function ServiceDetail() {
  const { serviceName } = useParams()
  const navigate = useNavigate()
  const svc = serviceName || ''
  const enc = encodeURIComponent(svc)

  const stats = useApi(`/api/services/${enc}/stats`)
  const http = useApi(`/api/services/${enc}/http-calls`)
  const perf = useApi('/api/metrics/performance')
  // Service list only used to resolve language/framework metadata for the header.
  const services = useApi('/api/services', {}, { noRange: true })

  const s = stats.data || {}
  const meta = (services.data?.services || []).find((x) => x.service === svc) || {}

  const errorRate = s.error_rate ?? 0
  const endpoints = s.top_endpoints || []
  const httpCalls = http.data?.http_calls || []
  const totalCalls = http.data?.total_calls ?? httpCalls.length

  const metrics = (perf.data?.metrics || []).map((m) => ({
    time: (m.time || '').slice(5, 16),
    throughput: m.throughput,
    error_rate: m.error_rate,
    p50: m.p50_duration,
    p95: m.p95_duration,
    p99: m.p99_duration,
  }))
  const spark = (k) => metrics.map((m) => m[k])
  const firstLast = (k) => {
    const a = metrics.filter((m) => m[k] != null)
    return a.length ? [a[0][k], a[a.length - 1][k]] : [null, null]
  }
  const [tpPrev, tpCur] = firstLast('throughput')
  const [p95Prev, p95Cur] = firstLast('p95')
  const [erPrev, erCur] = firstLast('error_rate')

  const maxEpCount = Math.max(1, ...endpoints.map((e) => e.count || 0))
  const maxBytesOut = Math.max(1, ...httpCalls.map((c) => c.total_bytes_sent || 0))
  const maxBytesIn = Math.max(1, ...httpCalls.map((c) => c.total_bytes_received || 0))

  const badges = []
  if (meta.language) badges.push(<LanguageBadge key="lang" language={meta.language} version={meta.language_version} />)
  if (meta.framework) badges.push(<Badge key="fw">{meta.framework}{meta.framework_version ? ` ${meta.framework_version}` : ''}</Badge>)

  // ---- Endpoints table ----
  const epColumns = [
    { key: 'name', header: 'Endpoint', mono: true, render: (r) => (
      <div className="opa-row" style={{ gap: 'var(--sp-2)' }}>
        <HealthDot tone={errorRateStatus(r.count ? ((r.error_count || 0) / r.count) * 100 : 0)} />
        <span className="cell-strong opa-mono">{r.name || '—'}</span>
      </div>
    ), sortValue: (r) => r.name || '' },
    { key: 'count', header: 'Count', num: true, render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <InlineBar value={r.count || 0} max={maxEpCount} label={fmtNum(r.count || 0)} color="var(--accent)" width={80} />
      </div>
    ) },
    { key: 'avg_duration', header: 'Avg', num: true, render: (r) => fmtMs(r.avg_duration) },
    { key: 'p95_duration', header: 'p95', num: true, render: (r) => (
      r.p95_duration != null
        ? <span style={{ color: `var(--${latencyStatus(r.p95_duration)})` }}>{fmtMs(r.p95_duration)}</span>
        : <span className="opa-muted">—</span>
    ) },
    { key: 'error', header: 'Errors', num: true, sortValue: (r) => (r.count ? (r.error_count || 0) / r.count : 0), render: (r) => {
      const rate = r.count ? ((r.error_count || 0) / r.count) * 100 : 0
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <InlineBar value={rate} max={100} label={fmtPct(rate)} color={`var(--${errorRateStatus(rate)})`} width={80} />
        </div>
      )
    } },
  ]

  // ---- Outbound HTTP calls table ----
  const xferCell = (value, max, tier, arrow) => (
    <div className="opa-xfer-row">
      <span className="opa-xfer-val" style={{ color: tierColor(tier) }}>{arrow}{fmtBytes(value)}</span>
      <span className="opa-xfer-track">
        <span className="opa-xfer-fill" style={{ width: `${Math.min(100, ((value || 0) / max) * 100)}%`, background: tierColor(tier) }} />
      </span>
    </div>
  )

  const httpColumns = [
    { key: 'url', header: 'URL', mono: true, render: (r) => (
      <div className="opa-row" style={{ gap: 'var(--sp-2)' }}>
        <HealthDot tone={errorRateStatus(r.error_rate)} />
        <span className="cell-strong opa-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.url || '—'}</span>
      </div>
    ), sortValue: (r) => r.url || '' },
    { key: 'method', header: 'Method', render: (r) => <Badge>{r.method || 'GET'}</Badge>, sortValue: (r) => r.method || '' },
    { key: 'call_count', header: 'Calls', num: true, render: (r) => fmtNum(r.call_count) },
    { key: 'avg_duration', header: 'Avg', num: true, render: (r) => fmtMs(r.avg_duration) },
    { key: 'max_duration', header: 'Max', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.max_duration)})` }}>{fmtMs(r.max_duration)}</span> },
    { key: 'error_rate', header: 'Error %', num: true, render: (r) => <span style={{ color: `var(--${errorRateStatus(r.error_rate)})` }}>{fmtPct(r.error_rate)}</span> },
    { key: 'bytes_out', header: 'Sent', num: true, sortValue: (r) => r.total_bytes_sent || 0, render: (r) => xferCell(r.total_bytes_sent, maxBytesOut, 'app', '↑') },
    { key: 'bytes_in', header: 'Received', num: true, sortValue: (r) => r.total_bytes_received || 0, render: (r) => xferCell(r.total_bytes_received, maxBytesIn, 'db', '↓') },
  ]

  return (
    <div className="opa-stack">
      <EntityHeader
        title={svc}
        subtitle="Service summary"
        badges={
          <>
            <HealthDot tone={errorRateStatus(errorRate)} pulse={errorRateStatus(errorRate) === 'error'} title={`${fmtPct(errorRate)} error rate`} />
            {badges}
          </>
        }
        meta={
          <span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>
            {fmtNum(s.total_traces || 0)} traces · {fmtNum(s.total_spans || 0)} spans
          </span>
        }
      />

      {/* Golden signals */}
      <div className="opa-grid cols-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <KpiTile label="Throughput" icon={<FiActivity size={12} />} value={fmtNum(s.total_traces || 0)} unit="traces" status="neutral"
          spark={spark('throughput')} sparkColor="var(--accent)" current={tpCur} previous={tpPrev} />
        <KpiTile label="Avg response" icon={<FiClock size={12} />} value={fmtMs(s.avg_duration)} status={latencyStatus(s.avg_duration)} />
        <KpiTile label="p95 response" icon={<FiZap size={12} />} value={fmtMs(s.p95_duration)} status={latencyStatus(s.p95_duration)}
          spark={spark('p95')} sparkColor="var(--warn)" current={p95Cur} previous={p95Prev} invert />
        <KpiTile label="p99 response" icon={<FiTrendingUp size={12} />} value={fmtMs(s.p99_duration)} status={latencyStatus(s.p99_duration)}
          footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>p50 {fmtMs(s.p50_duration)}</span>} />
        <KpiTile label="Error rate" icon={<FiAlertTriangle size={12} />} value={fmtPct(errorRate)} status={errorRateStatus(errorRate)}
          spark={spark('error_rate')} sparkColor="var(--error)" current={erCur} previous={erPrev} invert
          footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>{fmtNum(s.error_count || 0)} errors</span>} />
      </div>

      {/* Charts */}
      <div className="opa-grid cols-2">
        <Panel title="Response time percentiles" icon={<FiClock />} loading={perf.loading} error={perf.error} empty={!perf.loading && metrics.length === 0}>
          <TimeSeriesChart data={metrics} series={[
            { key: 'p50', name: 'p50', color: 'var(--p50)', type: 'line' },
            { key: 'p95', name: 'p95', color: 'var(--p95)', type: 'line' },
            { key: 'p99', name: 'p99', color: 'var(--p99)', type: 'line' },
          ]} valueFmt={fmtMs} yFmt={fmtMs} height={230} />
        </Panel>
        <Panel title="Throughput & errors" icon={<FiActivity />} loading={perf.loading} error={perf.error} empty={!perf.loading && metrics.length === 0}>
          <TimeSeriesChart data={metrics} series={[
            { key: 'throughput', name: 'Throughput', color: 'var(--accent)', type: 'bar' },
            { key: 'error_rate', name: 'Error %', color: 'var(--error)', type: 'line' },
          ]} valueFmt={(v) => fmtNum(v)} height={230} />
        </Panel>
      </div>

      {/* Top endpoints */}
      <Panel title="Top endpoints" icon={<FiList />} flush loading={stats.loading} error={stats.error}
        empty={!stats.loading && endpoints.length === 0} emptyText="No endpoint data for this service">
        <DataTable
          columns={epColumns} rows={endpoints} rowKey={(r, i) => r.name || i}
          initialSort={{ key: 'count', dir: 'desc' }}
        />
      </Panel>

      {/* Outbound HTTP calls */}
      <Panel title="Outbound HTTP calls" icon={<FiGlobe />} flush loading={http.loading} error={http.error}
        empty={!http.loading && httpCalls.length === 0} emptyText="No outbound HTTP calls recorded"
        actions={<span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>{fmtNum(totalCalls)} call{totalCalls === 1 ? '' : 's'}</span>}>
        <DataTable
          columns={httpColumns} rows={httpCalls} rowKey={(r, i) => `${r.method || ''}-${r.url || i}`}
          initialSort={{ key: 'call_count', dir: 'desc' }}
        />
      </Panel>
    </div>
  )
}
