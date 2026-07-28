import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FlameGraph from './FlameGraph'

// Pull every <rect> the flame graph drew, in document order, as geometry.
function extractRects(markup) {
  const rects = []
  const re = /<rect([^>]*?)\/?>/g
  let m
  while ((m = re.exec(markup)) !== null) {
    const attrs = m[1]
    const num = (name) => {
      const hit = new RegExp(`${name}="([-0-9.]+)"`).exec(attrs)
      return hit ? parseFloat(hit[1]) : null
    }
    const x = num('x')
    const y = num('y')
    const width = num('width')
    const height = num('height')
    if (x !== null && y !== null && width !== null && height !== null) {
      rects.push({ x, y, width, height, right: x + width })
    }
  }
  return rects
}

// Target the flame graph's own <svg>, not the react-icons SVGs that also
// appear in the filter bar / legend markup.
function svgWidth(markup) {
  const re = /<svg([^>]*)>/g
  let m
  while ((m = re.exec(markup)) !== null) {
    const attrs = m[1]
    if (!attrs.includes('flame-graph-svg')) continue
    const hit = /(?:^|\s)width="([0-9.]+)"/.exec(attrs)
    return hit ? parseFloat(hit[1]) : null
  }
  return null
}

// Two root spans, each with several very short children. The short children
// are what trigger the MIN_BAR_WIDTH floor, and two roots are what exercise
// the horizontal scale.
function buildStack() {
  const nodes = [
    { call_id: 'r1', parent_id: '', function: 'rootOne', duration_ms: 100, depth: 0 },
    { call_id: 'r2', parent_id: '', function: 'rootTwo', duration_ms: 100, depth: 0 },
  ]
  for (let i = 0; i < 5; i++) {
    nodes.push({
      call_id: `r1c${i}`,
      parent_id: 'r1',
      function: `shortChild${i}`,
      duration_ms: 0.01,
      depth: 1,
    })
  }
  return nodes
}

describe('FlameGraph layout geometry', () => {
  const markup = renderToStaticMarkup(
    <FlameGraph callStack={buildStack()} width={800} height={600} />
  )
  const rects = extractRects(markup)

  it('renders a bar for every node', () => {
    expect(rects.length).toBe(7) // 2 roots + 5 children
  })

  it('never overlaps bars that sit on the same row', () => {
    const byRow = new Map()
    for (const r of rects) {
      if (!byRow.has(r.y)) byRow.set(r.y, [])
      byRow.get(r.y).push(r)
    }
    for (const [y, row] of byRow) {
      const sorted = [...row].sort((a, b) => a.x - b.x)
      for (let i = 1; i < sorted.length; i++) {
        expect(
          sorted[i].x,
          `bar at row y=${y} starts (${sorted[i].x}) before the previous bar ends (${sorted[i - 1].right})`
        ).toBeGreaterThanOrEqual(sorted[i - 1].right)
      }
    }
  })

  it('keeps children within the horizontal span of their parent', () => {
    const rows = [...new Set(rects.map((r) => r.y))].sort((a, b) => a - b)
    const parentRow = rects.filter((r) => r.y === rows[0])
    const childRow = rects.filter((r) => r.y === rows[1])
    expect(childRow.length).toBeGreaterThan(0)

    const spanStart = Math.min(...parentRow.map((r) => r.x))
    const spanEnd = Math.max(...parentRow.map((r) => r.right))
    for (const child of childRow) {
      expect(child.x).toBeGreaterThanOrEqual(spanStart)
      expect(child.right).toBeLessThanOrEqual(spanEnd)
    }
  })

  it('grows the canvas to fit content instead of clipping it', () => {
    const widest = Math.max(...rects.map((r) => r.right))
    expect(svgWidth(markup)).toBeGreaterThanOrEqual(widest)
  })
})
