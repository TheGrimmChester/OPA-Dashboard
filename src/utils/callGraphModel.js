// Call-graph model. Turns one raw OPA call stack into (a) a columnar store of
// call instances and (b) an aggregated symbol graph: one node per function /
// class / file, one edge per observed call site.
//
// The collector's output is hostile and this file is where that is absorbed:
//   - parent_id can be cyclic or self-referential (the extension has no cycle
//     guard), so every traversal is iterative with an explicit visited/colour
//     state and a hard chain cap;
//   - stack_depth is unbounded (10MB root spans observed), so nothing recurses
//     and nothing spreads a trace-sized array (Math.max(...arr) throws
//     RangeError past ~100k elements);
//   - durations are frequently placeholder zeros, so no code path divides by a
//     total without guarding it;
//   - call ids may be missing, duplicated or random, so nothing keys off them
//     except a first-wins parent lookup whose collisions are counted;
//   - the shape is either a flat parent_id-linked array or an already-nested
//     .children tree, in snake_case or PascalCase.
//
// Everything is pure and allocation-frugal: source records are referenced, not
// cloned, and all per-call state lives in typed arrays.

import { detectOpType, TYPE_ORDER } from './opTypes'

export const MAX_NODES = 200000
export const MAX_CHAIN = 4096
export const MAX_SYMBOLS = 50000
export const SCAN_CAP = 64

export const METRICS = ['duration', 'cpu', 'io', 'memory', 'network']
export const GROUP_BY = ['method', 'class', 'file', 'namespace']

// _diffStatus (ProfileComparison) -> small int column.
const DIFF_CODES = { 'no-change': 0, improvement: 1, degradation: 2, new: 3 }
export const DIFF_LABELS = ['Unchanged', 'Improved', 'Degraded', 'New']

