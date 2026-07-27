import React, { useState, useRef, useEffect } from 'react'
import { FiActivity, FiClock, FiHash, FiCode, FiLayers, FiBarChart2 } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable } from '../components/ui'
import FlameGraph from '../components/FlameGraph'
import { fmtMs, fmtBytes, fmtNum, fmtPct } from '../theme/format'
import './ProfilingView.css'

const ALL = '__all__'

export default function ProfilingView() {
  const [service, setService] = useState(ALL)

  const meta = useApi('/api/services/metadata', {}, { noRange: true })
  const profiles = useApi('/api/profiles', {
    limit: 200,
    ...(service !== ALL ? { service } : {}),
  })
  // Aggregate flame tree — the endpoint requires a specific service, so skip
  // the call entirely while "All services" is selected.
  const flame = useApi(
    '/api/profiles/flame',
    service !== ALL ? { service } : {},
    { skip: service === ALL },
  )

  const services = meta.data?.services || []
  const functions = profiles.data?.functions || []
  const totalSelf = profiles.data?.total_self_wall_ms || 0
  const flameTree = flame.data?.tree || []

  // FlameGraph renders a fixed-width SVG; measure the panel so it fills it
  // (same pattern as TraceDetail).
  const flameRef = useRef(null)
  const [flameW, setFlameW] = useState(960)
  useEffect(() => {
    const measure = () => { if (flameRef.current) setFlameW(Math.max(320, flameRef.current.offsetWidth - 4)) }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [flameTree.length, service])

  const columns = [
    {
      key: 'function',
      header: 'Function',
      mono: true,
      render: (r) => (
        <span className="opa-profiling-fn opa-mono cell-strong" title={r.function}>
          {r.function || '—'}
        </span>
      ),
      sortValue: (r) => r.function || '',
    },
    {
      key: 'service',
      header: 'Service',
      render: (r) => <span className="opa-mono opa-muted">{r.service || '—'}</span>,
      sortValue: (r) => r.service || '',
    },
    {
      key: 'call_count',
      header: 'Calls',
      num: true,
      render: (r) => fmtNum(r.call_count || 0),
      sortValue: (r) => r.call_count || 0,
    },
    {
      key: 'self_wall_ms',
      header: 'Self',
      num: true,
      render: (r) => <strong className="opa-tnum">{fmtMs(r.self_wall_ms)}</strong>,
      sortValue: (r) => r.self_wall_ms || 0,
    },
    {
      key: 'self_pct',
      header: 'Self %',
      width: 200,
      sortValue: (r) => r.self_pct || 0,
      render: (r) => {
        const pct = Math.min(100, Math.max(0, r.self_pct || 0))
        return (
          <div className="opa-profiling-selfbar" title={`${fmtPct(r.self_pct)} of self time`}>
            <span className="fill" style={{ width: `${pct}%` }} />
            <span className="label">{fmtPct(r.self_pct)}</span>
          </div>
        )
      },
    },
    {
      key: 'total_wall_ms',
      header: 'Total',
      num: true,
      render: (r) => fmtMs(r.total_wall_ms),
      sortValue: (r) => r.total_wall_ms || 0,
    },
    {
      key: 'total_cpu_ms',
      header: 'CPU',
      num: true,
      render: (r) => fmtMs(r.total_cpu_ms),
      sortValue: (r) => r.total_cpu_ms || 0,
    },
    {
      key: 'memory_delta',
      header: 'Mem',
      num: true,
      render: (r) => (
        <span style={{ color: (r.memory_delta || 0) < 0 ? 'var(--ok)' : 'var(--text-secondary)' }}>
          {fmtBytes(r.memory_delta)}
        </span>
      ),
      sortValue: (r) => r.memory_delta || 0,
    },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Profiling</h1>
          <div className="opa-page-sub">
            Aggregated function cost across all traces · call depth bounded by <span className="opa-mono">opa.stack_depth</span>
          </div>
        </div>
        <div className="opa-row">
          <select
            className="opa-select"
            value={service}
            onChange={(e) => setService(e.target.value)}
            style={{
              background: 'var(--surface-2)', color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)', borderRadius: 6,
              padding: '6px 10px', fontSize: 'var(--fs-12)',
            }}
          >
            <option value={ALL}>All services</option>
            {services.map((s) => (
              <option key={s.service} value={s.service}>{s.service}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="opa-grid cols-3">
        <KpiTile label="Total self time" icon={<FiClock size={12} />} value={fmtMs(totalSelf)} status="neutral" />
        <KpiTile label="Functions" icon={<FiCode size={12} />} value={fmtNum(functions.length)} status="neutral" />
        <KpiTile
          label="Total calls" icon={<FiHash size={12} />}
          value={fmtNum(functions.reduce((a, f) => a + (f.call_count || 0), 0))}
          status="neutral"
        />
      </div>

      <Panel
        title="Flame graph" icon={<FiBarChart2 />}
        loading={service !== ALL && flame.loading}
        error={service !== ALL ? flame.error : null}
        empty={service === ALL || (!flame.loading && !flame.error && flameTree.length === 0)}
        emptyText={
          service === ALL
            ? 'Select a service to render its aggregate flame graph'
            : 'No profiling data for this service in the selected range.'
        }
        actions={
          service !== ALL && flame.data?.total_ms != null ? (
            <span className="opa-row opa-muted" style={{ fontSize: 'var(--fs-12)', gap: 6 }}>
              <FiClock size={12} /> total {fmtMs(flame.data.total_ms)}
            </span>
          ) : null
        }
      >
        <div ref={flameRef} style={{ overflowX: 'auto' }}>
          <FlameGraph callStack={flameTree} width={flameW} height={440} />
        </div>
      </Panel>

      <Panel
        title="Function cost" icon={<FiActivity />} flush
        loading={profiles.loading} error={profiles.error}
        empty={!profiles.loading && functions.length === 0}
        emptyText="No profiling data — run traffic with the OPA profiler enabled."
        actions={
          <span className="opa-row opa-muted" style={{ fontSize: 'var(--fs-12)', gap: 6 }}>
            <FiLayers size={12} /> sorted by self time
          </span>
        }
      >
        <DataTable
          columns={columns}
          rows={functions}
          rowKey={(r, i) => `${r.service}:${r.function}:${i}`}
          initialSort={{ key: 'self_wall_ms', dir: 'desc' }}
        />
      </Panel>
    </div>
  )
}
