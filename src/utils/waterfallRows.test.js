import { describe, expect, it } from 'vitest'
import { buildWaterfallDisplayRows, flattenTree, WATERFALL_MIN_GROUP } from './waterfallRows'

describe('flattenTree', () => {
  it('assigns depth and appends orphans', () => {
    const root = {
      span_id: 'r',
      name: 'root',
      service: 'app',
      children: [{ span_id: 'a', name: 'child', service: 'app', children: [] }],
    }
    const rows = flattenTree(root, [{ span_id: 'orphan', name: 'x', service: 'other' }])
    expect(rows.map((r) => [r.span_id, r._depth])).toEqual([
      ['r', 0],
      ['a', 1],
      ['orphan', 0],
    ])
  })
})

describe('buildWaterfallDisplayRows', () => {
  function mkRun(n, name = 'fib') {
    return Array.from({ length: n }, (_, i) => ({
      span_id: `${name}-${i}`,
      name,
      parent_id: 'root',
      _depth: 1,
      start_ts: i * 1000,
      duration_ms: 0.05,
      service: 'app',
    }))
  }

  it('collapses long same-name runs by default', () => {
    const rows = mkRun(WATERFALL_MIN_GROUP + 5)
    const { displayRows, totalSpans, collapsedCount } = buildWaterfallDisplayRows(rows, {
      collapseNoise: true,
      expandedGroupIds: new Set(),
    })
    expect(totalSpans).toBe(WATERFALL_MIN_GROUP + 5)
    expect(displayRows).toHaveLength(1)
    expect(displayRows[0].kind).toBe('group')
    expect(displayRows[0].count).toBe(WATERFALL_MIN_GROUP + 5)
    expect(collapsedCount).toBe(WATERFALL_MIN_GROUP + 4)
  })

  it('expands a group when its id is in expandedGroupIds', () => {
    const rows = mkRun(25)
    const groupId = 'grp:root:fib:1:0'
    const { displayRows } = buildWaterfallDisplayRows(rows, {
      collapseNoise: true,
      expandedGroupIds: new Set([groupId]),
    })
    expect(displayRows).toHaveLength(25)
    expect(displayRows.every((r) => r.kind === 'span')).toBe(true)
  })

  it('does not collapse when collapseNoise is false', () => {
    const rows = mkRun(50)
    const { displayRows, collapsedCount } = buildWaterfallDisplayRows(rows, { collapseNoise: false })
    expect(displayRows).toHaveLength(50)
    expect(collapsedCount).toBe(0)
  })

  it('keeps short runs expanded', () => {
    const rows = mkRun(5)
    const { displayRows } = buildWaterfallDisplayRows(rows, { collapseNoise: true })
    expect(displayRows).toHaveLength(5)
  })
})
