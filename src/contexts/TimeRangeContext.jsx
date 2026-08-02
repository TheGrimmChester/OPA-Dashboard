import React, { createContext, useContext, useMemo, useState, useCallback } from 'react'

const RANGES = [
  { value: '15m', label: '15m', ms: 15 * 60 * 1000, interval: '1m' },
  { value: '1h', label: '1h', ms: 60 * 60 * 1000, interval: '1m' },
  { value: '6h', label: '6h', ms: 6 * 60 * 60 * 1000, interval: '5m' },
  { value: '24h', label: '24h', ms: 24 * 60 * 60 * 1000, interval: '30m' },
  { value: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000, interval: '6h' },
  { value: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000, interval: '1d' },
]

const pad = (n) => String(n).padStart(2, '0')
export function chTime(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

const TimeRangeContext = createContext(null)

export function TimeRangeProvider({ children }) {
  const [range, setRange] = useState(() => localStorage.getItem('opa_range') || '24h')
  // Dashboards: optional absolute window from brush-to-zoom.
  const [custom, setCustom] = useState(null) // { fromMs, toMs } | null
  const [tick, setTick] = useState(0)

  const setRangePersist = useCallback((r) => {
    localStorage.setItem('opa_range', r)
    setCustom(null)
    setRange(r)
  }, [])
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const setAbsoluteRange = useCallback((fromMs, toMs) => {
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return
    setCustom({ fromMs, toMs })
    setRange('custom')
  }, [])

  const clearCustom = useCallback(() => {
    setCustom(null)
    setRangePersist(localStorage.getItem('opa_range_prev') || '24h')
  }, [setRangePersist])

  const value = useMemo(() => {
    const now = Date.now()
    let fromD
    let toD
    let interval = '5m'
    let ms
    if (custom && range === 'custom') {
      fromD = new Date(custom.fromMs)
      toD = new Date(custom.toMs)
      ms = custom.toMs - custom.fromMs
      if (ms <= 3600000) interval = '1m'
      else if (ms <= 6 * 3600000) interval = '5m'
      else if (ms <= 24 * 3600000) interval = '30m'
      else interval = '6h'
    } else {
      const spec = RANGES.find((r) => r.value === range) || RANGES[3]
      ms = spec.ms
      interval = spec.interval
      toD = new Date(now)
      fromD = new Date(now - spec.ms)
    }
    const prevFromD = new Date(fromD.getTime() - ms)
    return {
      range,
      setRange: (r) => {
        if (r !== 'custom') localStorage.setItem('opa_range_prev', r)
        setRangePersist(r)
      },
      ranges: RANGES,
      refresh,
      tick,
      ms,
      interval,
      from: chTime(fromD),
      to: chTime(toD),
      prevFrom: chTime(prevFromD),
      prevTo: chTime(fromD),
      fromISO: fromD.toISOString(),
      toISO: toD.toISOString(),
      fromMs: fromD.getTime(),
      toMs: toD.getTime(),
      isCustom: range === 'custom' && !!custom,
      setAbsoluteRange,
      clearCustom,
    }
  }, [range, tick, custom, setRangePersist, refresh, setAbsoluteRange, clearCustom])

  return <TimeRangeContext.Provider value={value}>{children}</TimeRangeContext.Provider>
}

export function useTimeRange() {
  const ctx = useContext(TimeRangeContext)
  if (!ctx) throw new Error('useTimeRange must be used within TimeRangeProvider')
  return ctx
}
