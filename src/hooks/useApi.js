import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useTimeRange } from '../contexts/TimeRangeContext'
import { useTenant } from '../contexts/TenantContext'
import { apiUrl } from '../utils/apiBase'

/** Prefer honesty over bare codes like Agent 410 `error: "moved"`. */
export function formatApiError(e) {
  const d = e?.response?.data
  if (d && typeof d === 'object') {
    const code = d.error != null ? String(d.error) : ''
    const honesty = d.honesty != null ? String(d.honesty) : ''
    // Honest upstream codes when a peer product answered instead of the hub.
    if (code === 'moved' && honesty) return honesty
    if (honesty && code) return `${code}: ${honesty}`
    if (honesty) return honesty
    if (code) return code
  }
  if (typeof d === 'string' && d) return d
  return e?.message || 'Request failed'
}

// Fetch a JSON endpoint, auto-merging the global time range (from/to) and
// re-fetching when the range, the selected tenant scope (org + project selection), the manual refresh tick, or
// params change. The tenant travels as request headers (see TenantContext), so it
// has to be an explicit dependency here or a switch would never re-query.
// opts.noRange disables from/to injection. opts.skip defers the call.
export function useApi(path, params = {}, opts = {}) {
  const { from, to, interval, tick } = useTimeRange()
  const { scopeKey } = useTenant()
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const paramsKey = JSON.stringify(params)
  const skip = opts.skip

  const load = useCallback(async (signal) => {
    if (skip || !path) { setState({ data: null, loading: false, error: null }); return }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      // interval only affects the /api/metrics/* time-series endpoints; other
      // handlers ignore the unknown param, so injecting it globally is safe and
      // keeps short-range charts dense.
      const merged = opts.noRange ? params : { from, to, interval, ...params }
      const res = await axios.get(apiUrl(path), { params: merged, signal })
      setState({ data: res.data, loading: false, error: null })
    } catch (e) {
      if (axios.isCancel?.(e) || e.name === 'CanceledError') return
      setState({ data: null, loading: false, error: formatApiError(e) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey, from, to, interval, skip, opts.noRange, scopeKey])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load, tick])

  return { ...state, reload: () => load() }
}

// Poll a path on an interval (for Live views). Returns {data,loading,error}.
export function usePolling(path, intervalMs, params = {}, opts = {}) {
  const { scopeKey } = useTenant()
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const ref = useRef()
  const paramsKey = JSON.stringify(params)
  useEffect(() => {
    let alive = true
    const fetchOnce = async () => {
      try {
        const res = await axios.get(apiUrl(path), { params })
        if (alive) setState({ data: res.data, loading: false, error: null })
      } catch (e) {
        if (alive) setState((s) => ({ ...s, loading: false, error: e.message }))
      }
    }
    fetchOnce()
    if (!opts.paused) ref.current = setInterval(fetchOnce, intervalMs)
    return () => { alive = false; clearInterval(ref.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey, intervalMs, opts.paused, scopeKey])
  return state
}
