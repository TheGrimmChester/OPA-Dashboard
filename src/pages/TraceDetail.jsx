import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  FiGitBranch, FiClock, FiDatabase, FiServer, FiActivity, FiX,
  FiArrowUp, FiArrowDown, FiChevronLeft, FiChevronRight, FiFileText, FiGlobe, FiCpu, FiCode,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, DataTable, EntityHeader, Badge, StatusPill, LanguageBadge, SegmentedControl,
  EntityChip, EntityChipRow,
} from '../components/ui'
import FlameGraph from '../components/FlameGraph'
import CallGraph from '../components/CallGraph'
import ExecutionStackTree from '../components/ExecutionStackTree'
import { useProfileModel, ProfileToolbar, ProfileSummary, HotSpots } from '../components/profile'
import { fmtMs, fmtBytes, fmtNum, fmtAgo, tierColor, statusColor, latencyStatus, SERIES } from '../theme/format'
import { mergeCallStacks } from '../utils/mergeCallStacks'
import { flattenTree } from '../utils/waterfallRows'
import {
  collectCorrelationTags, compareTracesHref, logsHref, rumSessionHref, serviceHref,
  spanAttributeLinks, tracesHref as buildTracesHref,
} from '../utils/entityLinks'
import TraceWaterfall from '../components/TraceWaterfall'
import TraceReplayPanel from '../components/TraceReplayPanel'
import './TraceDetail.css'

const TIERS = ['app', 'db', 'redis', 'http']
const TIER_LABEL = { app: 'App / PHP', db: 'Database', redis: 'Redis', http: 'HTTP' }

const PROFILE_VIEWS = [
  { value: 'hotspots', label: 'Hot spots' },
  { value: 'flame', label: 'Flame' },
  { value: 'callgraph', label: 'Call graph' },
  { value: 'stacktree', label: 'Stack tree' },
]

// Significance floor for the hot-spots list, as a % of the ranked metric total.
const NOISE_FLOORS = [
  { value: 0, label: 'All' },
  { value: 0.1, label: '0.1%' },
  { value: 1, label: '1%' },
  { value: 5, label: '5%' },
]

// Classify a span into a breakdown tier from its name/service.
function spanTier(span) {
  const n = String(span?.name || '').toLowerCase()
  if (n.includes('pdo') || n.includes('sql') || n.includes('select') || n.includes('mysql') ||
      n.includes('query') || n.includes('insert') || n.includes('update') || n.includes('delete')) return 'db'
  if (n.includes('redis') || n.includes('cache')) return 'redis'
  if (n.includes('curl') || n.includes('http') || n.includes('guzzle') || n.includes('fetch')) return 'http'
  return 'app'
}

function toneForLevel(level) {
  const l = String(level || '').toUpperCase()
  if (l === 'ERROR' || l === 'CRITICAL' || l === 'FATAL') return 'error'
  if (l === 'WARN' || l === 'WARNING') return 'warn'
  if (l === 'INFO' || l === 'NOTICE') return 'ok'
  return 'neutral'
}

