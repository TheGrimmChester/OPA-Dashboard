import React, { useMemo, useState, useRef, useEffect } from 'react'
import {
  FiActivity, FiClock, FiHash, FiCode, FiBarChart2, FiTrendingUp, FiAlertTriangle, FiInbox, FiX,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, InlineBar, Badge, SegmentedControl } from '../components/ui'
import FlameGraph from '../components/FlameGraph'
import { ProfileToolbar } from '../components/profile'
import { detectOpType, typeFill, typeLabel } from '../utils/opTypes'
import { fmtMs, fmtBytes, fmtNum, fmtPct } from '../theme/format'
import './ProfilingView.css'

const ALL = '__all__'

const VIEWS = [
  { value: 'hotspots', label: 'Hot spots' },
  { value: 'flame', label: 'Flame' },
]
const LIMITS = [
  { value: 200, label: '200' },
  { value: 500, label: '500' },
  { value: 1000, label: '1k' },
]

// /api/profiles returns rows that are ALREADY aggregated per function: there are
// no call instances and no call edges, so neither the shared call-graph model nor
// HotSpots' caller/callee pivot can be rebuilt from it. The toolbar's metric
// therefore selects which returned column carries the rank and the bar; io and
// network are not aggregated server-side at all and fall back to call count.
const RANKERS = {
  duration: { key: 'self_wall_ms', col: 'self', label: 'self wall time' },
  cpu: { key: 'total_cpu_ms', col: 'cpu', label: 'CPU time' },
  memory: { key: 'memory_delta', col: 'mem', label: 'memory delta', abs: true },
  io: null,
  network: null,
}
const CALL_RANKER = { key: 'call_count', col: 'calls', label: 'call count' }

const GROUP_HEADER = { method: 'Function', class: 'Class', file: 'Function', namespace: 'Namespace' }
const GROUP_PLURAL = { method: 'Functions', class: 'Classes', file: 'Functions', namespace: 'Namespaces' }
// Only the two dimensions the endpoint never aggregates are ever named here.
const METRIC_LABEL = { io: 'I/O wait', network: 'network bytes' }

// Rows can repeat a function name across services, so identity is the pair.
const rowId = (r) => `${r.service || ''}\u0000${r.function || ''}`

// Derive the toolbar's groupBy key from an aggregate row. The endpoint returns
// only `function` (already "Class::method" for methods) and `service`, so 'file'
// degrades to the function key — the same fallback the shared model's groupKeyOf
// applies to a record that carries no file.
function groupKeyOf(row, groupBy) {
  const fn = row.function || 'unknown'
  const sep = fn.lastIndexOf('::')
  const cls = sep > 0 ? fn.slice(0, sep) : ''
  if (groupBy === 'class') return cls || fn
  if (groupBy === 'namespace') {
    if (!cls) return fn
    const parts = cls.split('\\')
    return parts.length >= 2 ? `${parts[0]}\\${parts[1]}` : parts[0]
  }
  return fn
}

// Fold rows onto the grouping key. Self time, self % and call counts are
// exclusive, so they add exactly; the inclusive columns are summed too but the
// panel says out loud that a group's sum double-counts nested members.
function groupRows(rows, groupBy) {
  if (groupBy !== 'class' && groupBy !== 'namespace') return rows
  const map = new Map()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const key = groupKeyOf(r, groupBy)
    let g = map.get(key)
    if (!g) {
      g = {
        function: key, service: r.service || null, members: 0, mixedService: false,
        call_count: 0, self_wall_ms: 0, self_pct: 0,
        total_wall_ms: 0, total_cpu_ms: 0, memory_delta: 0,
      }
      map.set(key, g)
    }
    g.members++
    if (r.service && g.service && r.service !== g.service) g.mixedService = true
    g.call_count += r.call_count || 0
    g.self_wall_ms += r.self_wall_ms || 0
    g.self_pct += r.self_pct || 0
    g.total_wall_ms += r.total_wall_ms || 0
    g.total_cpu_ms += r.total_cpu_ms || 0
    g.memory_delta += r.memory_delta || 0
  }
  return [...map.values()]
}

