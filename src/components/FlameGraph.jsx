import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FiAlertTriangle, FiChevronRight, FiInfo } from 'react-icons/fi'
import { EmptyState, SegmentedControl } from './ui'
import { fmtBytes, fmtMs, fmtNum, fmtPct } from '../theme/format'
import { fmtMetric, middleEllipsis } from './profile/HotSpots'
import { METRIC_LABELS } from './profile/ProfileToolbar'
import { TYPE_ORDER, detectOpType, typeFill, typeLabel } from '../utils/opTypes'
import './FlameGraph.css'

/* ============================================================================
   Icicle graph (root at top, growing downward).

   The whole thing is three pure, iterative passes:
     A  normalizeCallStack  raw input (any shape) -> index-based arena
     B  metric values + denominators + noise-floor keep-mask
     C  buildFlameLayout    breadth-first row packing into <= MAX_FRAMES rects

   Everything is iterative on purpose: OPA's collector emits unbounded
   stack_depth (thousands deep) and cyclic/self-referential parent_id, so any
   recursive walk either blows the JS stack or hangs. Cycles are cut ONCE in
   pass A, which makes every later traversal termination-safe by construction.

   Presentation lives on the design tokens only (see FlameGraph.css) and borrows
   the .opa-prof-* chrome from components/profile/profile.css, so this view is a
   member of the Profile panel rather than a widget with its own look.
   ========================================================================== */

const ROW_H = 17
const ROW_GAP = 1
const PITCH = ROW_H + ROW_GAP          // 18px rows: ~24 visible in a 440px box
const MIN_FRAME_PX = 1                 // thinner than this => folded into a merged run
const MIN_RUN_PX = 0.25                // a run thinner than this is dropped (counted in `hidden`)
const MIN_LABEL_PX = 30                // no <text> below this
const VALUE_LABEL_PX = 132             // append the metric value above this
const CHAR_PX = 6.8                    // conservative advance for 11px mono; over-estimate never overflows
const LABEL_PAD = 9
const MAX_ROWS = 512                   // depth budget; deeper is reachable by zooming
const MAX_FRAMES = 6000                // hard DOM budget
const MAX_TREE_DEPTH = 8192            // cycle/depth backstop during normalization
const GUTTER = 12                      // reserves the vertical scrollbar so no h-scroll can appear
const MIN_CANVAS_W = 240
const EPS = 1e-9

const ECHO_CAP = 240                   // other occurrences of the hovered symbol to outline
const CRUMB_TAIL = 4                   // zoom crumbs kept before collapsing to "…"
const GRID_FRACS = [0.25, 0.5, 0.75]
const AXIS_FRACS = [0, 0.25, 0.5, 0.75, 1]

const TIP_W = 296
const TIP_ROW_H = 17
const TIP_CHROME_H = 46
const TIP_EDGE = 6

export const FLAME = {
  ROW_H, ROW_GAP, PITCH, MIN_FRAME_PX, MIN_RUN_PX, MIN_LABEL_PX,
  MAX_ROWS, MAX_FRAMES, CHAR_PX, MIN_CANVAS_W, GUTTER,
}

// The shared ProfileToolbar ranks by any of these, so the icicle speaks the same
// vocabulary (io included) instead of silently falling back to duration.
const METRIC_KEYS = ['duration', 'cpu', 'io', 'memory', 'network']
const IS_METRIC = { duration: 1, cpu: 1, io: 1, memory: 1, network: 1 }

const NOISE_FLOORS = [
  { value: 0, label: 'All' },
  { value: 0.1, label: '0.1%' },
  { value: 1, label: '1%' },
  { value: 5, label: '5%' },
]

/* ---- paint -----------------------------------------------------------------
   op index: -2 merged run, -1 unclassified, 0..4 = opTypes.TYPE_ORDER.
   Hues come from opTypes.typeFill, so the icicle, the hot-spots table and the
   call graph cannot drift apart on colour.

   A frame is a 26% TINT of its type hue with the full hue as a 1px edge. The
   edge separates adjacent same-type siblings (solid blocks merge into one
   unreadable band), and the low-chroma ground means a single ink token
   (--text-primary) is legible on every fill in BOTH themes — no JS contrast
   table to go stale when a token moves. */
const OP_MERGED = -2
const OP_NONE = -1

