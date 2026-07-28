import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FiGitBranch, FiBarChart2, FiChevronLeft, FiChevronRight, FiClock, FiX, FiSearch } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, DataTable, StatusPill, LanguageBadge,
} from '../components/ui'
import ExportButton from '../components/ExportButton'
import { fmtMs, fmtNum, fmtAgo, latencyStatus } from '../theme/format'
import './TraceExplorer.css'

const LIMIT = 100
const BINS = 20

// Percentile over a numeric array (nearest-rank, linear-ish).
function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

// Bucket durations into ~BINS equal-width bins for the histogram.
function buildHistogram(durations) {
  if (!durations.length) return { bars: [], p95: null, p95Pct: 0, min: 0, max: 0 }
  const min = Math.min(...durations)
  const max = Math.max(...durations)
  const span = max - min || 1
  const width = span / BINS
  const bars = Array.from({ length: BINS }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }))
  for (const d of durations) {
    let bi = Math.floor((d - min) / width)
    if (bi < 0) bi = 0
    if (bi >= BINS) bi = BINS - 1
    bars[bi].count += 1
  }
  const sorted = [...durations].sort((a, b) => a - b)
  const p95 = percentile(sorted, 95)
  const p95Pct = span ? ((p95 - min) / span) * 100 : 0
  return { bars, p95, p95Pct: Math.max(0, Math.min(100, p95Pct)), min, max }
}

