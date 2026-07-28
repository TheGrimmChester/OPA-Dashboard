import { describe, it, expect } from 'vitest'
import { buildProfileModel } from './useProfileModel'

// Regression tests for the metric-semantics bugs found in review: memory and
// network are signed ADDITIVE per-call deltas, so the inclusive identity
// (total === sum of self) does not hold for them.

const MB = 1024 * 1024

describe('additive metrics are not summed as inclusive costs', () => {
  it('reports the real total memory even when parent selves cancel the children', () => {
    // 8MB + 8MB allocated under a parent that allocated nothing itself. The
    // parent's SELF memory is -16MB, so the signed sum is exactly 0.
    const stack = [
      { call_id: 'a', function: 'main', memory_delta: 0 },
      { call_id: 'b', class: 'Img', function: 'load', memory_delta: 8 * MB, parent_id: 'a' },
      { call_id: 'c', class: 'Img', function: 'load', memory_delta: 8 * MB, parent_id: 'a' },
    ]
    const { totals } = buildProfileModel(stack, { metric: 'memory' })
    expect(totals.memory).toBe(16 * MB)
    // …and the UI must not claim the metric is missing.
    expect(totals.hasData.memory).toBe(true)
    expect(totals.structureMode).toBe(false)
  })

  it('still flags a metric that genuinely carries no data', () => {
    const stack = [
      { call_id: 'a', function: 'main', duration_ms: 10 },
      { call_id: 'b', function: 'work', duration_ms: 4, parent_id: 'a' },
    ]
    const { totals } = buildProfileModel(stack, { metric: 'memory' })
    expect(totals.hasData.memory).toBe(false)
    expect(totals.structureMode).toBe(true)
    // Duration, by contrast, is present.
    expect(totals.hasData.duration).toBe(true)
  })

  it('keeps the share denominator sane when frees make selves negative', () => {
    // alloc +5MB and free -5MB: the signed sum is tiny, so |sum| as a
    // denominator produced shares in the hundreds of thousands of percent.
    const stack = [
      { call_id: 'r', function: 'main', memory_delta: 1024 },
      { call_id: 'a', function: 'alloc', memory_delta: 5 * MB, parent_id: 'r' },
      { call_id: 'f', function: 'free', memory_delta: -5 * MB, parent_id: 'r' },
    ]
    const { graph, totals } = buildProfileModel(stack, { metric: 'memory' })
    const base = totals.selfAbs.memory
    expect(base).toBeGreaterThan(9 * MB) // Σ|self|, not |Σ self|
    let worst = 0
    for (let s = 0; s < graph.S; s++) {
      const pct = (Math.abs(graph.selfM.memory[s]) / base) * 100
      if (pct > worst) worst = pct
    }
    // Every individual share must be a real percentage.
    expect(worst).toBeLessThanOrEqual(100.0001)
  })

  it('never lets any metric share exceed 100%', () => {
    const stack = [
      { call_id: 'r', function: 'main', duration_ms: 100, cpu_ms: 50, memory_delta: 2048 },
      { call_id: 'a', function: 'a', duration_ms: 60, cpu_ms: 30, memory_delta: 4 * MB, parent_id: 'r' },
      { call_id: 'b', function: 'b', duration_ms: 30, cpu_ms: 10, memory_delta: -3 * MB, parent_id: 'r' },
    ]
    for (const metric of ['duration', 'cpu', 'io', 'memory', 'network']) {
      const { graph, totals } = buildProfileModel(stack, { metric })
      const base = totals.selfAbs[metric]
      if (base <= 0) continue
      for (let s = 0; s < graph.S; s++) {
        const pct = (Math.abs(graph.selfM[metric][s]) / base) * 100
        expect(pct).toBeLessThanOrEqual(100.0001)
      }
    }
  })
})

describe('self time is reported as self time', () => {
  it('exposes wall as the sum of self time, and keeps it non-negative', () => {
    // Children over-summing their parent is normal after span merging; self is
    // clamped at 0, so Σ self is NOT the trace wall clock. It must at least stay
    // finite and non-negative, and callers must label it as self time.
    const stack = [
      { call_id: 'p', function: 'p', duration_ms: 100 },
      { call_id: 'c1', function: 'c1', duration_ms: 80, parent_id: 'p' },
      { call_id: 'c2', function: 'c2', duration_ms: 80, parent_id: 'p' },
    ]
    const { totals } = buildProfileModel(stack, { metric: 'duration' })
    expect(Number.isFinite(totals.wall)).toBe(true)
    expect(totals.wall).toBeGreaterThanOrEqual(0)
    expect(totals.wall).toBe(160) // 0 (clamped) + 80 + 80
  })
})

describe('degenerate input', () => {
  it('returns a not-ready model for an empty stack without throwing', () => {
    const { totals, ready } = buildProfileModel([], {})
    expect(ready).toBe(false)
    expect(totals.structureMode).toBe(false)
    expect(totals.hasData.memory).toBe(false)
  })

  it('terminates on a cyclic parent_id', () => {
    const stack = [
      { call_id: 'a', function: 'a', duration_ms: 1, parent_id: 'b' },
      { call_id: 'b', function: 'b', duration_ms: 1, parent_id: 'a' },
    ]
    const { totals } = buildProfileModel(stack, { metric: 'duration' })
    expect(Number.isFinite(totals.wall)).toBe(true)
  }, 5000)
})
