import React, { useState, useMemo } from 'react'
import { FiLayers, FiZap, FiTrendingDown } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, DataTable, DeltaIndicator, InlineBar } from './ui'
import { fmtMs, fmtBytes, fmtNum, fmtPct, latencyStatus } from '../theme/format'
import './CohortCompare.css'

// Split a transaction's entry spans by a dimension and compare aggregate speed —
// e.g. the same script on PHP 8.4 vs 8.5. Backed by /api/transactions/compare.

const DIMENSIONS = [
  { value: 'language_version', label: 'Runtime version' },
  { value: 'language', label: 'Language' },
  { value: 'framework', label: 'Framework' },
  { value: 'service', label: 'Service' },
  { value: 'name', label: 'Transaction' },
  { value: 'db_system', label: 'Database' },
]

// Metric rows. invert=true → lower is better (speed/cost); shapes the delta color.
const METRICS = [
  { key: 'count', label: 'Samples', fmt: fmtNum, delta: false },
  { key: 'avg_duration_ms', label: 'Avg duration', fmt: fmtMs, invert: true, bar: true },
  { key: 'p50_duration_ms', label: 'p50 duration', fmt: fmtMs, invert: true },
  { key: 'p95_duration_ms', label: 'p95 duration', fmt: fmtMs, invert: true, bar: true },
  { key: 'p99_duration_ms', label: 'p99 duration', fmt: fmtMs, invert: true },
  { key: 'avg_cpu_ms', label: 'Avg CPU', fmt: fmtMs, invert: true },
  { key: 'error_rate', label: 'Error rate', fmt: (v) => fmtPct(v), invert: true },
  { key: 'avg_http', label: 'Avg HTTP calls', fmt: (v) => fmtNum(Math.round((v || 0) * 10) / 10), invert: true },
  { key: 'avg_bytes_sent', label: 'Avg bytes sent', fmt: fmtBytes },
  { key: 'avg_bytes_received', label: 'Avg bytes recv', fmt: fmtBytes },
]

