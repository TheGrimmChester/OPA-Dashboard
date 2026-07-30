import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { FiZap, FiPlay, FiPlus, FiTrash2, FiUpload, FiDownload, FiCheck } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, Badge, StatusPill } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'

const API = import.meta.env.VITE_API_URL || ''
const TABS = ['Design', 'Datasets', 'JMX', 'Run', 'Results', 'Compare']

const emptyStep = () => ({ type: 'http', name: 'Request', method: 'GET', url: `${API || 'http://127.0.0.1:8080'}/api/health`, body: '', think_ms: 50 })

/**
 * Wave 31 — Visual JMX builder + Apache JMeter runs.
 * Users design steps in plain forms; Agent generates jmx_xml (no JMeter expertise required).
 */
export default function PerfLab() {
  const scenarios = useApi('/api/perf/scenarios', {}, { noRange: true })
  const runs = useApi('/api/perf/runs', {}, { noRange: true })
  const baselines = useApi('/api/performance/baselines', {}, { noRange: true })
  const [tab, setTab] = useState('Design')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [fanout, setFanout] = useState(false)
  const [profile, setProfile] = useState('')
  const [engine, setEngine] = useState('jmeter')
  const [dispatch, setDispatch] = useState(true)
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [activeRunId, setActiveRunId] = useState('')
  const [runDetail, setRunDetail] = useState(null)
  const [samples, setSamples] = useState([])
  const [form, setForm] = useState({
    name: 'my-load-test',
    target_url: `${API || 'http://127.0.0.1:8080'}/api/health`,
    method: 'GET',
    vus: 10,
    duration_seconds: 60,
    steps: [emptyStep()],
    datasets: { csv: { inline: '', variableNames: 'user,token', delimiter: ',', recycle: true } },
    sla: { p95_ms: 500, error_rate_max: 0.05 },
    schedule: { ramp_seconds: 10 },
    jmx_xml: '',
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

  const liveKPIs = useMemo(() => {
    if (!samples.length) return { n: 0, p95: 0, err: 0 }
    const lats = samples.map((s) => Number(s.latency_ms) || 0).sort((a, b) => a - b)
    const errors = samples.filter((s) => !s.ok && s.ok !== 1).length
    const idx = Math.min(lats.length - 1, Math.ceil(0.95 * lats.length) - 1)
    return { n: samples.length, p95: lats[idx] || 0, err: samples.length ? errors / samples.length : 0 }
  }, [samples])

  useEffect(() => {
    if (!activeRunId || tab !== 'Results') return undefined
    let cancelled = false
    const tick = async () => {
      try {
        const [d, s] = await Promise.all([
          axios.get(`${API}/api/perf/runs/${encodeURIComponent(activeRunId)}`),
          axios.get(`${API}/api/perf/runs/${encodeURIComponent(activeRunId)}/samples`),
        ])
        if (!cancelled) {
          setRunDetail(d.data)
          setSamples(s.data?.samples || [])
        }
      } catch { /* ignore poll errors */ }
    }
    tick()
    const t = setInterval(tick, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [activeRunId, tab])

  const setStep = (i, patch) => {
    const steps = form.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    setForm({ ...form, steps })
  }

  const addStep = (type = 'http') => {
    const base = type === 'http' ? emptyStep()
      : type === 'extract' ? { type: 'extract', name: 'Extract', engine: 'regex', expression: '', var: 'token' }
        : type === 'assert' ? { type: 'assert', name: 'Assert', status: 200, body_contains: '' }
          : { type: 'transaction', name: 'Business step' }
    setForm({ ...form, steps: [...form.steps, base] })
  }

  const saveScenario = async () => {
    setBusy(true); setMsg(null)
    try {
      const firstHttp = form.steps.find((s) => !s.type || s.type === 'http') || {}
      const { data } = await axios.post(`${API}/api/perf/scenarios/upsert`, {
        id: selectedId || undefined,
        name: form.name,
        target_url: firstHttp.url || form.target_url,
        method: firstHttp.method || form.method,
        vus: form.vus,
        duration_seconds: form.duration_seconds,
        steps: form.steps,
        datasets: form.datasets,
        sla: form.sla,
        schedule: form.schedule,
        jmx_xml: form.jmx_xml || undefined,
        thresholds: form.sla,
      })
      setMsg(data)
      if (data.id) setSelectedId(data.id)
      scenarios.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const loadScenario = async (id) => {
    setBusy(true)
    try {
      const { data } = await axios.get(`${API}/api/perf/scenarios/${encodeURIComponent(id)}`)
      let steps = []
      try { steps = typeof data.steps_json === 'string' ? JSON.parse(data.steps_json || '[]') : (data.steps_json || []) } catch { steps = [] }
      if (!steps.length) steps = [{ type: 'http', name: 'Request', method: data.method || 'GET', url: data.target_url, body: data.body || '', think_ms: 50 }]
      let datasets = form.datasets
      try { datasets = typeof data.datasets_json === 'string' ? JSON.parse(data.datasets_json || '{}') : (data.datasets_json || datasets) } catch { /* keep */ }
      let sla = form.sla
      try { sla = typeof data.sla_json === 'string' ? JSON.parse(data.sla_json || '{}') : (data.sla_json || sla) } catch { /* keep */ }
      setSelectedId(id)
      setForm({
        name: data.name || form.name,
        target_url: data.target_url,
        method: data.method || 'GET',
        vus: Number(data.vus) || 10,
        duration_seconds: Number(data.duration_seconds) || 60,
        steps,
        datasets: { csv: { inline: '', variableNames: 'user,token', delimiter: ',', recycle: true, ...(datasets.csv || {}) } },
        sla: { p95_ms: 500, error_rate_max: 0.05, ...sla },
        schedule: { ramp_seconds: 10 },
        jmx_xml: data.jmx_xml || '',
      })
      setTab('Design')
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const importJmxFile = async (file) => {
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const text = await file.text()
      const { data } = await axios.post(`${API}/api/perf/scenarios/import-jmx?name=${encodeURIComponent(file.name.replace(/\.jmx$/i, ''))}`, {
        name: file.name.replace(/\.jmx$/i, ''),
        jmx: text,
      })
      setMsg(data)
      if (data.id) {
        setSelectedId(data.id)
        await loadScenario(data.id)
      }
      scenarios.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const validateScenario = async () => {
    if (!selectedId) { setMsg({ error: 'Save the scenario first' }); return }
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/perf/scenarios/${encodeURIComponent(selectedId)}/validate`)
      setMsg(data)
      setTab('Results')
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const startRun = async (scenarioId) => {
    const sid = scenarioId || selectedId
    if (!sid) { setMsg({ error: 'Save or select a scenario first' }); return }
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/perf/runs`, {
        scenario_id: sid,
        vus: form.vus,
        fanout,
        profile: profile || undefined,
        engine,
        dispatch,
      })
      setMsg(data)
      const rid = data.load_run_id || data.id
      if (rid) {
        setActiveRunId(rid)
        setTab('Results')
      }
      runs.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const downloadJmx = async () => {
    if (!selectedId) return
    window.open(`${API}/api/perf/scenarios/${encodeURIComponent(selectedId)}/export-jmx`, '_blank')
  }

  const scnCols = [
    { key: 'name', header: 'Name', render: (r) => (
      <button type="button" className="opa-btn ghost" onClick={() => loadScenario(r.id)} style={{ padding: 0 }}>
        <span className="cell-strong">{r.name}</span>
      </button>
    ) },
    { key: 'vus', header: 'VUs', num: true },
    { key: 'duration_seconds', header: 'Dur', num: true },
    { key: 'jmx_bytes', header: 'JMX', num: true, render: (r) => fmtNum(r.jmx_bytes || 0) },
    { key: 'id', header: '', render: (r) => (
      <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => startRun(r.id)}><FiPlay size={12} /> Start</button>
    ) },
  ]

  const runCols = [
    { key: 'id', header: 'Run', render: (r) => (
      <button type="button" className="opa-btn ghost opa-mono" style={{ fontSize: 11 }} onClick={() => { setActiveRunId(r.id); setTab('Results') }}>
        {String(r.id).slice(0, 18)}
      </button>
    ) },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'vus', header: 'VUs', num: true },
    { key: 'summary_json', header: 'Summary', render: (r) => {
      const s = parseSummary(r)
      return <span className="opa-mono" style={{ fontSize: 11 }}>p95={fmtNum(s.p95_ms)} err={fmtNum(s.error_rate)}</span>
    } },
    { key: 'started_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.started_at)}</span> },
    { key: 'id2', header: 'Traces', render: (r) => (
      <Link to={`/traces?load_run_id=${encodeURIComponent(r.id)}`}>Open traces</Link>
    ) },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Perf lab</h1>
          <div className="opa-page-sub">
            Visual scenario builder → Apache JMeter · load_run_id ↔ traces
            <span className="opa-muted"> (no JMeter expertise required; fan-out ≠ multi-region cloud)</span>
          </div>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Scenarios" icon={<FiZap size={12} />} value={fmtNum(scnRows.length)} status="neutral" />
        <KpiTile label="Runs" icon={<FiPlay size={12} />} value={fmtNum(runRows.length)} status="neutral" />
        <KpiTile label="Live samples" icon={<FiZap size={12} />} value={fmtNum(liveKPIs.n)} status="neutral" />
        <KpiTile label="Engine" icon={<FiZap size={12} />} value={engine} status="neutral" />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`opa-btn ${tab === t ? '' : 'ghost'}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Design' && (
        <Panel title="Visual scenario builder" icon={<FiPlus />}>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input className="opa-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Scenario name" />
              <input className="opa-input" type="number" value={form.vus} onChange={(e) => setForm({ ...form, vus: Number(e.target.value) })} style={{ width: 90 }} title="Virtual users" />
              <input className="opa-input" type="number" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} style={{ width: 90 }} title="Duration seconds" />
              <input className="opa-input" type="number" value={form.sla.p95_ms} onChange={(e) => setForm({ ...form, sla: { ...form.sla, p95_ms: Number(e.target.value) } })} style={{ width: 100 }} title="SLA p95 ms" />
              <input className="opa-input" type="number" step="0.01" value={form.sla.error_rate_max} onChange={(e) => setForm({ ...form, sla: { ...form.sla, error_rate_max: Number(e.target.value) } })} style={{ width: 100 }} title="Max error rate" />
            </div>
            <div className="opa-muted" style={{ fontSize: 12 }}>
              Add HTTP steps, extractors (capture tokens), and asserts. We generate JMeter JMX for you.
            </div>
            {form.steps.map((step, i) => (
              <div key={i} style={{ border: '1px solid var(--opa-border, #333)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select className="opa-input" value={step.type || 'http'} onChange={(e) => setStep(i, { type: e.target.value })}>
                    <option value="http">HTTP request</option>
                    <option value="extract">Extract variable</option>
                    <option value="assert">Assert</option>
                    <option value="transaction">Transaction label</option>
                  </select>
                  <input className="opa-input" value={step.name || ''} onChange={(e) => setStep(i, { name: e.target.value })} placeholder="Step name" />
                  <button type="button" className="opa-btn ghost" onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })}><FiTrash2 size={12} /></button>
                </div>
                {(step.type === 'http' || !step.type) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <select className="opa-input" value={step.method || 'GET'} onChange={(e) => setStep(i, { method: e.target.value })}>
                      {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input className="opa-input" style={{ minWidth: 280, flex: 1 }} value={step.url || ''} onChange={(e) => setStep(i, { url: e.target.value })} placeholder="https://… or use ${token}" />
                    <input className="opa-input" type="number" value={step.think_ms || 0} onChange={(e) => setStep(i, { think_ms: Number(e.target.value) })} style={{ width: 90 }} title="Think time ms" />
                    <input className="opa-input" style={{ minWidth: 200, flex: 1 }} value={step.body || ''} onChange={(e) => setStep(i, { body: e.target.value })} placeholder="Body (optional)" />
                  </div>
                )}
                {step.type === 'extract' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <select className="opa-input" value={step.engine || 'regex'} onChange={(e) => setStep(i, { engine: e.target.value })}>
                      <option value="regex">Regex</option>
                      <option value="jsonpath">JSONPath</option>
                    </select>
                    <input className="opa-input" style={{ flex: 1, minWidth: 200 }} value={step.expression || ''} onChange={(e) => setStep(i, { expression: e.target.value })} placeholder="Expression" />
                    <input className="opa-input" value={step.var || ''} onChange={(e) => setStep(i, { var: e.target.value })} placeholder="Variable name" />
                  </div>
                )}
                {step.type === 'assert' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <input className="opa-input" type="number" value={step.status || 200} onChange={(e) => setStep(i, { status: Number(e.target.value) })} style={{ width: 100 }} title="Status code" />
                    <input className="opa-input" style={{ flex: 1 }} value={step.body_contains || ''} onChange={(e) => setStep(i, { body_contains: e.target.value })} placeholder="Body must contain…" />
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="opa-btn ghost" onClick={() => addStep('http')}><FiPlus size={12} /> HTTP</button>
              <button type="button" className="opa-btn ghost" onClick={() => addStep('extract')}>+ Extract</button>
              <button type="button" className="opa-btn ghost" onClick={() => addStep('assert')}>+ Assert</button>
              <button type="button" className="opa-btn ghost" onClick={() => addStep('transaction')}>+ Transaction</button>
              <button type="button" className="opa-btn" disabled={busy} onClick={saveScenario}>Save (generates JMX)</button>
              <button type="button" className="opa-btn ghost" disabled={busy || !selectedId} onClick={validateScenario}><FiCheck size={12} /> Validate 1 VU</button>
            </div>
          </div>
        </Panel>
      )}

      {tab === 'Datasets' && (
        <Panel title="CSV dataset">
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="opa-input" value={form.datasets.csv?.variableNames || ''} onChange={(e) => setForm({ ...form, datasets: { ...form.datasets, csv: { ...form.datasets.csv, variableNames: e.target.value } } })} placeholder="Column names: user,password" />
            <textarea className="opa-input" rows={8} value={form.datasets.csv?.inline || ''} onChange={(e) => setForm({ ...form, datasets: { ...form.datasets, csv: { ...form.datasets.csv, inline: e.target.value } } })} placeholder={"user1,secret1\nuser2,secret2"} />
            <span className="opa-muted" style={{ fontSize: 12 }}>Use ${'{'}user{'}'} in URLs/bodies after extractors or CSV columns.</span>
            <button type="button" className="opa-btn" disabled={busy} onClick={saveScenario}>Save datasets</button>
          </div>
        </Panel>
      )}

      {tab === 'JMX' && (
        <Panel title="JMX (advanced — optional)">
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="opa-muted" style={{ fontSize: 12 }}>
              Prefer the Design tab. Paste or import a .jmx only if you already have one. Export downloads Agent-generated JMX.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label className="opa-btn ghost">
                <FiUpload size={12} /> Import .jmx
                <input type="file" accept=".jmx,application/xml,text/xml" hidden onChange={(e) => importJmxFile(e.target.files?.[0])} />
              </label>
              <button type="button" className="opa-btn ghost" disabled={!selectedId} onClick={downloadJmx}><FiDownload size={12} /> Export .jmx</button>
            </div>
            <textarea className="opa-input opa-mono" rows={14} style={{ fontSize: 11 }} value={form.jmx_xml} onChange={(e) => setForm({ ...form, jmx_xml: e.target.value })} placeholder="Generated on Save, or paste JMX XML here" />
            <button type="button" className="opa-btn" disabled={busy} onClick={saveScenario}>Save JMX</button>
          </div>
        </Panel>
      )}

      {tab === 'Run' && (
        <Panel title="Run options">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={dispatch} onChange={(e) => setDispatch(e.target.checked)} />
              Dispatch engine now
            </label>
            <label>
              Engine{' '}
              <select value={engine} onChange={(e) => setEngine(e.target.value)}>
                <option value="jmeter">Apache JMeter</option>
                <option value="node">Node fallback</option>
              </select>
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={fanout} onChange={(e) => setFanout(e.target.checked)} />
              Fan-out to federation peers
            </label>
            <label>
              Profile{' '}
              <select value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="">default</option>
                <option value="soak">soak</option>
                <option value="spike">spike</option>
                <option value="ramp">ramp</option>
              </select>
            </label>
            <button type="button" className="opa-btn" disabled={busy} onClick={() => startRun()}><FiPlay size={12} /> Start run</button>
            <button type="button" className="opa-btn ghost" disabled={busy || !selectedId} onClick={validateScenario}>Validate</button>
          </div>
          <Panel title="Scenarios" flush loading={scenarios.loading} empty={!scenarios.loading && !scnRows.length} emptyText="Build a scenario in Design">
            <DataTable columns={scnCols} rows={scnRows} rowKey={(r) => r.id} />
          </Panel>
        </Panel>
      )}

      {tab === 'Results' && (
        <>
          <div className="opa-grid cols-4">
            <KpiTile label="Samples" value={fmtNum(liveKPIs.n)} status="neutral" />
            <KpiTile label="p95 ms" value={fmtNum(liveKPIs.p95)} status={liveKPIs.p95 > (form.sla.p95_ms || 500) ? 'warn' : 'ok'} />
            <KpiTile label="Error rate" value={fmtNum(liveKPIs.err)} status={liveKPIs.err > (form.sla.error_rate_max || 0.05) ? 'error' : 'ok'} />
            <KpiTile label="Run status" value={runDetail?.status || '—'} status="neutral" />
          </div>
          <Panel title="Active run">
            <div style={{ padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="opa-mono" style={{ fontSize: 12 }}>{activeRunId || 'No run selected'}</span>
              {activeRunId && <Link to={`/traces?load_run_id=${encodeURIComponent(activeRunId)}`}>Open traces for this run</Link>}
              {activeRunId && (
                <button type="button" className="opa-btn ghost" onClick={async () => {
                  const { data } = await axios.get(`${API}/api/perf/runs/${encodeURIComponent(activeRunId)}/gate`)
                  setMsg(data)
                }}>SLA gate</button>
              )}
            </div>
          </Panel>
          <Panel title="Runs" flush loading={runs.loading} empty={!runs.loading && !runRows.length} emptyText="Start a run">
            <DataTable columns={runCols} rows={runRows} rowKey={(r) => r.id} />
          </Panel>
        </>
      )}

      {tab === 'Compare' && (
        <Panel title="Compare runs">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12, alignItems: 'center' }}>
            <select value={compareA} onChange={(e) => setCompareA(e.target.value)}>
              <option value="">Run A…</option>
              {runRows.map((r) => <option key={r.id} value={r.id}>{String(r.id).slice(0, 20)} · {r.status}</option>)}
            </select>
            <select value={compareB} onChange={(e) => setCompareB(e.target.value)}>
              <option value="">Run B…</option>
              {runRows.map((r) => <option key={r.id} value={r.id}>{String(r.id).slice(0, 20)} · {r.status}</option>)}
            </select>
            {compareA && <Link to={`/traces?load_run_id=${encodeURIComponent(compareA)}`}>Traces A</Link>}
            {compareB && <Link to={`/traces?load_run_id=${encodeURIComponent(compareB)}`}>Traces B</Link>}
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
                ]}
                rows={baseRows}
                rowKey={(r) => r.id || `${r.service}:${r.metric}`}
                maxHeight={200}
              />
            </div>
          )}
        </Panel>
      )}

      {msg && (
        <Panel title="Result">
          <pre className="opa-mono" style={{ padding: 12, fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(msg, null, 2)}</pre>
        </Panel>
      )}
    </div>
  )
}
