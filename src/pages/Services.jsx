import React from 'react'
import { useNavigate } from 'react-router-dom'
import { FiActivity, FiClock, FiAlertTriangle, FiZap, FiServer } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, DataTable, TimeSeriesChart, InlineBar, HealthDot, LanguageBadge,
} from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtBytes, latencyStatus, errorRateStatus, statusColor } from '../theme/format'

/** Service inventory + golden signals (canonical home; formerly also labeled Overview). */
export default function Services() {
  const navigate = useNavigate()
  // (No /api/stats call here: its result was never read, so it was a wasted
  // request on every load — the KPIs come from /api/services.)
  const services = useApi('/api/services')
  const perf = useApi('/api/metrics/performance')

  const g = services.data?.global_totals || {}
  const svc = services.data?.services || []
  const metrics = (perf.data?.metrics || []).map((m) => {
    const raw = m.time || ''
    const timeMs = /^\d{4}-\d{2}-\d{2}/.test(raw)
      ? Date.parse(raw.replace(' ', 'T') + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? '' : 'Z'))
      : 0
    return {
      time: raw.slice(5, 16),
      timeMs: Number.isFinite(timeMs) ? timeMs : 0,
      throughput: m.throughput, error_rate: m.error_rate,
      p50: m.p50_duration, p95: m.p95_duration, p99: m.p99_duration,
    }
  })

  const spark = (k) => metrics.map((m) => m[k])
  const firstLast = (k) => { const a = metrics.filter((m) => m[k] != null); return a.length ? [a[0][k], a[a.length - 1][k]] : [null, null] }
  const [tpPrev, tpCur] = firstLast('throughput')
  const [p95Prev, p95Cur] = firstLast('p95')
  const [erPrev, erCur] = firstLast('error_rate')

  const errRate = g.total_spans ? (g.error_count / g.total_spans) * 100 : 0
  const maxTp = Math.max(1, ...svc.map((s) => s.total_traces || 0))

  const svcColumns = [
    { key: 'service', header: 'Service', render: (r) => (
      <div className="oui-row">
        <HealthDot tone={errorRateStatus(r.error_rate)} title={`${fmtPct(r.error_rate)} errors`} />
        <span className="cell-strong oui-mono">{r.service}</span>
        {r.language && <LanguageBadge language={r.language} version={r.language_version} />}
      </div>
    ), sortValue: (r) => r.service },
    { key: 'total_traces', header: 'Throughput', num: true, render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><InlineBar value={r.total_traces} max={maxTp} label={fmtNum(r.total_traces)} color="var(--accent)" width={90} /></div>
    ) },
    { key: 'avg_duration', header: 'Avg', num: true, render: (r) => fmtMs(r.avg_duration) },
    { key: 'p95_duration', header: 'p95', num: true, render: (r) => <span style={{ color: statusColor(latencyStatus(r.p95_duration)) }}>{fmtMs(r.p95_duration)}</span> },
    { key: 'error_rate', header: 'Error %', num: true, render: (r) => <span style={{ color: statusColor(errorRateStatus(r.error_rate)) }}>{fmtPct(r.error_rate)}</span> },
    { key: 'sql_query_count', header: 'SQL', num: true, render: (r) => fmtNum(r.sql_query_count) },
    { key: 'total_cpu_ms', header: 'CPU', num: true, render: (r) => fmtMs(r.total_cpu_ms) },
    { key: 'io', header: 'I/O (out / in)', num: true, sortValue: (r) => (r.total_bytes_sent || 0) + (r.total_bytes_received || 0), render: (r) => (
      <span className="oui-mono"><span style={{ color: 'var(--chart-1)' }}>↑{fmtBytes(r.total_bytes_sent)}</span> <span className="oui-text-muted">/</span> <span style={{ color: 'var(--chart-2)' }}>↓{fmtBytes(r.total_bytes_received)}</span></span>
    ) },
  ]

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Service</h1>
          <div className="opa-page-sub">Golden signals across {svc.length} service{svc.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {/* Golden signal KPIs */}
      <div className="opa-grid cols-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <KpiTile label="Throughput" icon={<FiActivity size={12} />} value={fmtNum(g.total_traces || 0)} unit="traces" status="neutral"
          spark={spark('throughput')} sparkColor="var(--accent)" current={tpCur} previous={tpPrev} />
        <KpiTile label="Avg response" icon={<FiClock size={12} />} value={fmtMs(g.avg_duration)} status={latencyStatus(g.avg_duration)} />
        <KpiTile label="p95 response" icon={<FiZap size={12} />} value={fmtMs(p95Cur ?? g.avg_duration)} status={latencyStatus(p95Cur)}
          spark={spark('p95')} sparkColor="var(--warn-text)" current={p95Cur} previous={p95Prev} invert />
        <KpiTile label="Error rate" icon={<FiAlertTriangle size={12} />} value={fmtPct(errRate)} status={errorRateStatus(errRate)}
          spark={spark('error_rate')} sparkColor="var(--critical-text)" current={erCur} previous={erPrev} invert />
        <KpiTile label="Spans" icon={<FiServer size={12} />} value={fmtNum(g.total_spans || 0)} status="neutral"
          footer={<span className="oui-text-muted" style={{ fontSize: 'var(--text-2xs)' }}>{fmtNum(g.total_sql_queries)} SQL · {fmtNum(g.total_http_requests)} HTTP</span>} />
      </div>

      {/* Charts */}
      <div className="opa-grid cols-2">
        <Panel title="Throughput & errors" icon={<FiActivity />} loading={perf.loading} error={perf.error} empty={!perf.loading && metrics.length === 0}>
          <TimeSeriesChart brushZoom data={metrics} series={[
            { key: 'throughput', name: 'Throughput', color: 'var(--accent)', type: 'bar' },
            { key: 'error_rate', name: 'Error %', color: 'var(--critical-text)', type: 'line' },
          ]} valueFmt={(v) => fmtNum(v)} height={230} />
        </Panel>
        <Panel title="Response time percentiles" icon={<FiClock />} loading={perf.loading} error={perf.error} empty={!perf.loading && metrics.length === 0}>
          <TimeSeriesChart brushZoom data={metrics} series={[
            { key: 'p50', name: 'p50', color: 'var(--chart-1)', type: 'line' },
            { key: 'p95', name: 'p95', color: 'var(--chart-2)', type: 'line' },
            { key: 'p99', name: 'p99', color: 'var(--chart-3)', type: 'line' },
          ]} valueFmt={fmtMs} yFmt={fmtMs} height={230} />
        </Panel>
      </div>

      {/* Services table */}
      <Panel title="Services" icon={<FiServer />} flush loading={services.loading} error={services.error} empty={!services.loading && svc.length === 0}
        actions={<span className="oui-text-muted" style={{ fontSize: 'var(--text-xs)' }}>click a row to drill in</span>}>
        <DataTable
          columns={svcColumns} rows={svc} rowKey={(r) => r.service}
          initialSort={{ key: 'total_traces', dir: 'desc' }}
          onRowClick={(r) => navigate(`/services/${encodeURIComponent(r.service)}`)}
        />
      </Panel>
    </div>
  )
}
