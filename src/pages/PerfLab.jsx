import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { FiZap, FiPlay, FiPlus } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, Badge, StatusPill } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'

const API = import.meta.env.VITE_API_URL || ''

/** Wave 29: Perf lab — scenarios, fan-out, soak/spike profiles, baseline compare. */
export default function PerfLab() {
  const scenarios = useApi('/api/perf/scenarios', {}, { noRange: true })
  const runs = useApi('/api/perf/runs', {}, { noRange: true })
  const baselines = useApi('/api/performance/baselines', {}, { noRange: true })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [fanout, setFanout] = useState(false)
  const [profile, setProfile] = useState('')
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const [form, setForm] = useState({
    name: 'health-check',
    target_url: `${API || 'http://127.0.0.1:8080'}/api/health`,
    method: 'GET',
    vus: 10,
    duration_seconds: 60,
  })

  const scnRows = scenarios.data?.scenarios || []
  const runRows = runs.data?.runs || []
  const baseRows = baselines.data?.baselines || []

  const parseSummary = (r) => {
    try {
      return typeof r.summary_json === 'string' ? JSON.parse(r.summary_json || '{}') : (r.summary_json || {})
    } catch {
      return {}
    }
  }

  const compare = useMemo(() => {
    if (!compareA || !compareB) return null
    const a = runRows.find((r) => r.id === compareA)
    const b = runRows.find((r) => r.id === compareB)
    if (!a || !b) return null
    const sa = parseSummary(a)
    const sb = parseSummary(b)
    const delta = (x, y) => (Number(y) || 0) - (Number(x) || 0)
    return {
      a: { id: a.id, ...sa, vus: a.vus },
      b: { id: b.id, ...sb, vus: b.vus },
      d_p95: delta(sa.p95_ms, sb.p95_ms),
      d_err: delta(sa.error_rate, sb.error_rate),
    }
  }, [compareA, compareB, runRows])

  const createScenario = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/perf/scenarios/upsert`, form)
      setMsg(data)
      scenarios.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const startRun = async (scenarioId) => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/perf/runs`, {
        scenario_id: scenarioId,
        vus: form.vus,
        fanout,
        profile: profile || undefined,
      })
      setMsg({
        ...data,
        tip: 'Run: node scripts/load-runner.mjs — attach X-OPA-Load-Run-Id / baggage so spans get tags.load_run_id=' + (data.load_run_id || data.id),
      })
      runs.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const scnCols = [
    { key: 'name', header: 'Name', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'target_url', header: 'Target', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{r.target_url}</span> },
    { key: 'vus', header: 'VUs', num: true },
    { key: 'duration_seconds', header: 'Dur(s)', num: true },
    { key: 'id', header: '', render: (r) => (
      <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => startRun(r.id)}><FiPlay size={12} /> Start</button>
    ) },
  ]

  const runCols = [
    { key: 'id', header: 'Run', render: (r) => <span className="opa-mono">{String(r.id).slice(0, 18)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'vus', header: 'VUs', num: true },
    { key: 'summary_json', header: 'Summary', render: (r) => {
      const s = parseSummary(r)
      return <span className="opa-mono" style={{ fontSize: 11 }}>p95={fmtNum(s.p95_ms)} err={fmtNum(s.error_rate)}</span>
    } },
    { key: 'started_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.started_at)}</span> },
    { key: 'id2', header: 'Traces', render: (r) => (
      <Link to={`/traces?load_run_id=${encodeURIComponent(r.id)}`}>Filter traces</Link>
    ) },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Perf lab</h1>
          <div className="opa-page-sub">
            Scenarios · soak/spike · federation fan-out · load_run_id ↔ spans
            <span className="opa-muted"> (peers ≠ multi-cloud load grid)</span>
          </div>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Scenarios" icon={<FiZap size={12} />} value={fmtNum(scnRows.length)} status="neutral" />
        <KpiTile label="Runs" icon={<FiPlay size={12} />} value={fmtNum(runRows.length)} status="neutral" />
        <KpiTile label="Baselines" icon={<FiZap size={12} />} value={fmtNum(baseRows.length)} status="neutral" />
        <KpiTile label="Fan-out" icon={<FiZap size={12} />} value={fanout ? 'on' : 'off'} status={fanout ? 'warn' : 'neutral'} />
      </div>

      <Panel title="Run options">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={fanout} onChange={(e) => setFanout(e.target.checked)} />
            Fan-out to federation peers
          </label>
          <label>
            Profile{' '}
            <select value={profile} onChange={(e) => setProfile(e.target.value)}>
              <option value="">default</option>
              <option value="soak">soak (≥5 VUs)</option>
              <option value="spike">spike (≥50 VUs)</option>
              <option value="ramp">ramp</option>
            </select>
          </label>
          <span className="opa-muted" style={{ fontSize: 12 }}>
            Spans pick up <code>tags.load_run_id</code> from <code>X-OPA-Load-Run-Id</code> / baggage.
          </span>
        </div>
      </Panel>

      <Panel title="New scenario" icon={<FiPlus />}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          <input className="opa-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="name" />
          <input className="opa-input" style={{ minWidth: 280 }} value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} placeholder="target_url" />
          <input className="opa-input" type="number" value={form.vus} onChange={(e) => setForm({ ...form, vus: Number(e.target.value) })} style={{ width: 80 }} />
          <input className="opa-input" type="number" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} style={{ width: 80 }} />
          <button type="button" className="opa-btn" disabled={busy} onClick={createScenario}>Save scenario</button>
        </div>
      </Panel>

      <Panel title="Scenarios" flush loading={scenarios.loading} empty={!scenarios.loading && !scnRows.length} emptyText="Create a scenario above">
        <DataTable columns={scnCols} rows={scnRows} rowKey={(r) => r.id} />
      </Panel>

      <Panel title="Runs" flush loading={runs.loading} empty={!runs.loading && !runRows.length} emptyText="Start a run from a scenario">
        <DataTable columns={runCols} rows={runRows} rowKey={(r) => r.id} />
      </Panel>

      <Panel title="Compare runs (baselines)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12, alignItems: 'center' }}>
          <select value={compareA} onChange={(e) => setCompareA(e.target.value)}>
            <option value="">Baseline run A…</option>
            {runRows.map((r) => <option key={r.id} value={r.id}>{String(r.id).slice(0, 20)} · {r.status}</option>)}
          </select>
          <select value={compareB} onChange={(e) => setCompareB(e.target.value)}>
            <option value="">Candidate run B…</option>
            {runRows.map((r) => <option key={r.id} value={r.id}>{String(r.id).slice(0, 20)} · {r.status}</option>)}
          </select>
          <Link to="/performance">Perf baselines / gate</Link>
        </div>
        {compare && (
          <div style={{ padding: '0 12px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <StatusPill tone={compare.d_p95 > 0 ? 'error' : 'ok'}>Δ p95 {fmtNum(compare.d_p95)} ms</StatusPill>
            <StatusPill tone={compare.d_err > 0 ? 'error' : 'ok'}>Δ err {fmtNum(compare.d_err)}</StatusPill>
            <span className="opa-mono" style={{ fontSize: 11 }}>
              A p95={fmtNum(compare.a.p95_ms)} → B p95={fmtNum(compare.b.p95_ms)}
            </span>
          </div>
        )}
        {baseRows.length > 0 && (
          <div style={{ padding: '0 12px 12px' }}>
            <div className="opa-muted" style={{ fontSize: 12, marginBottom: 6 }}>Stored Wave 11 baselines</div>
            <DataTable
              columns={[
                { key: 'service', header: 'Service' },
                { key: 'transaction', header: 'Txn' },
                { key: 'metric', header: 'Metric' },
                { key: 'value', header: 'Value', num: true, render: (r) => fmtNum(r.value) },
                { key: 'release', header: 'Release' },
              ]}
              rows={baseRows}
              rowKey={(r) => r.id || `${r.service}:${r.metric}`}
              maxHeight={200}
            />
          </div>
        )}
      </Panel>

      {msg && (
        <Panel title="Result">
          <pre className="opa-mono" style={{ padding: 12, fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(msg, null, 2)}</pre>
        </Panel>
      )}
    </div>
  )
}
