import React, { useMemo, useState, useRef, useEffect } from 'react'
import { FiFilter, FiAlertTriangle, FiRotateCcw } from 'react-icons/fi'
import TraceTabFilters from './TraceTabFilters'
import { fmtMs, fmtBytes, fmtNum } from '../theme/format'
import './FlameGraph.css'

/* ============================================================================
   Icicle graph (root at top, growing downward).

   The whole thing is three pure, iterative passes:
     A  normalizeCallStack  raw input (any shape) -> index-based arena
     B  metric values + denominators + filter keep-mask
     C  buildFlameLayout    breadth-first row packing into <= MAX_FRAMES rects

   Everything is iterative on purpose: OPA's collector emits unbounded
   stack_depth (thousands deep) and cyclic/self-referential parent_id, so any
   recursive walk either blows the JS stack or hangs. Cycles are cut ONCE in
   pass A, which makes every later traversal termination-safe by construction.
   ========================================================================== */

const ROW_H = 18
const ROW_GAP = 1
const PITCH = ROW_H + ROW_GAP          // 440px viewport => ~23 rows visible
const MIN_FRAME_PX = 1                 // thinner than this => folded into a merged run
const MIN_RUN_PX = 0.25                // a run thinner than this is dropped (counted in `hidden`)
const MIN_LABEL_PX = 34                // no <text> below this
const VALUE_LABEL_PX = 120             // append " · 12.3ms" above this
const CHAR_PX = 6.8                    // conservative advance for 11px mono; over-estimate never overflows
const LABEL_PAD = 8
const MAX_ROWS = 512                   // depth budget; deeper is reachable by zooming
const MAX_FRAMES = 6000                // hard DOM budget
const MAX_TREE_DEPTH = 8192            // cycle/depth backstop during normalization
const GUTTER = 12                      // reserves the vertical scrollbar so no h-scroll can appear
const MIN_CANVAS_W = 240
const EPS = 1e-9

export const FLAME = {
  ROW_H, ROW_GAP, PITCH, MIN_FRAME_PX, MIN_RUN_PX, MIN_LABEL_PX,
  MAX_ROWS, MAX_FRAMES, CHAR_PX, MIN_CANVAS_W, GUTTER,
}

// Operation type -> color convention shared with the rest of the dashboard
// (function=blue, sql=purple, http=orange, redis=red, cache=green). The fills
// live in FlameGraph.css as `.t-*` classes so both themes resolve correctly.
const OP_TYPES = { function: 'Function', sql: 'SQL', http: 'HTTP', redis: 'Redis', cache: 'Cache' }
const OP_ORDER = ['function', 'sql', 'http', 'redis', 'cache', 'none']
const OP_LABEL = { ...OP_TYPES, none: 'Other' }

const METRICS = [
  { value: 'duration', label: 'Duration' },
  { value: 'cpu', label: 'CPU' },
  { value: 'memory', label: 'Memory' },
  { value: 'network', label: 'Network' },
]
const METRIC_LABEL = { duration: 'Duration', cpu: 'CPU', memory: 'Memory', network: 'Network' }

const EMPTY_PATH = []
const EMPTY_ARR = []

// Detect the operation type from raw node data (explicit type field, or the
// presence of sql/http/redis/cache detail arrays). null when nothing is known.
export function detectNodeType(node) {
  if (!node) return null
  const explicit = node.type || node.Type
  if (explicit) {
    const t = String(explicit).toLowerCase()
    if (OP_TYPES[t]) return t
  }
  const sql = node.sql_queries || node.SQLQueries || node.sqlQueries
  const http = node.http_requests || node.HttpRequests || node.httpRequests
  const redis = node.redis_operations || node.RedisOperations || node.redisOperations
  const cache = node.cache_operations || node.CacheOperations || node.cacheOperations
  if (Array.isArray(sql) && sql.length > 0) return 'sql'
  if (Array.isArray(http) && http.length > 0) return 'http'
  if (Array.isArray(redis) && redis.length > 0) return 'redis'
  if (Array.isArray(cache) && cache.length > 0) return 'cache'
  const name = node.function || node.Function || node.name
  if (!name || name === 'unknown') return null
  return 'function'
}

// Every numeric field goes through this: the collector emits nulls, strings and
// the occasional NaN, and a single NaN would poison the whole layout.
function num(v) {
  const x = +v
  return Number.isFinite(x) ? x : 0
}

