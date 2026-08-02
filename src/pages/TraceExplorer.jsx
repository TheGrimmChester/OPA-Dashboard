import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FiGitBranch, FiBarChart2, FiChevronLeft, FiChevronRight, FiClock, FiX, FiSearch } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, DataTable, StatusPill, LanguageBadge,
} from '../components/ui'
import FacetSidebar from '../components/ui/FacetSidebar'
import ExportButton from '../components/ExportButton'
import { fmtMs, fmtNum, fmtAgo, latencyStatus } from '../theme/format'
import './TraceExplorer.css'

function facetDSL(facets) {
  const parts = []
  Object.entries(facets?.include || {}).forEach(([f, vals]) => vals.forEach((v) => parts.push(`${f}:"${String(v).replace(/(["\\])/g, '\\$1')}"`)))
  Object.entries(facets?.exclude || {}).forEach(([f, vals]) => vals.forEach((v) => parts.push(`-${f}:"${String(v).replace(/(["\\])/g, '\\$1')}"`)))
  return parts.join(' AND ')
}

const LIMIT = 100
const BINS = 20

// URI filters arrive as dedicated query params (?uri=, ?host=, ?scheme=,
// ?query_string=) — /api/traces has always accepted them, but this page never
// read them, so a deep link like /traces?uri=/checkout silently listed
// everything with an empty query box. Fold them into the DSL the box speaks:
// each term compiles to the exact same ClickHouse expression the param does
// (JSONExtractString on the http_request tag, LIKE-substring except scheme,
// which is exact), so the filter is now both applied and stated — and Export,
// which only forwards ?filter, inherits it.
const URI_PARAMS = [
  { param: 'uri', field: 'tags.http_request.uri', substring: true },
  { param: 'host', field: 'tags.http_request.host', substring: true },
  { param: 'scheme', field: 'tags.http_request.scheme', substring: false },
  { param: 'query_string', field: 'tags.http_request.query_string', substring: true },
]

// Values are double-quoted for the DSL lexer; escaping keeps a stray quote from
// running the string off the end of the query.
const dslQuote = (v) => `"${String(v).replace(/(["\\])/g, '\\$1')}"`
const uriTerm = ({ field, substring }, value) => (substring
  ? `${field}:LIKE ${dslQuote(`%${value}%`)}`
  : `${field}:${dslQuote(value)}`)

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

  // Resolved synchronously rather than in an effect so the very first fetch
  // already carries the URI filters — an effect would let one unfiltered
  // result set flash first.
  const normalized = useMemo(() => {
    const p = new URLSearchParams(searchParams)
    const terms = []
    for (const spec of URI_PARAMS) {
      const v = p.get(spec.param)
      if (!v) continue
      terms.push(uriTerm(spec, v))
      p.delete(spec.param)
    }
    if (terms.length) p.set('filter', [p.get('filter'), ...terms].filter(Boolean).join(' AND '))
    return { params: p, folded: terms.length > 0 }
  }, [searchParams])

  // Rewrite the address bar to the folded form so the URL and the query box
  // agree, and so a copied link reproduces exactly what's on screen.
  useEffect(() => {
    if (normalized.folded) setSearchParams(normalized.params, { replace: true })
  }, [normalized, setSearchParams])

  const params = normalized.params
  const service = params.get('service') || ''
  const status = params.get('status') || ''
  const filter = params.get('filter') || ''
  const [offset, setOffset] = useState(0)
  const [facets, setFacets] = useState({ include: {}, exclude: {} })
  const combinedFilter = useMemo(() => {
    const f = facetDSL(facets)
    return [filter, f].filter(Boolean).join(' AND ')
  }, [filter, facets])

  const setParam = (key, val) => {
    const p = new URLSearchParams(params)
    if (val) p.set(key, val)
    else p.delete(key)
    setSearchParams(p, { replace: true })
    setOffset(0)
  }
  const clearFilters = () => { setSearchParams(new URLSearchParams(), { replace: true }); setOffset(0) }
  const hasFilters = !!(service || status || filter || facetDSL(facets))

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
    filter: combinedFilter || undefined,
    limit: LIMIT,
    offset,
    sort: 'duration_ms',
    order: 'desc',
  })

  const services = meta.data?.services || []
  // A deep link can scope to a service the metadata list doesn't carry — a RUM
  // origin like https://app.example.test, or a service whose
  // spans aged out of the range. Without its own option the <select> falls back
  // to the empty one and claims "All services" while the scope is still applied.
  const serviceOptions = useMemo(() => {
    const names = services.map((s) => s.service)
    return service && !names.includes(service) ? [service, ...names] : names
  }, [services, service])
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
          <select
            className="opa-select opa-mono" style={{ maxWidth: 260 }}
            value={service} onChange={(e) => setParam('service', e.target.value)}
            title={service || 'All services'} aria-label="Service filter"
          >
            <option value="">All services</option>
            {serviceOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="opa-select" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status filter">
            <option value="">All statuses</option>
            <option value="ok">OK</option>
            <option value="error">Error</option>
          </select>
          <ExportButton filters={{ service, status, filter: combinedFilter }} label="Export" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <FacetSidebar
          value={facets}
          onChange={(next) => { setFacets(next); setOffset(0) }}
          fields={['service', 'environment', 'status', 'host']}
        />
        <div className="opa-stack" style={{ flex: 1, minWidth: 0 }}>
          {/* Query bar — raw DSL filter. Facets AND into the same request. */}
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
              <button className="opa-btn ghost" onClick={() => { clearFilters(); setFacets({ include: {}, exclude: {} }) }} title="Clear all filters">
                <FiX size={13} /> Clear
              </button>
            )}
          </div>

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
      </div>
    </div>
  )
}
