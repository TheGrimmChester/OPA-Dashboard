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

// Shape of `totals` for components that can render before a model exists.
export const EMPTY_TOTALS = Object.freeze({
  wall: 0,
  cpu: 0,
  io: 0,
  memory: 0,
  network: 0,
  calls: 0,
  symbols: 0,
  edges: 0,
  scanned: 0,
  maxDepth: 0,
  structureMode: false,
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
  return {
    // Σ self equals Σ root inclusive cost for a well-formed tree (every child's
    // value is subtracted from its parent exactly once), so this is both the
    // trace total and the exact denominator HotSpots uses for "self %". It
    // covers included symbols only, which is everything unless the 50k symbol
    // cap fired.
    wall: self.duration,
    cpu: self.cpu,
    io: self.io,
    memory: self.memory,
    network: self.network,
    calls: calls.n,
    symbols: graph.S,
    edges: graph.E,
    // diag.total keeps counting past the ingest cap, so this is the honest
    // "first N of M" denominator.
    scanned: calls.diag.total,
    maxDepth: calls.maxDepth,
    // structureMode only means something once there IS data; an empty trace
    // would otherwise claim the metric "was not recorded".
    structureMode: ready && ranked.structureMode,
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
