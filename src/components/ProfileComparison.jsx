import React, { useState, useMemo, useRef, useEffect, useId } from 'react'
import {
  FiActivity, FiCode, FiCpu, FiDatabase, FiDownload, FiFileText, FiGitBranch,
  FiGlobe, FiHardDrive, FiInfo, FiLayers, FiServer, FiSliders, FiTag, FiUpload, FiZap,
} from 'react-icons/fi'
import CallGraph from './CallGraph'
import FlameGraph from './FlameGraph'
import ExecutionStackTree from './ExecutionStackTree'
import LogCorrelation from './LogCorrelation'
import JsonTreeViewer from './JsonTreeViewer'
import SqlComparisonTable from './comparison/SqlComparisonTable'
import HttpComparisonTable from './comparison/HttpComparisonTable'
import CacheComparisonTable from './comparison/CacheComparisonTable'
import RedisComparisonTable from './comparison/RedisComparisonTable'
import TagComparisonView from './comparison/TagComparisonView'
import {
  Panel, KpiTile, DataTable, DeltaIndicator, Badge, StatusPill, HealthDot, Tabs, EmptyState,
} from './ui'
import { fmtMs, fmtBytes, fmtNum, fmtPct } from '../theme/format'
import {
  calculateOverallMetrics,
  extractSqlQueries,
  extractHttpRequests,
  extractCacheOperations,
  extractRedisOperations,
  extractStackTraces,
  extractTags,
  extractDumps,
  compareMetrics,
  compareSqlQueries,
  compareHttpRequests,
  compareCacheOperations,
  compareRedisOperations,
  compareTags,
} from '../utils/comparisonUtils'
import './ProfileComparison.css'

// ---------------------------------------------------------------------------
// diff model
// ---------------------------------------------------------------------------

// Field names arrive in both snake_case and PascalCase depending on the agent.
function getNodeSignature(node) {
  const className = node.class || node.Class || ''
  const functionName = node.function || node.Function || node.name || ''
  return className ? `${className}::${functionName}` : functionName
}

// Index one call stack by signature. Stacks reach us FLAT (linked by parent_id),
// but legacy payloads can still nest under .children, so both are covered.
// Iterative with a WeakSet guard: .children can be cyclic and can nest thousands
// deep, either of which kills a recursive walk.
function indexBySignature(nodes, index = new Map()) {
  if (!Array.isArray(nodes)) return index
  const seen = new WeakSet()
  const stack = [...nodes]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (seen.has(node)) continue
    seen.add(node)
    const sig = getNodeSignature(node)
    const bucket = index.get(sig)
    if (bucket) bucket.push(node)
    else index.set(sig, [node])
    const kids = node.children
    if (Array.isArray(kids)) {
      for (let i = 0; i < kids.length; i++) stack.push(kids[i])
    }
  }
  return index
}

function metricPair(node, snake, pascal) {
  return node[snake] || node[pascal] || 0
}

// Percent change of one metric. A zero baseline is NOT "no change": going from
// nothing to a real cost is the most important thing a regression diff can show,
// so it reports +Infinity (and 0 -> 0 stays 0). Callers must therefore compare
// magnitudes rather than assume a finite number.
function pctChange(oldValue, newValue) {
  if (oldValue === 0) {
    if (newValue === 0) return 0
    return newValue > 0 ? Infinity : -Infinity
  }
  return ((newValue - oldValue) / Math.abs(oldValue)) * 100
}

// 'improvement' | 'degradation' | 'no-change' for a matched pair of nodes.
// Only primitives are allocated: this runs once per node of a stack that can
// reach 200k entries, so no per-node diff objects are built.
function nodeChangeStatus(oldNode, newNode, threshold) {
  const changes = [
    pctChange(metricPair(oldNode, 'duration_ms', 'DurationMs') || oldNode.duration || 0,
      metricPair(newNode, 'duration_ms', 'DurationMs') || newNode.duration || 0),
    pctChange(metricPair(oldNode, 'cpu_ms', 'CPUMs') || oldNode.cpu || 0,
      metricPair(newNode, 'cpu_ms', 'CPUMs') || newNode.cpu || 0),
    pctChange(metricPair(oldNode, 'memory_delta', 'MemoryDelta'),
      metricPair(newNode, 'memory_delta', 'MemoryDelta')),
    pctChange(
      metricPair(oldNode, 'network_bytes_sent', 'NetworkBytesSent') + metricPair(oldNode, 'network_bytes_received', 'NetworkBytesReceived'),
      metricPair(newNode, 'network_bytes_sent', 'NetworkBytesSent') + metricPair(newNode, 'network_bytes_received', 'NetworkBytesReceived'),
    ),
  ]
  let significant = false
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    // An exactly-unchanged metric is never significant. Testing only
    // `abs < threshold` classified every unchanged node as an improvement at
    // threshold 0, because 0 is not < 0 and not > 0.
    if (change === 0) continue
    if (Math.abs(change) < threshold) continue
    // Any degradation dominates the node's colour. Infinity lands here too:
    // new cost against a zero baseline is a regression, not an improvement.
    if (change > 0) return 'degradation'
    significant = true
  }
  return significant ? 'improvement' : 'no-change'
}

