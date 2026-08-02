import React from 'react'
import { useNavigate } from 'react-router-dom'
import { FiTerminal, FiActivity, FiClock, FiAlertTriangle } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, EmptyState, StatusPill, InlineBar } from '../components/ui'
import { fmtNum, fmtMs, fmtPct } from '../theme/format'

// Commands — CLI / worker / cron transactions. Kept separate from HTTP endpoints
// because they are a different population (agent popCommand / is_cli). The
// rate-limit badge is the MetricsExplorer resolution badge for volume control:
// when sample_weight > stored, detail was suppressed and the count still counts.
export default function Commands() {
  const navigate = useNavigate()
  const q = useApi('/api/commands')
  const rows = q.data?.commands || []

  const totalRequests = rows.reduce((s, r) => s + (r.requests || 0), 0)
  const totalSuppressed = rows.reduce((s, r) => s + (r.suppressed || 0), 0)
  const limited = rows.filter((r) => (r.sample_ratio ?? 1) < 0.999).length
  const maxReq = Math.max(1, ...rows.map((x) => x.requests || 0))

  const columns = [
    {
      key: 'name',
      header: 'Command',
      mono: true,
      render: (r) => (
        <div className="opa-row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <span className="cell-strong opa-mono">{r.name || '—'}</span>
          {(r.sample_ratio ?? 1) < 0.999 && (
            <StatusPill tone="warn">
              {fmtPct((r.sample_ratio || 0) * 100)} kept · {fmtNum(r.suppressed || 0)} suppressed
            </StatusPill>
          )}
        </div>
      ),
      sortValue: (r) => r.name || '',
    },
    { key: 'service', header: 'Service', render: (r) => <span className="opa-mono">{r.service}</span> },
    {
      key: 'requests',
      header: 'Requests',
      num: true,
      render: (r) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <InlineBar
            value={r.requests || 0}
            max={maxReq}
            label={fmtNum(r.requests || 0)}
            color="var(--accent)"
            width={80}
          />
        </div>
      ),
    },
    { key: 'p50_duration_ms', header: 'p50', num: true, render: (r) => fmtMs(r.p50_duration_ms) },
    {
      key: 'p95_duration_ms',
      header: 'p95',
      num: true,
      render: (r) => fmtMs(r.p95_duration_ms),
    },
    {
      key: 'error_rate',
      header: 'Errors',
      num: true,
      render: (r) => (
        <span style={{ color: r.error_rate > 5 ? 'var(--error)' : undefined }}>
          {fmtPct(r.error_rate || 0)}
        </span>
      ),
    },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Commands</h1>
          <div className="opa-page-sub">
            CLI, workers and cron — named transactions, not HTTP endpoints
          </div>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Commands" icon={<FiTerminal size={12} />} value={fmtNum(rows.length)} status="neutral" />
        <KpiTile label="Requests" icon={<FiActivity size={12} />} value={fmtNum(totalRequests)} status="neutral" />
        <KpiTile
          label="Suppressed"
          icon={<FiClock size={12} />}
          value={fmtNum(totalSuppressed)}
          status={totalSuppressed > 0 ? 'warn' : 'neutral'}
          footer={
            totalSuppressed > 0
              ? <span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>detail dropped, count kept via sample_weight</span>
              : null
          }
        />
        <KpiTile
          label="Rate-limited"
          icon={<FiAlertTriangle size={12} />}
          value={fmtNum(limited)}
          status={limited > 0 ? 'warn' : 'ok'}
        />
      </div>

      <Panel title="Commands" icon={<FiTerminal />} flush loading={q.loading} error={q.error}>
        {rows.length === 0 && !q.loading
          ? (
            <EmptyState
              icon={<FiTerminal />}
              title="No CLI commands in this range"
              hint="Console, queue workers and cron show up here once the extension names them (opa.cli_naming)."
            />
            )
          : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r, i) => `${r.service}|${r.name}|${i}`}
              initialSort={{ key: 'requests', dir: 'desc' }}
              onRowClick={(r) => {
                if (!r.service) return
                const params = new URLSearchParams()
                params.set('service', r.service)
                if (r.name) params.set('name', r.name)
                navigate(`/traces?${params.toString()}`)
              }}
            />
            )}
      </Panel>
    </div>
  )
}
