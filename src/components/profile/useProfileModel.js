// Profile model: one memoised pipeline from a raw OPA call stack to the three
// analysis products every profile view reads — the columnar call store, the
// aggregated symbol graph, and the metric ranking. All of the analysis lives in
// utils/callGraphModel; this module only wires it to React and derives the
// trace-level totals the summary strip and toolbar display.

import { useMemo } from 'react'
import {
  ingestCalls,
  deriveSymbolGraph,
  rankSymbols,
  METRICS,
  GROUP_BY,
} from '../../utils/callGraphModel'

// One shared array for the absent-stack case. ingestCalls([]) is O(1), so an
// empty model costs nothing; keeping the INPUT identity stable is what keeps the
// memo chain — and therefore the returned object identity — stable while a trace
// is still loading.
const NO_CALLS = []

// Metric shapes differ, and conflating them produced wrong headline numbers.
// callGraphModel derives self by subtracting the children and clamping at 0 for
// duration/cpu/io/network — those are INCLUSIVE, so Σ self is their trace total.
// Only `memory` is a SIGNED additive delta (frees are real information and are
// deliberately not clamped), so Σ self cancels for it and the total has to come
// from the positive selves instead. See deriveTotals.
const ZERO_PER_METRIC = Object.freeze({
  duration: 0, cpu: 0, io: 0, memory: 0, network: 0,
})

// Shape of `totals` for components that can render before a model exists.
export const EMPTY_TOTALS = Object.freeze({
  wall: 0,
  cpu: 0,
  io: 0,
  memory: 0,
  network: 0,
  selfAbs: ZERO_PER_METRIC,
  hasData: Object.freeze({
    duration: false, cpu: false, io: false, memory: false, network: false,
  }),
  calls: 0,
  symbols: 0,
  edges: 0,
  scanned: 0,
  maxDepth: 0,
  structureMode: false,
  rankedByCalls: false,
  truncated: false,
})

function normMetric(metric) {
  return METRICS.indexOf(metric) >= 0 ? metric : 'duration'
}

function normGroupBy(groupBy) {
  return GROUP_BY.indexOf(groupBy) >= 0 ? groupBy : 'method'
}

function normPct(minPct) {
  return typeof minPct === 'number' && Number.isFinite(minPct) ? minPct : 0
}

function deriveTotals(calls, graph, ranked) {
  const self = graph.totalSelfM
  const ready = calls.n > 0

  // Σ|self| per metric. Two jobs, both of which a signed sum gets wrong:
  //  - the only correct denominator for "share of total" (using |Σ self| makes
  //    a metric with real frees report shares in the thousands of percent);
  //  - the honest "does this metric carry any data" test. A trace can allocate
  //    16MB and still have Σ self memory === 0.
  const selfAbs = {}
  const selfPos = {}
  const hasData = {}
  for (const metric of METRICS) {
    const col = graph.selfM[metric]
    let abs = 0
    let pos = 0
    if (col) {
      for (let i = 0; i < graph.S; i++) {
        const v = col[i]
        abs += Math.abs(v)
        if (v > 0) pos += v
      }
    }
    selfAbs[metric] = abs
    selfPos[metric] = pos
    hasData[metric] = abs > 0
  }

  return {
    // Σ self time. NOT the trace's wall clock: callGraphModel clamps self at
    // Math.max(0, own - children), so this is >= root inclusive cost and
    // mergeCallStacks' span wrappers make it strictly greater on any nested
    // trace. Present it as "self time", never as trace duration — TraceDetail
    // shows the real root duration in its header.
    wall: self.duration,
    cpu: self.cpu,
    io: self.io,
    // Memory is the one signed metric, so Σ self cancels parents against their
    // own children. Σ of the POSITIVE selves is the total allocated and is
    // correct whether or not a parent aggregates its children's bytes:
    //   parent 0, children 8+8MB  -> selves -16,+8,+8 -> 16MB
    //   parent 16MB, children 8+8 -> selves   0,+8,+8 -> 16MB
    // (a plain sum over all calls gets the second case wrong, at 32MB).
    memory: selfPos.memory,
    // network is INCLUSIVE in this model (self subtracts children and clamps at
    // 0), so Σ self is already the trace total — not a plain sum over calls.
    network: self.network,
    selfAbs,
    hasData,
    calls: calls.n,
    symbols: graph.S,
    edges: graph.E,
    // diag.total keeps counting past the ingest cap, so this is the honest
    // "first N of M" denominator.
    scanned: calls.diag.total,
    maxDepth: calls.maxDepth,
    // "The metric was genuinely not recorded" — the only claim a UI may make to
    // the user. Deliberately NOT ranked.structureMode, which is only ever a
    // statement about |Σ self| being 0: a trace that allocates and frees 16MB
    // sets that flag while carrying perfectly good per-call memory data.
    structureMode: ready && !hasData[ranked.metric],
    // The weaker, separate fact: rankSymbols could not weight by this metric and
    // fell back to call count. Values may still be worth showing.
    rankedByCalls: ready && ranked.structureMode,
    truncated: !!calls.diag.truncated,
  }
}

/**
 * Pure (non-hook) build of the same model. Used by tests and by any caller that
 * needs the model outside a component; `opts` also accepts the ingestCalls
 * limits (maxNodes / maxChain / maxSymbols).
 */
export function buildProfileModel(callStack, opts = {}) {
  const stack = Array.isArray(callStack) && callStack.length > 0 ? callStack : NO_CALLS
  const calls = ingestCalls(stack, opts)
  const graph = deriveSymbolGraph(calls, { groupBy: normGroupBy(opts.groupBy), maxSymbols: opts.maxSymbols })
  const ranked = rankSymbols(graph, {
    metric: normMetric(opts.metric),
    minPct: normPct(opts.minPct),
    typeFilter: opts.typeFilter || null,
  })
  return { calls, graph, ranked, totals: deriveTotals(calls, graph, ranked), ready: calls.n > 0 }
}

/**
 * Memoised profile model.
 *
 * The three stages are memoised SEPARATELY because their costs and inputs
 * differ: ingest is the expensive one (200k rows) and depends only on the stack,
 * so switching the ranking metric re-runs ranking alone.
 */
export function useProfileModel(callStack, { metric = 'duration', groupBy = 'method', minPct = 0, typeFilter = null } = {}) {
  const stack = Array.isArray(callStack) && callStack.length > 0 ? callStack : NO_CALLS
  const m = normMetric(metric)
  const g = normGroupBy(groupBy)
  const pct = normPct(minPct)
  // Callers normally rebuild the type filter Set on every render, so key the
  // memo on its CONTENTS: rankSymbols only ever reads .size/.has.
  const filterKey = typeFilter && typeFilter.size ? Array.from(typeFilter).sort().join('|') : ''

  const calls = useMemo(() => ingestCalls(stack), [stack])
  const graph = useMemo(() => deriveSymbolGraph(calls, { groupBy: g }), [calls, g])
  const ranked = useMemo(
    () => rankSymbols(graph, { metric: m, minPct: pct, typeFilter }),
    [graph, m, pct, filterKey],
  )

  return useMemo(
    () => ({ calls, graph, ranked, totals: deriveTotals(calls, graph, ranked), ready: calls.n > 0 }),
    [calls, graph, ranked],
  )
}

export default useProfileModel