export default function CohortCompare() {
  const [dimension, setDimension] = useState('language_version')
  const [service, setService] = useState('')
  const [name, setName] = useState('')

  const meta = useApi('/api/services/metadata', {}, { noRange: true })
  const services = useMemo(() => {
    const s = meta.data?.services || []
    return [...new Set(s.map((x) => x.service).filter(Boolean))]
  }, [meta.data])

  // Distinct transaction names (reuses the same endpoint grouped by name).
  const namesQ = useApi('/api/transactions/compare', { dimension: 'name', service: service || undefined })
  const names = useMemo(() => (namesQ.data?.groups || []).map((g) => g.value), [namesQ.data])

  // The comparison itself.
  const q = useApi('/api/transactions/compare', {
    dimension,
    service: service || undefined,
    name: name || undefined,
  })
  const groups = q.data?.groups || []
  const baseline = groups[0]

  // Headline: fastest vs slowest by p95.
  const headline = useMemo(() => {
    if (groups.length < 2) return null
    const sorted = [...groups].sort((a, b) => (a.p95_duration_ms || 0) - (b.p95_duration_ms || 0))
    const fast = sorted[0]
    const slow = sorted[sorted.length - 1]
    if (!slow.p95_duration_ms) return null
    const pct = ((slow.p95_duration_ms - fast.p95_duration_ms) / slow.p95_duration_ms) * 100
    return { fast, slow, pct }
  }, [groups])

  const maxP95 = Math.max(1, ...groups.map((g) => g.p95_duration_ms || 0))
  const maxAvg = Math.max(1, ...groups.map((g) => g.avg_duration_ms || 0))

  const columns = useMemo(() => [
    { key: 'label', header: 'Metric', sortable: false, render: (r) => <span className="cell-strong">{r.label}</span> },
    ...groups.map((g, gi) => ({
      key: `g${gi}`,
      num: true,
      sortable: false,
      header: (
        <span>
          {g.value || '—'} <span className="opa-muted" style={{ fontWeight: 'var(--fw-regular)' }}>n={fmtNum(g.count)}</span>
          {gi === 0 && groups.length > 1 && <span className="opa-badge" style={{ marginLeft: 6 }}>baseline</span>}
        </span>
      ),
      render: (r) => (
        <span className="opa-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          {r.fmt(g[r.key] ?? 0)}
          {gi > 0 && r.delta !== false && (
            <DeltaIndicator current={g[r.key] ?? 0} previous={baseline?.[r.key] ?? 0} invert={r.invert} />
          )}
        </span>
      ),
    })),
  ], [groups, baseline])

  const dimLabel = DIMENSIONS.find((d) => d.value === dimension)?.label || dimension

  return (
    <>
      <Panel title="Cohort" icon={<FiLayers size={14} />}>
        <div className="opa-row" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="cc-field">Split by
            <select className="opa-select" value={dimension} onChange={(e) => setDimension(e.target.value)}>
              {DIMENSIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label className="cc-field">Service
            <select className="opa-select" value={service} onChange={(e) => { setService(e.target.value); setName('') }}>
              <option value="">All services</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="cc-field">Transaction
            <select className="opa-select" value={name} onChange={(e) => setName(e.target.value)}>
              <option value="">All transactions</option>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="opa-muted" style={{ fontSize: 'var(--fs-12)', marginTop: 'var(--sp-2)' }}>
          Comparing entry-span speed across <strong>{dimLabel}</strong>
          {name ? <> for <strong>{name}</strong></> : ''}
          {service ? <> in <strong>{service}</strong></> : ''}.
        </div>
      </Panel>

      {headline && (
        <Panel>
          <div className="opa-row" style={{ gap: 'var(--sp-3)', alignItems: 'center' }}>
            <FiZap size={18} style={{ color: 'var(--ok)' }} />
            <div>
              <div style={{ fontSize: 'var(--fs-16)', fontWeight: 'var(--fw-semibold)' }}>
                <span style={{ color: 'var(--ok)' }}>{headline.fast.value}</span> is {fmtPct(headline.pct, 0)} faster than{' '}
                <span style={{ color: 'var(--warn)' }}>{headline.slow.value}</span> at p95
              </div>
              <div className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>
                p95 {fmtMs(headline.fast.p95_duration_ms)} vs {fmtMs(headline.slow.p95_duration_ms)} · {dimLabel}
              </div>
            </div>
          </div>
        </Panel>
      )}

      <Panel
        title="Speed by cohort"
        icon={<FiTrendingDown size={14} />}
        loading={q.loading}
        error={q.error}
        empty={!q.loading && groups.length < 2}
        emptyText={groups.length === 1
          ? `Only one ${dimLabel} value present — need at least two to compare.`
          : `No entry spans match. Pick a different split, service, or time range.`}
      >
        {/* Visual p95/avg bars per cohort */}
        <div className="cc-bars">
          {groups.map((g, gi) => (
            <div key={gi} className="cc-bar-row">
              <div className="cc-bar-label opa-mono">{g.value || '—'}</div>
              <div className="cc-bar-cell">
                <span className="opa-muted cc-bar-tag">avg</span>
                <InlineBar value={g.avg_duration_ms || 0} max={maxAvg} color="var(--tier-app)" />
                <span className="opa-mono cc-bar-val" style={{ color: `var(--${latencyStatus(g.avg_duration_ms)})` }}>{fmtMs(g.avg_duration_ms)}</span>
              </div>
              <div className="cc-bar-cell">
                <span className="opa-muted cc-bar-tag">p95</span>
                <InlineBar value={g.p95_duration_ms || 0} max={maxP95} color="var(--p95)" />
                <span className="opa-mono cc-bar-val" style={{ color: `var(--${latencyStatus(g.p95_duration_ms)})` }}>{fmtMs(g.p95_duration_ms)}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <DataTable columns={columns} rows={METRICS} rowKey={(r) => r.key} />
        </div>
      </Panel>
    </>
  )
}
