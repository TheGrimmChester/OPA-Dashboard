import React, { createContext, useContext, useMemo, useState } from 'react'

const RANGES = [
  { value: '15m', label: '15m', ms: 15 * 60 * 1000, interval: '1m' },
  { value: '1h', label: '1h', ms: 60 * 60 * 1000, interval: '1m' },
  { value: '6h', label: '6h', ms: 6 * 60 * 60 * 1000, interval: '5m' },
  { value: '24h', label: '24h', ms: 24 * 60 * 60 * 1000, interval: '30m' },
  { value: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000, interval: '6h' },
  { value: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000, interval: '1d' },
]

const pad = (n) => String(n).padStart(2, '0')
// ClickHouse-friendly 'YYYY-MM-DD HH:MM:SS' in UTC (matches agent query filters).
function chTime(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

const TimeRangeContext = createContext(null)

export function TimeRangeProvider({ children }) {
  const [range, setRange] = useState(() => localStorage.getItem('opa_range') || '24h')
  const [tick, setTick] = useState(0) // bump to force a refetch across pages

  const setRangePersist = (r) => { localStorage.setItem('opa_range', r); setRange(r) }
  const refresh = () => setTick((t) => t + 1)

  const value = useMemo(() => {
    const spec = RANGES.find((r) => r.value === range) || RANGES[3]
    const now = Date.now()
    const fromD = new Date(now - spec.ms)
    const prevFromD = new Date(now - spec.ms * 2)
    return {
      range, setRange: setRangePersist, ranges: RANGES, refresh, tick,
      ms: spec.ms, interval: spec.interval,
      from: chTime(fromD), to: chTime(new Date(now)),
      prevFrom: chTime(prevFromD), prevTo: chTime(fromD),
      fromISO: fromD.toISOString(), toISO: new Date(now).toISOString(),
    }
  }, [range, tick])

  return <TimeRangeContext.Provider value={value}>{children}</TimeRangeContext.Provider>
}

export function useTimeRange() {
  const ctx = useContext(TimeRangeContext)
  if (!ctx) throw new Error('useTimeRange must be used within TimeRangeProvider')
  return ctx
}
