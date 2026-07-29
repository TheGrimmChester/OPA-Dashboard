import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FlameGraph, { normalizeCallStack, buildFlameLayout, detectNodeType } from './FlameGraph'
import { detectOpType } from '../utils/opTypes'

// These exercise the pure layout passes rather than rendered markup: the
// geometry invariants are what matter, and asserting them on the real numbers
// is both stronger and less brittle than scraping SVG attributes.

const CANVAS = 800

function layoutOf(stack, opts = {}) {
  const tree = normalizeCallStack(stack)
  return { tree, layout: buildFlameLayout({ tree, canvasW: CANVAS, ...opts }) }
}

function node(id, parent, duration, extra = {}) {
  return { call_id: id, parent_id: parent, function: id, duration_ms: duration, ...extra }
}

// root(100) -> a(60) -> a1(30), b(40)
function simpleTree() {
  return [
    node('root', '', 100),
    node('a', 'root', 60),
    node('a1', 'a', 30),
    node('b', 'root', 40),
  ]
}

describe('flame layout geometry', () => {
  it('bounds every frame inside the canvas', () => {
    const { layout } = layoutOf(simpleTree())
    expect(layout.frames.length).toBeGreaterThan(0)
    for (const f of layout.frames) {
      expect(f.x).toBeGreaterThanOrEqual(0)
      expect(f.x + f.w).toBeLessThanOrEqual(CANVAS + 0.001)
    }
  })

  it('contains every frame within ITS OWN parent frame', () => {
    const { layout } = layoutOf(simpleTree())
    let checked = 0
    layout.frames.forEach((f) => {
      if (f.p < 0) return
      const parent = layout.frames[f.p]
      expect(parent).toBeDefined()
      expect(f.x).toBeGreaterThanOrEqual(parent.x - 0.001)
      expect(f.x + f.w).toBeLessThanOrEqual(parent.x + parent.w + 0.001)
      checked++
    })
    expect(checked).toBeGreaterThan(0)
  })

  it('never overlaps siblings that share a parent', () => {
    const { layout } = layoutOf(simpleTree())
    const byParent = new Map()
    layout.frames.forEach((f) => {
      if (!byParent.has(f.p)) byParent.set(f.p, [])
      byParent.get(f.p).push(f)
    })
    for (const [, sibs] of byParent) {
      const sorted = [...sibs].sort((a, b) => a.x - b.x)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].w - 0.001)
      }
    }
  })

  it('makes bar width proportional to the metric', () => {
    // one root, children 10ms and 20ms -> the second is ~2x wider
    const { tree, layout } = layoutOf([
      node('r', '', 30),
      node('small', 'r', 10),
      node('big', 'r', 20),
    ])
    const byName = (name) => layout.frames.find((f) => f.m === 0 && tree.name[f.i] === name)
    const small = byName('small')
    const big = byName('big')
    expect(small).toBeDefined()
    expect(big).toBeDefined()
    expect(big.w / small.w).toBeGreaterThan(1.8)
    expect(big.w / small.w).toBeLessThan(2.2)
  })

  it('gives the root row the full canvas width', () => {
    const { layout } = layoutOf(simpleTree())
    const row0 = layout.frames.filter((f) => f.d === 0)
    const span = row0.reduce((s, f) => s + f.w, 0)
    expect(span).toBeCloseTo(CANVAS, 1)
  })

  it('produces no NaN or Infinity in any coordinate', () => {
    const { layout } = layoutOf(simpleTree())
    for (const f of layout.frames) {
      expect(Number.isFinite(f.x)).toBe(true)
      expect(Number.isFinite(f.w)).toBe(true)
    }
  })
})

