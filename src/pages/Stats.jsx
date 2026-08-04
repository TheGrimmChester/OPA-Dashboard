import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiActivity, FiAlertCircle, FiClock, FiTrendingUp, FiServer, FiDatabase,
  FiHardDrive, FiInbox, FiLayers,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, DataTable, InlineBar, StatusPill, HealthDot,
} from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtBytes, statusColor, latencyStatus, errorRateStatus } from '../theme/format'

export default function Stats() {
  const navigate = useNavigate()
  const stats = useApi('/api/stats')
  const health = useApi('/api/health')

  const agent = stats.data?.agent || {}
  const db = stats.data?.database || {}
  const traces = stats.data?.traces || {}
  const tables = db.tables || []
  const byService = traces.by_service || []

  const maxSize = Math.max(1, ...tables.map((t) => t.size_bytes || 0))

  // Health chip: derive a tone from the /api/health payload.
  const rawStatus = health.data?.status ?? health.data?.health ?? (health.data ? 'healthy' : null)
  const healthColor = statusColor(rawStatus)
  const healthTone = healthColor === 'var(--good-text)' ? 'ok'
    : healthColor === 'var(--warn-text)' ? 'warn'
      : healthColor === 'var(--critical-text)' ? 'error' : 'neutral'
  const healthLabel = health.loading ? 'checking…'
    : health.error ? 'unreachable'
      : (rawStatus ? String(rawStatus) : 'unknown')

  const tableColumns = [
    { key: 'name', header: 'Table', render: (r) => (
      <div className="oui-row">
        <FiDatabase size={13} style={{ color: 'var(--chart-2)' }} />
        <span className="oui-mono">{r.name}</span>
      </div>
    ), sortValue: (r) => r.name },
    { key: 'rows', header: 'Rows', num: true, render: (r) => fmtNum(r.rows) },
    { key: 'size_bytes', header: 'Size', num: true, sortValue: (r) => r.size_bytes || 0, render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <InlineBar value={r.size_bytes || 0} max={maxSize} label={r.size_readable || fmtBytes(r.size_bytes)} color="var(--chart-2)" width={120} />
      </div>
    ) },
  ]

  const svcColumns = [
    { key: 'service', header: 'Service', render: (r) => (
      <div className="oui-row">
        <HealthDot tone={errorRateStatus(r.error_rate)} title={`${fmtPct(r.error_rate)} errors`} />
        <span className="cell-strong oui-mono">{r.service}</span>
      </div>
    ), sortValue: (r) => r.service },
    { key: 'traces', header: 'Traces', num: true, render: (r) => fmtNum(r.traces) },
    { key: 'spans', header: 'Spans', num: true, render: (r) => fmtNum(r.spans) },
    { key: 'error_rate', header: 'Error %', num: true, render: (r) => (
      <span style={{ color: statusColor(errorRateStatus(r.error_rate)) }}>{fmtPct(r.error_rate)}</span>
    ) },
  ]

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Statistics</h1>
          <div className="opa-page-sub">Agent, database, and trace health</div>
        </div>
        <div className="oui-row">
          <StatusPill tone={healthTone}>
            <HealthDot tone={healthTone} pulse={healthTone === 'ok'} />
            <span style={{ marginLeft: 6 }}>API {healthLabel}</span>
          </StatusPill>
        </div>
      </div>

      {/* Agent internals */}
      <Panel title="Agent" icon={<FiServer />} loading={stats.loading && !stats.data} error={stats.error}>
        <div className="opa-grid cols-3">
          <KpiTile label="Incoming messages" icon={<FiInbox size={12} />} value={fmtNum(agent.incoming_total || 0)} status="neutral" />
          <KpiTile label="Dropped messages" icon={<FiAlertCircle size={12} />} value={fmtNum(agent.dropped_total || 0)}
            status={(agent.dropped_total || 0) > 0 ? 'warn' : 'ok'} />
          <KpiTile label="Queue size" icon={<FiActivity size={12} />} value={fmtNum(agent.queue_size || 0)}
            status={(agent.queue_size || 0) > 1000 ? 'warn' : 'ok'} />
        </div>
      </Panel>

      {/* Trace summary */}
      <Panel title="Traces" icon={<FiActivity />} loading={stats.loading && !stats.data} error={stats.error}>
        <div className="opa-grid cols-4">
          <KpiTile label="Total traces" icon={<FiActivity size={12} />} value={fmtNum(traces.total_traces || 0)} status="neutral" />
          <KpiTile label="Total spans" icon={<FiLayers size={12} />} value={fmtNum(traces.total_spans || 0)} status="neutral" />
          <KpiTile label="Error rate" icon={<FiAlertCircle size={12} />} value={fmtPct(traces.error_rate || 0)}
            status={errorRateStatus(traces.error_rate)} />
          <KpiTile label="Avg duration" icon={<FiClock size={12} />} value={fmtMs(traces.avg_duration_ms)}
            status={latencyStatus(traces.avg_duration_ms)} />
          <KpiTile label="p50 duration" icon={<FiTrendingUp size={12} />} value={fmtMs(traces.p50_duration_ms)}
            status={latencyStatus(traces.p50_duration_ms)} />
          <KpiTile label="p95 duration" icon={<FiTrendingUp size={12} />} value={fmtMs(traces.p95_duration_ms)}
            status={latencyStatus(traces.p95_duration_ms)} />
          <KpiTile label="p99 duration" icon={<FiTrendingUp size={12} />} value={fmtMs(traces.p99_duration_ms)}
            status={latencyStatus(traces.p99_duration_ms)} />
        </div>
      </Panel>

      {/* Traces by service */}
      <Panel title="Traces by service" icon={<FiServer />} flush
        loading={stats.loading && !stats.data} error={stats.error}
        empty={!stats.loading && byService.length === 0}>
        <DataTable
          columns={svcColumns} rows={byService} rowKey={(r) => r.service}
          initialSort={{ key: 'traces', dir: 'desc' }}
          onRowClick={(r) => r.service && navigate('/services/' + encodeURIComponent(r.service))}
        />
      </Panel>

      {/* Database size */}
      <Panel title="ClickHouse storage" icon={<FiDatabase />} flush
        loading={stats.loading && !stats.data} error={stats.error}
        empty={!stats.loading && tables.length === 0}
        actions={(
          <span className="oui-row oui-text-muted" style={{ fontSize: 'var(--text-xs)' }}>
            <FiHardDrive size={13} />
            <span>Total <span className="oui-mono" style={{ color: 'var(--text-primary)' }}>{db.total_size_readable || '0 B'}</span></span>
          </span>
        )}>
        <DataTable
          columns={tableColumns} rows={tables} rowKey={(r) => r.name}
          initialSort={{ key: 'size_bytes', dir: 'desc' }}
        />
      </Panel>
    </div>
  )
}
