import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiActivity, FiAlertOctagon, FiAlertTriangle, FiZap, FiInfo, FiFilter } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, HealthDot, Badge, DeltaIndicator, SegmentedControl } from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtAgo, statusColor } from '../theme/format'

// API timestamps arrive as "2026-07-25 08:10:29.000" — normalize so Date.parse is reliable.
const parseTs = (ts) => {
  if (!ts) return null
  const t = Date.parse(typeof ts === 'string' ? ts.replace(' ', 'T') : ts)
  return isNaN(t) ? null : t
}

// Severity -> design-system tone. critical/high = error, medium = warn, low = neutral.
const SEVERITY_TONE = { critical: 'error', high: 'error', medium: 'warn', low: 'neutral' }
const severityTone = (s) => SEVERITY_TONE[String(s || '').toLowerCase()] || 'neutral'
// Sort weight so critical floats to the top of the severity column.
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

// Render a metric value in its native unit.
const METRIC_LABEL = { duration: 'Duration', error_rate: 'Error rate', throughput: 'Throughput' }
const fmtMetric = (metric, v) => {
  if (v == null || isNaN(v)) return '—'
  if (metric === 'duration') return fmtMs(v)
  if (metric === 'error_rate') return fmtPct(v)
  return fmtNum(v) // throughput + fallback
}
// Which direction is "bad": latency/errors up is bad; throughput drops are bad.
const metricInvert = (metric) => metric === 'duration' || metric === 'error_rate'

const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low']

export default function Anomalies() {
  const navigate = useNavigate()
  // useApi auto-injects the global time range (from/to); the endpoint also accepts
  // service/severity, but we pull the full window and filter client-side so the
  // service dropdown and the severity KPI breakdown stay complete.
  const q = useApi('/api/anomalies')
  const [service, setService] = useState('all')
  const [severity, setSeverity] = useState('all')

  const anomalies = q.data?.anomalies || []

  const services = useMemo(
    () => Array.from(new Set(anomalies.map((a) => a?.service).filter(Boolean))).sort(),
    [anomalies],
  )

  // Service filter feeds both the KPI breakdown and the table; the severity
  // segmented control only narrows the table below.
  const byService = useMemo(
    () => (service === 'all' ? anomalies : anomalies.filter((a) => a?.service === service)),
    [anomalies, service],
  )

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const a of byService) {
      const s = String(a?.severity || '').toLowerCase()
      if (s in c) c[s] += 1
    }
    return c
  }, [byService])

  const rows = useMemo(
    () => (severity === 'all' ? byService : byService.filter((a) => String(a?.severity || '').toLowerCase() === severity)),
    [byService, severity],
  )

  const columns = [
    {
      key: 'detected_at',
      header: 'Detected',
      num: true,
      sortValue: (r) => parseTs(r?.detected_at) || 0,
      render: (r) => <span className="oui-text-muted oui-num">{fmtAgo(parseTs(r?.detected_at))}</span>,
    },
    {
      key: 'service',
      header: 'Service',
      sortValue: (r) => r?.service || '',
      render: (r) => (
        <div className="oui-row" style={{ gap: 8 }}>
          <HealthDot tone={severityTone(r?.severity)} title={`${r?.severity || 'unknown'} severity`} />
          <span className="cell-strong oui-mono">{r?.service || '—'}</span>
        </div>
      ),
    },
    {
      key: 'metric',
      header: 'Anomaly',
      sortValue: (r) => r?.metric || '',
      render: (r) => (
        <div className="oui-row" style={{ gap: 8, minWidth: 0 }}>
          {r?.type && <Badge title={r.type}>{r.type}</Badge>}
          <span className="oui-text-muted oui-mono">{METRIC_LABEL[r?.metric] || r?.metric || '—'}</span>
        </div>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      sortValue: (r) => SEVERITY_ORDER[String(r?.severity || '').toLowerCase()] ?? 99,
      render: (r) => <StatusPill tone={severityTone(r?.severity)}>{r?.severity || 'unknown'}</StatusPill>,
    },
    {
      key: 'observed',
      header: 'Observed vs expected',
      num: true,
      sortValue: (r) => (r?.value != null && r?.expected ? Math.abs((r.value - r.expected) / Math.abs(r.expected)) : 0),
      render: (r) => (
        <div className="oui-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <span className="oui-mono cell-strong">{fmtMetric(r?.metric, r?.value)}</span>
          <span className="oui-text-muted" style={{ fontSize: 'var(--text-2xs)' }}>vs {fmtMetric(r?.metric, r?.expected)}</span>
          <DeltaIndicator current={r?.value} previous={r?.expected} invert={metricInvert(r?.metric)} />
        </div>
      ),
    },
    {
      key: 'score',
      header: 'z-score',
      num: true,
      sortValue: (r) => (r?.score == null || isNaN(r?.score) ? -Infinity : Math.abs(r.score)),
      render: (r) => {
        const s = r?.score
        if (s == null || isNaN(s)) return <span className="oui-text-muted">—</span>
        return (
          <span className="oui-mono oui-num" style={{ color: statusColor(severityTone(r?.severity)) }} title={`${s.toFixed(2)} standard deviations from baseline`}>
            {s >= 0 ? '▲' : '▼'} {Math.abs(s).toFixed(1)}σ
          </span>
        )
      },
    },
  ]

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Anomalies</h1>
          <div className="opa-page-sub">
            {rows.length} anomal{rows.length === 1 ? 'y' : 'ies'} across {services.length} service{services.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="oui-row" style={{ gap: 12 }}>
          <label className="oui-row" style={{ gap: 6, fontSize: 'var(--text-xs)' }}>
            <FiFilter size={12} className="oui-text-muted" />
            <select className="opa-select" value={service} onChange={(e) => setService(e.target.value)} aria-label="Service filter">
              <option value="all">All services</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <SegmentedControl
            options={SEVERITIES.map((s) => ({ value: s, label: s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1) }))}
            value={severity}
            onChange={setSeverity}
          />
        </div>
      </div>

      {/* Severity breakdown for the selected service */}
      <div className="opa-grid cols-4">
        <KpiTile label="Critical" icon={<FiAlertOctagon size={12} />} value={fmtNum(counts.critical)} status={counts.critical > 0 ? 'error' : 'ok'} />
        <KpiTile label="High" icon={<FiAlertTriangle size={12} />} value={fmtNum(counts.high)} status={counts.high > 0 ? 'error' : 'ok'} />
        <KpiTile label="Medium" icon={<FiZap size={12} />} value={fmtNum(counts.medium)} status={counts.medium > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Low" icon={<FiInfo size={12} />} value={fmtNum(counts.low)} status="neutral" />
      </div>

      <Panel
        title="Detected anomalies"
        icon={<FiActivity />}
        flush
        loading={q.loading}
        error={q.error}
        empty={!q.loading && rows.length === 0}
        emptyText="No anomalies detected in this window — the scheduler scans every 5 min"
        actions={<span className="oui-text-muted" style={{ fontSize: 'var(--text-xs)' }}>z-score = deviation from baseline</span>}
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r?.id}
          initialSort={{ key: 'score', dir: 'desc' }}
          onRowClick={(r) => r?.service && navigate('/services/' + encodeURIComponent(r.service))}
        />
      </Panel>
    </div>
  )
}
