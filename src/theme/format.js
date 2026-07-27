// Shared formatters + semantic color helpers for the OPA design system.
// Every metric render goes through these so units/rounding/colors are uniform.

export function fmtMs(v) {
  if (v == null || isNaN(v)) return '—'
  if (v < 1) return `${(v * 1000).toFixed(0)}µs`
  if (v < 1000) return `${v < 10 ? v.toFixed(1) : Math.round(v)}ms`
  if (v < 60000) return `${(v / 1000).toFixed(2)}s`
  return `${(v / 60000).toFixed(1)}m`
}

export function fmtBytes(v) {
  if (v == null || isNaN(v)) return '—'
  const neg = v < 0
  let n = Math.abs(v)
  if (n === 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${neg ? '-' : ''}${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`
}

export function fmtNum(v) {
  if (v == null || isNaN(v)) return '—'
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return `${Math.round(v)}`
}

export function fmtPct(v, digits = 1) {
  if (v == null || isNaN(v)) return '—'
  return `${v.toFixed(digits)}%`
}

// Throughput expressed per-minute (New Relic "rpm" convention).
export function fmtRpm(v) {
  if (v == null || isNaN(v)) return '—'
  return `${fmtNum(v)}`
}

// Relative time for "last seen" style columns.
// Agent timestamps are naive UTC ("YYYY-MM-DD HH:MM:SS[.mmm]"). Date.parse reads
// that space-separated form as LOCAL time, skewing "ago" by the viewer's UTC
// offset (e.g. a just-created row shows "2h ago" in UTC+2). Mark it UTC so it's
// parsed correctly; leave numbers and already-zoned ISO strings untouched.
export function toUtcIso(ts) {
  if (typeof ts !== 'string') return ts
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(ts) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)) {
    return ts.replace(' ', 'T') + 'Z'
  }
  return ts
}

export function fmtAgo(ts) {
  if (!ts) return '—'
  const t = typeof ts === 'number' ? ts : Date.parse(toUtcIso(ts))
  // Treat missing/epoch-zero sentinels (e.g. "1970-01-01 00:00:00") as no data
  // rather than rendering a nonsensical "20000d ago".
  if (isNaN(t) || t < 946684800000) return '—'
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// Health / status -> css var color.
export function statusColor(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'error' || s === '0' || s === 'down' || s === 'critical' || s === 'unhealthy') return 'var(--error)'
  if (s === 'warn' || s === 'warning' || s === 'degraded' || s === 'needs-improvement') return 'var(--warn)'
  if (s === 'ok' || s === 'healthy' || s === 'success' || s === 'good' || s === '1' || s === '200') return 'var(--ok)'
  return 'var(--neutral)'
}

// Fixed semantic breakdown palette by operation tier.
export function tierColor(tier) {
  const t = String(tier || '').toLowerCase()
  if (t.includes('db') || t.includes('sql') || t.includes('mysql') || t.includes('postgres')) return 'var(--tier-db)'
  if (t.includes('redis')) return 'var(--tier-redis)'
  if (t.includes('http') || t.includes('external') || t.includes('curl')) return 'var(--tier-http)'
  if (t.includes('cache') || t.includes('apcu')) return 'var(--tier-cache)'
  return 'var(--tier-app)'
}

export const SERIES = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
  'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)',
]

// Classify a latency (ms) against loose APM thresholds for coloring.
export function latencyStatus(ms, warnAt = 500, errAt = 2000) {
  if (ms == null) return 'neutral'
  if (ms >= errAt) return 'error'
  if (ms >= warnAt) return 'warn'
  return 'ok'
}

// Classify error-rate (%) for coloring.
export function errorRateStatus(pct, warnAt = 1, errAt = 5) {
  if (pct == null) return 'neutral'
  if (pct >= errAt) return 'error'
  if (pct >= warnAt) return 'warn'
  return 'ok'
}
