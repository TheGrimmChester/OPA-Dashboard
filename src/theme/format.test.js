import { describe, it, expect, vi, afterEach } from 'vitest'
import { toUtcIso, fmtAgo } from './format'

describe('toUtcIso', () => {
  it('marks a naive "YYYY-MM-DD HH:MM:SS" timestamp as UTC', () => {
    expect(toUtcIso('2026-07-28 10:00:00')).toBe('2026-07-28T10:00:00Z')
  })

  it('keeps fractional seconds while marking naive timestamps as UTC', () => {
    expect(toUtcIso('2026-07-28 10:00:00.123')).toBe('2026-07-28T10:00:00.123Z')
  })

  it('handles the T-separated naive form too', () => {
    expect(toUtcIso('2026-07-28T10:00:00')).toBe('2026-07-28T10:00:00Z')
  })

  it('passes through already-zoned ISO strings untouched', () => {
    expect(toUtcIso('2026-07-28T10:00:00Z')).toBe('2026-07-28T10:00:00Z')
    expect(toUtcIso('2026-07-28T10:00:00.500Z')).toBe('2026-07-28T10:00:00.500Z')
    expect(toUtcIso('2026-07-28T10:00:00+02:00')).toBe('2026-07-28T10:00:00+02:00')
    expect(toUtcIso('2026-07-28 10:00:00+0200')).toBe('2026-07-28 10:00:00+0200')
  })

  it('passes through non-strings untouched', () => {
    expect(toUtcIso(1753696800000)).toBe(1753696800000)
    expect(toUtcIso(null)).toBe(null)
    expect(toUtcIso(undefined)).toBe(undefined)
  })

  it('passes through non-timestamp strings untouched', () => {
    expect(toUtcIso('not a date')).toBe('not a date')
  })
})

describe('fmtAgo', () => {
  // 2026-07-28T12:00:00Z
  const NOW = Date.UTC(2026, 6, 28, 12, 0, 0)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const freeze = () => vi.spyOn(Date, 'now').mockReturnValue(NOW)

  it('returns em dash for empty values', () => {
    expect(fmtAgo(null)).toBe('—')
    expect(fmtAgo(undefined)).toBe('—')
    expect(fmtAgo('')).toBe('—')
    expect(fmtAgo(0)).toBe('—')
  })

  it('treats epoch-zero sentinels as no data', () => {
    freeze()
    expect(fmtAgo('1970-01-01 00:00:00')).toBe('—')
  })

  it('returns em dash for unparseable strings', () => {
    freeze()
    expect(fmtAgo('garbage')).toBe('—')
  })

  it('formats seconds / minutes / hours / days', () => {
    freeze()
    expect(fmtAgo(NOW - 30 * 1000)).toBe('30s ago')
    expect(fmtAgo(NOW - 90 * 1000)).toBe('1m ago')
    expect(fmtAgo(NOW - 2 * 3600 * 1000)).toBe('2h ago')
    expect(fmtAgo(NOW - 3 * 86400 * 1000)).toBe('3d ago')
  })

  it('parses naive UTC timestamps as UTC (no local-offset skew)', () => {
    freeze()
    // 12:00:00Z minus 10 minutes, in the agent's naive UTC format.
    expect(fmtAgo('2026-07-28 11:50:00')).toBe('10m ago')
  })

  it('never renders negative ages for slightly-future timestamps', () => {
    freeze()
    expect(fmtAgo(NOW + 5000)).toBe('0s ago')
  })
})