const AVG_FIELDS = [
  ['duration_ms', 'DurationMs', 'duration'],
  ['cpu_ms', 'CPUMs', 'cpu'],
  ['memory_delta', 'MemoryDelta', null],
  ['network_bytes_sent', 'NetworkBytesSent', null],
  ['network_bytes_received', 'NetworkBytesReceived', null],
]

// A signature usually occurs many times in the baseline (a hot query called 40
// times). Comparing against whichever instance happened to be indexed first made
// the verdict depend on stack order, so compare against the signature's MEAN.
function baselineAverage(bucket) {
  const avg = {}
  for (const [snake, pascal, plain] of AVG_FIELDS) {
    let sum = 0
    for (let i = 0; i < bucket.length; i++) {
      const node = bucket[i]
      const v = node[snake] || node[pascal] || (plain ? node[plain] : 0) || 0
      sum += v
    }
    avg[snake] = sum / bucket.length
  }
  return avg
}

// Tag every node of the new stack with _diffStatus, which callGraphModel folds
// into its diff column (DIFF_CODES: no-change | improvement | degradation | new).
// Iterative + WeakSet-guarded for the same reason as indexBySignature.
function createDiffCallStack(oldStack, newStack, threshold = 5) {
  if (!Array.isArray(newStack)) return []
  const oldIndex = indexBySignature(oldStack)
  const avgCache = new Map()
  const baselineFor = (sig) => {
    if (avgCache.has(sig)) return avgCache.get(sig)
    const bucket = oldIndex.get(sig)
    const avg = bucket && bucket.length > 0 ? baselineAverage(bucket) : null
    avgCache.set(sig, avg)
    return avg
  }

  const tag = (node) => {
    const copy = { ...node }
    const base = baselineFor(getNodeSignature(node))
    copy._diffStatus = base ? nodeChangeStatus(base, node, threshold) : 'new'
    return copy
  }

  const seen = new WeakSet()
  const roots = newStack.map(tag)
  const stack = []
  for (let i = 0; i < newStack.length; i++) stack.push([newStack[i], roots[i]])
  while (stack.length > 0) {
    const [orig, copy] = stack.pop()
    if (!orig || typeof orig !== 'object') continue
    if (seen.has(orig)) continue
    seen.add(orig)
    const kids = orig.children
    if (!Array.isArray(kids) || kids.length === 0) continue
    const copies = new Array(kids.length)
    for (let i = 0; i < kids.length; i++) {
      copies[i] = tag(kids[i])
      stack.push([kids[i], copies[i]])
    }
    copy.children = copies
  }
  return roots
}

// ---------------------------------------------------------------------------
// static config
// ---------------------------------------------------------------------------

// Overview tiles. `invert` is implicit and always on: every metric here is
// "more is worse", which is what compareMetrics()' changeType already assumes.
const OVERVIEW_METRICS = [
  { key: 'duration', label: 'Duration', icon: <FiActivity />, fmt: fmtMs },
  { key: 'cpu', label: 'CPU time', icon: <FiCpu />, fmt: fmtMs },
  { key: 'memory', label: 'Memory', icon: <FiServer />, fmt: fmtBytes },
  { key: 'spans', label: 'Spans', icon: <FiLayers />, fmt: fmtNum, exact: true },
  { key: 'sqlQueries', label: 'SQL queries', icon: <FiDatabase />, fmt: fmtNum, exact: true },
  { key: 'httpRequests', label: 'HTTP requests', icon: <FiGlobe />, fmt: fmtNum, exact: true },
  { key: 'cacheOperations', label: 'Cache ops', icon: <FiZap />, fmt: fmtNum, exact: true },
  { key: 'redisOperations', label: 'Redis ops', icon: <FiHardDrive />, fmt: fmtNum, exact: true },
  { key: 'networkSent', label: 'Bytes sent', icon: <FiUpload />, fmt: fmtBytes },
  { key: 'networkReceived', label: 'Bytes received', icon: <FiDownload />, fmt: fmtBytes },
  { key: 'stackTraces', label: 'Stack traces', icon: <FiCode />, fmt: fmtNum, exact: true },
  { key: 'tags', label: 'Tags', icon: <FiTag />, fmt: fmtNum, exact: true },
]

