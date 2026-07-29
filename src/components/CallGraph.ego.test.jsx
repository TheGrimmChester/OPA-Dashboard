// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CallGraph from './CallGraph'

// The component is rendered rather than unit-tested here because the questions
// are about what actually reaches the DOM: does a FLAT stack produce a
// neighbourhood, does hostile input terminate, and is the same trace drawn the
// same way twice. Geometry invariants live in utils/callGraphLayout.test.js.

function node(id, parent, fn, duration = 1, extra = {}) {
  return { call_id: id, parent_id: parent, function: fn, duration_ms: duration, ...extra }
}

/**
 * mergeCallStacks' shape: a flat array linked by parent_id, no .children.
 * Costs are arranged so `Hub::handle` is the hottest symbol by SELF time and is
 * therefore the default focus, with strictly decreasing call-site costs so the
 * expected caller order is simply Caller0, Caller1, …
 */
function flatHub(callers, callees) {
  const out = [node('r', '', 'Entry::index', 10)]
  for (let i = 0; i < callers; i++) {
    out.push(node(`c${i}`, 'r', `Caller${i}::run`, 1000))
    out.push(node(`h${i}`, `c${i}`, 'Hub::handle', 900 - i))
  }
  for (let j = 0; j < callees; j++) {
    out.push(node(`e${j}`, 'h0', `Callee${j}::work`, 10 + j))
  }
  return out
}

function render(stack, props = {}) {
  return renderToStaticMarkup(
    <CallGraph callStack={stack} width={props.width || 900} height={props.height || 520} />,
  )
}

describe('CallGraph renders a real neighbourhood from a flat stack', () => {
  // THE regression this rewrite exists for. The old component built its tree
  // from node.children only; TraceDetail feeds it a flat parent_id array, so
  // every node became a childless depth-0 root under one synthetic root and the
  // drawing degenerated into a star with no caller/callee structure at all.
  it('draws callers, callees and edges — not a star', () => {
    const markup = render(flatHub(3, 4))
    expect(markup).toContain('Hub::handle')
    expect(markup).toContain('Caller0::run')
    expect(markup).toContain('Callee0::work')
    expect(markup).toContain('Callers · 3')
    expect(markup).toContain('Callees · 4')
    // One arrow head per drawn edge: 3 callers + 4 callees, plus the ring-2
    // caller of the callers (Entry::index). Depth now auto-fills the granted
    // height instead of stopping at one hop and wasting the panel.
    expect(markup).toContain('Entry::index')
    expect((markup.match(/class="opa-cg-arrow"/g) || []).length).toBe(8)
    expect(markup).not.toContain('synthetic_root')
    expect(markup).not.toContain('NaN')
  })

  it('defaults the focus to the hottest symbol and says where it ranks', () => {
    // Hub::handle holds the most self time, so it is rank #1 and opens focused.
    const markup = render(flatHub(3, 4))
    expect(markup).toContain('#1')
    expect(markup).toContain('opa-cg-node is-focus')
    expect(markup).toContain('in focus')
  })

  it('renders an entry-path breadcrumb the user can click back through', () => {
    const markup = render(flatHub(2, 2))
    expect(markup).toContain('Entry path')
    expect(markup).toContain('class="opa-prof-crumb')
  })

  it('labels edges with the cost and the call count through the call site', () => {
    const markup = render(flatHub(2, 2))
    expect(markup).toContain('class="opa-cg-elabel"')
    expect(markup).toMatch(/opa-cg-elabel[^>]*>[^<]*×/)
  })

  it('is deterministic: the same trace draws the same markup twice', () => {
    const stack = flatHub(7, 9)
    expect(render(stack)).toBe(render(stack))
  })

  it('drops vis-network and never hardcodes a colour', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/components/CallGraph.jsx'), 'utf8')
    const css = readFileSync(path.join(process.cwd(), 'src/components/CallGraph.css'), 'utf8')
    expect(src).not.toContain('vis-network')
    // tokens.css remapped --color-primary-*, so a mirrored hex table goes stale
    // silently and light.css makes it illegible. Every colour must be a token.
    for (const text of [src, css]) {
      expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(text).not.toMatch(/\b(rgb|hsl)a?\(/)
    }
  })
})