export default function ProfilingView() {
  const [service, setService] = useState(ALL)
  const [view, setView] = useState('hotspots')
  const [metric, setMetric] = useState('duration')
  const [groupBy, setGroupBy] = useState('method')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(200)
  const [selectedKey, setSelectedKey] = useState(null)

  const meta = useApi('/api/services/metadata', {}, { noRange: true })
  const profiles = useApi('/api/profiles', {
    limit,
    ...(service !== ALL ? { service } : {}),
  })
  // Aggregate flame tree — the endpoint requires a specific service, so skip
  // the call entirely while "All services" is selected.
  const flame = useApi(
    '/api/profiles/flame',
    service !== ALL ? { service } : {},
    { skip: service === ALL },
  )

  const services = meta.data?.services || []
  const functions = profiles.data?.functions || []
  const totalSelf = profiles.data?.total_self_wall_ms || 0
  const flameTree = flame.data?.tree || []

  const grouped = groupBy === 'class' || groupBy === 'namespace'
  const metricMissing = !RANKERS[metric]
  // The API returns the top `limit` rows by self time, so hitting the limit means
  // the tail is missing rather than absent.
  const capped = functions.length >= limit

  // The KPI strip and the toolbar summary describe the DATASET, so they read off
  // the grouped-but-unfiltered set; only the table follows the search box.
  const base = useMemo(() => groupRows(functions, groupBy), [functions, groupBy])
  const baseSelf = useMemo(() => base.reduce((a, r) => a + (r.self_wall_ms || 0), 0), [base])
  const baseCalls = useMemo(() => base.reduce((a, r) => a + (r.call_count || 0), 0), [base])
  const hottest = useMemo(
    () => (base.length ? base.reduce((a, r) => ((r.self_wall_ms || 0) > (a.self_wall_ms || 0) ? r : a), base[0]) : null),
    [base],
  )
  const hottestPct = hottest && totalSelf > 0 ? ((hottest.self_wall_ms || 0) / totalSelf) * 100 : 0
  const coverage = totalSelf > 0 ? (baseSelf / totalSelf) * 100 : 0
  const avgSelf = baseCalls > 0 ? baseSelf / baseCalls : 0

  // Filter -> rank. `_rank` is baked onto the row so the # column keeps showing
  // the metric ranking even after the user sorts by another column.
  const ranked = useMemo(() => {
    const ranker = RANKERS[metric] || CALL_RANKER
    const value = (r) => {
      const v = r[ranker.key] || 0
      return ranker.abs ? Math.abs(v) : v
    }
    const q = query.trim().toLowerCase()
    const kept = q
      ? base.filter((r) => `${r.function || ''} ${r.service || ''}`.toLowerCase().includes(q))
      : base
    const sorted = kept.slice().sort((a, b) => (
      value(b) - value(a) || String(a.function || '').localeCompare(String(b.function || ''))
    ))
    let max = 0
    const rows = sorted.map((r, i) => {
      const v = value(r)
      if (v > max) max = v
      return { ...r, _rank: i + 1 }
    })
    return { rows, ranker, max, value }
  }, [base, query, metric])

  const rows = ranked.rows

  const selected = useMemo(
    () => (selectedKey ? rows.find((r) => rowId(r) === selectedKey) || null : null),
    [rows, selectedKey],
  )
  // Grouping rewrites the row identities, so a stale selection has to go.
  useEffect(() => { setSelectedKey(null) }, [groupBy, service])

  // FlameGraph renders a fixed-width SVG; measure the panel so it fills it, and
  // track viewport height so its box scales with the window (same pattern as
  // TraceDetail) instead of sitting at a magic constant.
  const flameRef = useRef(null)
  const [flameW, setFlameW] = useState(960)
  const [vpH, setVpH] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight))
  useEffect(() => {
    const measure = () => {
      setVpH(window.innerHeight)
      if (flameRef.current) setFlameW(Math.max(320, flameRef.current.offsetWidth - 4))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [flameTree.length, service, view])

  // Chrome above the view: page head + KPI strip + panel head + toolbar. Clamped
  // so the graph stays readable on a laptop and bounded on a tall display.
  const flameH = Math.max(320, Math.min(720, vpH - 400))
  const listH = Math.max(300, Math.min(680, vpH - 380))

  const toggle = (r) => setSelectedKey((k) => (k === rowId(r) ? null : rowId(r)))

  // Numeric cell: the column the metric ranks by carries the proportion bar, the
  // rest stay plain figures so no header ever implies the wrong dimension.
  const numCell = (col, row, text, color) => (
    ranked.ranker.col === col
      ? <InlineBar value={ranked.value(row)} max={ranked.max} label={text} color={color || 'var(--accent)'} />
      : <span className="oui-num">{text}</span>
  )

  const columns = [
    {
      key: '_rank',
      header: '#',
      num: true,
      width: 44,
      render: (r) => <span className="oui-text-muted oui-num">{r._rank}</span>,
      sortValue: (r) => r._rank,
    },
    {
      key: 'function',
      header: GROUP_HEADER[groupBy] || 'Function',
      render: (r) => {
        const type = detectOpType({ function: r.function })
        return (
          <button
            type="button"
            className={`opa-profiling-fnbtn ${rowId(r) === selectedKey ? 'is-selected' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggle(r) }}
            title={r.function}
          >
            {/* Plain functions are the default, so they get a bare tinted dot;
                sql / http / redis / cache earn the label. */}
            {type === 'function' || !type ? (
              <span className="opa-dot opa-profiling-type" style={{ background: typeFill(type) }} title={typeLabel(type)} />
            ) : (
              <span className="opa-badge">
                <span className="opa-dot opa-profiling-type" style={{ background: typeFill(type) }} />
                {typeLabel(type)}
              </span>
            )}
            <span className="opa-profiling-fn oui-mono cell-strong">{r.function || '—'}</span>
            {r.members > 1 && <Badge title="functions folded into this group">{fmtNum(r.members)} fns</Badge>}
            {r.mixedService
              ? <Badge title="this group spans several services">multi-service</Badge>
              : (!grouped && r.service ? <Badge>{r.service}</Badge> : null)}
          </button>
        )
      },
      sortValue: (r) => r.function || '',
    },
    {
      key: 'self_wall_ms',
      header: 'Self',
      num: true,
      width: 130,
      render: (r) => numCell('self', r, fmtMs(r.self_wall_ms)),
      sortValue: (r) => r.self_wall_ms || 0,
    },
    {
      key: 'self_pct',
      header: 'Self %',
      num: true,
      width: 76,
      render: (r) => <span className="oui-num">{fmtPct(r.self_pct)}</span>,
      sortValue: (r) => r.self_pct || 0,
    },
    {
      key: 'total_wall_ms',
      header: 'Total',
      num: true,
      width: 84,
      render: (r) => <span className="oui-num">{fmtMs(r.total_wall_ms)}</span>,
      sortValue: (r) => r.total_wall_ms || 0,
    },
    {
      key: 'total_cpu_ms',
      header: 'CPU',
      num: true,
      width: 120,
      render: (r) => numCell('cpu', r, fmtMs(r.total_cpu_ms), 'var(--chart-1)'),
      sortValue: (r) => r.total_cpu_ms || 0,
    },
    {
      key: 'memory_delta',
      header: 'Mem',
      num: true,
      width: 120,
      render: (r) => numCell(
        'mem', r,
        <span style={{ color: (r.memory_delta || 0) < 0 ? 'var(--good-text)' : undefined }}>{fmtBytes(r.memory_delta)}</span>,
        'var(--chart-5)',
      ),
      sortValue: (r) => r.memory_delta || 0,
    },
    {
      key: 'call_count',
      header: 'Calls',
      num: true,
      width: 110,
      render: (r) => numCell('calls', r, fmtNum(r.call_count), 'var(--chart-2)'),
      sortValue: (r) => r.call_count || 0,
    },
  ]

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Profiling</h1>
          <div className="opa-page-sub">
            Aggregated function cost across all traces · call depth bounded by <span className="oui-mono">opa.stack_depth</span>
          </div>
        </div>
        <div className="oui-row">
          <select
            className="opa-select"
            aria-label="Filter profiling data by service"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value={ALL}>All services</option>
            {services.map((s) => (
              <option key={s.service} value={s.service}>{s.service}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile
          label="Total self time" icon={<FiClock size={12} />} value={fmtMs(totalSelf)} status="neutral"
          footer={<span className="oui-text-muted">{capped ? `top ${fmtNum(base.length)} covers ${fmtPct(coverage, 0)}` : 'complete'}</span>}
        />
        <KpiTile
          label={GROUP_PLURAL[groupBy] || 'Functions'} icon={<FiCode size={12} />}
          value={fmtNum(base.length)} status="neutral"
          footer={<span className="oui-text-muted">{capped ? `capped at ${fmtNum(limit)}` : 'all returned'}</span>}
        />
        <KpiTile
          label="Total calls" icon={<FiHash size={12} />} value={fmtNum(baseCalls)} status="neutral"
          footer={<span className="oui-text-muted">{fmtMs(avgSelf)} avg self / call</span>}
        />
        <KpiTile
          label="Hottest share" icon={<FiTrendingUp size={12} />}
          value={hottest ? fmtPct(hottestPct) : '—'}
          status={hottestPct >= 40 ? 'warn' : 'neutral'}
          footer={<span className="oui-text-muted oui-mono opa-profiling-kpifn">{hottest ? hottest.function : 'no data'}</span>}
        />
      </div>

      {/* The two views read different endpoints, so the panel's shared state slots
          only follow /api/profiles; the flame view carries its own. */}
      <Panel
        title="Profile" icon={<FiActivity />} flush
        loading={view === 'hotspots' && profiles.loading}
        error={view === 'hotspots' ? profiles.error : null}
        empty={view === 'hotspots' && !profiles.loading && !profiles.error && functions.length === 0}
        emptyText="No profiling data — run traffic with the OPA profiler enabled."
        actions={<SegmentedControl options={VIEWS} value={view} onChange={setView} />}
      >
        <div className="opa-profiling">
          <div className="opa-profiling-bar">
            <ProfileToolbar
              metric={metric}
              onMetricChange={setMetric}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              query={query}
              onQueryChange={setQuery}
              // `truncated` is deliberately false: the toolbar's pill describes an
              // ingest cap with a scanned denominator, which this pre-aggregated
              // endpoint has no equivalent of. The top-N cap is stated below instead.
              totals={{
                wall: baseSelf, cpu: 0, io: 0, memory: 0, network: 0,
                calls: baseCalls, symbols: base.length, maxDepth: 0,
                structureMode: metricMissing, truncated: false,
              }}
              right={
                <div className="oui-row opa-profiling-limit">
                  <span className="oui-text-muted">Top</span>
                  <SegmentedControl options={LIMITS} value={limit} onChange={setLimit} />
                </div>
              }
            />
          </div>

          {metricMissing && (
            <div className="opa-profiling-note">
              <FiAlertTriangle size={13} />
              <span>
                <span className="oui-mono">/api/profiles</span> does not aggregate {METRIC_LABEL[metric] || metric} —
                rows are ranked by call count instead. Nothing below is a {METRIC_LABEL[metric] || metric} measurement.
              </span>
            </div>
          )}
          {groupBy === 'file' && (
            <div className="opa-profiling-note">
              <FiAlertTriangle size={13} />
              <span>
                <span className="oui-mono">/api/profiles</span> rows carry no file path, so File grouping falls back
                to one row per function.
              </span>
            </div>
          )}
          {grouped && (
            <div className="opa-profiling-note">
              <FiAlertTriangle size={13} />
              <span>
                Grouped by {groupBy}: Self, Self % and Calls add up exactly. Total, CPU and Mem are inclusive per
                function, so a group&apos;s sum double-counts nested members — rank on Self.
              </span>
            </div>
          )}

          {view === 'hotspots' ? (
            <>
              {selected && (
                <div className="opa-profiling-detail">
                  <div className="opa-profiling-detail-head">
                    <span className="oui-mono cell-strong opa-profiling-detail-name">{selected.function}</span>
                    <span className="opa-badge">rank {selected._rank}</span>
                    {selected.service && <Badge>{selected.service}</Badge>}
                    <button
                      className="opa-btn ghost opa-profiling-detail-close"
                      aria-label="Clear selected function"
                      onClick={() => setSelectedKey(null)}
                    >
                      <FiX size={13} />
                    </button>
                  </div>
                  <SelfVsCallees row={selected} />
                  <div className="opa-profiling-detail-grid">
                    <Stat k="Self" v={fmtMs(selected.self_wall_ms)} />
                    <Stat k="Total" v={fmtMs(selected.total_wall_ms)} />
                    <Stat k="In callees" v={fmtMs(Math.max(0, (selected.total_wall_ms || 0) - (selected.self_wall_ms || 0)))} />
                    <Stat k="CPU" v={fmtMs(selected.total_cpu_ms)} />
                    <Stat k="Memory" v={fmtBytes(selected.memory_delta)} />
                    <Stat k="Calls" v={fmtNum(selected.call_count)} />
                    <Stat k="Self / call" v={fmtMs((selected.self_wall_ms || 0) / Math.max(1, selected.call_count || 0))} />
                    <Stat k="Share of self" v={fmtPct(selected.self_pct)} />
                  </div>
                  <div className="opa-profiling-detail-hint">
                    Callers and callees need per-call data, which this aggregate does not carry — open a trace and
                    use Profile › Hot spots for the caller/callee pivot.
                  </div>
                </div>
              )}
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => rowId(r)}
                onRowClick={toggle}
                emptyText={`No function matches “${query}”`}
                maxHeight={listH}
              />
              <div className="opa-profiling-foot">
                <FiBarChart2 size={12} />
                Ranked by {ranked.ranker.label}
                {query.trim() !== '' && <> · {fmtNum(rows.length)} of {fmtNum(base.length)} match the filter</>}
                {capped && <> · the API returns only the top {fmtNum(limit)} rows by self time</>}
              </div>
            </>
          ) : (
            <div className="opa-profiling-graph">
              {service === ALL ? (
                <div className="opa-empty"><FiInbox /><div>Select a service to render its aggregate flame graph</div></div>
              ) : flame.error ? (
                <div className="opa-errstate"><FiAlertTriangle /><div>{String(flame.error)}</div></div>
              ) : flame.loading ? (
                <div className="opa-skel" style={{ height: flameH }} />
              ) : flameTree.length === 0 ? (
                <div className="opa-empty"><FiInbox /><div>No aggregate flame data for this service in the selected range.</div></div>
              ) : (
                <>
                  <div className="opa-profiling-graph-head">
                    <span className="oui-text-muted"><FiClock size={12} /> total {fmtMs(flame.data?.total_ms)}</span>
                  </div>
                  {/* Measured on the inner (unpadded) box so the SVG width matches
                      the real content width instead of overflowing by the padding. */}
                  <div ref={flameRef} className="opa-profiling-graph-inner">
                    <FlameGraph callStack={flameTree} width={flameW} height={flameH} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}

function Stat({ k, v }) {
  return (
    <div className="opa-profiling-stat">
      <span className="k">{k}</span>
      <span className="v oui-mono">{v}</span>
    </div>
  )
}

// Self vs callee split for one aggregate row. Grouped rows sum inclusive totals,
// so the callee share is clamped at zero rather than rendered negative.
function SelfVsCallees({ row }) {
  const self = Math.max(0, row.self_wall_ms || 0)
  const callees = Math.max(0, (row.total_wall_ms || 0) - self)
  const total = self + callees
  const selfPct = total > 0 ? (self / total) * 100 : 100
  return (
    <div className="opa-profiling-split">
      <div className="opa-profiling-split-bar">
        <span className="self" style={{ width: `${selfPct}%` }} title={`self ${fmtMs(self)}`} />
        <span className="callees" style={{ width: `${100 - selfPct}%` }} title={`callees ${fmtMs(callees)}`} />
      </div>
      <div className="opa-profiling-split-legend">
        <span><span className="sw self" />self {fmtPct(selfPct, 0)}</span>
        <span><span className="sw callees" />callees {fmtPct(100 - selfPct, 0)}</span>
      </div>
    </div>
  )
}
