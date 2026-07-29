import { describe, it, expect } from 'vitest'
import { deriveSymbolGraph, ingestCalls, rankSymbols } from './callGraphModel'
import { EGO, boxGeometry, labelCharBudget, layoutEgo, splitRows } from './callGraphLayout'

// The geometry is asserted on the real numbers rather than on markup: the
// invariants that matter (nothing overlaps, nothing leaves the canvas, the same
// input gives the same drawing) are properties of the layout, not of the DOM.

const W = 900
const H = 520

function node(id, parent, fn, duration = 1, extra = {}) {
  return { call_id: id, parent_id: parent, function: fn, duration_ms: duration, ...extra }
}

function build(stack, opts = {}) {
  const calls = ingestCalls(stack)
  const graph = deriveSymbolGraph(calls, { groupBy: 'method' })
  const ranked = rankSymbols(graph, { metric: opts.metric || 'duration' })
  return { calls, graph, ranked }
}

/**
 * A FLAT parent_id-linked stack with NO .children anywhere — exactly the shape
 * mergeCallStacks emits and the shape the old component could not read. `hub` is
 * called once by every caller and calls every callee. Hub instances get strictly
 * decreasing durations so the expected caller order is simply caller0, caller1…
 */
function hubStack(callers, callees) {
  const out = [node('r', '', 'root', 1e6)]
  for (let i = 0; i < callers; i++) {
    out.push(node(`c${i}`, 'r', `caller${i}`, 5000))
    out.push(node(`h${i}`, `c${i}`, 'hub', 4000 - i))
  }
  for (let j = 0; j < callees; j++) {
    out.push(node(`e${j}`, 'h0', `callee${j}`, 10 + j))
  }
  return out
}

// Edge weight is the cost that flowed through that call site, and the model hands
// adjacency back pre-sorted by it — so a band must come out weight-descending.
function edgeWeights(graph, layout, dir) {
  return layout.nodes.filter((n) => n.dir === dir && n.level === 1).map((n) => graph.eW.duration[n.edge])
}

function symOf(graph, key) {
  return graph.symKey.indexOf(key)
}

function egoOf(stack, opts = {}) {
  const { graph, ranked } = build(stack, opts)
  const focus = opts.focusKey ? symOf(graph, opts.focusKey) : ranked.hotOrder[0]
  return {
    graph,
    ranked,
    focus,
    layout: layoutEgo(graph, ranked, {
      focus,
      width: opts.width || W,
      height: opts.height || H,
      depth: opts.depth || 1,
      edgeLabel: opts.edgeLabel === undefined ? (e) => `e${e}` : opts.edgeLabel,
      flagText: opts.flagText,
    }),
  }
}

function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function namesIn(layout, dir) {
  return layout.nodes.filter((n) => n.dir === dir).map((n) => n.key)
}

describe('ego layout on a flat parent_id stack', () => {
  // THE regression. The old component built its tree from node.children only,
  // so a flat stack produced thousands of childless depth-0 roots wrapped in one
  // synthetic root: a star with no caller/callee structure at all.
  it('produces caller and callee edges from parent_id alone', () => {
    const { graph, layout } = egoOf(hubStack(3, 4), { focusKey: 'hub' })
    expect(graph.E).toBeGreaterThan(0)
    expect(namesIn(layout, 'in').sort()).toEqual(['caller0', 'caller1', 'caller2'])
    expect(namesIn(layout, 'out').sort()).toEqual(['callee0', 'callee1', 'callee2', 'callee3'])
    // 3 callers + focus + 4 callees, and one edge per neighbour.
    expect(layout.drawn).toBe(8)
    expect(layout.edges.length).toBe(7)
    expect(layout.nodes.filter((n) => n.isFocus).map((n) => n.key)).toEqual(['hub'])
  })

  it('draws every edge downward, so an arrowhead means "calls"', () => {
    const { layout } = egoOf(hubStack(3, 4), { focusKey: 'hub' })
    for (const e of layout.edges) {
      const from = layout.nodes.find((n) => n.sym === e.from)
      const to = layout.nodes.find((n) => n.sym === e.to)
      expect(from.y + from.h).toBeLessThanOrEqual(to.y)
      expect(e.path.startsWith('M')).toBe(true)
      expect(e.path).not.toContain('NaN')
      expect(e.arrow).not.toContain('NaN')
    }
  })

  it('ranks neighbours by the cost through the call site and reports the rest', () => {
    // 12 callers, but a band is ONE sub-row (MAX_SUB=1), so a 900px canvas holds
    // 4. A second sub-row would force its first row's edges to cross the second
    // row's boxes, which paints arrows as if they came from the wrong function —
    // fewer boxes plus an honest "+8 more" beats a diagram that misattributes.
    const { graph, ranked, focus, layout } = egoOf(hubStack(12, 2), { focusKey: 'hub' })
    const inBand = layout.bands.find((b) => b.dir === 'in' && b.level === 1)
    expect(inBand.placed).toBe(4)
    expect(inBand.total).toBe(ranked.inDeg[focus])
    expect(inBand.total).toBe(12)
    expect(inBand.exact).toBe(true)
    // The 4 hottest call sites, in order — the other 8 are what "+8 more" means.
    expect(namesIn(layout, 'in')).toEqual(['caller0', 'caller1', 'caller2', 'caller3'])
    const weights = edgeWeights(graph, layout, 'in')
    expect(weights).toEqual([...weights].sort((a, b) => b - a))
    const outWeights = edgeWeights(graph, layout, 'out')
    expect(outWeights).toEqual([...outWeights].sort((a, b) => b - a))
  })

  it('reaches two hops when the panel is tall enough', () => {
    const { layout } = egoOf(hubStack(3, 4), { focusKey: 'hub', depth: 2, height: 700 })
    expect(layout.depth).toBe(2)
    expect(layout.depthClamped).toBe(false)
    // `root` calls every caller, so it is the only 2-hops-up neighbour.
    expect(namesIn(layout, 'in').filter((k) => k === 'root')).toEqual(['root'])
    expect(layout.bands.map((b) => `${b.dir}${b.level}`))
      .toEqual(['in2', 'in1', 'focus0', 'out1', 'out2'])
  })

  it('drops to one hop rather than overflowing a short panel', () => {
    const { layout } = egoOf(hubStack(3, 4), { focusKey: 'hub', depth: 2, height: 260 })
    expect(layout.depth).toBe(1)
    expect(layout.depthClamped).toBe(true)
    expect(layout.height).toBeLessThanOrEqual(260)
  })
})