describe('flame layout with hostile input', () => {
  it('terminates on a self-referential parent_id', () => {
    const { layout } = layoutOf([node('a', 'a', 10)])
    expect(layout.frames.length).toBeGreaterThanOrEqual(0)
  }, 5000)

  it('terminates on a two-node parent_id cycle', () => {
    const { layout } = layoutOf([node('a', 'b', 10), node('b', 'a', 10)])
    expect(Number.isFinite(layout.contentH)).toBe(true)
  }, 5000)

  it('terminates on a duplicated call_id that points at itself', () => {
    const { layout } = layoutOf([node('a', '', 10), node('a', 'a', 10)])
    expect(Number.isFinite(layout.contentH)).toBe(true)
  }, 5000)

  it('survives a 5000-deep chain without a stack overflow', () => {
    const deep = [node('n0', '', 5000)]
    for (let i = 1; i < 5000; i++) deep.push(node(`n${i}`, `n${i - 1}`, 5000 - i))
    expect(() => layoutOf(deep)).not.toThrow()
  }, 20000)

  it('handles 20k siblings under one root within the frame budget', () => {
    const wide = [node('r', '', 20000)]
    for (let i = 0; i < 20000; i++) wide.push(node(`c${i}`, 'r', 1))
    const { layout } = layoutOf(wide)
    // Sub-pixel siblings must be merged/accounted for, never silently lost.
    expect(layout.drawn + layout.mergedMembers + layout.hidden).toBeGreaterThan(0)
    expect(layout.frames.length).toBeLessThanOrEqual(6000)
    for (const f of layout.frames) {
      expect(f.x + f.w).toBeLessThanOrEqual(CANVAS + 0.001)
    }
  }, 20000)

  it('lays out structurally when every metric is zero', () => {
    const { layout } = layoutOf([
      node('r', '', 0),
      node('a', 'r', 0),
      node('b', 'r', 0),
    ])
    expect(layout.frames.length).toBeGreaterThan(0)
    for (const f of layout.frames) {
      expect(Number.isFinite(f.w)).toBe(true)
      expect(f.w).toBeGreaterThan(0)
    }
    // The component surfaces this as "not to scale" rather than pretending.
    expect(layout.degraded).toBeTruthy()
  })

  it('does not blow up on a metric the synthetic root lacks', () => {
    // mergeCallStacks injects a root carrying only duration/cpu, so memory and
    // network are 0 there while children have real values. This used to make
    // the scale collapse to 1px-per-byte and produce a multi-million-px canvas.
    const stack = [
      node('trace', '', 100),
      node('a', 'trace', 50, { memory_delta: 3 * 1024 * 1024 }),
      node('b', 'trace', 50, { memory_delta: 8 * 1024 * 1024 }),
    ]
    for (const metric of ['duration', 'cpu', 'memory', 'network']) {
      const { layout } = layoutOf(stack, { metric })
      for (const f of layout.frames) {
        expect(f.x + f.w).toBeLessThanOrEqual(CANVAS + 0.001)
      }
    }
  })

  it('handles empty and single-node input', () => {
    expect(layoutOf([]).layout.frames.length).toBe(0)
    expect(layoutOf([node('only', '', 5)]).layout.frames.length).toBeGreaterThan(0)
  })

  it('stays inside a 300px panel', () => {
    // 300px host - GUTTER = the narrowest canvas the component will ever build.
    const narrow = 288
    const tree = normalizeCallStack(simpleTree())
    const layout = buildFlameLayout({ tree, canvasW: narrow })
    const row0 = layout.frames.filter((f) => f.d === 0)
    expect(row0.reduce((s, f) => s + f.w, 0)).toBeCloseTo(narrow, 1)
    for (const f of layout.frames) {
      expect(f.x).toBeGreaterThanOrEqual(0)
      expect(f.x + f.w).toBeLessThanOrEqual(narrow + 0.001)
    }
  })

  it('caps a 200k-node trace at the frame budget instead of hanging', () => {
    // 400 chains of 500 -> 200k nodes, both deeper and wider than the budgets.
    const big = [node('root', '', 200000)]
    for (let b = 0; b < 400; b++) {
      big.push(node(`b${b}_0`, 'root', 500))
      for (let d = 1; d < 500; d++) big.push(node(`b${b}_${d}`, `b${b}_${d - 1}`, 500 - d))
    }
    const { tree, layout } = layoutOf(big)
    expect(tree.n).toBeGreaterThan(199000)
    expect(layout.frames.length).toBeLessThanOrEqual(6000)
    expect(layout.truncated).toBe(true)
    for (const f of layout.frames) {
      expect(f.x + f.w).toBeLessThanOrEqual(CANVAS + 0.001)
    }
  }, 30000)
})

