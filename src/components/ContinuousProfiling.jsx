import React, { useState, useEffect } from 'react'
import { FiCpu, FiClock, FiRefreshCw } from 'react-icons/fi'
import axios from 'axios'
import HelpIcon from './HelpIcon'
import './ContinuousProfiling.css'

// Continuous / aggregated profiler: top functions by self-time, rolled up across
// every request's call tree (opa.profiles). Unlike a per-trace flame graph this
// answers "where does this service spend CPU over time?".
const ContinuousProfiling = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [timeRange, setTimeRange] = useState('24h')
  const [sortBy, setSortBy] = useState('self_wall_ms')

  useEffect(() => {
    fetchProfiles()
    const interval = setInterval(fetchProfiles, 60000)
    return () => clearInterval(interval)
  }, [timeRange])

  const getFrom = (range) => {
    const now = new Date()
    const h = { '1h': 1, '6h': 6, '24h': 24, '7d': 24 * 7 }[range] || 24
    const d = new Date(now - h * 60 * 60 * 1000)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`
  }

  const fetchProfiles = async () => {
    try {
      const res = await axios.get('/api/profiles', { params: { from: getFrom(timeRange), limit: 100 } })
      setData(res.data)
      setError(null)
    } catch (e) {
      setError(e.message || 'Failed to fetch profiles')
    } finally {
      setLoading(false)
    }
  }

  const fmtMs = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(1)}ms`)
  const fmtBytes = (v) => {
    if (v == null || v === 0) return '—'
    const neg = v < 0
    let n = Math.abs(v)
    const u = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return `${neg ? '-' : ''}${n.toFixed(1)}${u[i]}`
  }

  if (loading) return <div className="cprof-loading">Loading profile…</div>

  const funcs = [...(data?.functions || [])].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0))
  const maxSelf = funcs.reduce((m, f) => Math.max(m, f.self_wall_ms || 0), 0) || 1

  return (
    <div className="cprof">
      <div className="cprof-header">
        <h2>
          <FiCpu /> Continuous Profiling
          <HelpIcon text="Aggregated profiler: per-function self-time rolled up across all requests over the selected range. Self-time is a function's own time excluding its callees. Bounded by the extension's opa.stack_depth cap." position="right" />
        </h2>
        <div className="cprof-controls">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
          <button className="cprof-refresh" onClick={fetchProfiles} title="Refresh"><FiRefreshCw /></button>
        </div>
      </div>

      {error && <div className="cprof-error">{error}</div>}

      <div className="cprof-summary">
        <div className="cprof-stat">
          <div className="cprof-stat-label"><FiClock /> Total self-time</div>
          <div className="cprof-stat-value">{fmtMs(data?.total_self_wall_ms)}</div>
        </div>
        <div className="cprof-stat">
          <div className="cprof-stat-label"><FiCpu /> Functions</div>
          <div className="cprof-stat-value">{funcs.length}</div>
        </div>
      </div>

      {funcs.length === 0 ? (
        <div className="cprof-empty">No profile data for this range. Generate traffic and wait for the next aggregation flush (~30s).</div>
      ) : (
        <table className="cprof-table">
          <thead>
            <tr>
              <th>Function</th>
              <th>Service</th>
              <th className="num sortable" onClick={() => setSortBy('call_count')}>Calls</th>
              <th className="num sortable" onClick={() => setSortBy('self_wall_ms')}>Self</th>
              <th className="num sortable" onClick={() => setSortBy('total_wall_ms')}>Total</th>
              <th className="num sortable" onClick={() => setSortBy('total_cpu_ms')}>CPU</th>
              <th className="num">Mem Δ</th>
              <th className="cprof-bar-col">Self %</th>
            </tr>
          </thead>
          <tbody>
            {funcs.map((f, i) => (
              <tr key={`${f.service}:${f.function}:${i}`}>
                <td className="cprof-fn" title={f.function}>{f.function}</td>
                <td className="cprof-svc">{f.service}</td>
                <td className="num">{f.call_count}</td>
                <td className="num strong">{fmtMs(f.self_wall_ms)}</td>
                <td className="num">{fmtMs(f.total_wall_ms)}</td>
                <td className="num">{fmtMs(f.total_cpu_ms)}</td>
                <td className="num">{fmtBytes(f.memory_delta)}</td>
                <td className="cprof-bar-col">
                  <div className="cprof-bar-track">
                    <div className="cprof-bar-fill" style={{ width: `${((f.self_wall_ms || 0) / maxSelf) * 100}%` }} />
                    <span className="cprof-bar-label">{(f.self_pct || 0).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default ContinuousProfiling