describe('ego layout geometry', () => {
  const cases = [
    { width: 300, height: 380, depth: 1 },
    { width: 300, height: 800, depth: 2 },
    { width: 640, height: 440, depth: 1 },
    { width: 900, height: 520, depth: 1 },
    { width: 900, height: 800, depth: 2 },
    { width: 1400, height: 600, depth: 2 },
  ]

  it('never overlaps two boxes and never leaves the canvas', () => {
    for (const c of cases) {
      const { layout } = egoOf(hubStack(9, 11), { focusKey: 'hub', ...c })
      expect(layout.drawn).toBeGreaterThan(1)
      for (const n of layout.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0)
        expect(n.x + n.w).toBeLessThanOrEqual(layout.width)
        expect(n.y).toBeGreaterThanOrEqual(0)
        expect(n.y + n.h).toBeLessThanOrEqual(layout.height)
      }
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          expect(overlap(layout.nodes[i], layout.nodes[j])).toBe(false)
        }
      }
    }
  })

  it('keeps the drawing inside the height it was given', () => {
    for (const c of cases) {
      const { layout } = egoOf(hubStack(9, 11), { focusKey: 'hub', ...c })
      expect(layout.height).toBeLessThanOrEqual(c.height)
    }
  })

  it('stays under the drawn-box budget on a dense neighbourhood', () => {
    const { layout } = egoOf(hubStack(40, 40), { focusKey: 'hub', width: 1400, height: 900, depth: 2 })
    expect(layout.drawn).toBeLessThanOrEqual(EGO.MAX_BOXES)
    expect(layout.drawn).toBeGreaterThan(8)
  })

  it('keeps a legible label budget even in a 300px panel', () => {
    const { layout } = egoOf(hubStack(4, 4), { focusKey: 'hub', width: 300, height: 440 })
    expect(layout.perRow).toBe(2)
    expect(layout.boxW).toBeGreaterThanOrEqual(EGO.MIN_BOX_W)
    for (const n of layout.nodes) expect(n.labelChars).toBeGreaterThanOrEqual(16)
  })

  it('never places two edge labels on top of each other', () => {
    const { layout } = egoOf(hubStack(8, 8), { focusKey: 'hub', width: 640, height: 520 })
    const lanes = new Map()
    for (const e of layout.edges) {
      if (!e.label) continue
      const lane = Math.round(e.label.y)
      const list = lanes.get(lane) || []
      for (const other of list) {
        expect(e.label.x >= other.x + other.w || other.x >= e.label.x + e.label.w).toBe(true)
      }
      list.push(e.label)
      lanes.set(lane, list)
      expect(e.label.x).toBeGreaterThanOrEqual(0)
      expect(e.label.x + e.label.w).toBeLessThanOrEqual(layout.width)
    }
  })

  it('labels only the ring that touches the focus', () => {
    const { layout } = egoOf(hubStack(3, 3), { focusKey: 'hub', depth: 2, height: 700 })
    for (const e of layout.edges) if (e.label) expect(e.focusEdge).toBe(true)
  })
})