// First defined value in a snake_case / PascalCase / camelCase chain.
function pick(node, keys) {
  for (let k = 0; k < keys.length; k++) {
    const v = node[keys[k]]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

const K_NAME = ['function', 'Function', 'name']
const K_CLASS = ['class', 'Class']
const K_FILE = ['file', 'File']
const K_LINE = ['line', 'Line']
// `total_ms|wall_ms|value` cover /api/profiles/flame's aggregate tree, whose
// field names are not pinned down anywhere in this repo.
const K_DUR = ['duration_ms', 'DurationMs', 'duration', 'total_ms', 'wall_ms', 'value']
const K_CPU = ['cpu_ms', 'CPUMs', 'cpu']
const K_MEM = ['memory_delta', 'MemoryDelta']
const K_SENT = ['network_bytes_sent', 'NetworkBytesSent']
const K_RECV = ['network_bytes_received', 'NetworkBytesReceived']
const K_ID = ['call_id', 'CallID', 'id']
const K_PARENT = ['parent_id', 'ParentID', 'parentId']

const EMPTY_TREE = Object.freeze({
  n: 0,
  name: EMPTY_ARR, cls: EMPTY_ARR, file: EMPTY_ARR, line: EMPTY_ARR,
  dur: EMPTY_ARR, cpu: EMPTY_ARR, memDelta: EMPTY_ARR, netSent: EMPTY_ARR, netRecv: EMPTY_ARR,
  type: EMPTY_ARR, parent: EMPTY_ARR, firstChild: EMPTY_ARR, lastChild: EMPTY_ARR,
  nextSib: EMPTY_ARR, childCount: EMPTY_ARR, depth: EMPTY_ARR, subtreeSize: EMPTY_ARR,
  roots: EMPTY_ARR, rootsHead: -1, order: EMPTY_ARR,
  typesPresent: Object.freeze(new Set()), cyclesCut: 0, maxDepth: 0, truncatedDepth: false,
})

/* ---------------------------------------------------------------------------
   PASS A — normalize any input shape into an arena of parallel arrays.

   Parallel typed arrays instead of one JS object per node: a 100k-node stack
   with a `children: []` array each is the single biggest allocation cost in
   this component, and none of it survives the next render.
   ------------------------------------------------------------------------- */
export function normalizeCallStack(callStack) {
  if (!callStack) return EMPTY_TREE
  let input
  if (Array.isArray(callStack)) {
    if (callStack.length === 0) return EMPTY_TREE
    input = callStack
  } else if (typeof callStack === 'object') {
    input = [callStack]
  } else {
    return EMPTY_TREE
  }

  // ---- A2: flatten iteratively. `seen` breaks `.children` cycles; the depth
  // counter aborts a branch that nests past MAX_TREE_DEPTH.
  const raws = []
  const nestParent = []
  let nestEdges = 0
  let truncatedDepth = false
  const seen = new WeakSet()
  const sNode = []
  const sParent = []
  const sDepth = []
  for (let i = input.length - 1; i >= 0; i--) {
    sNode.push(input[i]); sParent.push(-1); sDepth.push(0)
  }
  while (sNode.length > 0) {
    const raw = sNode.pop()
    const par = sParent.pop()
    const dep = sDepth.pop()
    if (!raw || typeof raw !== 'object') continue
    if (seen.has(raw)) continue
    seen.add(raw)
    const idx = raws.length
    raws.push(raw)
    nestParent.push(par)
    if (par !== -1) nestEdges++
    if (dep >= MAX_TREE_DEPTH) { truncatedDepth = true; continue }
    const kids = raw.children || raw.Children
    if (Array.isArray(kids)) {
      // Reverse-push so the first child is popped (and indexed) first, which
      // keeps sibling order == input order in the linked lists built below.
      for (let k = kids.length - 1; k >= 0; k--) {
        sNode.push(kids[k]); sParent.push(idx); sDepth.push(dep + 1)
      }
    }
  }

  const n = raws.length
  if (n === 0) return EMPTY_TREE

  const name = new Array(n)
  const cls = new Array(n)
  const file = new Array(n)
  const type = new Array(n)
  const line = new Int32Array(n)
  const dur = new Float64Array(n)
  const cpu = new Float64Array(n)
  const memDelta = new Float64Array(n)
  const netSent = new Float64Array(n)
  const netRecv = new Float64Array(n)
  const parent = new Int32Array(n)
  const typesPresent = new Set()

  for (let i = 0; i < n; i++) {
    const raw = raws[i]
    name[i] = String(pick(raw, K_NAME) ?? 'unknown')
    cls[i] = String(pick(raw, K_CLASS) ?? '')
    file[i] = String(pick(raw, K_FILE) ?? '')
    line[i] = num(pick(raw, K_LINE))
    dur[i] = num(pick(raw, K_DUR))
    cpu[i] = num(pick(raw, K_CPU))
    memDelta[i] = num(pick(raw, K_MEM))
    netSent[i] = num(pick(raw, K_SENT))
    netRecv[i] = num(pick(raw, K_RECV))
    // Resolved once here; the old version recomputed it per node per render.
    const t = detectNodeType(raw) || 'none'
    type[i] = t
    typesPresent.add(t)
  }

  // ---- A3: nested `.children` wins when present (matches the previous
  // hasNestedChildren behaviour); otherwise link by id.
  if (nestEdges > 0) {
    for (let i = 0; i < n; i++) parent[i] = nestParent[i]
  } else {
    const idToIdx = new Map()
    for (let i = 0; i < n; i++) {
      const id = pick(raws[i], K_ID)
      if (id === undefined) continue
      const key = String(id)
      // ids are documented as non-unique (Math.random fallback in the
      // collector): first occurrence wins, so duplicates degrade into extra
      // roots instead of corrupting the tree.
      if (!idToIdx.has(key)) idToIdx.set(key, i)
    }
    for (let i = 0; i < n; i++) {
      const pid = pick(raws[i], K_PARENT)
      if (pid === undefined) { parent[i] = -1; continue }
      const p = idToIdx.get(String(pid))
      parent[i] = p === undefined || p === i ? -1 : p
    }
  }

  // ---- A4: cut cycles in O(n) with a 3-colour iterative climb. After this
  // the graph is provably a forest, so nothing downstream can loop.
  let cyclesCut = 0
  const color = new Uint8Array(n) // 0 unseen, 1 on current chain, 2 settled
  const chain = []
  for (let s = 0; s < n; s++) {
    if (color[s]) continue
    let v = s
    chain.length = 0
    while (v !== -1 && color[v] === 0) { color[v] = 1; chain.push(v); v = parent[v] }
    if (v !== -1 && color[v] === 1) { parent[v] = -1; cyclesCut++ } // re-entered this chain
    for (let k = 0; k < chain.length; k++) color[chain[k]] = 2
    if (chain.length > MAX_TREE_DEPTH) { parent[chain[MAX_TREE_DEPTH]] = -1; cyclesCut++ }
  }

  // ---- link children (append order == index order == input order)
  const firstChild = new Int32Array(n).fill(-1)
  const lastChild = new Int32Array(n).fill(-1)
  const nextSib = new Int32Array(n).fill(-1)
  const childCount = new Int32Array(n)
  const roots = []
  let rootsHead = -1
  let rootsTail = -1
  for (let i = 0; i < n; i++) {
    const p = parent[i]
    if (p === -1) {
      roots.push(i)
      if (rootsTail === -1) rootsHead = i
      else nextSib[rootsTail] = i
      rootsTail = i
    } else {
      if (lastChild[p] === -1) firstChild[p] = i
      else nextSib[lastChild[p]] = i
      lastChild[p] = i
      childCount[p]++
    }
  }

  // ---- A5: pre-order + depth + subtreeSize, all iterative.
  const order = new Int32Array(n)
  const depth = new Int32Array(n)
  const stack = new Int32Array(n)
  let sp = 0
  let oi = 0
  let maxDepth = 0
  for (let k = 0; k < roots.length; k++) stack[sp++] = roots[k]
  while (sp > 0) {
    const v = stack[--sp]
    order[oi++] = v
    const p = parent[v]
    const dv = p === -1 ? 0 : depth[p] + 1
    depth[v] = dv
    if (dv > maxDepth) maxDepth = dv // running compare: Math.max(...arr) throws past ~1e5
    for (let c = firstChild[v]; c !== -1; c = nextSib[c]) stack[sp++] = c
  }

  const subtreeSize = new Int32Array(n).fill(1)
  // A parent always precedes its descendants in pre-order, so walking `order`
  // backwards settles every child before its parent.
  for (let k = n - 1; k >= 0; k--) {
    const v = order[k]
    const p = parent[v]
    if (p !== -1) subtreeSize[p] += subtreeSize[v]
  }

  return {
    n, name, cls, file, line, dur, cpu, memDelta, netSent, netRecv,
    type, parent, firstChild, lastChild, nextSib, childCount, depth, subtreeSize,
    roots, rootsHead, order, typesPresent, cyclesCut, maxDepth, truncatedDepth,
  }
}

const EMPTY_LAYOUT = Object.freeze({
  frames: EMPTY_ARR, rowStart: EMPTY_ARR, rowCount: 0, contentH: 0,
  drawn: 0, mergedMembers: 0, runCount: 0, hidden: 0, filteredOut: 0,
  truncated: false, degraded: false, total: 0, considered: 0,
})

/* ---------------------------------------------------------------------------
   PASS B + C — values, keep-mask, then breadth-first row packing.

   Widths are strictly proportional: a child's width is
       parentW * value / max(parentValue, sumOfALLChildValues)
   packed left-to-right inside its own parent's span. The residue at the right
   edge is the parent's real self time and is deliberately left empty.
   ------------------------------------------------------------------------- */
export function buildFlameLayout({
  tree, metric = 'duration', threshold = 0, focus = -1,
  canvasW = 800, maxRows = MAX_ROWS, maxFrames = MAX_FRAMES,
}) {
  const n = tree ? tree.n : 0
  if (!n) return EMPTY_LAYOUT
  const {
    dur, cpu, memDelta, netSent, netRecv, parent, firstChild, nextSib,
    childCount, subtreeSize, order, roots, rootsHead,
  } = tree
  const view = focus >= 0 && focus < n ? focus : -1

  // ---- B1: metric value per node. Negative / NaN / Infinity collapse to 0.
  const val = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let v
    if (metric === 'cpu') v = cpu[i]
    else if (metric === 'memory') v = memDelta[i] < 0 ? -memDelta[i] : memDelta[i]
    else if (metric === 'network') v = netSent[i] + netRecv[i]
    else v = dur[i]
    val[i] = v > 0 ? v : 0
  }

  // ---- B2: denominators. childSum sums ALL children, not just the kept ones,
  // so a bar's width is invariant under filtering — toggling a filter never
  // widens a survivor, which is what makes "wider == slower" always true.
  const childSum = new Float64Array(n)
  const structSum = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const p = parent[i]
    if (p !== -1) { childSum[p] += val[i]; structSum[p] += subtreeSize[i] }
  }

  // ---- B3: filter keep-mask. Keep a node when it passes OR any descendant
  // does (same semantics as the old recursive filter). Always on duration.
  let keep = null
  if (threshold > 0) {
    keep = new Uint8Array(n)
    for (let i = 0; i < n; i++) keep[i] = dur[i] >= threshold ? 1 : 0
    for (let k = n - 1; k >= 0; k--) {
      const v = order[k]
      const p = parent[v]
      if (keep[v] && p !== -1) keep[p] = 1
    }
  }

  // ---- C: row-by-row packing.
  const frames = []
  const rowStart = []
  let drawn = 0
  let mergedMembers = 0
  let runCount = 0
  let filteredOut = 0
  let truncated = false

  let total = 0
  let rootStruct = 0
  let considered = 0
  if (view >= 0) {
    total = val[view]
    considered = subtreeSize[view]
  } else {
    for (let k = 0; k < roots.length; k++) {
      total += val[roots[k]]
      rootStruct += subtreeSize[roots[k]]
      considered += subtreeSize[roots[k]]
    }
  }
  const degraded = !(total > 0)

  // Pack the children of `pi` (or the roots when pi === -1) into [px, px+pw].
  function packInto(pi, px, pw, pf, depthRow) {
    const first = pi === -1 ? rootsHead : firstChild[pi]
    if (first === -1) return
    let scale
    let structural
    if (pi === -1) {
      // Root row: proportional to the metric, or to subtree size when there is
      // no metric at all (OPA's placeholder durations) so STRUCTURE stays readable.
      if (total > EPS) { scale = pw / total; structural = 0 } else { scale = pw / rootStruct; structural = 1 }
    } else {
      const S = childSum[pi]
      if (S > EPS) {
        // max(own, Σchildren): clock skew regularly makes children exceed their
        // parent; this clamps them to exactly the parent's width instead of
        // overflowing it, and leaves real self time as the right-hand residue.
        const D = val[pi] > S ? val[pi] : S
        scale = pw / D
        structural = 0
      } else {
        scale = pw / structSum[pi]
        structural = 1
      }
    }
    const limit = px + pw
    let cx = px
    // Sub-pixel siblings are folded into one honest "merged sliver" instead of
    // being dropped: the row keeps its exact total width (no fake self-time
    // gaps) and the folded frames stay reachable by clicking the sliver.
    let runN = 0
    let runX = 0
    let runW = 0
    let runVal = 0
    let runBest = -1
    let runBestVal = -1
    const closeRun = () => {
      if (runW >= MIN_RUN_PX) {
        frames.push({ i: runBest, x: runX, w: runW, d: depthRow, p: pf, m: runN, mv: runVal, s: structural })
        mergedMembers += runN
        runCount++
      }
      runN = 0; runW = 0; runVal = 0; runBest = -1; runBestVal = -1
    }
    for (let c = first; c !== -1; c = nextSib[c]) {
      if (keep && !keep[c]) {
        // keep propagates upward, so keep[c] === 0 implies the whole subtree is
        // filtered — count it all and skip. Its pixels stay in the self gap.
        filteredOut += subtreeSize[c]
        continue
      }
      let cw = (structural ? subtreeSize[c] : val[c]) * scale
      if (!(cw > 0)) cw = 0
      if (cx + cw > limit) cw = limit - cx // containment clamp: exact, not merely mathematical
      if (cw < 0) cw = 0
      if (cw < MIN_FRAME_PX) {
        if (runN === 0) runX = cx
        runN++
        runW += cw
        runVal += val[c]
        if (val[c] > runBestVal) { runBestVal = val[c]; runBest = c }
        cx += cw
        continue
      }
      if (runN > 0) closeRun()
      frames.push({ i: c, x: cx, w: cw, d: depthRow, p: pf, m: 0, mv: val[c], s: structural })
      drawn++
      cx += cw
    }
    if (runN > 0) closeRun()
  }

  // Row 0 is the focus (full width) or the roots.
  rowStart[0] = 0
  if (view >= 0) {
    frames.push({ i: view, x: 0, w: canvasW, d: 0, p: -1, m: 0, mv: val[view], s: degraded ? 1 : 0 })
    drawn++
  } else {
    packInto(-1, 0, canvasW, -1, 0)
  }
  let rowCount = frames.length > 0 ? 1 : 0
  let rowFrom = 0
  let rowTo = frames.length
  let d = 1
  while (rowTo > rowFrom) {
    if (d >= maxRows) {
      for (let k = rowFrom; k < rowTo && !truncated; k++) {
        const f = frames[k]
        if (f.m === 0 && childCount[f.i] > 0) truncated = true
      }
      break
    }
    const snapLen = frames.length
    const snapDrawn = drawn
    const snapMerged = mergedMembers
    const snapRuns = runCount
    const snapFiltered = filteredOut
    rowStart[d] = snapLen
    for (let k = rowFrom; k < rowTo; k++) {
      const f = frames[k]
      if (f.m > 0) continue // a merged run is terminal: nothing under it could be visible
      packInto(f.i, f.x, f.w, k, d)
    }
    if (frames.length === snapLen) break
    if (frames.length > maxFrames) {
      // Budget blown: drop the whole row rather than amputate its right-hand
      // side (a half-drawn row reads as "there is nothing there"). Because
      // packing is breadth-first, truncation costs DEPTH, which zooming recovers.
      frames.length = snapLen
      drawn = snapDrawn
      mergedMembers = snapMerged
      runCount = snapRuns
      filteredOut = snapFiltered
      truncated = true
      break
    }
    rowCount = d + 1
    rowFrom = rowStart[d]
    rowTo = frames.length
    d++
  }
  rowStart.length = rowCount
  rowStart.push(frames.length)

  // Reachable when a threshold filters out every root: report the accounting so
  // the caller can say "nothing matches" instead of drawing a 0-height canvas.
  const hidden = Math.max(0, considered - filteredOut - drawn - mergedMembers)
  return {
    frames, rowStart, rowCount, contentH: rowCount * PITCH,
    drawn, mergedMembers, runCount, hidden, filteredOut,
    truncated, degraded, total, considered,
  }
}