export default function TraceDetail() {
  const { traceId } = useParams()
  const navigate = useNavigate()
  // The selected span lives in the URL (?span=<span_id>) so a specific span is
  // shareable and survives a reload — "look at this span" is the most common
  // thing to send someone.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedSpanId = searchParams.get('span') || null
  const setSelected = useCallback((span) => {
    const p = new URLSearchParams(searchParams)
    if (span && span.span_id) p.set('span', span.span_id)
    else p.delete('span')
    setSearchParams(p, { replace: true })
  }, [searchParams, setSearchParams])
  // A ranked list answers "what is slow?" faster than any picture, so the
  // profile opens on hot spots and the drawings are one click away.
  const [profileView, setProfileView] = useState('hotspots')
  const [metric, setMetric] = useState('duration')
  const [groupBy, setGroupBy] = useState('method')
  const [query, setQuery] = useState('')
  const [minPct, setMinPct] = useState(0)
  const [focusKey, setFocusKey] = useState(null)
  // Collapse self-recursive / micro-span runs in the waterfall (e.g. fib × N).
  const [collapseNoise, setCollapseNoise] = useState(true)
  // Trace replay mode from ?replay= (waterfall | rum_session | perf_lab | …).
  const replayMode = searchParams.get('replay') || null
  const setReplayMode = useCallback((mode) => {
    const p = new URLSearchParams(searchParams)
    if (mode) p.set('replay', mode)
    else p.delete('replay')
    setSearchParams(p, { replace: true })
  }, [searchParams, setSearchParams])
  const [replayPlayhead, setReplayPlayhead] = useState(0)
  const [replayHighlightIds, setReplayHighlightIds] = useState(null)

  // /full carries the per-span call stacks (span.stack) that the flame/call
  // views need; the shape is otherwise identical to /api/traces/{id}, so the
  // waterfall below is unaffected.
  const trace = useApi(`/api/traces/${traceId}/full`, {}, { noRange: true })
  const logsQ = useApi(`/api/traces/${traceId}/logs`, {}, { noRange: true })

  const data = trace.data || {}
  const root = data.root || null
  const flatSpans = Array.isArray(data.spans) ? data.spans : []

  // Merged call stack across every span, for the profile views (flame / call
  // graph / stack tree). See mergeCallStacks for the namespacing scheme.
  const callStack = useMemo(() => mergeCallStacks(root, flatSpans), [root, flatSpans])

  // One ingest + aggregate + rank for the whole page: every profile view reads
  // this model, so a 200k-call stack is never walked twice per render.
  const model = useProfileModel(callStack, { metric, groupBy, minPct })
  const totals = model.totals || {}

  // A regroup (or a new trace) rewrites the symbol set, so a stale selection has
  // to go rather than point at a function that no longer exists.
  useEffect(() => { setFocusKey(null) }, [groupBy, callStack])

  // The flame/call graphs render fixed-width SVG; measure the panel so they fill
  // it, and track viewport height so their boxes scale with the window instead
  // of sitting at a magic constant.
  const profRef = useRef(null)
  const [profW, setProfW] = useState(960)
  const [vpH, setVpH] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight))
  useEffect(() => {
    const measure = () => {
      setVpH(window.innerHeight)
      if (profRef.current) setProfW(Math.max(320, profRef.current.offsetWidth - 4))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [callStack.length, profileView])

  // Chrome above the profile view: page head + entity header + waterfall + the
  // panel's own toolbar/summary. Clamped so an SVG stays readable on a 13" laptop
  // and doesn't turn into a mile-high strip on a 4K panel.
  const flameH = Math.max(320, Math.min(720, vpH - 360))
  const callGraphH = Math.max(380, Math.min(880, vpH - 260))
  const listH = Math.max(300, Math.min(680, vpH - 380))

  // Ordered waterfall rows.
  const rows = useMemo(() => {
    const r = flattenTree(root, flatSpans)
    return r.slice().sort((a, b) => (a.start_ts || 0) - (b.start_ts || 0))
  }, [root, flatSpans])

  // Resolve the id from the URL against the ordered waterfall rows.
  const selectedIndex = selectedSpanId ? rows.findIndex((s) => s.span_id === selectedSpanId) : -1
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : null

  const traceStart = rows.length ? Math.min(...rows.map((s) => s.start_ts || 0)) : 0
  const traceEnd = rows.length ? Math.max(...rows.map((s) => s.end_ts || (s.start_ts || 0))) : 0
  const totalMs = Math.max(1, root?.duration_ms || (traceEnd - traceStart) || 1)

  // opa_dump() payloads captured during the trace, attributed to their span.
  const dumps = useMemo(() => {
    const out = []
    rows.forEach((s) => {
      (Array.isArray(s.dumps) ? s.dumps : []).forEach((d, i) => {
        out.push({ ...d, _span: s.name, _spanId: s.span_id, _key: `${s.span_id || 's'}-${i}` })
      })
    })
    return out.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
  }, [rows])

  // Distributed tracing: a trace can span multiple services (same trace id
  // propagated via W3C traceparent). Assign each service a stable color and mark
  // the spans where the service changes from its parent (a cross-service hop).
  const services = useMemo(() => [...new Set(rows.map((s) => s.service).filter(Boolean))], [rows])
  const multiService = services.length > 1
  const serviceColor = useMemo(() => {
    const m = {}
    services.forEach((s, i) => { m[s] = SERIES[i % SERIES.length] })
    return m
  }, [services])
  const svcBySpanId = useMemo(() => {
    const m = {}
    rows.forEach((s) => { if (s.span_id) m[s.span_id] = s.service })
    return m
  }, [rows])
  // A cross-service hop: the span's tree parent is a different service. Prefer
  // the stitched tree-parent service (_parentService, robust to broken/absent
  // parent_id); fall back to resolving parent_id within this trace.
  const isServiceEntry = (s) => {
    if (!s.service) return false
    if (s._parentService) return s._parentService !== s.service
    return !!(s.parent_id && svcBySpanId[s.parent_id] && svcBySpanId[s.parent_id] !== s.service)
  }

  // Aggregate per-operation collections across every span (defensive).
  const allSql = useMemo(() => rows.flatMap((s) => s.sql || []), [rows])
  const allRedis = useMemo(() => rows.flatMap((s) => s.redis || []), [rows])
  const allHttp = useMemo(() => rows.flatMap((s) => s.http || []), [rows])

  const totalCpu = rows.reduce((a, s) => a + (s.cpu_ms || 0), 0)
  const anyError = rows.some((s) => String(s.status || '').toLowerCase() === 'error')

  // Response-time breakdown by tier (sum op durations; app = remainder / self-time).
  const breakdown = useMemo(() => {
    const db = allSql.reduce((a, x) => a + (x.duration_ms || 0), 0)
    const redis = allRedis.reduce((a, x) => a + (x.duration_ms || 0), 0)
    const http = allHttp.reduce((a, x) => a + (x.duration_ms || 0), 0)
    const app = Math.max(0, totalMs - db - redis - http)
    return { app, db, redis, http }
  }, [allSql, allRedis, allHttp, totalMs])
  const breakdownTotal = Math.max(1, TIERS.reduce((a, t) => a + breakdown[t], 0))

  // Network I/O — prefer root.net, else sum across spans.
  const net = useMemo(() => {
    const acc = { bytes_in: 0, bytes_out: 0, in_by_type: {}, out_by_type: {} }
    const src = root?.net ? [root] : rows
    src.forEach((s) => {
      const n = s.net || {}
      acc.bytes_in += n.bytes_in || 0
      acc.bytes_out += n.bytes_out || 0
      ;['db', 'http', 'redis'].forEach((k) => {
        acc.in_by_type[k] = (acc.in_by_type[k] || 0) + ((n.in_by_type || {})[k] || 0)
        acc.out_by_type[k] = (acc.out_by_type[k] || 0) + ((n.out_by_type || {})[k] || 0)
      })
    })
    return acc
  }, [root, rows])

  const logs = logsQ.data?.logs || []

  // ---- render helpers ----
  const stackedBar = (parts, total) => (
    <div className="tb-bar">
      {parts.map((p) => {
        const pct = total > 0 ? (p.value / total) * 100 : 0
        if (pct <= 0) return null
        return <div key={p.key} className="tb-seg" style={{ width: `${pct}%`, background: p.color }} title={`${p.label}: ${p.display}`} />
      })}
    </div>
  )

  const netTotal = Math.max(1, net.bytes_out, net.bytes_in)
  const dtParts = (byType) => ['db', 'http', 'redis'].map((k) => ({
    key: k, value: byType[k] || 0, color: tierColor(k), label: TIER_LABEL[k] || k, display: fmtBytes(byType[k] || 0),
  }))

  // Cross-link an operation row to the filtered Trace Explorer. Scope to the
  // trace's service when it's unambiguous (a single-service trace); DSL values
  // are wrapped in double quotes and URLSearchParams handles the encoding.
  const opService = services.length === 1 ? services[0] : null
  const goTraces = (filter) => {
    navigate(buildTracesHref(opService ? { service: opService, filter } : { filter }))
  }

  // Correlation IDs from span tags (load run, RUM session, synthetic check, …).
  const correlations = useMemo(() => collectCorrelationTags(rows), [rows])
  const rootResource = root?.name || root?.url_path || null

  // ---- op tables ----
  const sqlCols = [
    { key: 'query', header: 'Query', render: (r) => (
      <span className="td-sql" title={r.query}>{r.query || '—'}</span>
    ), sortValue: (r) => r.query },
    { key: 'query_type', header: 'Type', render: (r) => <Badge>{r.query_type || r.type || '—'}</Badge>, sortValue: (r) => r.query_type },
    { key: 'db_system', header: 'System', render: (r) => <span className="opa-muted">{r.db_system || '—'}</span> },
    { key: 'duration_ms', header: 'Duration', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span> },
    { key: 'rows_affected', header: 'Rows', num: true, render: (r) => (r.rows_affected == null || r.rows_affected < 0 ? '—' : fmtNum(r.rows_affected)) },
    { key: 'io', header: 'Out / In', num: true, sortValue: (r) => (r.bytes_out || 0) + (r.bytes_in || 0), render: (r) => (
      <span className="opa-mono"><span style={{ color: 'var(--tier-app)' }}>↑{fmtBytes(r.bytes_out)}</span> <span className="opa-muted">/</span> <span style={{ color: 'var(--tier-db)' }}>↓{fmtBytes(r.bytes_in)}</span></span>
    ) },
  ]

  const redisCols = [
    { key: 'command', header: 'Command', render: (r) => <span className="opa-mono cell-strong" style={{ color: 'var(--tier-redis)' }}>{r.command || '—'}</span> },
    { key: 'key', header: 'Key', render: (r) => <span className="opa-mono opa-muted" title={r.key}>{r.key || '—'}</span> },
    { key: 'hit', header: 'Hit', render: (r) => (r.hit == null ? '—' : <StatusPill tone={r.hit ? 'ok' : 'warn'}>{r.hit ? 'HIT' : 'MISS'}</StatusPill>) },
    { key: 'duration_ms', header: 'Duration', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span> },
    { key: 'io', header: 'Out / In', num: true, sortValue: (r) => (r.bytes_out || 0) + (r.bytes_in || 0), render: (r) => (
      <span className="opa-mono"><span style={{ color: 'var(--tier-app)' }}>↑{fmtBytes(r.bytes_out)}</span> <span className="opa-muted">/</span> <span style={{ color: 'var(--tier-db)' }}>↓{fmtBytes(r.bytes_in)}</span></span>
    ) },
  ]

  const httpCols = [
    { key: 'method', header: 'Method', render: (r) => <Badge>{r.method || '—'}</Badge> },
    { key: 'url', header: 'URL', render: (r) => <span className="opa-mono td-sql" title={r.url}>{r.url || r.uri || '—'}</span>, sortValue: (r) => r.url || r.uri },
    { key: 'status_code', header: 'Status', num: true, render: (r) => <span style={{ color: statusColor(r.status_code) }}>{r.status_code ?? '—'}</span> },
    { key: 'duration_ms', header: 'Duration', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span> },
    { key: 'io', header: 'Req / Resp', num: true, sortValue: (r) => (r.request_size || 0) + (r.response_size || 0), render: (r) => (
      <span className="opa-mono"><span style={{ color: 'var(--tier-app)' }}>↑{fmtBytes(r.request_size ?? r.bytes_sent)}</span> <span className="opa-muted">/</span> <span style={{ color: 'var(--tier-http)' }}>↓{fmtBytes(r.response_size ?? r.bytes_received)}</span></span>
    ) },
  ]

  const loading = trace.loading
  const empty = !loading && !trace.error && rows.length === 0

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <button className="td-drawer-close" style={{ float: 'left', marginRight: 10 }} onClick={() => navigate(-1)} title="Back" aria-label="Back">
            <FiChevronLeft size={15} />
          </button>
          <h1 className="opa-page-title">Trace</h1>
          <div className="opa-page-sub">Distributed trace forensics</div>
        </div>
      </div>

      <EntityHeader
        title={traceId}
        subtitle={root?.name ? `${root.name} · ${rows.length} span${rows.length === 1 ? '' : 's'}` : `${rows.length} spans`}
        badges={
          <>
            <StatusPill tone={anyError ? 'error' : statusPillTone(root?.status)}>{anyError ? 'ERROR' : String(root?.status || 'ok').toUpperCase()}</StatusPill>
            {(multiService ? services : [root?.service].filter(Boolean)).map((svc) => (
              <EntityChip
                key={svc}
                to={serviceHref(svc)}
                title={multiService ? `Service in this distributed trace: ${svc}` : `Service ${svc}`}
                mono={false}
              >
                <span className="opa-dot" style={{ background: multiService ? serviceColor[svc] : 'var(--tier-app)', width: 7, height: 7 }} />
                {svc}
              </EntityChip>
            ))}
            {multiService && <Badge title="distributed trace spanning multiple services">{services.length} services</Badge>}
            {root?.language && <LanguageBadge language={root.language} version={root.language_version} />}
            <EntityChipRow items={correlations} />
          </>
        }
        meta={
          <div className="opa-row" style={{ gap: 'var(--sp-5, 22px)' }}>
            <div className="td-metastat"><span className="k">Duration</span><span className="v" style={{ color: `var(--${latencyStatus(totalMs)})` }}>{fmtMs(totalMs)}</span></div>
            <div className="td-metastat"><span className="k">CPU</span><span className="v">{fmtMs(totalCpu)}</span></div>
            <div className="td-metastat"><span className="k">Egress</span><span className="v">{fmtBytes(net.bytes_out)}</span></div>
            <div className="td-metastat"><span className="k">Ingress</span><span className="v">{fmtBytes(net.bytes_in)}</span></div>
          </div>
        }
        actions={(
          <div className="opa-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {opService && (
              <Link className="opa-btn ghost" to={buildTracesHref({ service: opService })}>Related traces</Link>
            )}
            {rootResource && (
              <Link className="opa-btn ghost" to={buildTracesHref({ filter: `name:"${String(rootResource).replace(/(["\\])/g, '\\$1')}"`, service: opService || undefined })}>
                Same resource
              </Link>
            )}
            {anyError && (
              <Link className="opa-btn ghost" to={buildTracesHref({ service: opService || undefined, status: 'error' })}>Error traces</Link>
            )}
            <Link className="opa-btn ghost" to={logsHref({ service: opService || undefined, q: traceId })}>Logs</Link>
            {correlations.find((c) => c.kind === 'session') && (
              <Link className="opa-btn ghost" to={rumSessionHref(correlations.find((c) => c.kind === 'session').value)}>RUM session</Link>
            )}
            <Link className="opa-btn ghost" to={compareTracesHref(traceId, '')}>Compare</Link>
          </div>
        )}
      />

      {/* Waterfall — virtualized + collapse noise so 10k-span traces stay usable */}
      <Panel title="Trace waterfall" icon={<FiGitBranch />} loading={loading} error={trace.error} empty={empty}
        actions={<span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>click a span for detail · use Trace replay below</span>}>
        <TraceWaterfall
          rows={rows}
          totalMs={totalMs}
          traceStart={traceStart}
          selectedSpanId={selectedSpanId}
          onSelect={setSelected}
          multiService={multiService}
          serviceColor={serviceColor}
          isServiceEntry={isServiceEntry}
          viewportHeight={listH}
          collapseNoise={collapseNoise}
          onToggleCollapse={setCollapseNoise}
          truncatedMeta={data.meta || null}
          highlightIds={replayMode === 'waterfall' ? replayHighlightIds : null}
          playheadMs={replayMode === 'waterfall' ? replayPlayhead : null}
        />
        {!empty && (
          <TraceReplayPanel
            traceId={traceId}
            rows={rows}
            totalMs={totalMs}
            traceStart={traceStart}
            activeMode={replayMode}
            onModeChange={setReplayMode}
            onPlayheadChange={setReplayPlayhead}
            onHighlightIds={setReplayHighlightIds}
          />
        )}
      </Panel>

      {/* Profile — ranked hot spots over every span's call stack, plus the
          flame / call-graph / stack-tree drawings of the same data. */}
      <Panel
        title="Profile"
        icon={<FiCpu />}
        flush
        loading={loading}
        error={trace.error}
        empty={!loading && !trace.error && callStack.length === 0}
        emptyText="No call stack captured on this trace — enable the OPA profiler to record one."
        actions={<SegmentedControl options={PROFILE_VIEWS} value={profileView} onChange={setProfileView} />}
      >
        <div className="td-prof">
          <div className="td-prof-bar">
            <ProfileToolbar
              metric={metric}
              onMetricChange={setMetric}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              query={query}
              onQueryChange={setQuery}
              totals={totals}
              right={
                <div
                  className="opa-row td-prof-floor"
                  title="Hide functions contributing less than this share of the ranked metric. Hot spots reports how many are hidden."
                >
                  <span className="opa-muted">Threshold</span>
                  <SegmentedControl options={NOISE_FLOORS} value={minPct} onChange={setMinPct} />
                </div>
              }
            />
          </div>

          {/* Ingest truncation and an unrecorded metric are both surfaced by the
              toolbar, the summary strip and the hot-spots notice — not repeated here. */}
          <div className="td-prof-sum">
            <ProfileSummary totals={totals} metric={metric} />
          </div>

          <div className="td-prof-view">
            {profileView === 'hotspots' ? (
              <HotSpots
                model={model}
                metric={metric}
                query={query}
                onMetricChange={setMetric}
                selectedKey={focusKey}
                onSelectSymbol={(key) => setFocusKey((k) => (k === key ? null : key))}
                maxHeight={listH}
              />
            ) : (
              <div className="td-prof-graph">
                {/* Measured on the inner (unpadded) box so the SVG width matches
                    the real content width instead of overflowing by the padding. */}
                <div ref={profRef} className="td-prof-graph-inner">
                  {/* Driving `metric` from the shared toolbar hides the graph's
                      own selector, so the panel has one metric control, not two. */}
                  {profileView === 'flame' && (
                    <FlameGraph
                      callStack={callStack}
                      width={profW}
                      height={flameH}
                      metric={metric}
                      onMetricChange={setMetric}
                    />
                  )}
                  {profileView === 'callgraph' && (
                    <CallGraph
                      callStack={callStack}
                      width={profW}
                      height={callGraphH}
                      metric={metric}
                      onMetricChange={setMetric}
                      groupBy={groupBy}
                      minPct={minPct}
                    />
                  )}
                  {profileView === 'stacktree' && <ExecutionStackTree callStack={callStack} />}
                </div>
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* Breakdown + Network I/O */}
      <div className="opa-grid cols-2">
        <Panel title="Response-time breakdown" icon={<FiClock />} loading={loading} error={trace.error} empty={empty}>
          {stackedBar(
            TIERS.map((t) => ({ key: t, value: breakdown[t], color: tierColor(t), label: TIER_LABEL[t], display: fmtMs(breakdown[t]) })),
            breakdownTotal,
          )}
          <div className="tb-legend">
            {TIERS.map((t) => (
              <div key={t} className="tb-legend-item">
                <span className="tb-swatch" style={{ background: tierColor(t) }} />
                {TIER_LABEL[t]}
                <span className="tb-legend-val">{fmtMs(breakdown[t])}</span>
                <span className="opa-muted">({Math.round((breakdown[t] / breakdownTotal) * 100)}%)</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Network I/O by tier" icon={<FiActivity />} loading={loading} error={trace.error} empty={empty}
          actions={<span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>bytes moved on the wire</span>}>
          <div className="dt-row">
            <div className="dt-dir"><FiArrowUp size={13} style={{ color: 'var(--tier-http)' }} /> Egress</div>
            {stackedBar(dtParts(net.out_by_type), netTotal)}
            <div className="dt-total">{fmtBytes(net.bytes_out)}</div>
          </div>
          <div className="dt-row">
            <div className="dt-dir"><FiArrowDown size={13} style={{ color: 'var(--tier-db)' }} /> Ingress</div>
            {stackedBar(dtParts(net.in_by_type), netTotal)}
            <div className="dt-total">{fmtBytes(net.bytes_in)}</div>
          </div>
          <div className="tb-legend">
            {['db', 'http', 'redis'].map((t) => (
              <div key={t} className="tb-legend-item">
                <span className="tb-swatch" style={{ background: tierColor(t) }} />
                {TIER_LABEL[t]}
                <span className="tb-legend-val">↑{fmtBytes(net.out_by_type[t] || 0)} ↓{fmtBytes(net.in_by_type[t] || 0)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Operation tables */}
      <Panel title="SQL queries" icon={<FiDatabase />} flush loading={loading} error={trace.error}
        empty={!loading && allSql.length === 0} emptyText="No SQL in this trace"
        actions={<Badge>{fmtNum(allSql.length)} queries</Badge>}>
        <DataTable columns={sqlCols} rows={allSql} rowKey={(r, i) => i}
          onRowClick={(r) => {
            const fp = r.query_fingerprint || r.fingerprint
            if (fp) { navigate(`/sql/${encodeURIComponent(fp)}`); return }
            const f = sqlDrillFilter(r)
            if (f) goTraces(f)
          }}
          initialSort={{ key: 'duration_ms', dir: 'desc' }} maxHeight={340} />
      </Panel>

      <div className="opa-grid cols-2">
        <Panel title="Redis" icon={<FiServer />} flush loading={loading} error={trace.error}
          empty={!loading && allRedis.length === 0} emptyText="No Redis ops"
          actions={<Badge>{fmtNum(allRedis.length)} ops</Badge>}>
          <DataTable columns={redisCols} rows={allRedis} rowKey={(r, i) => i}
            onRowClick={(r) => { if (r.command) goTraces(`redis.command:"${r.command}"`) }}
            initialSort={{ key: 'duration_ms', dir: 'desc' }} maxHeight={340} />
        </Panel>
        <Panel title="HTTP calls" icon={<FiGlobe />} flush loading={loading} error={trace.error}
          empty={!loading && allHttp.length === 0} emptyText="No outbound HTTP"
          actions={<Badge>{fmtNum(allHttp.length)} calls</Badge>}>
          <DataTable columns={httpCols} rows={allHttp} rowKey={(r, i) => i}
            onRowClick={(r) => { const u = r.url || r.uri; if (u) goTraces(`http.url:"${u}"`) }}
            initialSort={{ key: 'duration_ms', dir: 'desc' }} maxHeight={340} />
        </Panel>
      </div>

      {/* Logs */}
      <Panel title="Correlated logs" icon={<FiFileText />} flush loading={logsQ.loading} error={logsQ.error}
        empty={!logsQ.loading && logs.length === 0} emptyText="No logs for this trace"
        actions={<Badge>{fmtNum(logsQ.data?.count ?? logs.length)} entries</Badge>}>
        <DataTable
          columns={[
            { key: 'level', header: 'Level', width: 84, render: (r) => <StatusPill tone={toneForLevel(r.level)}>{String(r.level || '—').toUpperCase()}</StatusPill> },
            { key: 'message', header: 'Message', render: (r) => <span className="opa-mono" style={{ fontSize: 'var(--fs-12)' }}>{r.message || '—'}</span> },
            { key: 'service', header: 'Service', render: (r) => (
              r.service
                ? <EntityChip to={serviceHref(r.service)} title={`Service ${r.service}`}>{r.service}</EntityChip>
                : <span className="opa-muted">—</span>
            ) },
            { key: 'timestamp', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.timestamp)}</span>, sortValue: (r) => Date.parse(r.timestamp) || 0 },
          ]}
          rows={logs} rowKey={(r, i) => r.id || i}
          initialSort={{ key: 'timestamp', dir: 'desc' }} maxHeight={340}
        />
      </Panel>

      {/* Dumps (opa_dump) captured during the trace */}
      <Panel title="Variable dumps" icon={<FiCode />} flush loading={loading} error={trace.error}
        empty={!loading && dumps.length === 0} emptyText="No opa_dump() output in this trace"
        actions={<Badge>{fmtNum(dumps.length)} dumps</Badge>}>
        <div className="td-dumps">
          {dumps.map((d) => <DumpCard key={d._key} d={d} spanName={multiService ? d._span : null} />)}
        </div>
      </Panel>

      {/* Span drawer */}
      {selected && (
        <SpanDrawer
          span={selected}
          traceStart={traceStart}
          rows={rows}
          index={selectedIndex}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// Render one dump: file:line header + the var_dump text (or pretty-printed data).
function DumpBody({ d }) {
  let body = d.text
  if (!body && d.data != null) {
    if (typeof d.data === 'string') {
      try { body = JSON.stringify(JSON.parse(d.data), null, 2) } catch { body = d.data }
    } else {
      body = JSON.stringify(d.data, null, 2)
    }
  }
  return <pre className="td-dump-pre">{body || '(empty)'}</pre>
}

function DumpCard({ d, spanName }) {
  const loc = d.file ? `${d.file}${d.line ? ':' + d.line : ''}` : null
  return (
    <div className="td-dump">
      <div className="td-dump-head">
        <FiCode size={12} />
        {loc && <span className="opa-mono td-dump-loc">{loc}</span>}
        {spanName && <Badge>{spanName}</Badge>}
      </div>
      <DumpBody d={d} />
    </div>
  )
}

function statusPillTone(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'error') return 'error'
  if (s === 'warn' || s === 'warning') return 'warn'
  if (s === 'ok' || s === 'success') return 'ok'
  return 'neutral'
}

// SQL fingerprints are stored whitespace-collapsed (see the agent's
// normalizeSQLQuery), so a raw statement — with its newlines and indentation —
// can never match one by equality. When the backend gave us a fingerprint we use
// it verbatim; otherwise we fall back to a LIKE on the first line-collapsed
// fragment, because guessing at the agent's literal-replacement rules in JS
// would drift from the real implementation.
function sqlDrillFilter(op) {
  const fingerprint = op?.query_fingerprint || op?.fingerprint
  if (fingerprint) return `query_fingerprint:"${fingerprint}"`
  const collapsed = String(op?.query || '').replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  // A prefix is enough to identify a statement and survives literal differences.
  const fragment = collapsed.slice(0, 60).replace(/(["\\])/g, '\\$1')
  return `query_fingerprint:LIKE "${fragment}%"`
}

// Build a filtered Trace Explorer link from a DSL clause.
function tracesHref(filter, service) {
  return buildTracesHref(service ? { service, filter } : { filter })
}

// A drawer value that navigates somewhere useful. Everything the drawer shows
// about a span is a lead worth following ("show me every trace that ran this
// query"), so values render as links rather than dead text.
function DrillLink({ to, title, children, mono = true, style }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className={`td-drill ${mono ? 'opa-mono' : ''}`}
      title={title}
      style={style}
      onClick={(e) => { e.stopPropagation(); navigate(to) }}
    >
      {children}
    </button>
  )
}

function SpanDrawer({ span, traceStart, rows = [], index = -1, onSelect, onClose }) {
  const sql = span.sql || []
  const redis = span.redis || []
  const http = span.http || []
  const dumps = span.dumps || []
  const net = span.net || {}
  const tier = spanTier(span)

  // In-trace movement: previous/next in waterfall order, plus the span's own
  // place in the tree. Keyboard: ←/→ (or j/k) step, Esc closes.
  const prev = index > 0 ? rows[index - 1] : null
  const next = index >= 0 && index < rows.length - 1 ? rows[index + 1] : null
  const parent = span.parent_id ? rows.find((s) => s.span_id === span.parent_id) : null
  const children = rows.filter((s) => s.parent_id && s.parent_id === span.span_id)
  const siblings = span.parent_id
    ? rows.filter((s) => s.parent_id === span.parent_id && s.span_id !== span.span_id)
    : []

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
      if (e.key === 'Escape') { onClose(); return }
      if ((e.key === 'ArrowRight' || e.key === 'j') && next) { e.preventDefault(); onSelect(next) }
      if ((e.key === 'ArrowLeft' || e.key === 'k') && prev) { e.preventDefault(); onSelect(prev) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onSelect, onClose])

  const urlPath = span.url_path || span.uri || null
  const attrChips = spanAttributeLinks(span)
  const tagEntries = (() => {
    const t = span.tags
    if (!t || typeof t !== 'object') return []
    return Object.entries(t)
      .filter(([, v]) => v != null && typeof v !== 'object')
      .slice(0, 24)
  })()

  return (
    <>
      <div className="td-drawer-overlay" onClick={onClose} />
      <div className="td-drawer" role="dialog" aria-label="Span detail">
        <div className="td-drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="opa-row" style={{ gap: 8 }}>
              <span className="tw-tierdot" style={{ background: tierColor(tier) }} />
              {/* The operation name → every trace that ran this operation. */}
              <DrillLink
                to={tracesHref(`name:"${span.name}"`, span.service)}
                title={`All traces running "${span.name}"`}
                style={{ fontSize: 'var(--fs-15)', fontWeight: 'var(--fw-semibold)' }}
              >
                {span.name}
              </DrillLink>
            </div>
            <div className="opa-row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <DrillLink
                to={tracesHref(`status:"${span.status || 'ok'}"`, span.service)}
                title={`All ${span.status || 'ok'} traces for this service`}
                mono={false}
              >
                <StatusPill tone={statusPillTone(span.status)}>{String(span.status || 'ok').toUpperCase()}</StatusPill>
              </DrillLink>
              {span.service && (
                <DrillLink to={`/services/${encodeURIComponent(span.service)}`} title={`Service overview: ${span.service}`} mono={false}>
                  <Badge>{span.service}</Badge>
                </DrillLink>
              )}
              {urlPath && (
                <DrillLink to={tracesHref(`url_path:"${urlPath}"`)} title={`All traces hitting ${urlPath}`} style={{ fontSize: 'var(--fs-11)' }}>
                  {urlPath}
                </DrillLink>
              )}
              <EntityChip to={null} title={`span_id ${span.span_id}`}>{span.span_id}</EntityChip>
              <EntityChipRow items={attrChips.filter((c) => c.kind === 'load_run' || c.kind === 'session' || c.kind === 'check' || c.kind === 'error')} />
            </div>
          </div>
          <div className="opa-row" style={{ gap: 4, alignItems: 'flex-start' }}>
            <button
              className="td-drawer-close" onClick={() => prev && onSelect(prev)} disabled={!prev}
              title={prev ? `Previous span: ${prev.name} (←)` : 'First span'} aria-label="Previous span"
            ><FiChevronLeft size={15} /></button>
            <button
              className="td-drawer-close" onClick={() => next && onSelect(next)} disabled={!next}
              title={next ? `Next span: ${next.name} (→)` : 'Last span'} aria-label="Next span"
            ><FiChevronRight size={15} /></button>
            <button className="td-drawer-close" onClick={onClose} title="Close (Esc)" aria-label="Close span detail"><FiX size={15} /></button>
          </div>
        </div>

        <div className="td-drawer-body">
          {/* Where this span sits in the trace — one click to any neighbour. */}
          {(parent || children.length > 0 || siblings.length > 0) && (
            <div>
              <div className="td-drawer-sub">
                In this trace <span className="opa-muted" style={{ fontWeight: 'normal' }}>· span {index + 1} of {rows.length}</span>
              </div>
              <div className="td-relations">
                {parent && (
                  <button type="button" className="td-relchip" onClick={() => onSelect(parent)} title={`Parent: ${parent.name}`}>
                    <FiArrowUp size={11} /> <span className="opa-mono">{parent.name}</span>
                  </button>
                )}
                {children.map((c) => (
                  <button type="button" key={c.span_id} className="td-relchip" onClick={() => onSelect(c)} title={`Child: ${c.name}`}>
                    <FiArrowDown size={11} /> <span className="opa-mono">{c.name}</span>
                    <span className="opa-muted">{fmtMs(c.duration_ms)}</span>
                  </button>
                ))}
                {siblings.slice(0, 8).map((sib) => (
                  <button type="button" key={sib.span_id} className="td-relchip is-sibling" onClick={() => onSelect(sib)} title={`Sibling: ${sib.name}`}>
                    <span className="opa-mono">{sib.name}</span>
                    <span className="opa-muted">{fmtMs(sib.duration_ms)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="opa-grid cols-3" style={{ gap: 12 }}>
            <div className="td-metastat"><span className="k">Duration</span><span className="v" style={{ color: `var(--${latencyStatus(span.duration_ms)})` }}>{fmtMs(span.duration_ms)}</span></div>
            <div className="td-metastat"><span className="k">CPU</span><span className="v">{fmtMs(span.cpu_ms)}</span></div>
            <div className="td-metastat"><span className="k">Start</span><span className="v">+{fmtMs((span.start_ts || 0) - traceStart)}</span></div>
          </div>

          {net && (net.bytes_in != null || net.bytes_out != null) && (
            <div>
              <div className="td-drawer-sub">Network</div>
              <div className="opa-row" style={{ gap: 20 }}>
                <span className="opa-mono"><FiArrowUp size={12} /> {fmtBytes(net.bytes_out)}</span>
                <span className="opa-mono"><FiArrowDown size={12} /> {fmtBytes(net.bytes_in)}</span>
              </div>
            </div>
          )}

          {tagEntries.length > 0 && (
            <div>
              <div className="td-drawer-sub">Attributes</div>
              <div className="td-taggrid">
                {tagEntries.map(([k, v]) => {
                  const link = attrChips.find((c) => String(c.value) === String(v) && (c.key === k || c.key.endsWith(k)))
                    || (k === 'http.url' || k === 'url' ? { to: tracesHref(`http.url:"${v}"`) } : null)
                  const known = ['load_run_id', 'session_id', 'check_id', 'service', 'url_path'].includes(k)
                    || k.endsWith('load_run_id') || k.endsWith('session_id')
                  return (
                    <div key={k} className="td-tagrow">
                      <span className="opa-muted opa-mono">{k}</span>
                      {known || link?.to ? (
                        <EntityChip to={link?.to || tracesHref(`tags.${k}:"${String(v).replace(/(["\\])/g, '\\$1')}"`)} title={`${k}=${v}`}>
                          {String(v)}
                        </EntityChip>
                      ) : (
                        <span className="opa-mono">{String(v)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {sql.length > 0 && (
            <div>
              <div className="td-drawer-sub">SQL ({sql.length})</div>
              {sql.map((q, i) => (
                <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
                  {/* The statement → its fingerprint page (aggregate stats +
                      every trace that ran it). */}
                  <DrillLink
                    to={(q.query_fingerprint || q.fingerprint)
                      ? `/sql/${encodeURIComponent(q.query_fingerprint || q.fingerprint)}`
                      : tracesHref(sqlDrillFilter(q) || '')}
                    title="Open this query's detail (all traces running it)"
                    style={{ fontSize: 'var(--fs-12)', color: 'var(--text-primary)', wordBreak: 'break-word', textAlign: 'left' }}
                  >
                    {q.query}
                  </DrillLink>
                  <div className="opa-row opa-muted" style={{ gap: 14, marginTop: 4, fontSize: 'var(--fs-11)' }}>
                    <span>{q.query_type || q.type}</span>
                    <span style={{ color: `var(--${latencyStatus(q.duration_ms)})` }}>{fmtMs(q.duration_ms)}</span>
                    <span>{q.rows_affected != null && q.rows_affected >= 0 ? `${fmtNum(q.rows_affected)} rows` : ''}</span>
                    <span>↑{fmtBytes(q.bytes_out)} ↓{fmtBytes(q.bytes_in)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {redis.length > 0 && (
            <div>
              <div className="td-drawer-sub">Redis ({redis.length})</div>
              {redis.map((r, i) => (
                <div key={i} className="opa-row" style={{ justifyContent: 'space-between', gap: 10, marginBottom: 6, fontSize: 'var(--fs-12)' }}>
                  <DrillLink
                    to={tracesHref(r.key ? `redis.command:"${r.command}" AND redis.key:"${r.key}"` : `redis.command:"${r.command}"`)}
                    title={`All traces issuing ${r.command}${r.key ? ' on ' + r.key : ''}`}
                  >
                    <span style={{ color: 'var(--tier-redis)' }}>{r.command}</span> <span className="opa-muted">{r.key}</span>
                  </DrillLink>
                  <span className="opa-row" style={{ gap: 10 }}>
                    {r.hit != null && <StatusPill tone={r.hit ? 'ok' : 'warn'}>{r.hit ? 'HIT' : 'MISS'}</StatusPill>}
                    <span className="opa-mono" style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {http.length > 0 && (
            <div>
              <div className="td-drawer-sub">HTTP ({http.length})</div>
              {http.map((h, i) => (
                <div key={i} style={{ marginBottom: 8, fontSize: 'var(--fs-12)' }}>
                  <div className="opa-mono" style={{ wordBreak: 'break-all' }}>
                    <Badge>{h.method}</Badge> <span style={{ color: statusColor(h.status_code) }}>{h.status_code}</span>{' '}
                    {/* The call → its endpoint page (aggregate + sample traces). */}
                    <DrillLink
                      to={`/http/${encodeURIComponent(h.url || `${h.method || 'GET'} ${h.uri || ''}`.trim())}`}
                      title="Open this endpoint's detail"
                      style={{ wordBreak: 'break-all', textAlign: 'left' }}
                    >
                      {h.url || h.uri}
                    </DrillLink>
                  </div>
                  <div className="opa-row opa-muted" style={{ gap: 14, marginTop: 3, fontSize: 'var(--fs-11)' }}>
                    <span style={{ color: `var(--${latencyStatus(h.duration_ms)})` }}>{fmtMs(h.duration_ms)}</span>
                    <span>↑{fmtBytes(h.request_size ?? h.bytes_sent)} ↓{fmtBytes(h.response_size ?? h.bytes_received)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {dumps.length > 0 && (
            <div>
              <div className="td-drawer-sub">Dumps ({dumps.length})</div>
              <div className="td-dumps">
                {dumps.map((d, i) => <DumpCard key={i} d={d} spanName={null} />)}
              </div>
            </div>
          )}

          {sql.length === 0 && redis.length === 0 && http.length === 0 && dumps.length === 0 && (
            <div className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>No operations recorded on this span.</div>
          )}
        </div>
      </div>
    </>
  )
}