function tintOf(hue) {
  return `color-mix(in srgb, ${hue} 26%, var(--surface-1))`
}

// Merged runs are deliberately hue-less: they are an aggregate, not an operation.
// Unclassified frames use --surface-3 rather than opTypes' NEUTRAL_VAR, which is
// tuned for swatches and is indistinguishable from the sunken plot area here.
const OP_HUES = ['var(--border-strong)', 'var(--neutral)', ...TYPE_ORDER.map(typeFill)]
const PAINT = OP_HUES.map((hue, k) => Object.freeze({
  fill: k === 0 ? 'var(--surface-3)' : tintOf(hue),
  stroke: hue,
}))
const SWATCH = OP_HUES.map((hue, k) => Object.freeze({
  background: k === 0 ? 'var(--surface-3)' : tintOf(hue),
  borderColor: hue,
}))

function paintOf(op) { return PAINT[op + 2] || PAINT[1] }
function swatchOf(op) { return SWATCH[op + 2] || SWATCH[1] }

const TYPE_INDEX = {}
TYPE_ORDER.forEach((t, i) => { TYPE_INDEX[t] = i })

const EMPTY_PATH = []
const EMPTY_ARR = []

// Kept as this module's public name; the classification itself lives in
// opTypes so every profiling view labels the same call the same way.
export function detectNodeType(node) {
  return detectOpType(node)
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
const K_IO = ['io_wait_ms', 'IoWaitMs', 'io_wait_time', 'io_wait']
const K_MEM = ['memory_delta', 'MemoryDelta']
const K_SENT = ['network_bytes_sent', 'NetworkBytesSent']
const K_RECV = ['network_bytes_received', 'NetworkBytesReceived']
const K_ID = ['call_id', 'CallID', 'id']
const K_PARENT = ['parent_id', 'ParentID', 'parentId']

const EMPTY_TREE = Object.freeze({
  n: 0,
  name: EMPTY_ARR, cls: EMPTY_ARR, file: EMPTY_ARR, line: EMPTY_ARR,
  dur: EMPTY_ARR, cpu: EMPTY_ARR, io: EMPTY_ARR,
  memDelta: EMPTY_ARR, netSent: EMPTY_ARR, netRecv: EMPTY_ARR,
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
  const line = new Int32Array(n)
  const dur = new Float64Array(n)
  const cpu = new Float64Array(n)
  const io = new Float64Array(n)
  const memDelta = new Float64Array(n)
  const netSent = new Float64Array(n)
  const netRecv = new Float64Array(n)
  // Op type as an index into TYPE_ORDER (-1 = unclassified), matching the
  // symOpType column in utils/callGraphModel.
  const type = new Int8Array(n)
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
    io[i] = num(pick(raw, K_IO))
    memDelta[i] = num(pick(raw, K_MEM))
    netSent[i] = num(pick(raw, K_SENT))
    netRecv[i] = num(pick(raw, K_RECV))
    // Resolved once here; the old version recomputed it per node per render.
    const t = detectOpType(raw)
    const ti = t !== null && TYPE_INDEX[t] !== undefined ? TYPE_INDEX[t] : OP_NONE
    type[i] = ti
    typesPresent.add(ti)
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
    n, name, cls, file, line, dur, cpu, io, memDelta, netSent, netRecv,
    type, parent, firstChild, lastChild, nextSib, childCount, depth, subtreeSize,
    roots, rootsHead, order, typesPresent, cyclesCut, maxDepth, truncatedDepth,
  }
}

const EMPTY_LAYOUT = Object.freeze({
  frames: EMPTY_ARR, rowStart: EMPTY_ARR, rowCount: 0, contentH: 0,
  drawn: 0, mergedMembers: 0, runCount: 0, hidden: 0, filteredOut: 0,
  truncated: false, degraded: false, total: 0, considered: 0,
})

// Metric value of one node, always >= 0. memory is a SIGNED delta (a free is
// negative) and network is two counters, so both are reduced to a magnitude.
function metricValue(tree, metric, i) {
  if (metric === 'cpu') return tree.cpu[i] > 0 ? tree.cpu[i] : 0
  if (metric === 'io') return tree.io[i] > 0 ? tree.io[i] : 0
  if (metric === 'memory') {
    const v = tree.memDelta[i]
    return v < 0 ? -v : v
  }
  if (metric === 'network') {
    const v = tree.netSent[i] + tree.netRecv[i]
    return v > 0 ? v : 0
  }
  return tree.dur[i] > 0 ? tree.dur[i] : 0
}

/* ---------------------------------------------------------------------------
   PASS B + C — values, keep-mask, then breadth-first row packing.

   Widths are strictly proportional: a child's width is
       parentW * value / max(parentValue, sumOfALLChildValues)
   packed left-to-right inside its own parent's span. The residue at the right
   edge is the parent's real self time and is deliberately left empty.

   `minPct` is a noise floor expressed as a percentage of the VIEW total on the
   current metric (not raw milliseconds), so the control means the same thing
   whichever metric is selected.
   ------------------------------------------------------------------------- */
export function buildFlameLayout({
  tree, metric = 'duration', minPct = 0, focus = -1,
  canvasW = 800, maxRows = MAX_ROWS, maxFrames = MAX_FRAMES,
}) {
  const n = tree ? tree.n : 0
  if (!n) return EMPTY_LAYOUT
  const {
    parent, firstChild, nextSib, childCount, subtreeSize, order, roots, rootsHead,
  } = tree
  const view = focus >= 0 && focus < n ? focus : -1

  // ---- B1: metric value per node. Negative / NaN / Infinity collapse to 0.
  const val = new Float64Array(n)
  for (let i = 0; i < n; i++) val[i] = metricValue(tree, metric, i)

  // ---- B2: denominators. childSum sums ALL children, not just the kept ones,
  // so a bar's width is invariant under filtering — toggling the noise floor
  // never widens a survivor, which is what makes "wider == slower" always true.
  const childSum = new Float64Array(n)
  const structSum = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const p = parent[i]
    if (p !== -1) { childSum[p] += val[i]; structSum[p] += subtreeSize[i] }
  }

  // ---- B3: the view total. Computed before the keep-mask because the noise
  // floor is a share OF it — and because it is deliberately independent of
  // filtering, so the axis does not move when the floor changes.
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
  // Two different questions, previously conflated into one flag:
  //  - scaleZero: the value in view sums to 0, so widths cannot be proportional
  //    and this band falls back to structural weighting.
  //  - degraded:  the metric was never recorded ANYWHERE, which is the only
  //    claim the UI may put in front of a user.
  // They differ constantly: memory/network are signed additive deltas, and
  // mergeCallStacks' synthetic root carries no memory key at all, so a trace
  // that really allocated 16MB can still sum to 0 over the root set.
  const scaleZero = !(total > 0)
  let recorded = false
  for (let i = 0; i < n; i++) {
    if (val[i] !== 0) { recorded = true; break }
  }
  const degraded = !recorded

  // ---- B4: keep-mask. Keep a node when it passes OR any descendant does, so
  // a hot leaf under a cheap parent never disappears. Skipped in structure mode
  // (nothing to be a share of).
  let keep = null
  if (minPct > 0 && total > EPS) {
    const cut = (total * minPct) / 100
    keep = new Uint8Array(n)
    for (let i = 0; i < n; i++) keep[i] = val[i] >= cut ? 1 : 0
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
    // Structural styling tracks whether THIS width is a real cost, not whether
    // the metric exists somewhere in the trace.
    frames.push({ i: view, x: 0, w: canvasW, d: 0, p: -1, m: 0, mv: val[view], s: scaleZero ? 1 : 0 })
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

  // Reachable when the noise floor filters out every root: report the accounting
  // so the caller can say "nothing matches" instead of drawing a 0-height canvas.
  const hidden = Math.max(0, considered - filteredOut - drawn - mergedMembers)
  return {
    frames, rowStart, rowCount, contentH: rowCount * PITCH,
    drawn, mergedMembers, runCount, hidden, filteredOut,
    truncated, degraded, total, considered,
  }
}

/* ------------------------------ presentation ------------------------------ */

// Labels are computed, never measured: CHAR_PX over-estimates the advance of an
// 11px mono glyph, so a label can never overflow its frame. No
// getComputedTextLength, no clipPath, no textLength — zero layout thrash.
// Widest-that-fits ladder: fully qualified, then class-qualified, then the bare
// method. Middle-ellipsising a namespace spends characters that carry nothing.
function frameText(tree, i, maxChars) {
  const fn = tree.name[i]
  const cls = tree.cls[i]
  if (!cls) return middleEllipsis(fn, maxChars)
  const full = `${cls}::${fn}`
  if (full.length <= maxChars) return full
  const short = `${cls.slice(cls.lastIndexOf('\\') + 1)}::${fn}`
  if (short.length <= maxChars) return short
  return middleEllipsis(fn, maxChars)
}

function symbolOf(tree, i) {
  const cls = tree.cls[i]
  return cls ? `${cls}::${tree.name[i]}` : tree.name[i]
}

function srcOf(tree, i) {
  const file = tree.file[i]
  if (!file) return ''
  const base = file.slice(file.lastIndexOf('/') + 1)
  return tree.line[i] ? `${base}:${tree.line[i]}` : base
}

// The frame layer carries NO event handlers and is memoized, so a mouse sweep
// re-renders the tooltip and one overlay rect — never these 6000 rects.
// Labels are emitted after every rect so no frame can paint over a neighbour's
// text.
const FlameFrames = React.memo(function FlameFrames({ frames, tree, metric }) {
  const rects = []
  const labels = []
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k]
    const y = f.d * PITCH
    const merged = f.m > 0
    const op = merged ? OP_MERGED : tree.type[f.i]
    rects.push(
      <rect
        key={k}
        className={`fg-f${f.s ? ' is-struct' : ''}`}
        style={paintOf(op)}
        x={f.x}
        y={y}
        width={f.w}
        height={ROW_H}
      />
    )
    if (f.w < MIN_LABEL_PX) continue
    const maxChars = Math.floor((f.w - LABEL_PAD) / CHAR_PX)
    if (maxChars < 3) continue
    // The value only earns its space on a wide frame, and never in structure
    // mode where the width is a node count rather than a cost.
    let val = ''
    if (!merged && f.s === 0 && f.w >= VALUE_LABEL_PX && f.mv > 0) {
      const v = fmtMetric(metric, f.mv)
      if (maxChars - v.length - 2 >= 8) val = v
    }
    const budget = val ? maxChars - val.length - 2 : maxChars
    const text = merged
      ? (f.w >= VALUE_LABEL_PX ? `⋯ ${fmtNum(f.m)} frames merged` : `⋯ ${fmtNum(f.m)}`)
      : frameText(tree, f.i, budget)
    labels.push(
      <text
        key={`t${k}`}
        className={`fg-t${merged ? ' is-merged' : ''}`}
        x={f.x + LABEL_PAD / 2}
        y={y + ROW_H / 2}
      >
        {text}
        {val ? <tspan className="fg-tv" dx={6}>{val}</tspan> : null}
      </text>
    )
  }
  return <g className="fg-frames">{rects}{labels}</g>
})