function fin(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function metricCols(n) {
  const o = {}
  for (let k = 0; k < METRICS.length; k++) o[METRICS[k]] = new Float64Array(n)
  return o
}

function metricTotals() {
  const o = {}
  for (let k = 0; k < METRICS.length; k++) o[METRICS[k]] = 0
  return o
}

export function rawId(node) {
  if (!node) return null
  const v = node.call_id ?? node.CallID ?? node.id
  return v == null ? null : v
}

export function fnName(node) {
  return node.function || node.Function || node.name || 'unknown'
}

export function clsName(node) {
  return node.class || node.Class || ''
}

export function fileName(node) {
  return node.file || node.File || ''
}

export function lineNo(node) {
  return fin(node.line ?? node.Line)
}

// Last path segment, / and \ both treated as separators (PHP on both OSes).
export function baseName(path) {
  if (!path) return ''
  let cut = -1
  for (let i = path.length - 1; i >= 0; i--) {
    const c = path.charCodeAt(i)
    if (c === 47 || c === 92) { cut = i; break }
  }
  return cut === -1 ? path : path.slice(cut + 1)
}

function emptyCalls(diag) {
  return {
    n: 0,
    maxDepth: 0,
    src: [],
    parent: new Int32Array(0),
    depth: new Int32Array(0),
    val: metricCols(0),
    self: metricCols(0),
    fnType: new Int8Array(0),
    opType: new Int8Array(0),
    diff: new Int8Array(0),
    hasDiff: false,
    totalVal: metricTotals(),
    diag,
  }
}

/**
 * STAGE A — flatten + repair + columnarise. O(n) time, ~1 pass per concern.
 * Returns a structure-of-arrays store; `src[i]` is a REFERENCE to the caller's
 * record (never a clone), so the component can read rare fields on demand.
 */
export function ingestCalls(callStack, opts = {}) {
  const maxNodes = opts.maxNodes || MAX_NODES
  const maxChain = opts.maxChain || MAX_CHAIN
  const diag = {
    total: 0,
    kept: 0,
    truncated: false,
    nested: false,
    dupIds: 0,
    cyclesBroken: 0,
    depthClipped: 0,
    roots: 0,
  }
  if (!Array.isArray(callStack) || callStack.length === 0) return emptyCalls(diag)

  // --- A1: iterative pre-order flatten. Handles the flat and the nested shape
  // with one loop: a flat array simply yields nestedParent = -1 everywhere.
  // `seen` is keyed on object identity, which guards .children cycles and
  // shared subtrees (both observed in merged multi-span stacks).
  const src = []
  const nestedParent = []
  const seen = new Set()
  const stack = []
  const pstack = []
  for (let i = callStack.length - 1; i >= 0; i--) {
    stack.push(callStack[i])
    pstack.push(-1)
  }
  let counted = 0
  while (stack.length > 0) {
    const node = stack.pop()
    const p = pstack.pop()
    if (!node || typeof node !== 'object') continue
    if (seen.has(node)) continue
    seen.add(node)
    counted++
    let idx = -1
    if (src.length < maxNodes) {
      idx = src.length
      src.push(node)
      nestedParent.push(p)
      if (p >= 0) diag.nested = true
    } else {
      // Keep counting past the cap so the UI can say "first N of M".
      diag.truncated = true
    }
    const kids = node.children || node.Children
    if (Array.isArray(kids)) {
      for (let k = kids.length - 1; k >= 0; k--) {
        stack.push(kids[k])
        pstack.push(idx)
      }
    }
  }
  diag.total = counted
  const n = src.length
  diag.kept = n
  if (n === 0) return emptyCalls(diag)

  // --- A2: parent resolution. Nesting is authoritative where present;
  // otherwise resolve parent_id through a first-wins id index. Rebuilding from
  // parent_id is what makes a flat stack an actual graph.
  const parent = new Int32Array(n).fill(-1)
  const idIndex = new Map()
  for (let i = 0; i < n; i++) {
    const raw = rawId(src[i])
    if (raw == null || raw === '') continue
    const key = String(raw)
    if (idIndex.has(key)) { diag.dupIds++; continue }
    idIndex.set(key, i)
  }
  for (let i = 0; i < n; i++) {
    if (nestedParent[i] >= 0) { parent[i] = nestedParent[i]; continue }
    const s = src[i]
    const pid = s.parent_id ?? s.ParentID ?? s.parent
    if (pid == null || pid === '') continue
    const pkey = String(pid)
    const own = rawId(s)
    if (own != null && String(own) === pkey) continue // self-referential row
    const pi = idIndex.get(pkey)
    if (pi !== undefined && pi !== i) parent[i] = pi
  }

  // --- A3: cycle repair + depth, white/grey/black, amortised O(n).
  // Each node is greyed exactly once; a grey hit on the walk is a back edge, so
  // the LAST node on the path is promoted to a root. Termination is structural,
  // not heuristic. The collector's own depth/stack_depth field is never trusted.
  const depth = new Int32Array(n)
  const state = new Uint8Array(n)
  const pathBuf = new Int32Array(n)
  for (let s = 0; s < n; s++) {
    if (state[s] !== 0) continue
    let len = 0
    let cur = s
    while (cur !== -1 && state[cur] === 0 && len < maxChain) {
      state[cur] = 1
      pathBuf[len++] = cur
      cur = parent[cur]
    }
    if (cur !== -1 && state[cur] === 1) {
      parent[pathBuf[len - 1]] = -1
      diag.cyclesBroken++
      cur = -1
    } else if (cur !== -1 && state[cur] === 0 && len >= maxChain) {
      parent[pathBuf[len - 1]] = -1
      diag.depthClipped++
      cur = -1
    }
    let d = cur === -1 ? -1 : depth[cur]
    for (let k = len - 1; k >= 0; k--) {
      depth[pathBuf[k]] = ++d
      state[pathBuf[k]] = 2
    }
  }
  let maxDepth = 0
  for (let i = 0; i < n; i++) {
    if (parent[i] === -1) diag.roots++
    if (depth[i] > maxDepth) maxDepth = depth[i]
  }
  // Breaking a cycle always promotes a node to root, so this cannot fire —
  // it exists so a future change can never leave the forest rootless.
  if (diag.roots === 0) { parent[0] = -1; diag.roots = 1 }

  // --- A4: metric extraction, tolerant of both casings and of string numbers.
  const val = metricCols(n)
  const vDur = val.duration
  const vCpu = val.cpu
  const vIo = val.io
  const vMem = val.memory
  const vNet = val.network
  const fnType = new Int8Array(n)
  const opType = new Int8Array(n)
  const diff = new Int8Array(n).fill(-1)
  const totalVal = metricTotals()
  let hasDiff = false
  for (let i = 0; i < n; i++) {
    const s = src[i]
    vDur[i] = fin(s.duration_ms ?? s.DurationMs ?? s.wall_time_ms ?? s.wall_time ?? s.duration)
    vCpu[i] = fin(s.cpu_ms ?? s.CPUMs ?? s.cpu_time ?? s.cpu)
    vIo[i] = fin(s.io_wait_ms ?? s.io_wait_time ?? s.io_wait)
    vMem[i] = fin(s.memory_delta ?? s.MemoryDelta)
    vNet[i] = fin(s.network_bytes_sent ?? s.NetworkBytesSent ?? s.bytes_sent_delta) +
      fin(s.network_bytes_received ?? s.NetworkBytesReceived ?? s.bytes_received_delta)
    totalVal.duration += vDur[i]
    totalVal.cpu += vCpu[i]
    totalVal.io += vIo[i]
    totalVal.memory += vMem[i]
    totalVal.network += vNet[i]

    const ft = s.function_type ?? s.FunctionType
    fnType[i] = ft === 0 || ft === 1 || ft === 2 ? ft : -1

    const t = detectOpType(s)
    opType[i] = t == null ? -1 : TYPE_ORDER.indexOf(t)

    const ds = s._diffStatus
    if (ds != null) {
      const code = DIFF_CODES[ds]
      if (code !== undefined) { diff[i] = code; hasDiff = true }
    }
  }

  // --- A5: self metrics via child sums. No tree walk at all, which is why a
  // cyclic parent_id cannot hang the metric pipeline even in principle.
  const self = metricCols(n)
  const csDur = new Float64Array(n)
  const csCpu = new Float64Array(n)
  const csIo = new Float64Array(n)
  const csMem = new Float64Array(n)
  const csNet = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const p = parent[i]
    if (p < 0) continue
    csDur[p] += vDur[i]
    csCpu[p] += vCpu[i]
    csIo[p] += vIo[i]
    csMem[p] += vMem[i]
    csNet[p] += vNet[i]
  }
  for (let i = 0; i < n; i++) {
    self.duration[i] = Math.max(0, vDur[i] - csDur[i])
    self.cpu[i] = Math.max(0, vCpu[i] - csCpu[i])
    self.io[i] = Math.max(0, vIo[i] - csIo[i])
    self.network[i] = Math.max(0, vNet[i] - csNet[i])
    // Memory delta is signed on purpose (frees are real information); the
    // absolute value is taken at ranking/display time only.
    self.memory[i] = vMem[i] - csMem[i]
  }

  return {
    n,
    maxDepth,
    src,
    parent,
    depth,
    val,
    self,
    fnType,
    opType,
    diff,
    hasDiff,
    totalVal,
    diag,
  }
}

