import React, { useMemo, useState } from 'react'
import { FiGlobe, FiActivity, FiClock, FiAlertTriangle, FiHardDrive } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, DataTable, InlineBar, Badge, SegmentedControl,
} from '../components/ui'
import { fmtMs, fmtBytes, fmtNum, fmtPct, tierColor, latencyStatus, errorRateStatus } from '../theme/format'
import './ExternalHttp.css'

const SORTS = [
  { value: 'call_count', label: 'Calls' },
  { value: 'avg_duration', label: 'Avg latency' },
]

export default function ExternalHttp() {
  const [sort, setSort] = useState('call_count')
  const [service, setService] = useState('all')

  const q = useApi('/api/http-calls', { limit: 200, sort, order: 'desc' })
  const calls = q.data?.http_calls || []

  // Distinct services for the client-side scope filter.
  const services = useMemo(() => {
    const set = new Set(calls.map((c) => c?.service).filter(Boolean))
    return Array.from(set).sort()
  }, [calls])

  const rows = useMemo(
    () => (service === 'all' ? calls : calls.filter((c) => c?.service === service)),
    [calls, service],
  )

  // Aggregate KPIs over the (filtered) rows.
  const totals = useMemo(() => {
    return rows.reduce(
      (a, c) => {
        const n = c?.call_count || 0
        a.calls += n
        a.durWeighted += (c?.avg_duration || 0) * n
        a.errors += c?.error_count || 0
        a.sent += c?.total_bytes_sent || 0
        a.recv += c?.total_bytes_received || 0
        return a
      },
      { calls: 0, durWeighted: 0, errors: 0, sent: 0, recv: 0 },
    )
  }, [rows])

  const avgLatency = totals.calls ? totals.durWeighted / totals.calls : 0
  const errRate = totals.calls ? (totals.errors / totals.calls) * 100 : 0
  const bandwidth = totals.sent + totals.recv
  const maxCalls = Math.max(1, ...rows.map((r) => r?.call_count || 0))

  const columns = [
    { key: 'method', header: 'Method', width: 74, sortValue: (r) => r?.method || '', render: (r) => <Badge>{r?.method || '—'}</Badge> },
    {
      key: 'url', header: 'Endpoint', sortValue: (r) => r?.url || '',
      render: (r) => (
        <div className="exthttp-url opa-mono">
          <span className="exthttp-host" title={r?.url}>{r?.url || r?.request_uri || '—'}</span>
          {r?.request_uri && <span className="exthttp-path" title={r?.request_uri}>{r?.request_uri}</span>}
        </div>
      ),
    },
    { key: 'service', header: 'Service', sortValue: (r) => r?.service || '', render: (r) => <span className="opa-mono opa-muted">{r?.service || '—'}</span> },
    {
      key: 'call_count', header: 'Calls', num: true, sortValue: (r) => r?.call_count || 0,
      render: (r) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <InlineBar value={r?.call_count || 0} max={maxCalls} label={fmtNum(r?.call_count || 0)} color="var(--accent)" width={90} />
        </div>
      ),
    },
    { key: 'avg_duration', header: 'Avg', num: true, sortValue: (r) => r?.avg_duration || 0, render: (r) => <span style={{ color: `var(--${latencyStatus(r?.avg_duration)})` }}>{fmtMs(r?.avg_duration)}</span> },
    { key: 'max_duration', header: 'Max', num: true, sortValue: (r) => r?.max_duration || 0, render: (r) => <span style={{ color: `var(--${latencyStatus(r?.max_duration)})` }}>{fmtMs(r?.max_duration)}</span> },
    {
      key: 'error_rate', header: 'Errors', num: true, sortValue: (r) => r?.error_rate || 0,
      render: (r) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <InlineBar value={r?.error_rate || 0} max={100} label={fmtPct(r?.error_rate || 0)} color={`var(--${errorRateStatus(r?.error_rate || 0)})`} width={80} />
        </div>
      ),
    },
    {
      key: 'io', header: 'Bytes (out / in)', num: true, sortValue: (r) => (r?.total_bytes_sent || 0) + (r?.total_bytes_received || 0),
      render: (r) => (
        <span className="opa-mono">
          <span style={{ color: tierColor('http') }}>↑{fmtBytes(r?.total_bytes_sent)}</span>{' '}
          <span className="opa-muted">/</span>{' '}
          <span style={{ color: tierColor('app') }}>↓{fmtBytes(r?.total_bytes_received)}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">External Services</h1>
          <div className="opa-page-sub">
            Outbound HTTP calls across {services.length} service{services.length === 1 ? '' : 's'}
            {service !== 'all' ? ` · scoped to ${service}` : ''}
          </div>
        </div>
        <div className="opa-row">
          <select className="exthttp-select" value={service} onChange={(e) => setService(e.target.value)} aria-label="Service scope">
            <option value="all">All services</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Outbound calls" icon={<FiActivity size={12} />} value={fmtNum(totals.calls)} unit="calls" status="neutral" />
        <KpiTile label="Avg latency" icon={<FiClock size={12} />} value={fmtMs(avgLatency)} status={latencyStatus(avgLatency)} />
        <KpiTile label="Error rate" icon={<FiAlertTriangle size={12} />} value={fmtPct(errRate)} status={errorRateStatus(errRate)}
          footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>{fmtNum(totals.errors)} errors</span>} />
        <KpiTile label="Bandwidth" icon={<FiHardDrive size={12} />} value={fmtBytes(bandwidth)} status="neutral"
          footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>
            <span style={{ color: tierColor('http') }}>↑{fmtBytes(totals.sent)}</span> · <span style={{ color: tierColor('app') }}>↓{fmtBytes(totals.recv)}</span>
          </span>} />
      </div>

      <Panel title="External HTTP calls" icon={<FiGlobe />} flush
        loading={q.loading} error={q.error} empty={!q.loading && rows.length === 0}
        emptyText="No outbound HTTP calls in range"
        actions={
          <div className="opa-row" style={{ gap: 8 }}>
            <span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>sort</span>
            <SegmentedControl options={SORTS} value={sort} onChange={setSort} />
          </div>
        }>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r, i) => `${r?.method}|${r?.url}|${r?.service}|${i}`}
          initialSort={{ key: sort, dir: 'desc' }}
        />
      </Panel>
    </div>
  )
}
