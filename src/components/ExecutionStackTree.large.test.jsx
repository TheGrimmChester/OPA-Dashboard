// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ExecutionStackTree from './ExecutionStackTree'

// A flat stack with no parent_id: every node becomes a root, so all of them are
// visible rows without needing to expand anything. This is the shape
// mergeCallStacks returns for a single span, and it is the case that used to
// throw once the row count passed V8's argument-spread limit.
function flatStack(count) {
  const nodes = new Array(count)
  for (let i = 0; i < count; i++) {
    nodes[i] = {
      call_id: `n${i}`,
      parent_id: '',
      function: `fn${i}`,
      duration_ms: (i % 50) + 1,
      depth: 0,
    }
  }
  return nodes
}

// A deep chain, to exercise the indent cap rather than the row count.
function deepChain(depth) {
  const nodes = new Array(depth)
  for (let i = 0; i < depth; i++) {
    nodes[i] = {
      call_id: `d${i}`,
      parent_id: i === 0 ? '' : `d${i - 1}`,
      function: `level${i}`,
      duration_ms: depth - i,
      depth: i,
    }
  }
  return nodes
}

describe('ExecutionStackTree at scale', () => {
  it('renders 200k rows without throwing RangeError', () => {
    // 200k > V8's ~124k argument-spread ceiling. Math.max(...rows) threw here.
    expect(() =>
      renderToStaticMarkup(<ExecutionStackTree callStack={flatStack(200000)} />)
    ).not.toThrow()
  })

  it('windows the DOM instead of rendering every row', () => {
    const markup = renderToStaticMarkup(<ExecutionStackTree callStack={flatStack(200000)} />)
    const rendered = (markup.match(/stack-tree-node-content--virtual/g) || []).length
    expect(rendered).toBeGreaterThan(0)
    // Only the viewport slice plus overscan should exist in the DOM.
    expect(rendered).toBeLessThan(200)
  })

  it('caps indentation so deep rows keep their content on screen', () => {
    const markup = renderToStaticMarkup(<ExecutionStackTree callStack={deepChain(400)} />)
    const pads = [...markup.matchAll(/padding-left:\s*([0-9.]+)px/g)].map((m) => parseFloat(m[1]))
    expect(pads.length).toBeGreaterThan(0)
    // 12 levels * 14px + 8px base = 176px is the hard ceiling.
    expect(Math.max(...pads)).toBeLessThanOrEqual(176)
  })

  it('does not scroll horizontally in the windowed path', () => {
    const markup = renderToStaticMarkup(<ExecutionStackTree callStack={deepChain(400)} />)
    expect(markup).not.toContain('overflow-x:auto')
    expect(markup).toContain('overflow-x:hidden')
  })

  it('handles an empty and a single-node stack', () => {
    expect(() => renderToStaticMarkup(<ExecutionStackTree callStack={[]} />)).not.toThrow()
    expect(() => renderToStaticMarkup(<ExecutionStackTree callStack={flatStack(1)} />)).not.toThrow()
  })
})