// Aggregation key for one record. 'method' is the default because grouping by
// class alone hides WHICH method is hot.
function groupKeyOf(s, groupBy) {
  const fn = fnName(s)
  const cls = clsName(s)
  const file = fileName(s)
  if (groupBy === 'class') return cls || baseName(file) || fn
  if (groupBy === 'file') return baseName(file) || cls || fn
  if (groupBy === 'namespace') {
    if (cls) {
      const parts = cls.split('\\')
      if (parts.length >= 2) return parts[0] + '\\' + parts[1]
      return parts[0]
    }
    return baseName(file) || fn
  }
  return cls ? cls + '::' + fn : (file ? baseName(file) + ':' + fn : fn)
}

function includedByKind(ft, flags) {
  // -1 (unknown) is treated as a user function, matching the previous component.
  if (ft === 1) return flags.internal !== false
  if (ft === 2) return flags.method !== false
  return flags.user !== false
}

/**
 * STAGE B — aggregate call instances into a symbol graph.
 * O(n + E) with counting-sorted CSR indices and one enter/exit DFS; no
 * recursion, no per-node objects, no filter() inside a loop.
 */
export function deriveSymbolGraph(calls, opts = {}) {
  const groupBy = GROUP_BY.indexOf(opts.groupBy) >= 0 ? opts.groupBy : 'method'
  const flags = opts.fnTypeFlags || { user: true, internal: true, method: true }
  const durationMin = fin(opts.durationMin)
  const maxSymbols = opts.maxSymbols || MAX_SYMBOLS
  const n = calls.n
  const diag = { ...calls.diag, symbols: 0, edges: 0, excluded: 0, symbolCapped: false }

  if (n === 0) {
    return {
      calls,
      groupBy,
      S: 0,
      E: 0,
      symKey: [],
      keyRank: new Int32Array(0),
      symOf: new Int32Array(0),
      effParent: new Int32Array(0),
      repIdx: new Int32Array(0),
      callCount: new Int32Array(0),
      minDepth: new Int32Array(0),
      maxDepth: new Int32Array(0),
      symOpType: new Int8Array(0),
      symFnType: new Int8Array(0),
      symDiff: new Int8Array(0),
      symIsWrapper: new Uint8Array(0),
      recursiveCalls: new Int32Array(0),
      selfM: metricCols(0),
      inclM: metricCols(0),
      totalSelfM: metricTotals(),
      totalInclM: metricTotals(),
      eFrom: new Int32Array(0),
      eTo: new Int32Array(0),
      eCount: new Int32Array(0),
      eW: metricCols(0),
      methodList: [],
      methodOverflow: new Int32Array(0),
      hasDiff: false,
      diag,
    }
  }

  const { src, parent, depth, val, self, fnType, opType, diff } = calls

  // --- B1a: inclusion predicate (function kinds + duration threshold).
  const included = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const ok = includedByKind(fnType[i], flags) && (durationMin <= 0 || val.duration[i] >= durationMin)
    included[i] = ok ? 1 : 0
    if (!ok) diag.excluded++
  }

  // --- B1b: intern signatures in flatten order, so symbol ids (and therefore
  // every downstream tie-break fallback) are deterministic for a given input.
  const symOf = new Int32Array(n).fill(-1)
  const keyToSym = new Map()
  const symKey = []
  for (let i = 0; i < n; i++) {
    if (!included[i]) continue
    const key = groupKeyOf(src[i], groupBy)
    let s = keyToSym.get(key)
    if (s === undefined) {
      if (symKey.length >= maxSymbols) { diag.symbolCapped = true; continue }
      s = symKey.length
      keyToSym.set(key, s)
      symKey.push(key)
    }
    symOf[i] = s
  }
  const S = symKey.length
  diag.symbols = S

  // --- B1c: effective parent = nearest INCLUDED ancestor. Resolved in
  // depth-ascending order (counting sort, O(n)) because parent[i] < i is not
  // guaranteed; this re-parents filtered-out rows instead of rebuilding a tree.
  const maxD = calls.maxDepth
  const cnt = new Int32Array(maxD + 2)
  for (let i = 0; i < n; i++) cnt[depth[i] + 1]++
  for (let d = 1; d < cnt.length; d++) cnt[d] += cnt[d - 1]
  const cursorD = cnt.slice(0, cnt.length - 1)
  const order = new Int32Array(n)
  for (let i = 0; i < n; i++) order[cursorD[depth[i]]++] = i
  const effParent = new Int32Array(n).fill(-1)
  for (let k = 0; k < n; k++) {
    const i = order[k]
    const p = parent[i]
    if (p < 0) continue
    effParent[i] = symOf[p] >= 0 ? p : effParent[p]
  }

  // --- B2: per-symbol accumulation (one flat pass).
  const selfM = metricCols(S)
  const inclM = metricCols(S)
  const callCount = new Int32Array(S)
  const repIdx = new Int32Array(S).fill(-1)
  const minDepth = new Int32Array(S).fill(0x7fffffff)
  const maxDepthS = new Int32Array(S)
  const symOpType = new Int8Array(S).fill(-1)
  const symFnType = new Int8Array(S).fill(-1)
  const symDiff = new Int8Array(S).fill(-1)
  const symIsWrapper = new Uint8Array(S)
  const recursiveCalls = new Int32Array(S)
  const wantMethods = groupBy !== 'method'
  const methodList = wantMethods ? new Array(S) : []
  const methodSeen = wantMethods ? new Array(S) : []
  const methodOverflow = new Int32Array(S)
  const totalSelfM = metricTotals()
  const totalInclM = metricTotals()

  for (let i = 0; i < n; i++) {
    const s = symOf[i]
    if (s < 0) continue
    for (let m = 0; m < METRICS.length; m++) {
      const key = METRICS[m]
      selfM[key][s] += self[key][i]
    }
    callCount[s]++
    if (depth[i] < minDepth[s]) minDepth[s] = depth[i]
    if (depth[i] > maxDepthS[s]) maxDepthS[s] = depth[i]
    // Unknown (-1) < function (0) < a specific operation type: first specific wins.
    if (opType[i] > 0) { if (symOpType[s] <= 0) symOpType[s] = opType[i] }
    else if (symOpType[s] === -1 && opType[i] === 0) symOpType[s] = 0
    if (repIdx[s] < 0) {
      repIdx[s] = i
      symFnType[s] = fnType[i]
      const rid = rawId(src[i])
      const rs = rid == null ? '' : String(rid)
      // mergeCallStacks injects these wrappers; they are the trace entry points.
      if (rs === 'trace' || rs.startsWith('span:')) symIsWrapper[s] = 1
    }
    if (symDiff[s] === -1 && diff[i] >= 0) symDiff[s] = diff[i]
    if (wantMethods) {
      let set = methodSeen[s]
      if (set === undefined) { set = new Set(); methodSeen[s] = set; methodList[s] = [] }
      const cls = clsName(src[i])
      const label = cls ? cls + '::' + fnName(src[i]) : fnName(src[i])
      if (!set.has(label)) {
        if (set.size < 32) { set.add(label); methodList[s].push(label) }
        else methodOverflow[s]++
      }
    }
  }
  for (let s = 0; s < S; s++) {
    if (minDepth[s] === 0x7fffffff) minDepth[s] = 0
    for (let m = 0; m < METRICS.length; m++) totalSelfM[METRICS[m]] += selfM[METRICS[m]][s]
  }

  // --- B3: children CSR over effParent (counting sort, no per-node arrays).
  const childStart = new Int32Array(n + 1)
  let linked = 0
  for (let i = 0; i < n; i++) {
    const p = effParent[i]
    if (p >= 0) { childStart[p + 1]++; linked++ }
  }
  for (let i = 1; i <= n; i++) childStart[i] += childStart[i - 1]
  const childList = new Int32Array(linked)
  const cursorC = childStart.slice(0, n)
  for (let i = 0; i < n; i++) {
    const p = effParent[i]
    if (p >= 0) childList[cursorC[p]++] = i
  }

  // --- B4a: intern edges in flatten order (deterministic ids) and count call
  // sites. A call into the SAME symbol is recursion, recorded as a badge rather
  // than a self-loop edge — that removes a whole class of visual clutter.
  const edgeKeyToIdx = new Map()
  const eFromArr = []
  const eToArr = []
  const eCountArr = []
  const edgeOf = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    const v = symOf[i]
    if (v < 0) continue
    const p = effParent[i]
    if (p < 0) continue
    const u = symOf[p]
    if (u < 0) continue
    if (u === v) { recursiveCalls[v]++; continue }
    const key = u * S + v // integer key: S <= 50k so this stays well under 2^53
    let e = edgeKeyToIdx.get(key)
    if (e === undefined) {
      e = eFromArr.length
      edgeKeyToIdx.set(key, e)
      eFromArr.push(u)
      eToArr.push(v)
      eCountArr.push(0)
    }
    eCountArr[e]++
    edgeOf[i] = e
  }
  const E = eFromArr.length
  diag.edges = E
  const eFrom = Int32Array.from(eFromArr)
  const eTo = Int32Array.from(eToArr)
  const eCount = Int32Array.from(eCountArr)
  const eW = metricCols(E)

  // --- B4b: one enter/exit DFS gives BOTH recursion-safe inclusive metrics per
  // symbol (an `active` on-path counter stops a recursive frame double-counting)
  // and the exact per-instance inclusive value used as edge weight ("how much
  // cost flowed through this call site"). Iterative with a child cursor, so the
  // JS stack is never at risk however deep the PHP stack was.
  const active = new Int32Array(S)
  const cursorDfs = new Int32Array(n)
  const dfsStack = []
  const levels = maxD + 2
  const accum = metricCols(levels * METRICS.length ? levels : 1)
  const acc = {}
  for (let m = 0; m < METRICS.length; m++) acc[METRICS[m]] = new Float64Array(levels)
  void accum
  for (let r = 0; r < n; r++) {
    if (effParent[r] >= 0) continue
    dfsStack.length = 0
    let level = 0
    // enter root
    for (let m = 0; m < METRICS.length; m++) acc[METRICS[m]][level] = 0
    enterSym(r)
    dfsStack.push(r)
    while (dfsStack.length > 0) {
      const idx = dfsStack[dfsStack.length - 1]
      const base = childStart[idx]
      const c = cursorDfs[idx]
      if (base + c < childStart[idx + 1]) {
        cursorDfs[idx] = c + 1
        const child = childList[base + c]
        level++
        for (let m = 0; m < METRICS.length; m++) acc[METRICS[m]][level] = 0
        enterSym(child)
        dfsStack.push(child)
      } else {
        // exit: acc[level] holds the subtree total of idx's CHILDREN.
        const e = edgeOf[idx]
        for (let m = 0; m < METRICS.length; m++) {
          const key = METRICS[m]
          const total = acc[key][level] + val[key][idx]
          if (level > 0) acc[key][level - 1] += total
          if (e >= 0) eW[key][e] += total
        }
        const s = symOf[idx]
        if (s >= 0) active[s]--
        dfsStack.pop()
        level--
      }
    }
  }
  function enterSym(idx) {
    const s = symOf[idx]
    if (s < 0) return
    // Only the outermost frame of a recursive symbol contributes its inclusive
    // metric, so recursion is correct rather than merely caveated.
    if (active[s]++ === 0) {
      for (let m = 0; m < METRICS.length; m++) {
        const key = METRICS[m]
        inclM[key][s] += val[key][idx]
      }
    }
  }
  for (let s = 0; s < S; s++) {
    for (let m = 0; m < METRICS.length; m++) totalInclM[METRICS[m]] += inclM[METRICS[m]][s]
  }

  // --- B5: content order. Every later tie-break terminates in this rank, so
  // equal-cost sets are ordered by CONTENT, not by arrival order, and the
  // hot loops compare integers instead of calling localeCompare.
  const keyOrder = new Int32Array(S)
  for (let s = 0; s < S; s++) keyOrder[s] = s
  const keyRank = new Int32Array(S)
  if (S > 1) {
    const sorted = Array.prototype.slice.call(keyOrder)
    sorted.sort((a, b) => symKey[a].localeCompare(symKey[b]))
    for (let k = 0; k < S; k++) keyRank[sorted[k]] = k
  }

  return {
    calls,
    groupBy,
    S,
    E,
    symKey,
    keyRank,
    symOf,
    effParent,
    repIdx,
    callCount,
    minDepth,
    maxDepth: maxDepthS,
    symOpType,
    symFnType,
    symDiff,
    symIsWrapper,
    recursiveCalls,
    selfM,
    inclM,
    totalSelfM,
    totalInclM,
    eFrom,
    eTo,
    eCount,
    eW,
    methodList,
    methodOverflow,
    hasDiff: calls.hasDiff,
    diag,
  }
}

