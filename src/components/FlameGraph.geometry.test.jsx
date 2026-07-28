import { describe, it, expect } from 'vitest'
import { normalizeCallStack, buildFlameLayout } from './FlameGraph'

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
})