export default function TraceExplorer() {
  const navigate = useNavigate()
  // Filters live in the URL so every drill-down (a row elsewhere linking to
  // /traces?filter=…) lands here filtered, and views are shareable/bookmarkable.
  const [searchParams, setSearchParams] = useSearchParams()
  const service = searchParams.get('service') || ''
  const status = searchParams.get('status') || ''
  const filter = searchParams.get('filter') || ''
  const [offset, setOffset] = useState(0)

  const setParam = (key, val) => {
    const p = new URLSearchParams(searchParams)
    if (val) p.set(key, val)
    else p.delete(key)
    setSearchParams(p, { replace: true })
    setOffset(0)
  }
  const clearFilters = () => { setSearchParams(new URLSearchParams(), { replace: true }); setOffset(0) }
  const hasFilters = !!(service || status || filter)

  // Editable draft of the raw DSL filter. Kept local so typing doesn't thrash
  // the URL on every keystroke; committed to ?filter on Enter/blur. Re-syncs
  // whenever the URL filter changes (e.g. a drill-down navigates here).
  const [filterDraft, setFilterDraft] = useState(filter)
  useEffect(() => { setFilterDraft(filter) }, [filter])
  const commitFilter = () => {
    const v = filterDraft.trim()
    if (v !== filter) setParam('filter', v)
  }

  const meta = useApi('/api/services/metadata', {}, { noRange: true })
  const q = useApi('/api/traces', {
    service: service || undefined,
    status: status || undefined,
    filter: filter || undefined,
    limit: LIMIT,
    offset,
    sort: 'duration_ms',
    order: 'desc',
  })

  const services = meta.data?.services || []
  const traces = q.data?.traces || []
  const total = q.data?.total ?? 0

  const durations = useMemo(
    () => traces.map((t) => t?.duration_ms).filter((d) => d != null && !isNaN(d)),
    [traces],
  )
  const hist = useMemo(() => buildHistogram(durations), [durations])
  const maxCount = Math.max(1, ...hist.bars.map((b) => b.count))

  const columns = [
    {
      key: 'trace_id', header: 'Trace', width: 130,
      render: (r) => <span className="opa-mono cell-strong">{String(r.trace_id || '').slice(0, 16)}</span>,
      sortValue: (r) => r.trace_id,
    },
    { key: 'service', header: 'Service', render: (r) => <span className="opa-mono">{r.service || '—'}</span>, sortValue: (r) => r.service },
    {
      key: 'language', header: 'Runtime',
      render: (r) => (r.language ? <LanguageBadge language={r.language} version={r.language_version} /> : <span className="opa-muted">—</span>),
      sortValue: (r) => r.language,
    },
    {
      key: 'duration_ms', header: 'Duration', num: true,
      render: (r) => <span style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span>,
    },
    { key: 'span_count', header: 'Spans', num: true, render: (r) => fmtNum(r.span_count) },
    {
      key: 'status', header: 'Status', align: 'center',
      render: (r) => {
        const s = String(r.status || '').toLowerCase()
        const tone = s === 'error' ? 'error' : s === 'ok' ? 'ok' : 'neutral'
        return <StatusPill tone={tone}>{r.status || 'unknown'}</StatusPill>
      },
      sortValue: (r) => r.status,
    },
    {
      key: 'created_at', header: 'When', num: true,
      render: (r) => <span className="opa-muted">{fmtAgo(r.created_at)}</span>,
      sortValue: (r) => Date.parse(r.created_at) || 0,
    },
  ]

  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd = Math.min(offset + traces.length, total)
  const hasPrev = offset > 0
  const hasNext = offset + LIMIT < total

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Trace Explorer</h1>
          <div className="opa-page-sub">
            Distributed traces{total ? ` · ${fmtNum(total)} matching` : ''} · sorted by slowest
          </div>
        </div>
        <div className="opa-row">
          <select className="opa-select" value={service} onChange={(e) => setParam('service', e.target.value)} aria-label="Service filter">
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s.service} value={s.service}>{s.service}</option>
            ))}
          </select>
          <select className="opa-select" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status filter">
            <option value="">All statuses</option>
            <option value="ok">OK</option>
            <option value="error">Error</option>
          </select>
          <ExportButton filters={{ service, status, filter }} label="Export" />
        </div>
      </div>

      {/* Query bar — raw DSL filter. Every cross-page drill-down lands here by
          setting ?filter=…, so this input shows (and lets you refine) exactly
          what's being matched. Enter/blur commits to the URL → shareable.
          DSL: field:value, AND/OR, quotes for spaces, http./sql./redis. prefixes,
          duration_ms:>200, etc. */}
      <div className="opa-row" style={{ gap: 'var(--sp-2)', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <FiSearch size={13} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            className="opa-input opa-mono"
            style={{ width: '100%', paddingLeft: 30, fontSize: 'var(--fs-12)' }}
            value={filterDraft}
            onChange={(e) => setFilterDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitFilter() }}
            onBlur={commitFilter}
            spellCheck={false}
            placeholder='Filter — e.g. url_path:"/health-check" AND duration_ms:>200'
            aria-label="Filter query (DSL)"
          />
        </div>
        {hasFilters && (
          <button className="opa-btn ghost" onClick={clearFilters} title="Clear all filters">
            <FiX size={13} /> Clear
          </button>
        )}
      </div>

      {/* Latency distribution */}
      <Panel
        title="Latency distribution" icon={<FiBarChart2 />}
        loading={q.loading} error={q.error}
        empty={!q.loading && durations.length === 0}
        emptyText="No traces in range"
        actions={hist.p95 != null && (
          <span className="opa-muted opa-mono" style={{ fontSize: 'var(--fs-12)' }}>
            <span style={{ color: 'var(--p95)' }}>p95 {fmtMs(hist.p95)}</span> · {fmtNum(durations.length)} traces
          </span>
        )}
      >
        <div className="tx-hist">
          {hist.bars.map((b, i) => {
            const mid = (b.from + b.to) / 2
            return (
              <div
                key={i}
                className="tx-hist-bar"
                style={{ height: `${(b.count / maxCount) * 100}%`, background: `var(--${latencyStatus(mid)})` }}
                title={`${fmtMs(b.from)}–${fmtMs(b.to)} · ${b.count} trace${b.count === 1 ? '' : 's'}`}
              />
            )
          })}
          {hist.p95 != null && (
            <div className="tx-hist-p95" style={{ left: `${hist.p95Pct}%` }}>
              <span className="tx-hist-p95-label">p95</span>
            </div>
          )}
        </div>
        <div className="tx-hist-axis">
          <span>{fmtMs(hist.min)}</span>
          <span>{fmtMs((hist.min + hist.max) / 2)}</span>
          <span>{fmtMs(hist.max)}</span>
        </div>
      </Panel>

      {/* Trace table */}
      <Panel
        title="Traces" icon={<FiGitBranch />} flush
        loading={q.loading} error={q.error}
        empty={!q.loading && traces.length === 0}
        emptyText="No traces match these filters"
        actions={(
          <div className="opa-row" style={{ fontSize: 'var(--fs-12)' }}>
            <span className="opa-muted opa-tnum">
              {total ? `${pageStart}–${pageEnd} of ${fmtNum(total)}` : '0 traces'}
            </span>
            <button
              className="opa-btn" disabled={!hasPrev}
              onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
              title="Previous page"
            ><FiChevronLeft size={13} /></button>
            <button
              className="opa-btn" disabled={!hasNext}
              onClick={() => setOffset((o) => o + LIMIT)}
              title="Next page"
            ><FiChevronRight size={13} /></button>
          </div>
        )}
      >
        <DataTable
          columns={columns}
          rows={traces}
          rowKey={(r) => r.trace_id}
          initialSort={{ key: 'duration_ms', dir: 'desc' }}
          onRowClick={(r) => r.trace_id && navigate(`/traces/${encodeURIComponent(r.trace_id)}`)}
          maxHeight="60vh"
          emptyText="No traces match these filters"
        />
      </Panel>
    </div>
  )
}