function typeAllowed(typeFilter, opTypeIdx) {
  if (!typeFilter || typeFilter.size === 0) return true
  const name = opTypeIdx >= 0 ? TYPE_ORDER[opTypeIdx] : 'unknown'
  return typeFilter.has(name)
}

/**
 * STAGE B5/C prep — metric-dependent ranking plus weight-sorted adjacency.
 * Each node's adjacency slice comes out pre-sorted descending, so every later
 * "top-k neighbours" lookup is O(k) with zero sorting at interaction time.
 */
export function rankSymbols(graph, opts = {}) {
  const metric = METRICS.indexOf(opts.metric) >= 0 ? opts.metric : 'duration'
  const sortKey = opts.sortKey || 'self'
  const minPct = fin(opts.minPct)
  const typeFilter = opts.typeFilter || null
  const { S, E, eFrom, eTo, eCount, eW, selfM, inclM, callCount, keyRank, symOpType } = graph

  const totalSelf = Math.abs(graph.totalSelfM[metric])
  const totalIncl = Math.abs(graph.totalInclM[metric])
  // Placeholder durations (all zero) and degenerate all-equal metrics both land
  // here: rank structurally by call count instead of dividing by zero.
  const structureMode = totalSelf === 0

  const weight = new Float64Array(S)
  let maxWeight = 0
  let minSelf = Infinity
  let maxSelf = 0
  for (let s = 0; s < S; s++) {
    const v = Math.abs(selfM[metric][s])
    weight[s] = structureMode ? callCount[s] : v
    if (weight[s] > maxWeight) maxWeight = weight[s]
    if (v > maxSelf) maxSelf = v
    if (v < minSelf) minSelf = v
  }
  if (!Number.isFinite(minSelf)) minSelf = 0
  const allEqual = S > 1 && !structureMode && maxSelf === minSelf

  // Total order: primary weight, then calls, then inclusive, then content rank.
  const cmpCost = (a, b) => {
    if (weight[b] !== weight[a]) return weight[b] - weight[a]
    if (callCount[b] !== callCount[a]) return callCount[b] - callCount[a]
    const ia = Math.abs(inclM[metric][a])
    const ib = Math.abs(inclM[metric][b])
    if (ib !== ia) return ib - ia
    return keyRank[a] - keyRank[b]
  }
  const hotOrder = new Int32Array(S)
  for (let s = 0; s < S; s++) hotOrder[s] = s
  hotOrder.sort(cmpCost)
  const rankOf = new Int32Array(S)
  for (let k = 0; k < S; k++) rankOf[hotOrder[k]] = k

  let listOrder = hotOrder
  if (sortKey !== 'self') {
    const alt = Int32Array.from(hotOrder)
    if (sortKey === 'total') {
      alt.sort((a, b) => {
        const d = Math.abs(inclM[metric][b]) - Math.abs(inclM[metric][a])
        return d !== 0 ? d : keyRank[a] - keyRank[b]
      })
    } else if (sortKey === 'calls') {
      alt.sort((a, b) => {
        const d = callCount[b] - callCount[a]
        return d !== 0 ? d : keyRank[a] - keyRank[b]
      })
    } else {
      alt.sort((a, b) => keyRank[a] - keyRank[b])
    }
    listOrder = alt
  }

  // Visibility: significance threshold + op-type chips. Never applied to the
  // focus itself (the component keeps it) so drilling can always continue.
  const visible = new Uint8Array(S)
  const denom = structureMode ? maxWeight : totalSelf
  let visibleCount = 0
  for (let s = 0; s < S; s++) {
    const pct = denom > 0 ? (weight[s] / denom) * 100 : 0
    const ok = pct >= minPct && typeAllowed(typeFilter, symOpType[s])
    visible[s] = ok ? 1 : 0
    if (ok) visibleCount++
  }

  // Per-edge rank weight, then out/in CSR sorted by (source, weight desc, content).
  const eRank = new Float64Array(E)
  let totalEdgeW = 0
  for (let e = 0; e < E; e++) totalEdgeW += Math.abs(eW[metric][e])
  let maxEdgeW = 0
  for (let e = 0; e < E; e++) {
    eRank[e] = totalEdgeW > 0 ? Math.abs(eW[metric][e]) : eCount[e]
    if (eRank[e] > maxEdgeW) maxEdgeW = eRank[e]
  }

  const outStart = new Int32Array(S + 1)
  const inStart = new Int32Array(S + 1)
  for (let e = 0; e < E; e++) { outStart[eFrom[e] + 1]++; inStart[eTo[e] + 1]++ }
  for (let s = 1; s <= S; s++) { outStart[s] += outStart[s - 1]; inStart[s] += inStart[s - 1] }
  const outList = new Int32Array(E)
  const inList = new Int32Array(E)
  const co = outStart.slice(0, S)
  const ci = inStart.slice(0, S)
  for (let e = 0; e < E; e++) { outList[co[eFrom[e]]++] = e; inList[ci[eTo[e]]++] = e }
  // One sort per index, keyed so slices stay contiguous: source asc, weight
  // desc, then the other endpoint's content rank.
  if (E > 1) {
    outList.sort((a, b) => {
      if (eFrom[a] !== eFrom[b]) return eFrom[a] - eFrom[b]
      if (eRank[b] !== eRank[a]) return eRank[b] - eRank[a]
      return keyRank[eTo[a]] - keyRank[eTo[b]]
    })
    inList.sort((a, b) => {
      if (eTo[a] !== eTo[b]) return eTo[a] - eTo[b]
      if (eRank[b] !== eRank[a]) return eRank[b] - eRank[a]
      return keyRank[eFrom[a]] - keyRank[eFrom[b]]
    })
  }
  const outDeg = new Int32Array(S)
  const inDeg = new Int32Array(S)
  for (let s = 0; s < S; s++) {
    outDeg[s] = outStart[s + 1] - outStart[s]
    inDeg[s] = inStart[s + 1] - inStart[s]
  }

  return {
    metric,
    sortKey,
    structureMode,
    allEqual,
    totalSelf,
    totalIncl,
    weight,
    maxWeight,
    hotOrder,
    rankOf,
    listOrder,
    visible,
    visibleCount,
    eRank,
    maxEdgeW,
    outStart,
    outList,
    inStart,
    inList,
    outDeg,
    inDeg,
  }
}

