import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useTimeRange } from '../contexts/TimeRangeContext'

const API = import.meta.env.VITE_API_URL || ''

// Fetch a JSON endpoint, auto-merging the global time range (from/to) and
// re-fetching when the range, the manual refresh tick, or params change.
// opts.noRange disables from/to injection. opts.skip defers the call.
export function useApi(path, params = {}, opts = {}) {
  const { from, to, tick } = useTimeRange()
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const paramsKey = JSON.stringify(params)
  const skip = opts.skip

  const load = useCallback(async (signal) => {
    if (skip || !path) { setState({ data: null, loading: false, error: null }); return }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const merged = opts.noRange ? params : { from, to, ...params }
      const res = await axios.get(`${API}${path}`, { params: merged, signal })
      setState({ data: res.data, loading: false, error: null })
    } catch (e) {
      if (axios.isCancel?.(e) || e.name === 'CanceledError') return
      setState({ data: null, loading: false, error: e.response?.data?.error || e.response?.data || e.message || 'Request failed' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey, from, to, skip, opts.noRange])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load, tick])

  return { ...state, reload: () => load() }
}

// Poll a path on an interval (for Live views). Returns {data,loading,error}.
export function usePolling(path, intervalMs, params = {}, opts = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const ref = useRef()
  const paramsKey = JSON.stringify(params)
  useEffect(() => {
    let alive = true
    const fetchOnce = async () => {
      try {
        const res = await axios.get(`${API}${path}`, { params })
        if (alive) setState({ data: res.data, loading: false, error: null })
      } catch (e) {
        if (alive) setState((s) => ({ ...s, loading: false, error: e.message }))
      }
    }
    fetchOnce()
    if (!opts.paused) ref.current = setInterval(fetchOnce, intervalMs)
    return () => { alive = false; clearInterval(ref.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey, intervalMs, opts.paused])
  return state
}
