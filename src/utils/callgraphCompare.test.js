import { describe, expect, it } from 'vitest'
import { fmtMs } from '../theme/format'
import { defaultSplit, fmtSignedMs } from '../utils/callgraphCompare'

describe('defaultSplit', () => {
  it('splits CH naive-UTC halves without mixing ISO midpoints', () => {
    const split = defaultSplit('2026-07-28 10:00:00', '2026-07-28 12:00:00')
    expect(split).toEqual({
      fromA: '2026-07-28 10:00:00',
      toA: '2026-07-28 11:00:00',
      fromB: '2026-07-28 11:00:00',
      toB: '2026-07-28 12:00:00',
    })
    expect(split.toA).not.toContain('T')
    expect(split.toA).not.toContain('Z')
  })

  it('does not treat space-separated CH times as local wall clock', () => {
    // If Date.parse were used raw, mid would shift by the viewer TZ offset.
    const split = defaultSplit('2026-01-15 00:00:00', '2026-01-15 02:00:00')
    expect(split.toA).toBe('2026-01-15 01:00:00')
  })

  it('returns identical windows when the range is invalid', () => {
    expect(defaultSplit('nope', 'also-nope')).toEqual({
      fromA: 'nope',
      toA: 'also-nope',
      fromB: 'nope',
      toB: 'also-nope',
    })
  })
})

describe('fmtSignedMs', () => {
  it('formats negative deltas without µs-magnitude bug', () => {
    expect(fmtSignedMs(-5)).toBe('-5.0ms')
    expect(fmtSignedMs(-0.5)).toBe('-500µs')
    expect(fmtSignedMs(5)).toBe('+5.0ms')
    expect(fmtSignedMs(0)).toBe('0µs')
    // The bug: fmtMs(-5) hit `v < 1` and rendered as µs-scale nonsense.
    expect(fmtMs(-5)).not.toBe(fmtSignedMs(-5).slice(1))
  })
})