/**
 * STAGE D — path context. Both walks are budgeted and cycle-guarded; an
 * aggregated symbol graph has no unique stack, so the result is labelled an
 * OBSERVED path, never "the stack".
 */
export function shortestEntryPath(graph, ranked, focus, budget = 20000) {
  if (focus == null || focus < 0 || graph.S === 0) return []
  const { inStart, inList, inDeg } = ranked
  const { eFrom, symIsWrapper } = graph
  const prev = new Int32Array(graph.S).fill(-1)
  const seen = new Uint8Array(graph.S)
  const queue = [focus]
  seen[focus] = 1
  let head = 0
  let spent = 0
  let target = -1
  while (head < queue.length) {
    const u = queue[head++]
    if (u !== focus && (inDeg[u] === 0 || symIsWrapper[u])) { target = u; break }
    if (inDeg[u] === 0) { target = u; break }
    for (let k = inStart[u]; k < inStart[u + 1]; k++) {
      if (++spent > budget) { head = queue.length; break }
      const v = eFrom[inList[k]]
      if (seen[v]) continue
      seen[v] = 1
      prev[v] = u
      queue.push(v)
    }
  }
  if (target < 0) return hottestCallerChain(graph, ranked, focus)
  const path = []
  let cur = target
  let guard = 0
  while (cur !== -1 && guard++ < 4096) {
    path.push(cur)
    if (cur === focus) break
    cur = prev[cur]
  }
  return path
}

