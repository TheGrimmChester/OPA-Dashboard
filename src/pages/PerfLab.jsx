import React, { useState } from 'react'
import axios from 'axios'
import { FiZap, FiPlay, FiPlus } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, Badge } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'

const API = import.meta.env.VITE_API_URL || ''

/** Wave 29: Perf lab — scenarios + load runs (single-runner MVP). */
export default function PerfLab() {
  const scenarios = useApi('/api/perf/scenarios', {}, { noRange: true })
  const runs = useApi('/api/perf/runs', {}, { noRange: true })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({
    name: 'health-check',
    target_url: `${API || 'http://127.0.0.1:8080'}/api/health`,
    method: 'GET',
    vus: 10,
    duration_seconds: 60,
  })

  const scnRows = scenarios.data?.scenarios || []
  const runRows = runs.data?.runs || []

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
      const { data } = await axios.post(`${API}/api/perf/runs`, { scenario_id: scenarioId, vus: form.vus })
      setMsg({
        ...data,
        tip: 'Run: node scripts/load-runner.mjs --scenario scenario.json --agent <agent> --run-id ' + (data.load_run_id || data.id),
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
      let s = {}
      try { s = typeof r.summary_json === 'string' ? JSON.parse(r.summary_json || '{}') : (r.summary_json || {}) } catch (_) {}
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
          <div className="opa-page-sub">Scenarios · load runs · APM correlation (single-runner MVP)</div>
        </div>
      </div>

      <div className="opa-grid cols-3">
        <KpiTile label="Scenarios" icon={<FiZap size={12} />} value={fmtNum(scnRows.length)} status="neutral" />
        <KpiTile label="Runs" icon={<FiPlay size={12} />} value={fmtNum(runRows.length)} status="neutral" />
        <KpiTile label="Honesty" icon={<FiZap size={12} />} value="1 runner" status="neutral" />
      </div>

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

      {msg && (
        <Panel title="Result">
          <pre className="opa-mono" style={{ padding: 12, fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(msg, null, 2)}</pre>
        </Panel>
      )}
    </div>
  )
}