describe('CallGraph with hostile input', () => {
  it('terminates on self-referential and cyclic parent_id', () => {
    for (const stack of [
      [node('a', 'a', 'Solo::spin', 10)],
      [node('a', 'b', 'A::x', 10), node('b', 'a', 'B::y', 10)],
      [node('a', '', 'A::x', 10), node('a', 'a', 'A::x', 10)],
    ]) {
      const markup = render(stack)
      expect(markup).toContain('opa-cg-canvas')
      expect(markup).not.toContain('NaN')
    }
  }, 5000)

  it('completes quickly on a 5000-deep chain and a 20k-node stack', () => {
    const deep = [node('n0', '', 'Level0::run', 5000)]
    for (let i = 1; i < 5000; i++) deep.push(node(`n${i}`, `n${i - 1}`, `Level${i}::run`, 5000 - i))
    const wide = [node('r', '', 'Root::run', 20000)]
    for (let i = 0; i < 20000; i++) wide.push(node(`c${i}`, 'r', `Fn${i % 500}::call`, 1 + (i % 7)))

    const t0 = Date.now()
    expect(render(deep)).toContain('opa-cg-svg')
    expect(render(wide)).toContain('opa-cg-svg')
    expect(Date.now() - t0).toBeLessThan(10000)
  }, 30000)

  it('caps a 200k-node trace and says so instead of hanging', () => {
    // 400 chains of 520 -> 208k nodes, past ingest's 200k MAX_NODES cap.
    const big = [node('root', '', 'Root::run', 208000)]
    for (let b = 0; b < 400; b++) {
      big.push(node(`b${b}_0`, 'root', 'Branch::enter', 520))
      for (let d = 1; d < 520; d++) big.push(node(`b${b}_${d}`, `b${b}_${d - 1}`, `Deep${d}::run`, 520 - d))
    }
    const markup = render(big)
    expect(markup).toContain('Ingest stopped at the first')
    expect(markup).not.toContain('NaN')
  }, 60000)

  it('still draws structurally when the ranked metric was never recorded', () => {
    // Placeholder durations with real CPU numbers: the common collector case.
    const markup = render(flatHub(3, 3).map((n) => ({ ...n, duration_ms: 0, cpu_ms: 5 })))
    expect(markup).toContain('Wall time</strong> was not recorded in this trace')
    expect(markup).toContain('Size by CPU time')
    expect(markup).toContain('Hub::handle')
    // 3 callers + 3 callees + the ring-2 caller reached by auto depth.
    expect((markup.match(/class="opa-cg-arrow"/g) || []).length).toBe(7)
    // Boxes fall back to call counts rather than showing a fake 0ms.
    expect(markup).toMatch(/opa-cg-sub[^>]*>1 call</)
    expect(markup).not.toContain('0µs')
  })

  it('lays out structurally when EVERY metric is zero', () => {
    const markup = render(flatHub(2, 2).map((n) => ({ ...n, duration_ms: 0 })))
    expect(markup).toContain('was not recorded in this trace')
    // Nothing to switch to, so no quick-switch buttons are offered.
    expect(markup).not.toContain('Size by')
    // 2 callers + 2 callees + the ring-2 caller reached by auto depth.
    expect((markup.match(/class="opa-cg-arrow"/g) || []).length).toBe(5)
    expect(markup).not.toContain('NaN')
  })

  it('handles an empty and a single-node stack', () => {
    expect(render([])).toContain('No call stack')
    const one = render([node('only', '', 'Solo::run', 5)])
    expect(one).toContain('Solo::run')
    expect(one).toContain('No caller in this trace')
    expect(one).toContain('No callee in this trace')
  })

  it('fits a 300px panel without drawing outside it', () => {
    const markup = render(flatHub(5, 5), { width: 300, height: 440 })
    // 300 minus the canvas' 1px border on each side: the SVG must fit the
    // CONTENT box or overflow:hidden shaves the last column of boxes.
    expect(markup).toContain('<svg class="opa-cg-svg" width="298"')
    expect(markup).toContain('style="width:300px"')
    expect(markup).not.toMatch(/\b(x|y|width|height)="-/)
    expect(markup).not.toContain('NaN')
  })

  it('honours a short panel by staying at one hop', () => {
    const markup = render(flatHub(3, 3), { width: 640, height: 380 })
    expect(markup).toContain('2 hops needs a taller panel')
    expect(markup).not.toContain('Callers of callers')
  })
})

describe('CallGraph renders the A/B diff state', () => {
  // ProfileComparison tags its diff stack with _diffStatus; callGraphModel folds
  // that into symDiff. Nothing rendered it before, so the compare view's
  // improvement/degradation legend described something invisible.
  it('marks each box and shows only the states present', () => {
    const stack = [
      node('r', '', 'Root::run', 100, { _diffStatus: 'no-change' }),
      node('a', 'r', 'Slower::query', 60, { _diffStatus: 'degradation' }),
      node('b', 'r', 'Faster::cache', 30, { _diffStatus: 'improvement' }),
    ]
    const markup = render(stack)
    expect(markup).toContain('opa-cg-diffmark')
    expect(markup).toContain('fill:var(--error)')
    expect(markup).toContain('fill:var(--neutral)')
    expect(markup).toContain('Degraded')
    expect(markup).toContain('Unchanged')
    // Nothing is new in this trace, so the legend must not claim it.
    expect(markup).not.toContain('>New<')
  })

  it('omits the diff legend entirely when the trace is not a comparison', () => {
    const markup = render(flatHub(2, 2))
    expect(markup).not.toContain('opa-cg-keygroup')
    expect(markup).not.toContain('Degraded')
  })
})

// Regression: PHP callers of a hot symbol are usually siblings in one namespace
// sharing a method name. Middle-ellipsis kept the shared head and tail and threw
// away the discriminator, so several DIFFERENT boxes rendered the SAME label.
describe('box labels stay distinguishable', () => {
  it('gives same-namespace, same-method siblings distinct labels', () => {
    const stack = [{ call_id: 'h', function: 'handle', class: 'App\\Bus', duration_ms: 500 }]
    for (let i = 0; i < 6; i++) {
      stack.push({
        call_id: `c${i}`,
        parent_id: 'h',
        class: `App\\Handler\\MessageHandler${i}`,
        function: 'process',
        duration_ms: 60 - i,
      })
    }
    for (const width of [320, 480, 620, 898]) {
      const markup = renderToStaticMarkup(
        <CallGraph callStack={stack} width={width} height={440} />
      )
      // Collect the rendered box name texts.
      const names = [...markup.matchAll(/class="opa-cg-name"[^>]*>([^<]+)</g)].map((m) => m[1])
      const drawn = names.filter((n) => n.includes('process'))
      if (drawn.length < 2) continue
      expect(
        new Set(drawn).size,
        `width ${width}: ${drawn.length} boxes rendered only ${new Set(drawn).size} distinct labels (${[...new Set(drawn)].join(', ')})`
      ).toBe(drawn.length)
    }
  })
})
