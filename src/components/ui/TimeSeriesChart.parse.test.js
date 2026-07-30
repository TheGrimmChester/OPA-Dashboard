import { describe, expect, it } from 'vitest'
import { parseChartTime } from './TimeSeriesChart.jsx'

describe('parseChartTime', () => {
  it('prefers timeMs', () => {
    expect(parseChartTime({ time: '07-30 12:00', timeMs: 1_700_000_000_000 })).toBe(1_700_000_000_000)
  })

  it('parses ClickHouse datetime as UTC', () => {
    const ms = parseChartTime({ time: '2026-07-30 15:04:05' })
    expect(ms).toBe(Date.parse('2026-07-30T15:04:05Z'))
  })

  it('rejects display-only MM-DD labels', () => {
    expect(Number.isFinite(parseChartTime({ time: '07-30 15:04' }))).toBe(false)
  })
})
