import { describe, it, expect } from 'vitest'
import { mergeCallStacks } from './mergeCallStacks'

const node = (over = {}) => ({
  call_id: 'c1',
  function: 'fn',
  class: '',
  file: 'app.php',
  line: 1,
  duration_ms: 10,
  cpu_ms: 5,
  parent_id: null,
  depth: 0,
  ...over,
})

describe('mergeCallStacks', () => {
  it('returns [] when no span carries a stack', () => {
    expect(mergeCallStacks(null, [])).toEqual([])
    expect(mergeCallStacks(null, [{ span_id: 'a' }, { span_id: 'b', stack: [] }])).toEqual([])
    expect(mergeCallStacks({ span_id: 'root', stack: [] }, [{ span_id: 'a', stack: null }])).toEqual([])
  })

  it('ignores null/undefined spans defensively', () => {
    expect(mergeCallStacks(null, [null, undefined])).toEqual([])
  })

  it('returns a single stack untouched (identity, no namespacing)', () => {
    const stack = [node(), node({ call_id: 'c2', parent_id: 'c1', depth: 1 })]
    const root = { span_id: 'root', name: 'GET /', stack }
    expect(mergeCallStacks(root, [])).toBe(stack)
  })

  it('does not double-count the root when it also appears in the flat span list', () => {
    const stack = [node()]
    const root = { span_id: 'root', stack }
    // Same span_id in flatSpans → deduped → still single-stack passthrough.
    expect(mergeCallStacks(root, [{ span_id: 'root', stack: [node({ call_id: 'other' })] }])).toBe(stack)
  })

  it('namespaces and re-roots multiple stacks under one synthetic trace root', () => {
    const root = {
      span_id: 'A',
      name: 'GET /checkout',
      service: 'shop',
      duration_ms: 100,
      stack: [
        node({ call_id: '1', parent_id: null, depth: 0, duration_ms: 100 }),
        node({ call_id: '2', parent_id: '1', depth: 1, duration_ms: 40 }),
      ],
    }
    const child = {
      span_id: 'B',
      name: 'POST /pay',
      service: 'payments',
      duration_ms: 60,
      stack: [
        // '' parent is treated like null: a stack-local root.
        node({ call_id: '1', parent_id: '', depth: 0, duration_ms: 60 }),
      ],
    }

    const out = mergeCallStacks(root, [child])

    // 1 synthetic trace root + 2 wrappers + 3 stack nodes.
    expect(out).toHaveLength(6)

    // Synthetic trace root sums span durations.
    expect(out[0]).toEqual({
      call_id: 'trace',
      function: 'trace',
      class: '',
      file: '',
      line: 0,
      duration_ms: 160,
      cpu_ms: 0,
      parent_id: null,
      depth: 0,
    })

    // Per-span wrappers hang off the trace root at depth 1 and carry the
    // span name + service label.
    const wrapperA = out.find((n) => n.call_id === 'span:A')
    expect(wrapperA).toMatchObject({
      function: 'GET /checkout [shop]',
      parent_id: 'trace',
      depth: 1,
      duration_ms: 100,
    })
    const wrapperB = out.find((n) => n.call_id === 'span:B')
    expect(wrapperB).toMatchObject({
      function: 'POST /pay [payments]',
      parent_id: 'trace',
      depth: 1,
      duration_ms: 60,
    })

    // call_ids are namespaced per span (colliding '1' ids stay distinct),
    // stack-local roots are reparented onto their wrapper, child links are
    // rewritten within the namespace, and depth shifts by +2.
    const a1 = out.find((n) => n.call_id === 'A:1')
    expect(a1).toMatchObject({ parent_id: 'span:A', depth: 2 })
    const a2 = out.find((n) => n.call_id === 'A:2')
    expect(a2).toMatchObject({ parent_id: 'A:1', depth: 3 })
    const b1 = out.find((n) => n.call_id === 'B:1')
    expect(b1).toMatchObject({ parent_id: 'span:B', depth: 2 })

    // Non-id fields of stack nodes are preserved.
    expect(a2.duration_ms).toBe(40)
    expect(a2.function).toBe('fn')
  })

  it('falls back to positional namespaces for spans without span_id', () => {
    const s1 = { name: 'one', stack: [node({ call_id: 'x' })] }
    const s2 = { name: 'two', stack: [node({ call_id: 'x' })] }
    const out = mergeCallStacks(null, [s1, s2])
    expect(out.map((n) => n.call_id)).toEqual(['trace', 'span:s0', 's0:x', 'span:s1', 's1:x'])
  })
})
