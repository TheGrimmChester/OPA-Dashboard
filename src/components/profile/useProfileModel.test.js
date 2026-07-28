import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildProfileModel, useProfileModel } from './useProfileModel'
import { HotSpots, ProfileSummary, ProfileToolbar } from './index'

// The model is a thin wiring layer over utils/callGraphModel, so these assert the
// contract the profile views depend on: the totals, the structure-mode fallback,
// and — above all — that hostile input (cycles, 20k rows) can never hang a
// render. No JSX here on purpose: the file must stay a plain .js module, so the
// two rendering tests use React.createElement directly.

// Flat, parent_id-linked, snake_case: the shape mergeCallStacks returns.
function flatStack() {
  return [
    { call_id: 'a', function: 'index', duration_ms: 100, cpu_ms: 80, parent_id: null },
    { call_id: 'b', function: 'query', class: 'Db', duration_ms: 30, cpu_ms: 5, parent_id: 'a' },
    { call_id: 'c', function: 'render', duration_ms: 20, cpu_ms: 15, parent_id: 'a' },
  ]
}

function symIndex(model, key) {
  return model.graph.symKey.indexOf(key)
}

// 20 roots x 1000 leaves. Wide rather than deep so the cost is in the ingest and
// aggregation passes, which is what the UI actually waits on.
function bigStack(total) {
  const out = []
  const roots = 20
  const perRoot = Math.floor(total / roots)
  for (let r = 0; r < roots; r++) {
    out.push({ call_id: `r${r}`, function: 'handle', class: `Controller${r}`, duration_ms: 50, cpu_ms: 20, parent_id: null })
    for (let i = 1; i < perRoot; i++) {
      out.push({
        call_id: `r${r}:${i}`,
        function: i % 3 === 0 ? 'query' : 'work',
        class: i % 3 === 0 ? 'Db' : `Service${i % 40}`,
        duration_ms: 0.01,
        cpu_ms: 0.005,
        memory_delta: 128,
        parent_id: `r${r}`,
      })
    }
  }
  return out
}

