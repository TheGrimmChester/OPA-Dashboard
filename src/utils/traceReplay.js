/**
 * Client-side helpers for trace waterfall playback and mode presentation.
 */

/** Spans whose start is at or before playheadMs (relative to traceStart). */
export function spansActiveAt(rows, playheadMs, traceStart = 0) {
  const t = Number(playheadMs) || 0
  const base = Number(traceStart) || 0
  const active = []
  for (const s of rows || []) {
    const start = (Number(s.start_ts) || 0) - base
    const dur = Number(s.duration_ms) || 0
    const end = start + Math.max(0, dur)
    if (start <= t && t <= end) active.push(s)
    else if (dur <= 0 && Math.abs(start - t) < 1) active.push(s)
  }
  return active
}

/** Ordered unique span_ids for progressive highlight up to playhead. */
export function spanIdsStartedBy(rows, playheadMs, traceStart = 0) {
  const t = Number(playheadMs) || 0
  const base = Number(traceStart) || 0
  const ids = []
  const seen = new Set()
  const sorted = [...(rows || [])].sort((a, b) => (a.start_ts || 0) - (b.start_ts || 0))
  for (const s of sorted) {
    const start = (Number(s.start_ts) || 0) - base
    if (start <= t && s.span_id && !seen.has(s.span_id)) {
      seen.add(s.span_id)
      ids.push(s.span_id)
    }
  }
  return ids
}

export function pickReplayMode(modes, id) {
  return (modes || []).find((m) => m.id === id) || null
}

export function availableReplayModes(modes) {
  return (modes || []).filter((m) => m.available)
}

export const REPLAY_MODE_ORDER = [
  'waterfall',
  'rum_session',
  'perf_lab',
  'synthetics',
  'har_export',
  'step_list',
]