/* ------------------------------ presentation ------------------------------ */

function fmtMetric(v, metric) {
  if (metric === 'memory' || metric === 'network') return fmtBytes(v)
  return fmtMs(v)
}

// Labels are computed, never measured: CHAR_PX over-estimates the advance of
// 11px mono, so a label can never overflow its frame. No getComputedTextLength,
// no clipPath, no textLength — zero layout thrash.
function frameLabel(f, tree, metric) {
  const maxChars = Math.floor((f.w - LABEL_PAD) / CHAR_PX)
  if (maxChars < 2) return ''
  let s = f.m > 0
    ? (f.w >= VALUE_LABEL_PX ? `⋯ ${f.m} frames merged` : `⋯ ${f.m}`)
    : tree.name[f.i]
  if (f.m === 0 && f.w >= VALUE_LABEL_PX && f.mv > 0) s = `${s} · ${fmtMetric(f.mv, metric)}`
  if (s.length > maxChars) s = `${s.slice(0, Math.max(1, maxChars - 1))}…`
  return s
}

// The frame layer carries NO event handlers and is memoized, so a mouse sweep
// re-renders the tooltip and one overlay rect — never these 6000 rects.
const FlameFrames = React.memo(function FlameFrames({ frames, tree, metric }) {
  const out = []
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k]
    const y = f.d * PITCH
    const tcls = f.m > 0 ? 'is-merged' : `t-${tree.type[f.i]}`
    out.push(
      <rect
        key={k}
        className={`fg-f ${tcls}${f.s ? ' is-struct' : ''}`}
        x={f.x}
        y={y}
        width={f.w}
        height={ROW_H}
      />
    )
    if (f.w >= MIN_LABEL_PX) {
      const label = frameLabel(f, tree, metric)
      if (label) {
        out.push(
          <text key={`t${k}`} className={`fg-t ${tcls}`} x={f.x + LABEL_PAD / 2} y={y + ROW_H / 2}>
            {label}
          </text>
        )
      }
    }
  }
  return <g className="fg-frames">{out}</g>
})