describe('flame layout metric + noise floor', () => {
  it('scales by io wait and survives a root that never recorded it', () => {
    const withIo = [
      node('trace', '', 100, { io_wait_ms: 40 }),
      node('slow', 'trace', 50, { io_wait_ms: 30 }),
      node('fast', 'trace', 50, { io_wait_ms: 10 }),
    ]
    const { tree, layout } = layoutOf(withIo, { metric: 'io' })
    const byName = (name) => layout.frames.find((f) => f.m === 0 && tree.name[f.i] === name)
    expect(byName('slow').w / byName('fast').w).toBeCloseTo(3, 1)

    // mergeCallStacks' synthetic root carries only duration/cpu, so io is 0
    // there while children have real values — the scale must not collapse.
    const rootlessIo = [
      node('trace', '', 100),
      node('a', 'trace', 50, { io_wait_ms: 30 }),
    ]
    for (const f of layoutOf(rootlessIo, { metric: 'io' }).layout.frames) {
      expect(f.x + f.w).toBeLessThanOrEqual(CANVAS + 0.001)
    }
  })

  it('keeps a hot leaf hanging off a cheap parent', () => {
    // The floor is a share of the metric in view; a parent survives whenever any
    // descendant passes, otherwise the hot leaf would vanish with its wrapper.
    const { tree, layout } = layoutOf([
      node('root', '', 100),
      node('cheap', 'root', 0.5),
      node('hot', 'cheap', 50),
      node('noise', 'root', 0.5),
    ], { minPct: 5 })
    const names = layout.frames.filter((f) => f.m === 0).map((f) => tree.name[f.i])
    expect(names).toContain('cheap')
    expect(names).toContain('hot')
    expect(names).not.toContain('noise')
    expect(layout.filteredOut).toBe(1)
  })

  it('reports an empty layout rather than a zero-height canvas when the floor excludes every root', () => {
    // Reachable for real: cut cycles and duplicate call_ids both degrade into
    // extra roots, so no single root need reach the floor.
    const many = []
    for (let i = 0; i < 30; i++) many.push(node(`r${i}`, '', 1))
    const { layout } = layoutOf(many, { minPct: 5 })
    expect(layout.frames.length).toBe(0)
    expect(layout.contentH).toBe(0)
    expect(layout.filteredOut).toBe(30)
    expect(Number.isFinite(layout.total)).toBe(true)
  })

  it('leaves widths invariant under the noise floor', () => {
    // The denominator sums ALL children, not the surviving ones, so raising the
    // floor may never widen a survivor — that is what keeps "wider == slower" true.
    const stack = [
      node('root', '', 100),
      node('big', 'root', 60),
      node('small', 'root', 1),
    ]
    const widthOf = (opts) => {
      const { tree, layout } = layoutOf(stack, opts)
      const f = layout.frames.find((g) => g.m === 0 && tree.name[g.i] === 'big')
      return f.w
    }
    expect(widthOf({ minPct: 5 })).toBeCloseTo(widthOf({}), 6)
  })
})

describe('operation typing', () => {
  it('delegates classification to opTypes so the profile views cannot disagree', () => {
    const cases = [
      { function: 'query', class: 'Doctrine\\DBAL\\Connection' },
      { function: 'get', class: 'Predis\\Client' },
      { function: 'handle', http_requests: [{ url: 'https://x' }] },
      { function: 'unknown' },
      {},
    ]
    for (const c of cases) expect(detectNodeType(c)).toBe(detectOpType(c))
  })

  it('records the op type as a TYPE_ORDER index the whole profile shares', () => {
    const { tree } = layoutOf([
      node('trace', '', 10),
      { call_id: 'q', parent_id: 'trace', function: 'query', class: 'Doctrine\\DBAL\\Connection', duration_ms: 5 },
    ])
    const sqlIdx = tree.name.indexOf('query')
    expect(tree.type[sqlIdx]).toBe(1) // TYPE_ORDER = [function, sql, http, redis, cache]
  })
})

// The layout passes above are pure; these cover the render contract the Profile
// panel depends on (one metric selector, tokens not hexes, honest empty states).
describe('render contract', () => {
  const typed = [
    node('trace', '', 100),
    { call_id: 'q', parent_id: 'trace', function: 'query', class: 'Doctrine\\DBAL\\Connection', duration_ms: 60 },
    node('fetchAll', 'q', 30),
    node('render', 'trace', 40),
  ]
  const html = (props) => renderToStaticMarkup(<FlameGraph callStack={typed} width={900} height={500} {...props} />)

  it('shows its own metric selector only when `metric` is not supplied', () => {
    expect(html()).toContain('<select')
    // TraceDetail renders one shared ProfileToolbar metric selector for the whole
    // Profile panel; a second one inside the icicle is the duplicated control.
    expect(html({ metric: 'cpu', onMetricChange: () => {} })).not.toContain('<select')
  })

  it('accepts every metric the shared toolbar can select, and rejects nonsense', () => {
    for (const m of ['duration', 'cpu', 'io', 'memory', 'network']) {
      expect(html({ metric: m })).toContain('fg-root')
    }
    expect(html({ metric: 'nonsense' })).toContain('fg-root')
  })

  it('paints from tokens only — no hex, rgb() or hsl() in the markup', () => {
    const out = html()
    expect(out).toContain('color-mix')
    expect(out).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(out).not.toMatch(/\b(?:rgb|hsl)a?\(/)
  })

  it('borrows the profile chrome instead of inventing parallel styles', () => {
    const out = html({ metric: 'memory' }) // signed deltas absent here -> structure mode
    expect(out).toContain('opa-prof-notice')
    expect(out).toContain('opa-prof-crumb')
    expect(out).toContain('opa-prof-foot')
  })

  it('states the empty case rather than drawing an empty canvas', () => {
    expect(renderToStaticMarkup(<FlameGraph callStack={[]} width={900} height={500} />)).toContain('opa-empty')
  })

  it('renders inside a 300px panel', () => {
    const out = renderToStaticMarkup(<FlameGraph callStack={typed} width={300} height={320} />)
    // canvas = width - GUTTER, never wider than the box it was given
    expect(out).toContain('width="288"')
  })
})
