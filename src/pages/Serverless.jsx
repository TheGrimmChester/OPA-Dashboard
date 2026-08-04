import React from 'react'
import { FiCloud, FiZap, FiThermometer, FiDollarSign } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtAgo } from '../theme/format'

/** Serverless / FaaS pillar. */
export default function Serverless() {
  const summary = useApi('/api/faas/summary', { hours: 24 }, { noRange: true })
  const cold = useApi('/api/faas/cold-starts', { hours: 24 }, { noRange: true })
  const cost = useApi('/api/faas/cost', { hours: 24 }, { noRange: true })
  const inv = useApi('/api/faas/invocations', { limit: 100 }, { noRange: true })

  const s = summary.data || {}
  const functions = cold.data?.functions || []
  const costRows = cost.data?.functions || []
  const rows = inv.data?.invocations || []

  const coldCols = [
    { key: 'function_name', header: 'Function', render: (r) => <span className="oui-mono cell-strong">{r.function_name}</span> },
    { key: 'invocations', header: 'Invocations', num: true, render: (r) => fmtNum(r.invocations) },
    { key: 'cold_starts', header: 'Cold', num: true, render: (r) => fmtNum(r.cold_starts) },
    { key: 'cold_start_rate_pct', header: 'Cold %', num: true, render: (r) => {
      const v = Number(r.cold_start_rate_pct) || 0
      const tone = v >= 20 ? 'error' : v >= 5 ? 'warn' : 'ok'
      return <StatusPill tone={tone}>{fmtPct(v)}</StatusPill>
    } },
    { key: 'avg_init_ms', header: 'Avg init', num: true, render: (r) => fmtMs(r.avg_init_ms) },
  ]

  const costCols = [
    { key: 'function_name', header: 'Function', render: (r) => <span className="oui-mono">{r.function_name}</span> },
    { key: 'configured_mb', header: 'Configured MB', num: true, render: (r) => fmtNum(r.configured_mb) },
    { key: 'used_mb', header: 'Used MB', num: true, render: (r) => fmtNum(r.used_mb) },
    { key: 'memory_util_pct', header: 'Util %', num: true, render: (r) => {
      const v = Number(r.memory_util_pct) || 0
      const tone = v < 40 ? 'warn' : 'ok'
      return <StatusPill tone={tone}>{fmtPct(v)}</StatusPill>
    } },
    { key: 'avg_billed_ms', header: 'Billed', num: true, render: (r) => fmtMs(r.avg_billed_ms) },
    { key: 'avg_observed_ms', header: 'Observed', num: true, render: (r) => fmtMs(r.avg_observed_ms) },
  ]

  const invCols = [
    { key: 'function_name', header: 'Function', render: (r) => <span className="oui-mono">{r.function_name}</span> },
    { key: 'trigger', header: 'Trigger', render: (r) => <Badge>{r.trigger || '—'}</Badge> },
    { key: 'cold_start', header: 'Cold', render: (r) => (Number(r.cold_start) ? <StatusPill tone="warn">cold</StatusPill> : <span className="oui-text-muted">warm</span>) },
    { key: 'duration_ms', header: 'Duration', num: true, render: (r) => fmtMs(r.duration_ms) },
    { key: 'init_duration_ms', header: 'Init', num: true, render: (r) => (Number(r.cold_start) ? fmtMs(r.init_duration_ms) : <span className="oui-text-muted">—</span>) },
    { key: 'memory_mb', header: 'Mem', num: true, render: (r) => fmtNum(r.memory_mb) },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="oui-text-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Serverless</h1>
          <div className="opa-page-sub">Cold starts · billed duration · memory overprovisioning</div>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Invocations" icon={<FiCloud size={12} />} value={fmtNum(s.invocations || 0)} status="neutral" />
        <KpiTile label="Cold starts" icon={<FiThermometer size={12} />} value={fmtNum(s.cold_starts || 0)} status={Number(s.cold_start_rate_pct) >= 10 ? 'warn' : 'neutral'}
          footer={<span className="oui-text-muted" style={{ fontSize: 11 }}>{fmtPct(s.cold_start_rate_pct || 0)} rate</span>} />
        <KpiTile label="Avg init" icon={<FiZap size={12} />} value={fmtMs(s.avg_init_ms || 0)} status="neutral" />
        <KpiTile label="Avg billed" icon={<FiDollarSign size={12} />} value={fmtMs(s.avg_billed_ms || 0)} status="neutral"
          footer={<span className="oui-text-muted" style={{ fontSize: 11 }}>obs {fmtMs(s.avg_duration_ms || 0)}</span>} />
      </div>

      <div className="opa-grid cols-2">
        <Panel title="Cold start by function" icon={<FiThermometer />} flush loading={cold.loading} error={cold.error}
          empty={!cold.loading && functions.length === 0} emptyText="No FaaS invocations yet — wrap handlers with wrapLambdaHandler">
          <DataTable columns={coldCols} rows={functions} rowKey={(r) => r.function_name} maxHeight={320} />
        </Panel>
        <Panel title="Memory cost signal" icon={<FiDollarSign />} flush loading={cost.loading} error={cost.error}
          empty={!cost.loading && costRows.length === 0} emptyText="No memory telemetry yet">
          <DataTable columns={costCols} rows={costRows} rowKey={(r) => r.function_name} maxHeight={320} />
        </Panel>
      </div>

      <Panel title="Recent invocations" icon={<FiCloud />} flush loading={inv.loading} error={inv.error}
        empty={!inv.loading && rows.length === 0} emptyText="No invocations recorded">
        <DataTable columns={invCols} rows={rows} rowKey={(r, i) => `${r.trace_id || r.function_name}:${i}`} maxHeight={420} />
      </Panel>
    </div>
  )
}