const CHANGE_STATUS = { improvement: 'ok', degradation: 'error', 'no-change': 'neutral' }

// Same A/B vocabulary as the Compare page's trace selectors.
const A_TITLE = <>Trace A <span className="opa-muted">· Baseline</span></>
const B_TITLE = <>Trace B <span className="opa-muted">· New</span></>

const AB_COLUMNS = [
  { key: 'label', header: 'Metric', sortable: false, render: (r) => <span className="cell-strong">{r.label}</span> },
  { key: 'a', header: 'Baseline (A)', num: true, sortable: false, render: (r) => r.fmt(r.a) },
  { key: 'b', header: 'New (B)', num: true, sortable: false, render: (r) => r.fmt(r.b) },
  { key: 'delta', header: 'Δ', num: true, sortable: false, render: (r) => <DeltaIndicator current={r.b} previous={r.a} invert /> },
]

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Two panels: 2-up when comparing side by side, stacked full-width in diff mode.
function AbSplit({ stacked, children }) {
  return <div className={stacked ? 'opa-stack' : 'opa-grid cols-2'}>{children}</div>
}

function dumpTotal(items) {
  return items.reduce((sum, item) => sum + item.dumps.length, 0)
}

// Dump payloads arrive already parsed or as a JSON string; keep the raw string
// when it is not JSON at all so nothing is silently swallowed.
function parseDump(data) {
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

function shortId(id) {
  const s = String(id || '')
  if (!s) return '—'
  return s.length > 14 ? `${s.slice(0, 14)}…` : s
}

function DumpList({ items }) {
  return (
    <div className="opa-cmp-dumps">
      {items.map((item, spanIdx) => (
        <div key={`${item.spanId || 'span'}-${spanIdx}`} className="opa-cmp-dump-group">
          <div className="opa-cmp-dump-head">
            <span className="cell-strong">{item.span || 'unnamed span'}</span>
            <Badge title={`Span ${item.spanId || 'unknown'}`}>{shortId(item.spanId)}</Badge>
            <span className="opa-muted opa-cmp-dump-count">{fmtNum(item.dumps.length)} dumps</span>
          </div>
          {item.dumps.map((dump, dumpIdx) => (
            <div key={dumpIdx} className="opa-cmp-dump">
              <div className="opa-cmp-dump-meta">
                <span className="opa-mono">{dump.file || 'unknown'}</span>
                <span className="opa-muted">line {dump.line ?? '?'}</span>
              </div>
              <div className="opa-cmp-dump-body">
                <JsonTreeViewer data={parseDump(dump.data)} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ProfileComparison({ trace1, trace2, viewMode = 'diff' }) {
  const uid = useId()
  const [activeTab, setActiveTab] = useState('overview')
  const [threshold, setThreshold] = useState(5)
  // Tagging a 200k-node stack costs a full copy, so only do it once the diff
  // call graph has actually been opened. Latched, not gated on the live tab, so
  // switching away and back does not recompute.
  const [diffArmed, setDiffArmed] = useState(false)

  // The flame/call graphs render fixed-width SVG; measure the panel so they
  // fill it instead of being pinned to hardcoded 600/1200px widths (which
  // squeezed large stacks in side-by-side mode and overflowed narrow screens).
  const vizRef = useRef(null)
  const [vizW, setVizW] = useState(viewMode === 'side-by-side' ? 600 : 1200)

  // Extract call stacks from traces
  const callStack1 = useMemo(() => {
    if (!trace1 || !trace1.spans) return []
    const root = trace1.spans.find((s) => !s.parent_id) || trace1.spans[0]
    return root?.stack || []
  }, [trace1])

  const callStack2 = useMemo(() => {
    if (!trace2 || !trace2.spans) return []
    const root = trace2.spans.find((s) => !s.parent_id) || trace2.spans[0]
    return root?.stack || []
  }, [trace2])

  // Overall metrics + their A/B deltas (changeType uses compareMetrics' 5% band).
  const metrics1 = useMemo(() => calculateOverallMetrics(trace1), [trace1])
  const metrics2 = useMemo(() => calculateOverallMetrics(trace2), [trace2])
  const metricsComparison = useMemo(() => {
    const out = {}
    OVERVIEW_METRICS.forEach((m) => {
      out[m.key] = compareMetrics(metrics1?.[m.key] ?? 0, metrics2?.[m.key] ?? 0)
    })
    return out
  }, [metrics1, metrics2])

  // Extract and compare SQL queries
  const sqlQueries1 = useMemo(() => extractSqlQueries(trace1), [trace1])
  const sqlQueries2 = useMemo(() => extractSqlQueries(trace2), [trace2])
  const sqlComparison = useMemo(() => {
    if (sqlQueries1.length === 0 && sqlQueries2.length === 0) return null
    return compareSqlQueries(sqlQueries1, sqlQueries2)
  }, [sqlQueries1, sqlQueries2])

  // Extract and compare HTTP requests
  const httpRequests1 = useMemo(() => extractHttpRequests(trace1), [trace1])
  const httpRequests2 = useMemo(() => extractHttpRequests(trace2), [trace2])
  const httpComparison = useMemo(() => {
    if (httpRequests1.length === 0 && httpRequests2.length === 0) return null
    return compareHttpRequests(httpRequests1, httpRequests2)
  }, [httpRequests1, httpRequests2])

  // Extract and compare cache operations
  const cacheOps1 = useMemo(() => extractCacheOperations(trace1), [trace1])
  const cacheOps2 = useMemo(() => extractCacheOperations(trace2), [trace2])
  const cacheComparison = useMemo(() => {
    if (cacheOps1.length === 0 && cacheOps2.length === 0) return null
    return compareCacheOperations(cacheOps1, cacheOps2)
  }, [cacheOps1, cacheOps2])

  // Extract and compare Redis operations
  const redisOps1 = useMemo(() => extractRedisOperations(trace1), [trace1])
  const redisOps2 = useMemo(() => extractRedisOperations(trace2), [trace2])
  const redisComparison = useMemo(() => {
    if (redisOps1.length === 0 && redisOps2.length === 0) return null
    return compareRedisOperations(redisOps1, redisOps2)
  }, [redisOps1, redisOps2])

  // Extract and compare tags
  const tags1 = useMemo(() => extractTags(trace1), [trace1])
  const tags2 = useMemo(() => extractTags(trace2), [trace2])
  const tagsComparison = useMemo(() => {
    if (tags1.length === 0 && tags2.length === 0) return null
    return compareTags(tags1, tags2)
  }, [tags1, tags2])

  const stacks1 = useMemo(() => extractStackTraces(trace1), [trace1])
  const stacks2 = useMemo(() => extractStackTraces(trace2), [trace2])

  const dumps1 = useMemo(() => extractDumps(trace1), [trace1])
  const dumps2 = useMemo(() => extractDumps(trace2), [trace2])

  // Trace IDs for log correlation
  const trace1Id = trace1?.trace_id || trace1?.id || trace1?.spans?.[0]?.trace_id || trace1?.spans?.[0]?.traceId
  const trace2Id = trace2?.trace_id || trace2?.id || trace2?.spans?.[0]?.trace_id || trace2?.spans?.[0]?.traceId

  // Tabs whose data is missing are hidden entirely; the ones that carry a count
  // show it as a badge (A + B). `count === undefined` means always visible.
  const tabs = useMemo(() => {
    const hasStack = callStack1.length > 0 || callStack2.length > 0
    const pairTotal = (c) => (c ? (c.total1 || 0) + (c.total2 || 0) : 0)
    return [
      { value: 'overview', label: 'Overview', icon: <FiInfo /> },
      { value: 'stacktree', label: 'Stack tree', icon: <FiActivity />, show: hasStack },
      { value: 'flame', label: 'Flame graph', icon: <FiLayers />, show: hasStack },
      { value: 'callgraph', label: 'Call graph', icon: <FiGitBranch />, show: hasStack },
      { value: 'sql', label: 'SQL', icon: <FiDatabase />, count: pairTotal(sqlComparison) },
      { value: 'http', label: 'HTTP', icon: <FiGlobe />, count: pairTotal(httpComparison) },
      { value: 'cache', label: 'Cache', icon: <FiZap />, count: pairTotal(cacheComparison) },
      { value: 'redis', label: 'Redis', icon: <FiHardDrive />, count: pairTotal(redisComparison) },
      { value: 'stacks', label: 'Stack traces', icon: <FiCode />, count: stacks1.length + stacks2.length },
      { value: 'tags', label: 'Tags', icon: <FiTag />, count: pairTotal(tagsComparison) },
      { value: 'logs', label: 'Logs', icon: <FiFileText /> },
      { value: 'dumps', label: 'Dumps', icon: <FiCode />, count: dumpTotal(dumps1) + dumpTotal(dumps2) },
    ]
      .filter((t) => t.show !== false && t.count !== 0)
      .map((t) => ({
        value: t.value,
        icon: t.icon,
        label: (
          <>
            {t.label}
            {t.count ? <Badge title={`${t.count} across both traces`}>{fmtNum(t.count)}</Badge> : null}
          </>
        ),
      }))
  }, [
    callStack1, callStack2, sqlComparison, httpComparison, cacheComparison,
    redisComparison, tagsComparison, stacks1, stacks2, dumps1, dumps2,
  ])

  // A tab can disappear when its data does (traces reload); fall back rather
  // than render a body with no tab selected.
  const currentTab = tabs.some((t) => t.value === activeTab) ? activeTab : 'overview'
  const sideBySide = viewMode === 'side-by-side'

  // Arm the diff in the same commit as the tab switch, so the graph never
  // flashes its empty state on the way in.
  const selectTab = (value) => {
    if (value === 'callgraph') setDiffArmed(true)
    setActiveTab(value)
  }

  useEffect(() => {
    const measure = () => {
      if (!vizRef.current) return
      const full = Math.max(320, vizRef.current.offsetWidth - 4)
      // Side-by-side splits the row between two panels.
      setVizW(sideBySide ? Math.max(320, Math.floor(full / 2) - 12) : full)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [sideBySide, currentTab])

  const diffCallStack = useMemo(() => {
    if (!diffArmed || sideBySide || callStack1.length === 0 || callStack2.length === 0) return []
    return createDiffCallStack(callStack1, callStack2, threshold)
  }, [callStack1, callStack2, sideBySide, threshold, diffArmed])

  // Headline verdict on wall time. OPA durations are frequently placeholders, so
  // an all-zero pair is called out instead of being shown as a confident "0%".
  const verdict = useMemo(() => {
    const a = metrics1?.duration || 0
    const b = metrics2?.duration || 0
    if (!a && !b) {
      return { tone: 'neutral', label: 'No timing', text: 'Neither trace recorded a wall time — compare the volume counters below.' }
    }
    if (!a) {
      return { tone: 'warn', label: 'Partial', text: `Baseline has no wall time; B ran in ${fmtMs(b)}.` }
    }
    const pct = pctChange(a, b)
    if (Math.abs(pct) < 5) {
      return { tone: 'neutral', label: 'No change', text: `Within 5%: ${fmtMs(a)} → ${fmtMs(b)}.` }
    }
    return {
      tone: pct > 0 ? 'error' : 'ok',
      label: pct > 0 ? 'Regression' : 'Improvement',
      text: `B is ${fmtPct(Math.abs(pct))} ${pct > 0 ? 'slower' : 'faster'} than A: ${fmtMs(a)} → ${fmtMs(b)}.`,
    }
  }, [metrics1, metrics2])

  if (!trace1 || !trace2) {
    return (
      <EmptyState
        icon={<FiGitBranch />}
        title="Select two traces to compare"
        hint="Load a baseline (A) and a new trace (B) above."
      />
    )
  }

  const stackTraceRows = [
    { key: 'stackTraces', label: 'Stack traces', a: stacks1.length, b: stacks2.length, fmt: fmtNum },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-row opa-cmp-bar">
        <FiSliders aria-hidden="true" />
        <label htmlFor={`${uid}-threshold`} className="opa-cmp-bar-label">Diff threshold</label>
        <input
          id={`${uid}-threshold`}
          type="range"
          min="0"
          max="50"
          step="1"
          value={threshold}
          onChange={(e) => setThreshold(parseFloat(e.target.value))}
          className="opa-cmp-slider"
          aria-describedby={`${uid}-hint`}
        />
        <span className="opa-mono opa-tnum opa-cmp-slider-val">{fmtPct(threshold, 0)}</span>
        <span id={`${uid}-hint`} className="opa-muted opa-cmp-bar-hint">
          Minimum per-function change before the diff call graph colours a node
        </span>
      </div>

      <div className="opa-cmp-tabs">
        <Tabs tabs={tabs} value={currentTab} onChange={selectTab} />
      </div>

      {currentTab === 'overview' && (
        <div className="opa-stack">
          <div className="opa-row opa-cmp-verdict">
            <StatusPill tone={verdict.tone}>{verdict.label}</StatusPill>
            <span>{verdict.text}</span>
          </div>
          <div className="opa-grid cols-4">
            {OVERVIEW_METRICS.map((m) => {
              const a = metrics1?.[m.key] ?? 0
              const b = metrics2?.[m.key] ?? 0
              const missing = !a && !b
              return (
                <KpiTile
                  key={m.key}
                  label={m.label}
                  icon={m.icon}
                  value={m.fmt(b)}
                  status={missing ? 'neutral' : (CHANGE_STATUS[metricsComparison[m.key].changeType] || 'neutral')}
                  current={missing ? null : b}
                  previous={missing ? null : a}
                  invert
                  footer={
                    missing
                      ? <span className="opa-cmp-base">not recorded</span>
                      : <span className="opa-cmp-base" title={m.exact ? `A ${a} → B ${b}` : undefined}>vs {m.fmt(a)}</span>
                  }
                />
              )
            })}
          </div>
        </div>
      )}

      {currentTab === 'stacktree' && (
        sideBySide ? (
          <AbSplit stacked={false}>
            <Panel title={A_TITLE} icon={<FiActivity />} flush empty={callStack1.length === 0} emptyText="No call stack recorded">
              <ExecutionStackTree callStack={callStack1} />
            </Panel>
            <Panel title={B_TITLE} icon={<FiActivity />} flush empty={callStack2.length === 0} emptyText="No call stack recorded">
              <ExecutionStackTree callStack={callStack2} />
            </Panel>
          </AbSplit>
        ) : (
          <Panel
            title={B_TITLE}
            icon={<FiActivity />}
            flush
            actions={<span className="opa-muted opa-cmp-meta">{fmtNum(callStack2.length)} calls</span>}
            empty={callStack2.length === 0}
            emptyText="No call stack recorded"
          >
            <ExecutionStackTree callStack={callStack2} />
          </Panel>
        )
      )}

      {currentTab === 'flame' && (
        <div ref={vizRef}>
          {sideBySide ? (
            <AbSplit stacked={false}>
              <Panel title={A_TITLE} icon={<FiLayers />} flush empty={callStack1.length === 0} emptyText="No call stack recorded">
                <div className="opa-cmp-viz"><FlameGraph callStack={callStack1} width={vizW} height={600} /></div>
              </Panel>
              <Panel title={B_TITLE} icon={<FiLayers />} flush empty={callStack2.length === 0} emptyText="No call stack recorded">
                <div className="opa-cmp-viz"><FlameGraph callStack={callStack2} width={vizW} height={600} /></div>
              </Panel>
            </AbSplit>
          ) : (
            <Panel
              title={B_TITLE}
              icon={<FiLayers />}
              flush
              actions={<span className="opa-muted opa-cmp-meta">{fmtNum(callStack2.length)} calls</span>}
              empty={callStack2.length === 0}
              emptyText="No call stack recorded"
            >
              <div className="opa-cmp-viz"><FlameGraph callStack={callStack2} width={vizW} height={600} /></div>
            </Panel>
          )}
        </div>
      )}

      {currentTab === 'callgraph' && (
        <div ref={vizRef}>
          {sideBySide ? (
            <AbSplit stacked={false}>
              <Panel title={A_TITLE} icon={<FiGitBranch />} flush empty={callStack1.length === 0} emptyText="No call stack recorded">
                <div className="opa-cmp-viz"><CallGraph callStack={callStack1} width={vizW} height={600} /></div>
              </Panel>
              <Panel title={B_TITLE} icon={<FiGitBranch />} flush empty={callStack2.length === 0} emptyText="No call stack recorded">
                <div className="opa-cmp-viz"><CallGraph callStack={callStack2} width={vizW} height={600} /></div>
              </Panel>
            </AbSplit>
          ) : (
            <Panel
              title="Diff call graph"
              icon={<FiGitBranch />}
              flush
              actions={
                <div className="opa-row opa-cmp-legend">
                  <span><HealthDot tone="ok" /> Improved</span>
                  <span><HealthDot tone="error" /> Degraded</span>
                  <span><HealthDot tone="neutral" /> Unchanged</span>
                  <span className="opa-muted">≥ {fmtPct(threshold, 0)}</span>
                </div>
              }
              empty={diffCallStack.length === 0}
              emptyText="Both traces need a call stack to diff"
            >
              <div className="opa-cmp-viz"><CallGraph callStack={diffCallStack} width={vizW} height={800} /></div>
            </Panel>
          )}
        </div>
      )}

      {currentTab === 'sql' && (
        <Panel title="SQL queries" icon={<FiDatabase />} flush empty={!sqlComparison} emptyText="No SQL queries to compare">
          <div className="opa-cmp-embed"><SqlComparisonTable comparison={sqlComparison} /></div>
        </Panel>
      )}

      {currentTab === 'http' && (
        <Panel title="HTTP requests" icon={<FiGlobe />} flush empty={!httpComparison} emptyText="No HTTP requests to compare">
          <div className="opa-cmp-embed"><HttpComparisonTable comparison={httpComparison} /></div>
        </Panel>
      )}

      {currentTab === 'cache' && (
        <Panel title="Cache operations" icon={<FiZap />} flush empty={!cacheComparison} emptyText="No cache operations to compare">
          <div className="opa-cmp-embed"><CacheComparisonTable comparison={cacheComparison} /></div>
        </Panel>
      )}

      {currentTab === 'redis' && (
        <Panel title="Redis operations" icon={<FiHardDrive />} flush empty={!redisComparison} emptyText="No Redis operations to compare">
          <div className="opa-cmp-embed"><RedisComparisonTable comparison={redisComparison} /></div>
        </Panel>
      )}

      {currentTab === 'stacks' && (
        <Panel title="Stack traces" icon={<FiCode />} flush>
          <DataTable columns={AB_COLUMNS} rows={stackTraceRows} rowKey={(r) => r.key} />
          <div className="opa-cmp-note">
            <FiInfo aria-hidden="true" />
            <span>Counts only. Open a single trace to inspect individual frames.</span>
          </div>
        </Panel>
      )}

      {currentTab === 'tags' && (
        <Panel title="Tags" icon={<FiTag />} flush empty={!tagsComparison} emptyText="No tags to compare">
          <div className="opa-cmp-embed"><TagComparisonView comparison={tagsComparison} /></div>
        </Panel>
      )}

      {currentTab === 'logs' && (
        <AbSplit stacked={!sideBySide}>
          <Panel title={A_TITLE} icon={<FiFileText />} flush empty={!trace1Id} emptyText="No trace ID available">
            <LogCorrelation traceId={trace1Id} />
          </Panel>
          <Panel title={B_TITLE} icon={<FiFileText />} flush empty={!trace2Id} emptyText="No trace ID available">
            <LogCorrelation traceId={trace2Id} />
          </Panel>
        </AbSplit>
      )}

      {currentTab === 'dumps' && (
        <AbSplit stacked={!sideBySide}>
          <Panel
            title={A_TITLE}
            icon={<FiCode />}
            flush
            actions={<span className="opa-muted opa-cmp-meta">{fmtNum(dumpTotal(dumps1))} dumps</span>}
            empty={dumps1.length === 0}
            emptyText="No dumps recorded"
          >
            <DumpList items={dumps1} />
          </Panel>
          <Panel
            title={B_TITLE}
            icon={<FiCode />}
            flush
            actions={<span className="opa-muted opa-cmp-meta">{fmtNum(dumpTotal(dumps2))} dumps</span>}
            empty={dumps2.length === 0}
            emptyText="No dumps recorded"
          >
            <DumpList items={dumps2} />
          </Panel>
        </AbSplit>
      )}
    </div>
  )
}

export default ProfileComparison