describe('ego layout determinism and degenerate input', () => {
  it('gives byte-identical geometry for the same input twice', () => {
    const stack = hubStack(7, 9)
    const a = egoOf(stack, { focusKey: 'hub' })
    const b = egoOf(stack, { focusKey: 'hub' })
    expect(JSON.stringify(b.layout)).toBe(JSON.stringify(a.layout))
  })

  it('terminates on a self-referential and on a cyclic parent_id', () => {
    for (const stack of [
      [node('a', 'a', 'solo', 10)],
      [node('a', 'b', 'aa', 10), node('b', 'a', 'bb', 10)],
      [node('a', '', 'aa', 10), node('a', 'a', 'aa', 10)],
    ]) {
      const { layout } = egoOf(stack)
      expect(Number.isFinite(layout.height)).toBe(true)
      expect(layout.drawn).toBeGreaterThanOrEqual(1)
    }
  }, 5000)

  it('completes quickly on a 5000-deep chain and a 20k-node stack', () => {
    const deep = [node('n0', '', 'level0', 5000)]
    for (let i = 1; i < 5000; i++) deep.push(node(`n${i}`, `n${i - 1}`, `level${i}`, 5000 - i))
    const wide = [node('r', '', 'root', 20000)]
    for (let i = 0; i < 20000; i++) wide.push(node(`c${i}`, 'r', `fn${i % 500}`, 1 + (i % 7)))

    const t0 = Date.now()
    expect(egoOf(deep).layout.drawn).toBeGreaterThan(1)
    expect(egoOf(wide).layout.drawn).toBeGreaterThan(1)
    // Generous, but a whole order of magnitude below anything a user notices.
    expect(Date.now() - t0).toBeLessThan(8000)
  }, 20000)

  it('lays out structurally when every metric is zero', () => {
    const { ranked, layout } = egoOf(hubStack(3, 3).map((n) => ({ ...n, duration_ms: 0 })), { focusKey: 'hub' })
    expect(ranked.structureMode).toBe(true)
    expect(layout.drawn).toBe(7)
    expect(layout.edges.length).toBe(6)
    for (const e of layout.edges) expect(Number.isFinite(e.stroke)).toBe(true)
  })

  it('reserves a band even when the focus has no caller or no callee', () => {
    const { layout } = egoOf([node('only', '', 'solo', 5)])
    expect(layout.drawn).toBe(1)
    expect(layout.edges.length).toBe(0)
    // Both bands are still there, so the component can say WHY they are empty.
    expect(layout.bands.map((b) => b.placed)).toEqual([0, 1, 0])
    expect(layout.bands.every((b) => b.height > 0)).toBe(true)
  })

  it('returns an empty layout for an absent graph or an out-of-range focus', () => {
    const { graph, ranked } = build([node('a', '', 'aa', 1)])
    for (const focus of [undefined, null, -1, 999]) {
      const l = layoutEgo(graph, ranked, { focus, width: W, height: H })
      expect(l.nodes).toEqual([])
      expect(l.edges).toEqual([])
      expect(l.focus).toBe(-1)
    }
    const empty = build([])
    expect(layoutEgo(empty.graph, empty.ranked, { focus: 0, width: W, height: H }).drawn).toBe(0)
  })
})

describe('layout helpers', () => {
  it('scales the box grid to the panel width', () => {
    expect(boxGeometry(300).perRow).toBe(2)
    expect(boxGeometry(900).perRow).toBe(EGO.MAX_PER_ROW)
    expect(boxGeometry(1600).boxW).toBeLessThanOrEqual(EGO.MAX_BOX_W)
    // Absurdly narrow still yields one in-canvas box rather than a negative width.
    const tiny = boxGeometry(140)
    expect(tiny.perRow).toBe(1)
    expect(tiny.boxW).toBeGreaterThan(0)
    expect(tiny.boxW).toBeLessThanOrEqual(140 - 2 * EGO.PAD_X)
  })

  it('balances rows instead of leaving a row of one', () => {
    expect(splitRows(5, 4, 2)).toEqual([3, 2])
    expect(splitRows(8, 4, 2)).toEqual([4, 4])
    expect(splitRows(3, 4, 2)).toEqual([3])
    expect(splitRows(0, 4, 2)).toEqual([])
  })

  it('shrinks the name budget by the flag that shares the line', () => {
    const plain = labelCharBudget(215)
    const flagged = labelCharBudget(215, '↻12')
    expect(flagged).toBeLessThan(plain)
    expect(labelCharBudget(60)).toBeGreaterThanOrEqual(EGO.MIN_LABEL_CHARS)
  })
})