function TipRow({ k, v, mono }) {
  return (
    <div className="fg-tip-row">
      <span className="k">{k}</span>
      <span className={mono ? 'v p' : 'p'}>{v}</span>
    </div>
  )
}

function FlameGraph({ callStack, width = 800, height = 600 }) {
  const [metric, setMetric] = useState('duration')
  const [filters, setFilters] = useState({ enabled: false, thresholds: {} })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [zoom, setZoom] = useState({ tree: null, path: EMPTY_PATH })
  const [hover, setHover] = useState(null)

  const hostRef = useRef(null)
  const scrollRef = useRef(null)
  const svgRef = useRef(null)
  const rafRef = useRef(0)
  const ptRef = useRef(null)

  const tree = useMemo(() => normalizeCallStack(callStack), [callStack])
  // Tokenizing the zoom path by the tree object invalidates stale node indices
  // when `callStack` changes — no reset effect, no double render, no StrictMode
  // hazard.
  const path = zoom.tree === tree ? zoom.path : EMPTY_PATH
  const focus = path.length ? path[path.length - 1] : -1
  const threshold = filters.enabled ? num(filters.thresholds && filters.thresholds.duration) : 0

  const canvasW = useMemo(() => Math.max(MIN_CANVAS_W, Math.floor(width) - GUTTER), [width])
  const viewportH = useMemo(() => Math.max(180, Math.min(Math.floor(height), 2400)), [height])
  const layout = useMemo(
    () => buildFlameLayout({ tree, metric, threshold, focus, canvasW }),
    [tree, metric, threshold, focus, canvasW]
  )
  const crumbs = useMemo(() => path.map((i) => tree.name[i] || 'unknown'), [path, tree])
  const legendTypes = useMemo(
    () => OP_ORDER.filter((t) => tree.typesPresent.has(t)),
    [tree]
  )

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const setPath = (next) => setZoom({ tree, path: next })

  const scrollRowIntoView = (row) => {
    const el = scrollRef.current
    if (!el) return
    const top = row * PITCH
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight
  }

  // Place the tooltip for a frame reached by keyboard (no pointer coords).
  const hoverFrameIdx = (fi) => {
    if (fi < 0 || fi >= layout.frames.length) return
    const f = layout.frames[fi]
    const anchorX = f.x + Math.min(f.w / 2, 60)
    const anchorY = f.d * PITCH + ROW_H
    let mx = anchorX
    let my = anchorY
    const svg = svgRef.current
    const host = hostRef.current
    if (svg && host) {
      const r = svg.getBoundingClientRect()
      const hr = host.getBoundingClientRect()
      mx = r.left - hr.left + anchorX * (r.width / canvasW)
      my = r.top - hr.top + anchorY * (r.height / (layout.contentH || 1))
    }
    scrollRowIntoView(f.d)
    setHover({ lay: layout, f: fi, mx, my })
  }

  // O(log n) hit test: rows are contiguous slices of `frames` sorted by x
  // (children are packed inside their parent's span, parents are x-sorted),
  // so a binary search inside the row slice is all the index we need.
  const hitTest = (vx, vy) => {
    const d = Math.floor(vy / PITCH)
    if (d < 0 || d >= layout.rowCount) return -1
    if (vy - d * PITCH > ROW_H) return -1 // the 1px gutter is a deliberate miss
    let lo = layout.rowStart[d]
    let hi = layout.rowStart[d + 1] - 1
    let best = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (layout.frames[mid].x <= vx) { best = mid; lo = mid + 1 } else hi = mid - 1
    }
    if (best < 0) return -1
    const f = layout.frames[best]
    return vx <= f.x + f.w ? best : -1
  }

  const toCanvas = (clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    if (!r.width || !r.height) return null
    return {
      vx: (clientX - r.left) * (canvasW / r.width),
      vy: (clientY - r.top) * (layout.contentH / r.height),
      hx: clientX,
      hy: clientY,
    }
  }

  // Mouse moves are coalesced into one setHover per animation frame, so a fast
  // drag across the panel cannot queue hundreds of renders.
  const onMouseMove = (e) => {
    ptRef.current = { clientX: e.clientX, clientY: e.clientY }
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const pt = ptRef.current
      if (!pt) return
      const c = toCanvas(pt.clientX, pt.clientY)
      if (!c) return
      const fi = hitTest(c.vx, c.vy)
      if (fi < 0) { setHover(null); return }
      const host = hostRef.current
      const hr = host ? host.getBoundingClientRect() : { left: 0, top: 0 }
      setHover({ lay: layout, f: fi, mx: pt.clientX - hr.left, my: pt.clientY - hr.top })
    })
  }

  const onMouseLeave = () => {
    ptRef.current = null
    setHover(null)
  }

  const onClick = (e) => {
    const c = toCanvas(e.clientX, e.clientY)
    if (!c) return
    const fi = hitTest(c.vx, c.vy)
    if (fi < 0) { if (path.length) setPath(path.slice(0, -1)); return }
    const f = layout.frames[fi]
    // A merged sliver drills into its widest member — that is how sub-pixel
    // frames stay reachable at all.
    if (f.m > 0) { setPath([...path, f.i]); return }
    if (f.i === focus) { if (path.length) setPath(path.slice(0, -1)); return }
    setPath([...path, f.i])
  }

  const onDoubleClick = () => { if (path.length) setPath(path.slice(0, -1)) }

  const onKeyDown = (e) => {
    const fi = hover && hover.lay === layout ? hover.f : -1
    if (e.key === 'Escape') {
      if (path.length) { e.preventDefault(); setPath(path.slice(0, -1)) }
      return
    }
    if (e.key === 'Backspace' || e.key === 'Home') {
      if (path.length) { e.preventDefault(); setPath(EMPTY_PATH) }
      return
    }
    if (e.key === 'Enter') {
      if (fi >= 0) { e.preventDefault(); setPath([...path, layout.frames[fi].i]) }
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      if (fi < 0) { hoverFrameIdx(0); return }
      const d = layout.frames[fi].d
      const lo = layout.rowStart[d]
      const hi = layout.rowStart[d + 1] - 1
      const next = e.key === 'ArrowLeft' ? fi - 1 : fi + 1
      if (next >= lo && next <= hi) hoverFrameIdx(next)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (fi < 0) { hoverFrameIdx(0); return }
      const p = layout.frames[fi].p
      if (p >= 0) hoverFrameIdx(p)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (fi < 0) { hoverFrameIdx(0); return }
      const d = layout.frames[fi].d
      if (d + 1 >= layout.rowCount) return
      for (let k = layout.rowStart[d + 1]; k < layout.rowStart[d + 2]; k++) {
        if (layout.frames[k].p === fi) { hoverFrameIdx(k); return }
      }
    }
  }

  if (tree.n === 0) {
    return <div className="fg-empty">No call stack data available for flame graph</div>
  }

  const hf = hover && hover.lay === layout && hover.f < layout.frames.length ? layout.frames[hover.f] : null
  const metricLabel = METRIC_LABEL[metric] || 'Duration'

  // Self time is computed on demand for the one hovered node (O(childCount)),
  // not precomputed for all n.
  let selfMs = 0
  let hoverChildren = 0
  let hoverTitle = ''
  if (hf) {
    let kidsDur = 0
    for (let c = tree.firstChild[hf.i]; c !== -1; c = tree.nextSib[c]) { kidsDur += tree.dur[c]; hoverChildren++ }
    selfMs = Math.max(0, tree.dur[hf.i] - kidsDur)
    hoverTitle = hf.m > 0
      ? `${hf.m} frames merged (widest: ${tree.name[hf.i]})`
      : `${tree.name[hf.i]} — ${fmtMetric(hf.mv, metric)}`
  }
  const hostW = hostRef.current ? hostRef.current.clientWidth : 0
  const tipFlip = hf && hostW > 0 && hover.mx > hostW / 2

  return (
    <div className="fg-root" ref={hostRef}>
      <div className="fg-bar">
        <select
          className="opa-select fg-metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          aria-label="Flame graph metric"
        >
          {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <button
          type="button"
          className={`opa-btn ghost fg-filter-btn${filtersOpen ? ' is-on' : ''}`}
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
        >
          <FiFilter size={12} />
          {threshold > 0 ? <span className="opa-badge">{`≥ ${threshold} ms`}</span> : 'Filter'}
        </button>
        {path.length > 0 && (
          <div className="fg-crumbs">
            <button type="button" className="fg-crumb" onClick={() => setPath(EMPTY_PATH)}>
              {crumbs.length > 4 ? '…' : 'Root'}
            </button>
            {crumbs.slice(Math.max(0, crumbs.length - 4)).map((c, k, arr) => {
              const depthIdx = Math.max(0, crumbs.length - 4) + k + 1
              return (
                <React.Fragment key={`${depthIdx}:${c}`}>
                  <span className="fg-crumb-sep">›</span>
                  <button
                    type="button"
                    className={`fg-crumb${k === arr.length - 1 ? ' is-current' : ''}`}
                    onClick={() => setPath(path.slice(0, depthIdx))}
                    title={c}
                  >
                    {c}
                  </button>
                </React.Fragment>
              )
            })}
            <button type="button" className="opa-btn ghost fg-reset" onClick={() => setPath(EMPTY_PATH)}>
              <FiRotateCcw size={12} /> Reset
            </button>
          </div>
        )}
        <span className="fg-spacer" />
        <span className="fg-status">
          {fmtNum(layout.drawn)} frames · {layout.rowCount} rows
          {tree.maxDepth + 1 > layout.rowCount ? ` of ${tree.maxDepth + 1}` : ''}
        </span>
      </div>

      <div className="fg-notes">
        <span className="fg-legend">
          {legendTypes.map((t) => (
            <span key={t}><span className={`fg-sw t-${t}`} />{OP_LABEL[t]}</span>
          ))}
        </span>
        {layout.degraded && (
          <span
            className="opa-badge fg-warn"
            title="Every value for this metric is zero, so widths show subtree size instead of cost."
          >
            <FiAlertTriangle size={11} /> structure only — no {metricLabel.toLowerCase()} data
          </span>
        )}
        {layout.mergedMembers > 0 && (
          <span>{fmtNum(layout.mergedMembers)} frames merged into {layout.runCount} slivers — click a sliver or zoom in</span>
        )}
        {layout.hidden > 0 && <span>{fmtNum(layout.hidden)} frames hidden</span>}
        {layout.truncated && (
          <span className="fg-note-warn">depth truncated at {layout.rowCount} rows — zoom into a deep frame to continue</span>
        )}
        {layout.filteredOut > 0 && <span>{fmtNum(layout.filteredOut)} filtered out</span>}
        {tree.cyclesCut > 0 && (
          <span className="fg-note-warn">{tree.cyclesCut} cyclic parent link{tree.cyclesCut > 1 ? 's' : ''} cut</span>
        )}
        {tree.truncatedDepth && <span className="fg-note-warn">input nested past {MAX_TREE_DEPTH} levels — deeper nodes dropped</span>}
      </div>

      {filtersOpen && (
        <div className="fg-filters">
          <TraceTabFilters onFiltersChange={setFilters} availableFilters={['duration']} />
        </div>
      )}

      <div className="fg-canvas" ref={scrollRef} style={{ maxHeight: viewportH }}>
        <svg
          ref={svgRef}
          className="fg-svg"
          tabIndex={0}
          role="img"
          aria-label={`Icicle graph: ${layout.drawn} frames across ${layout.rowCount} rows, ${metricLabel} by width`}
          width={canvasW}
          height={layout.contentH}
          viewBox={`0 0 ${canvasW} ${layout.contentH}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: layout.contentH }}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
        >
          <FlameFrames frames={layout.frames} tree={tree} metric={metric} />
          {hf && (
            <g className="fg-overlay">
              <line
                className="fg-guide"
                x1={0}
                x2={canvasW}
                y1={hf.d * PITCH + ROW_H + 0.5}
                y2={hf.d * PITCH + ROW_H + 0.5}
              />
              <rect className="fg-hi" x={hf.x} y={hf.d * PITCH} width={hf.w} height={ROW_H}>
                <title>{hoverTitle}</title>
              </rect>
            </g>
          )}
        </svg>

        {hf && (
          <div
            className="fg-tip"
            style={
              tipFlip
                ? { right: `${Math.max(8, hostW - hover.mx + 12)}px`, top: `${hover.my + 12}px` }
                : { left: `${hover.mx + 12}px`, top: `${hover.my + 12}px` }
            }
          >
            {hf.m > 0 ? (
              <>
                <TipRow k="Merged" v={`${hf.m} frames`} />
                <TipRow k="Total" v={fmtMetric(hf.mv, metric)} mono />
                <TipRow k="Widest" v={tree.name[hf.i]} mono />
                <div className="fg-tip-hint">click to drill in</div>
              </>
            ) : (
              <>
                <TipRow k="Function" v={tree.name[hf.i]} mono />
                {tree.type[hf.i] !== 'none' && <TipRow k="Type" v={OP_LABEL[tree.type[hf.i]]} />}
                {tree.cls[hf.i] && <TipRow k="Class" v={tree.cls[hf.i]} mono />}
                {tree.file[hf.i] && (
                  <TipRow k="File" v={tree.line[hf.i] ? `${tree.file[hf.i]}:${tree.line[hf.i]}` : tree.file[hf.i]} mono />
                )}
                {metric !== 'duration' && <TipRow k={metricLabel} v={fmtMetric(hf.mv, metric)} mono />}
                <TipRow k="Total" v={fmtMs(tree.dur[hf.i])} mono />
                <TipRow k="Self" v={fmtMs(selfMs)} mono />
                {tree.cpu[hf.i] > 0 && <TipRow k="CPU" v={fmtMs(tree.cpu[hf.i])} mono />}
                {tree.memDelta[hf.i] !== 0 && <TipRow k="Memory" v={fmtBytes(tree.memDelta[hf.i])} mono />}
                {(tree.netSent[hf.i] > 0 || tree.netRecv[hf.i] > 0) && (
                  <TipRow
                    k="Network"
                    v={`↑${fmtBytes(tree.netSent[hf.i])} ↓${fmtBytes(tree.netRecv[hf.i])}`}
                    mono
                  />
                )}
                {layout.total > 0 && (
                  <TipRow k="% of view" v={`${((hf.mv / layout.total) * 100).toFixed(2)}%`} mono />
                )}
                <TipRow k="children" v={fmtNum(hoverChildren)} mono />
                <TipRow k="subtree" v={`${fmtNum(tree.subtreeSize[hf.i])} frames`} mono />
                {hf.s === 1 && <div className="fg-tip-hint">width shows subtree size — not to scale</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default FlameGraph
