import { describe, it, expect } from 'vitest'
import {
  spansActiveAt,
  spanIdsStartedBy,
  pickReplayMode,
  availableReplayModes,
} from './traceReplay'

const rows = [
  { span_id: 'a', start_ts: 1000, duration_ms: 100 },
  { span_id: 'b', start_ts: 1050, duration_ms: 20 },
  { span_id: 'c', start_ts: 1200, duration_ms: 10 },
]

describe('spansActiveAt', () => {
  it('returns spans covering the playhead', () => {
    const active = spansActiveAt(rows, 60, 1000)
    expect(active.map((s) => s.span_id).sort()).toEqual(['a', 'b'])
  })
})

describe('spanIdsStartedBy', () => {
  it('returns started spans in order', () => {
    expect(spanIdsStartedBy(rows, 50, 1000)).toEqual(['a', 'b'])
    expect(spanIdsStartedBy(rows, 250, 1000)).toEqual(['a', 'b', 'c'])
  })
})

describe('mode helpers', () => {
  const modes = [
    { id: 'waterfall', available: true },
    { id: 'rum_session', available: false },
    { id: 'har_export', available: true },
  ]
  it('picks by id', () => {
    expect(pickReplayMode(modes, 'har_export')?.available).toBe(true)
  })
  it('filters available', () => {
    expect(availableReplayModes(modes).map((m) => m.id)).toEqual(['waterfall', 'har_export'])
  })
})