describe('useProfileModel / buildProfileModel', () => {
  it('returns a usable, non-throwing empty model for an absent call stack', () => {
    for (const input of [undefined, null, [], 'nope', {}]) {
      const model = buildProfileModel(input)
      expect(model.ready).toBe(false)
      expect(model.calls.n).toBe(0)
      expect(model.graph.S).toBe(0)
      expect(model.ranked.hotOrder.length).toBe(0)
      expect(model.totals.calls).toBe(0)
      expect(model.totals.wall).toBe(0)
      // An empty trace has nothing to rank, so it must not claim the metric was
      // "not recorded" — that notice is reserved for real data.
      expect(model.totals.structureMode).toBe(false)
    }
  })

  it('exposes exactly the documented totals keys', () => {
    const model = buildProfileModel(flatStack())
    expect(Object.keys(model.totals).sort()).toEqual([
      'calls', 'cpu', 'edges', 'io', 'maxDepth', 'memory', 'network',
      'scanned', 'structureMode', 'symbols', 'truncated', 'wall',
    ])
  })

  it('splits self vs total cost on a flat parent_id stack', () => {
    const model = buildProfileModel(flatStack())
    expect(model.ready).toBe(true)
    expect(model.totals.calls).toBe(3)
    expect(model.totals.symbols).toBe(3)
    expect(model.totals.maxDepth).toBe(1)

    // wall = sum of self time = the root's inclusive time for a proper tree.
    expect(model.totals.wall).toBeCloseTo(100, 6)
    expect(model.totals.cpu).toBeCloseTo(80, 6) // (80-20) + 5 + 15

    const root = symIndex(model, 'index')
    const db = symIndex(model, 'Db::query')
    expect(root).toBeGreaterThanOrEqual(0)
    expect(model.graph.selfM.duration[root]).toBeCloseTo(50, 6)
    expect(model.graph.inclM.duration[root]).toBeCloseTo(100, 6)
    expect(model.graph.selfM.duration[db]).toBeCloseTo(30, 6)
    expect(model.graph.callCount[db]).toBe(1)

    // Hottest self time first.
    expect(model.graph.symKey[model.ranked.hotOrder[0]]).toBe('index')
    expect(model.ranked.structureMode).toBe(false)
    expect(model.ranked.totalSelf).toBeCloseTo(100, 6)
  })

  it('handles a single-node stack', () => {
    const model = buildProfileModel([{ call_id: 'only', function: 'main', duration_ms: 12 }])
    expect(model.ready).toBe(true)
    expect(model.totals.symbols).toBe(1)
    expect(model.totals.wall).toBeCloseTo(12, 6)
    expect(model.graph.E).toBe(0)
    expect(model.ranked.inDeg[0]).toBe(0)
  })

  // An explicit timeout so a regression that reintroduces recursion or an
  // unguarded while-loop fails loudly instead of stalling the suite.
  it('terminates on cyclic and self-referential parent_id', () => {
    const cyclic = [
      { call_id: 'a', function: 'a', duration_ms: 10, parent_id: 'c' },
      { call_id: 'b', function: 'b', duration_ms: 10, parent_id: 'a' },
      { call_id: 'c', function: 'c', duration_ms: 10, parent_id: 'b' },
      { call_id: 'd', function: 'd', duration_ms: 5, parent_id: 'd' },
    ]
    const model = buildProfileModel(cyclic)
    expect(model.ready).toBe(true)
    expect(model.totals.calls).toBe(4)
    expect(model.calls.diag.cyclesBroken).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(model.totals.wall)).toBe(true)
    expect(model.ranked.hotOrder.length).toBe(4)
  }, 2000)

  it('clips a chain deeper than MAX_CHAIN instead of walking it', () => {
    // Deepest row FIRST: the parent-repair pass then has to walk the whole chain
    // in one go, which is the case the MAX_CHAIN guard exists for.
    const deep = []
    for (let i = 4999; i >= 0; i--) {
      deep.push({ call_id: `n${i}`, function: `f${i % 50}`, duration_ms: 1, parent_id: i === 0 ? null : `n${i - 1}` })
    }
    const model = buildProfileModel(deep)
    expect(model.ready).toBe(true)
    expect(model.totals.calls).toBe(5000)
    expect(model.calls.diag.depthClipped).toBeGreaterThanOrEqual(1)
    expect(model.totals.maxDepth).toBeLessThanOrEqual(4096)
  }, 5000)

  it('falls back to structure mode when the metric was never recorded', () => {
    // No duration keys at all — the common OPA placeholder case.
    const noMetrics = [
      { call_id: 'a', function: 'boot', parent_id: null },
      { call_id: 'b', function: 'get', class: 'Cache', parent_id: 'a' },
      { call_id: 'c', function: 'get', class: 'Cache', parent_id: 'a' },
      { call_id: 'd', function: 'get', class: 'Cache', parent_id: 'a' },
      { call_id: 'e', function: 'once', parent_id: 'a' },
    ]
    const model = buildProfileModel(noMetrics)
    expect(model.ready).toBe(true)
    expect(model.totals.structureMode).toBe(true)
    expect(model.ranked.structureMode).toBe(true)
    expect(model.totals.wall).toBe(0)
    // Ranked by call count instead: the 3-call symbol wins.
    expect(model.graph.symKey[model.ranked.hotOrder[0]]).toBe('Cache::get')
    expect(model.graph.callCount[model.ranked.hotOrder[0]]).toBe(3)

    // A metric that IS present must not be dragged into structure mode.
    const withMemory = buildProfileModel(noMetrics.map((n) => ({ ...n, memory_delta: 1024 })), { metric: 'memory' })
    expect(withMemory.ranked.structureMode).toBe(false)
  })

  it('reports ingest truncation honestly', () => {
    const model = buildProfileModel(bigStack(200), { maxNodes: 50 })
    expect(model.totals.truncated).toBe(true)
    expect(model.totals.calls).toBe(50)
    expect(model.totals.scanned).toBe(200)
  })

  it('builds a 20k-node model quickly', () => {
    const stack = bigStack(20000)
    const t0 = Date.now()
    const model = buildProfileModel(stack)
    const elapsed = Date.now() - t0
    expect(model.ready).toBe(true)
    expect(model.totals.calls).toBe(20000)
    expect(model.totals.truncated).toBe(false)
    expect(model.totals.symbols).toBeGreaterThan(1)
    expect(model.graph.E).toBeGreaterThan(0)
    // Generous ceiling for CI noise; the real pipeline is ~50ms here.
    expect(elapsed).toBeLessThan(3000)
  }, 20000)

  it('groups by class when asked', () => {
    const model = buildProfileModel(flatStack(), { groupBy: 'class' })
    expect(model.graph.symKey).toContain('Db')
    expect(model.graph.groupBy).toBe('class')
  })

  it('exposes the same model through the hook', () => {
    function Probe({ stack, metric }) {
      const model = useProfileModel(stack, { metric })
      return React.createElement(
        'div',
        { 'data-ready': String(model.ready) },
        `${model.totals.calls}|${model.totals.cpu}|${model.ranked.metric}`,
      )
    }
    const html = renderToStaticMarkup(React.createElement(Probe, { stack: flatStack(), metric: 'cpu' }))
    expect(html).toContain('data-ready="true"')
    expect(html).toContain('3|80|cpu')

    const emptyHtml = renderToStaticMarkup(React.createElement(Probe, { stack: undefined, metric: 'duration' }))
    expect(emptyHtml).toContain('data-ready="false"')
    expect(emptyHtml).toContain('0|0|duration')
  })
})

describe('profile views render off the model', () => {
  it('renders the summary strip, toolbar and hot spots with a selected symbol', () => {
    const model = buildProfileModel(flatStack())
    const html = renderToStaticMarkup(React.createElement(
      'div',
      null,
      React.createElement(ProfileSummary, { totals: model.totals, metric: 'duration' }),
      React.createElement(ProfileToolbar, { totals: model.totals, metric: 'duration', groupBy: 'method', query: '' }),
      React.createElement(HotSpots, { model, metric: 'duration', selectedKey: 'Db::query' }),
    ))
    expect(html).toContain('Wall time')
    expect(html).toContain('Filter functions...')
    expect(html).toContain('Db::query')
    // The caller/callee pivot is the point of the view.
    expect(html).toContain('Callers')
    expect(html).toContain('Callees')
    expect(html).toContain('Observed path')
    expect(html).toContain('opa-prof-fn is-selected')
  })

  it('says so plainly instead of showing a confident zero', () => {
    const model = buildProfileModel([
      { call_id: 'a', function: 'boot', parent_id: null },
      { call_id: 'b', function: 'get', class: 'Cache', parent_id: 'a' },
    ])
    const html = renderToStaticMarkup(React.createElement(
      'div',
      null,
      React.createElement(ProfileSummary, { totals: model.totals, metric: 'duration' }),
      React.createElement(HotSpots, { model, metric: 'duration' }),
    ))
    expect(html).toContain('not recorded')
    expect(html).toContain('call count')
  })

  it('renders an empty state for an empty model', () => {
    const model = buildProfileModel([])
    const html = renderToStaticMarkup(React.createElement(HotSpots, { model }))
    expect(html).toContain('No profile data')
  })
})