function TipRow({ k, v }) {
  return (
    <div className="fg-tip-row">
      <span className="fg-tip-k">{k}</span>
      <span className="fg-tip-v opa-mono opa-tnum">{v}</span>
    </div>
  )
}

function FlameGraph({ callStack, width = 800, height = 600, metric: metricProp, onMetricChange }) {
  const [ownMetric, setOwnMetric] = useState('duration')
  const [minPct, setMinPct] = useState(0)
  const [zoom, setZoom] = useState({ tree: null, path: EMPTY_PATH })
  const [hover, setHover] = useState(null)
  const [boxW, setBoxW] = useState(0)

  const hostRef = useRef(null)
  const scrollRef = useRef(null)
  const svgRef = useRef(null)
  const rafRef = useRef(0)
  const ptRef = useRef(null)

  // `metric` is OPTIONAL. TraceDetail owns ONE metric selector for the whole
  // Profile panel, so when it passes the prop the internal <select> disappears;
  // without the prop the component stays self-managed (ProfilingView,
  // ProfileComparison). onMetricChange works in both modes.
  const controlled = metricProp !== undefined
  const wanted = controlled ? metricProp : ownMetric
  const metric = IS_METRIC[wanted] ? wanted : 'duration'
  const metricLabel = METRIC_LABELS[metric] || METRIC_LABELS.duration
  const setMetric = (m) => {
    if (!controlled) setOwnMetric(m)
    if (onMetricChange) onMetricChange(m)
  }

  const tree = useMemo(() => normalizeCallStack(callStack), [callStack])
  // Tokenizing the zoom path by the tree object invalidates stale node indices
  // when `callStack` changes — no reset effect, no double render, no StrictMode
  // hazard.
  const path = zoom.tree === tree ? zoom.path : EMPTY_PATH
  const focus = path.length ? path[path.length - 1] : -1

  // Measure the real box: ProfilingView/TraceDetail pass their measured width,
  // but ProfileComparison measures the OUTER split and hands the same number to
  // both halves. Taking the smaller of prop and reality keeps the SVG inside its
  // container instead of overflowing (or being squashed by a viewBox stretch,
  // which blurs every label).
  useEffect(() => {
    const el = hostRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      setBoxW((prev) => (Math.abs(prev - w) >= 1 ? w : prev))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const canvasW = useMemo(() => {
    const propW = Number.isFinite(width) && width > 0 ? Math.floor(width) : 0
    const avail = boxW > 0 && propW > 0 ? Math.min(propW, boxW) : (boxW || propW)
    return Math.max(MIN_CANVAS_W, avail - GUTTER)
  }, [width, boxW])
  const boxH = useMemo(() => Math.max(200, Math.min(Math.floor(height) || 0, 2400)), [height])

  const layout = useMemo(
    () => buildFlameLayout({ tree, metric, minPct, focus, canvasW }),
    [tree, metric, minPct, focus, canvasW]
  )

  const crumbs = useMemo(() => path.map((i) => symbolOf(tree, i)), [path, tree])
  const legend = useMemo(
    () => TYPE_ORDER.map((_t, i) => i).concat(OP_NONE).filter((op) => tree.typesPresent.has(op)),
    [tree]
  )
  // Σ|value| per metric — the honest "was this recorded?" test. |Σ| cannot be
  // used: memory/network are signed deltas whose sum cancels to 0 on real data.
  const hasData = useMemo(() => {
    const out = { duration: 0, cpu: 0, io: 0, memory: 0, network: 0 }
    for (let i = 0; i < tree.n; i++) {
      out.duration += Math.abs(tree.dur[i])
      out.cpu += Math.abs(tree.cpu[i])
      out.io += Math.abs(tree.io[i])
      out.memory += Math.abs(tree.memDelta[i])
      out.network += Math.abs(tree.netSent[i]) + Math.abs(tree.netRecv[i])
    }
    return out
  }, [tree])

  const hf = hover && hover.lay === layout && hover.f < layout.frames.length
    ? layout.frames[hover.f]
    : null

  // Every OTHER occurrence of the hovered symbol, outlined: the one question a
  // flame graph cannot otherwise answer is "where else does this run?".
  const echo = useMemo(() => {
    if (!hf || hf.m > 0) return EMPTY_ARR
    const fn = tree.name[hf.i]
    const cls = tree.cls[hf.i]
    const out = []
    const frames = layout.frames
    for (let k = 0; k < frames.length && out.length < ECHO_CAP; k++) {
      if (k === hover.f) continue
      const g = frames[k]
      if (g.m > 0) continue
      if (tree.name[g.i] === fn && tree.cls[g.i] === cls) out.push(g)
    }
    return out
  }, [hf, hover, layout, tree])

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
    // Scroll BEFORE measuring: scrollTop applies synchronously, so the svg rect
    // read below already reflects the row's final on-screen position.
    scrollRowIntoView(f.d)
    const host = hostRef.current
    const svg = svgRef.current
    let mx = f.x
    let my = f.d * PITCH + ROW_H
    let hw = 0
    let hh = 0
    if (host) {
      const hr = host.getBoundingClientRect()
      hw = hr.width
      hh = hr.height
      if (svg) {
        const r = svg.getBoundingClientRect()
        mx = r.left - hr.left + f.x + Math.min(f.w / 2, 80)
        my = r.top - hr.top + f.d * PITCH + ROW_H
      }
    }
    setHover({ lay: layout, f: fi, mx, my, hw, hh })
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

  // The SVG is rendered at 1:1 CSS pixels (no viewBox stretch), so client
  // offsets ARE canvas coordinates.
  const toCanvas = (clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    if (!r.width || !r.height) return null
    return { vx: clientX - r.left, vy: clientY - r.top }
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
      const hr = host ? host.getBoundingClientRect() : null
      setHover({
        lay: layout,
        f: fi,
        mx: hr ? pt.clientX - hr.left : 0,
        my: hr ? pt.clientY - hr.top : 0,
        hw: hr ? hr.width : 0,
        hh: hr ? hr.height : 0,
      })
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

  // Scoped to the SVG, never to window: ProfileComparison mounts two of these
  // side by side and a window listener would drive both at once.
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
    if (e.key === 'Enter' || e.key === ' ') {
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
    return (
      <EmptyState
        title="No call stack to draw"
        hint="This trace carries no profiler frames — enable the OPA profiler to record one."
      />
    )
  }

  /* ---- derived render data ---- */

  const structural = layout.degraded
  const otherMetrics = METRIC_KEYS.filter((k) => k !== metric && hasData[k] > 0)
  const deeper = tree.maxDepth + 1 > layout.rowCount

  // Self cost is computed on demand for the one hovered node (O(childCount)),
  // not precomputed for all n.
  let tipRows = EMPTY_ARR
  let tipHint = ''
  let tipHead = null
  let srText = ''
  if (hf) {
    const i = hf.i
    if (hf.m > 0) {
      tipRows = [
        ['Merged', `${fmtNum(hf.m)} frames`],
        [metricLabel, structural ? '—' : fmtMetric(metric, hf.mv)],
        ['Widest', middleEllipsis(symbolOf(tree, i), 34)],
      ]
      tipHint = 'click to drill into the widest member'
      srText = `${hf.m} merged frames, widest ${symbolOf(tree, i)}`
    } else {
      let kids = 0
      let kidsDur = 0
      for (let c = tree.firstChild[i]; c !== -1; c = tree.nextSib[c]) { kidsDur += tree.dur[c]; kids++ }
      const self = Math.max(0, tree.dur[i] - kidsDur)
      const rows = []
      // Always state the selected metric, even when it was never recorded —
      // omitting the row entirely left no way to see which metric was active.
      rows.push([metricLabel, structural ? 'not recorded' : fmtMetric(metric, hf.mv)])
      if (!structural && layout.total > 0) {
        rows.push(['Share of view', fmtPct((hf.mv / layout.total) * 100, 2)])
      }
      if (metric !== 'duration') rows.push(['Wall time', fmtMs(tree.dur[i])])
      rows.push(['Self (wall)', fmtMs(self)])
      if (tree.cpu[i] > 0 && metric !== 'cpu') rows.push(['CPU time', fmtMs(tree.cpu[i])])
      if (tree.io[i] > 0 && metric !== 'io') rows.push(['I/O wait', fmtMs(tree.io[i])])
      if (tree.memDelta[i] !== 0 && metric !== 'memory') rows.push(['Memory', fmtBytes(tree.memDelta[i])])
      if ((tree.netSent[i] > 0 || tree.netRecv[i] > 0) && metric !== 'network') {
        rows.push(['Network', `↑${fmtBytes(tree.netSent[i])} ↓${fmtBytes(tree.netRecv[i])}`])
      }
      rows.push(['Children / subtree', `${fmtNum(kids)} / ${fmtNum(tree.subtreeSize[i])}`])
      const src = srcOf(tree, i)
      if (src) rows.push(['Source', middleEllipsis(src, 32)])
      tipRows = rows
      if (hf.s === 1) tipHint = 'width shows subtree size — not to scale'
      else if (echo.length > 0) tipHint = `${fmtNum(echo.length)} other occurrence${echo.length === 1 ? '' : 's'} outlined`
      tipHead = symbolOf(tree, i)
      srText = `${tipHead}, ${structural ? 'no data' : fmtMetric(metric, hf.mv)}, depth ${hf.d}`
    }
  }

  const tipOp = hf ? (hf.m > 0 ? OP_MERGED : tree.type[hf.i]) : OP_NONE
  let tipStyle = null
  if (hf && hover) {
    // Clamped inside the host box on both axes, and the box clips whatever a
    // height estimate gets wrong, so the tip can never escape the panel.
    const hw = hover.hw || 0
    const hh = hover.hh || 0
    const est = TIP_CHROME_H + tipRows.length * TIP_ROW_H + (tipHint ? 16 : 0)
    const tw = Math.min(TIP_W, Math.max(150, hw - TIP_EDGE * 2))
    let left = hover.mx + 14
    if (left + tw > hw - TIP_EDGE) left = hover.mx - 14 - tw
    if (left < TIP_EDGE) left = Math.max(TIP_EDGE, Math.min(hover.mx + 14, hw - tw - TIP_EDGE))
    let top = hover.my + 16
    if (top + est > hh - TIP_EDGE) top = hover.my - est - 12
    if (top < TIP_EDGE) top = Math.max(TIP_EDGE, hh - est - TIP_EDGE)
    tipStyle = { left, top, width: tw }
  }

  const ariaLabel = `Icicle graph of ${fmtNum(layout.drawn)} frames over ${layout.rowCount} levels, width proportional to ${metricLabel.toLowerCase()}. Arrow keys move between frames, Enter zooms, Escape returns.`

  return (
    <div className="fg-root" ref={hostRef} style={{ maxHeight: boxH }}>
      {structural && (
        <div className="opa-prof-notice warn">
          <FiAlertTriangle aria-hidden="true" />
          <div>
            <strong>{metricLabel}</strong> is zero on every frame of this trace, so bar widths show
            <strong> subtree size</strong> instead of cost. The shape is real; the scale is not.
          </div>
          {otherMetrics.length > 0 && (
            <div className="opa-prof-notice-actions">
              {otherMetrics.map((k) => (
                <button key={k} type="button" className="opa-prof-mini" onClick={() => setMetric(k)}>
                  Show {METRIC_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {tree.cyclesCut > 0 && (
        <div className="opa-prof-notice">
          <FiInfo aria-hidden="true" />
          <div>
            {fmtNum(tree.cyclesCut)} cyclic parent link{tree.cyclesCut === 1 ? '' : 's'} cut — the collector
            has no cycle guard, so the affected calls are drawn as extra roots.
          </div>
        </div>
      )}
      {tree.truncatedDepth && (
        <div className="opa-prof-notice">
          <FiInfo aria-hidden="true" />
          <div>Input nested past {fmtNum(MAX_TREE_DEPTH)} levels; deeper calls were dropped before layout.</div>
        </div>
      )}

      <div className="fg-bar">
        {!controlled && (
          <label className="opa-prof-field">
            Metric
            <select className="opa-select" value={metric} onChange={(e) => setMetric(e.target.value)}>
              {METRIC_KEYS.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
            </select>
          </label>
        )}
        {!structural && (
          <div
            className="fg-floor"
            title={`Hide frames worth less than this share of the ${metricLabel.toLowerCase()} in view. A parent stays whenever any descendant passes.`}
          >
            <span className="opa-prof-field">Floor</span>
            <SegmentedControl options={NOISE_FLOORS} value={minPct} onChange={setMinPct} />
          </div>
        )}

        <div className="fg-crumbs">
          <button
            type="button"
            className={`opa-prof-crumb${path.length === 0 ? ' is-focus' : ''}`}
            onClick={() => setPath(EMPTY_PATH)}
            title="Zoom out to the whole trace"
          >
            Whole trace
          </button>
          {crumbs.length > CRUMB_TAIL && <span className="opa-prof-crumb-sep">…</span>}
          {crumbs.slice(Math.max(0, crumbs.length - CRUMB_TAIL)).map((c, k, arr) => {
            const depthIdx = Math.max(0, crumbs.length - CRUMB_TAIL) + k + 1
            const last = k === arr.length - 1
            return (
              <React.Fragment key={`${depthIdx}:${c}`}>
                <FiChevronRight className="opa-prof-crumb-sep" size={11} aria-hidden="true" />
                <button
                  type="button"
                  className={`opa-prof-crumb${last ? ' is-focus' : ''}`}
                  onClick={() => setPath(path.slice(0, depthIdx))}
                  title={c}
                  aria-current={last ? 'true' : undefined}
                >
                  {middleEllipsis(c, 28)}
                </button>
              </React.Fragment>
            )
          })}
        </div>

        <div className="fg-meta">
          {legend.map((op) => (
            <span key={op} className="fg-legend-item">
              <span className="fg-sw" style={swatchOf(op)} />
              {typeLabel(TYPE_ORDER[op])}
            </span>
          ))}
          <span className="opa-muted opa-tnum fg-count">
            {fmtNum(layout.drawn)} frames · {layout.rowCount}
            {deeper ? ` of ${fmtNum(tree.maxDepth + 1)}` : ''} levels
          </span>
        </div>
      </div>

      <div className="fg-plot">
        <div className="fg-axis" style={{ width: canvasW }} aria-hidden="true">
          {structural ? (
            <span className="fg-tick is-first">width = subtree size</span>
          ) : AXIS_FRACS.map((fr, k) => (
            <span
              key={fr}
              className={`fg-tick${k === 0 ? ' is-first' : ''}${k === AXIS_FRACS.length - 1 ? ' is-last' : ''}`}
              style={k === 0 || k === AXIS_FRACS.length - 1 ? undefined : { left: `${fr * 100}%` }}
            >
              {/* fmtMs(0) is "0µs", which reads as a measurement rather than an origin */}
              {fr === 0 ? '0' : fmtMetric(metric, layout.total * fr)}
            </span>
          ))}
        </div>

        <div className="fg-canvas" ref={scrollRef}>
          {layout.frames.length === 0 ? (
            <EmptyState
              title="Nothing passes the floor"
              hint={`No frame reaches ${minPct}% of the ${metricLabel.toLowerCase()} in view. Lower the floor to see the rest.`}
            />
          ) : (
            <svg
              ref={svgRef}
              className="fg-svg"
              tabIndex={0}
              role="img"
              aria-label={ariaLabel}
              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape"
              width={canvasW}
              height={layout.contentH}
              viewBox={`0 0 ${canvasW} ${layout.contentH}`}
              onMouseMove={onMouseMove}
              onMouseLeave={onMouseLeave}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              onKeyDown={onKeyDown}
              onBlur={() => setHover(null)}
            >
              {!structural && GRID_FRACS.map((fr) => (
                <line
                  key={fr}
                  className="fg-grid"
                  x1={Math.round(canvasW * fr) + 0.5}
                  x2={Math.round(canvasW * fr) + 0.5}
                  y1={0}
                  y2={layout.contentH}
                />
              ))}
              <FlameFrames frames={layout.frames} tree={tree} metric={metric} />
              {hf && (
                <g className="fg-overlay">
                  {echo.map((g, k) => (
                    <rect key={k} className="fg-echo" x={g.x} y={g.d * PITCH} width={g.w} height={ROW_H} />
                  ))}
                  <rect className="fg-hi" x={hf.x} y={hf.d * PITCH} width={hf.w} height={ROW_H} />
                </g>
              )}
            </svg>
          )}
        </div>
      </div>

      <div className="opa-prof-foot fg-foot">
        {layout.mergedMembers > 0 && (
          <span>
            {fmtNum(layout.mergedMembers)} sub-pixel frames folded into {fmtNum(layout.runCount)} slivers.
          </span>
        )}
        {layout.filteredOut > 0 && <span>{fmtNum(layout.filteredOut)} below the floor.</span>}
        {layout.hidden > 0 && <span>{fmtNum(layout.hidden)} too thin to place.</span>}
        {layout.truncated && (
          <span className="opa-prof-warn">
            Depth capped at {layout.rowCount} levels — zoom into a deep frame to continue.
          </span>
        )}
        <span className="opa-prof-dim">Click a frame to zoom · Esc or double-click to go back · arrow keys to walk.</span>
      </div>

      {hf && tipStyle && (
        <div className="fg-tip" style={tipStyle} aria-hidden="true">
          {tipHead && (
            <div className="fg-tip-head">
              <span className="opa-prof-type fg-tip-type" style={{ color: OP_HUES[tipOp + 2] }}>
                {typeLabel(TYPE_ORDER[tipOp])}
              </span>
              <span className="opa-mono">{middleEllipsis(tipHead, 40)}</span>
            </div>
          )}
          {tipRows.map(([k, v]) => <TipRow key={k} k={k} v={v} />)}
          {tipHint && <div className="fg-tip-hint">{tipHint}</div>}
        </div>
      )}

      <div className="fg-sr" aria-live="polite">{srText}</div>
    </div>
  )
}

export default FlameGraph