export function hottestCallerChain(graph, ranked, focus, cap = 512) {
  if (focus == null || focus < 0 || graph.S === 0) return []
  const { inStart, inList } = ranked
  const { eFrom } = graph
  const seen = new Set()
  const chain = [focus]
  let cur = focus
  seen.add(cur)
  for (let step = 0; step < cap; step++) {
    // Slices are pre-sorted by weight desc, so the hottest caller is first.
    let next = -1
    for (let k = inStart[cur]; k < inStart[cur + 1]; k++) {
      const v = eFrom[inList[k]]
      if (!seen.has(v)) { next = v; break }
    }
    if (next < 0) break
    seen.add(next)
    chain.push(next)
    cur = next
  }
  chain.reverse()
  return chain
}

/**
 * One REPRESENTATIVE CONCRETE call path for a symbol, recovered by walking the
 * repaired parent column upward from the symbol's first instance. Cycle-safe by
 * construction (visited set + hard cap).
 */
export function representativePath(graph, focus, cap = 512) {
  const out = []
  if (focus == null || focus < 0 || graph.S === 0) return out
  const i0 = graph.repIdx[focus]
  if (i0 < 0) return out
  const { parent, src } = graph.calls
  const seen = new Set()
  let cur = i0
  let steps = 0
  while (cur >= 0 && steps++ < cap && !seen.has(cur)) {
    seen.add(cur)
    out.push({ idx: cur, node: src[cur] })
    cur = parent[cur]
  }
  out.reverse()
  return out
}

// Top-k neighbours of a symbol straight off the pre-sorted CSR (no sorting).
export function neighbours(graph, ranked, sym, dir, limit = SCAN_CAP) {
  const out = []
  if (sym == null || sym < 0) return out
  const start = dir === 'in' ? ranked.inStart : ranked.outStart
  const list = dir === 'in' ? ranked.inList : ranked.outList
  const end = Math.min(start[sym + 1], start[sym] + limit)
  for (let k = start[sym]; k < end; k++) {
    const e = list[k]
    out.push({ e, sym: dir === 'in' ? graph.eFrom[e] : graph.eTo[e] })
  }
  return out
}
