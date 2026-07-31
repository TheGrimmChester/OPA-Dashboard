import { fmtMs, toUtcIso } from '../theme/format'

const pad2 = (n) => String(n).padStart(2, '0')

/** ClickHouse-friendly UTC wall time matching TimeRangeContext.chTime. */
export function toChUtc(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
}

/**
 * Split [from,to] into baseline / candidate halves.
 * Parses CH naive-UTC via toUtcIso; emits CH-format bounds (never mixed ISO).
 */
export function defaultSplit(from, to) {
  const a = Date.parse(toUtcIso(from))
  const b = Date.parse(toUtcIso(to))
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
    return { fromA: from, toA: to, fromB: from, toB: to }
  }
  const mid = toChUtc((a + b) / 2)
  return { fromA: from, toA: mid, fromB: mid, toB: to }
}

/** Signed duration: abs through fmtMs so negatives do not hit the µs branch. */
export function fmtSignedMs(v) {
  if (v == null || isNaN(v)) return '—'
  if (v === 0) return fmtMs(0)
  const sign = v > 0 ? '+' : '-'
  return `${sign}${fmtMs(Math.abs(v))}`
}
