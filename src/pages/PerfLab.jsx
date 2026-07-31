import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  FiZap, FiPlay, FiPlus, FiTrash2, FiUpload, FiDownload, FiCheck,
  FiActivity, FiDatabase, FiSettings, FiBarChart2, FiGitBranch, FiShield,
  FiLayers, FiX,
} from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, DataTable, Badge, StatusPill, Tabs, EmptyState,
} from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { fmtNum, fmtAgo } from '../theme/format'
import './PerfLab.css'

const API = import.meta.env.VITE_API_URL || ''

const TAB_DEFS = [
  { value: 'design', label: 'Design', icon: <FiLayers size={13} /> },
  { value: 'users', label: 'Users & data', icon: <FiDatabase size={13} /> },
  { value: 'capture', label: 'Capture', icon: <FiActivity size={13} /> },
  { value: 'jmx', label: 'JMX', icon: <FiSettings size={13} /> },
  { value: 'run', label: 'Run & scale', icon: <FiPlay size={13} /> },
  { value: 'results', label: 'Results', icon: <FiBarChart2 size={13} /> },
  { value: 'compare', label: 'Compare', icon: <FiGitBranch size={13} /> },
  { value: 'sla', label: 'SLA gates', icon: <FiShield size={13} /> },
]

const STRESS_PRESETS = [
  { id: '', label: 'Custom', hint: 'Use form VUs / duration', vus: null, profile: '', workers: null },
  { id: 'smoke', label: 'Smoke', hint: '2 VUs · 30s · 1 worker', vus: 2, profile: '', workers: 1, duration: 30 },
  { id: 'ramp', label: 'Ramp', hint: 'Profile ramp · current VUs', vus: null, profile: 'ramp', workers: null },
  { id: 'soak', label: 'Soak', hint: 'Steady load · ≥5 VUs', vus: 10, profile: 'soak', workers: 2, duration: 300 },
  { id: 'spike', label: 'Spike', hint: 'Burst ≥50 VUs', vus: 50, profile: 'spike', workers: 4, duration: 60 },
  { id: 'stress', label: 'Stress', hint: 'Scale workers + VUs', vus: 40, profile: 'ramp', workers: 4, duration: 120 },
]

const emptyStep = () => ({
  type: 'http',
  name: 'Request',
  method: 'GET',
  url: `${API || 'http://127.0.0.1:8080'}/api/health`,
  body: '',
  think_ms: 50,
  headers: {},
  selector_type: '',
  selector: '',
  page_url: '',
  ui_action: '',
})

function headersToText(headers) {
  if (!headers || typeof headers !== 'object') return ''
  return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')
}

function textToHeaders(text) {
  const out = {}
  String(text || '').split('\n').forEach((line) => {
    const i = line.indexOf(':')
    if (i <= 0) return
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim()
    if (k) out[k] = v
  })
  return out
}

function parseJSONField(raw, fallback) {
  try {
    if (raw == null || raw === '') return fallback
    return typeof raw === 'string' ? JSON.parse(raw || 'null') ?? fallback : raw
  } catch {
    return fallback
  }
}

/**
 * Perf Lab studio — visual scenario builder → Docker JMeter containers.
 * JMX remains the exportable source of truth; users design with forms + selectors.
 */
export default function PerfLab() {
  const toast = useToast()
  const scenarios = useApi('/api/perf/scenarios', {}, { noRange: true })
  const runs = useApi('/api/perf/runs', {}, { noRange: true })
  const baselines = useApi('/api/performance/baselines', {}, { noRange: true })

  const [tab, setTab] = useState('design')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(null)
  const [fanout, setFanout] = useState(false)
  const [profile, setProfile] = useState('')
  const [engine, setEngine] = useState('jmeter')
  const [workers, setWorkers] = useState(1)
  const [dispatch, setDispatch] = useState(true)
  const [preset, setPreset] = useState('')
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [activeRunId, setActiveRunId] = useState('')
  const [runDetail, setRunDetail] = useState(null)
  const [samples, setSamples] = useState([])
  const [gateResult, setGateResult] = useState(null)
  const [captureIncludeStatic, setCaptureIncludeStatic] = useState(false)
  const [captureDryRun, setCaptureDryRun] = useState(true)
  const [capturePreview, setCapturePreview] = useState(null)

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
  const engineLabel = scenarios.data?.engine || engine
  const runnerLabel = scenarios.data?.runner || 'docker'

  const flash = (tone, title, detail) => {
    setBanner({ tone, title, detail })
    toast.push(title, { tone: tone === 'error' ? 'error' : 'neutral' })
  }

  const parseSummary = (r) => parseJSONField(r?.summary_json, {})

  const compare = useMemo(() => {
    if (!compareA || !compareB) return null
    const a = runRows.find((r) => r.id === compareA)
    const b = runRows.find((r) => r.id === compareB)
    if (!a || !b) return null
    const sa = parseSummary(a)
    const sb = parseSummary(b)
    const delta = (x, y) => (Number(y) || 0) - (Number(x) || 0)
    return {
      a: { id: a.id, ...sa, vus: a.vus, status: a.status },
      b: { id: b.id, ...sb, vus: b.vus, status: b.status },
      d_p95: delta(sa.p95_ms, sb.p95_ms),
      d_p50: delta(sa.p50_ms, sb.p50_ms),
      d_err: delta(sa.error_rate, sb.error_rate),
      d_n: delta(sa.samples || sa.n, sb.samples || sb.n),
    }
  }, [compareA, compareB, runRows])

  const liveKPIs = useMemo(() => {
    if (!samples.length) return { n: 0, p50: 0, p95: 0, p99: 0, err: 0 }
    const lats = samples.map((s) => Number(s.latency_ms) || 0).sort((a, b) => a - b)
    const errors = samples.filter((s) => !s.ok && s.ok !== 1).length
    const pct = (p) => {
      if (!lats.length) return 0
      const idx = Math.min(lats.length - 1, Math.ceil(p * lats.length) - 1)
      return lats[Math.max(0, idx)] || 0
    }
    return {
      n: samples.length,
      p50: pct(0.5),
      p95: pct(0.95),
      p99: pct(0.99),
      err: samples.length ? errors / samples.length : 0,
    }
  }, [samples])

  useEffect(() => {
    if (!activeRunId || (tab !== 'results' && tab !== 'sla')) return undefined
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

  const moveStep = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= form.steps.length) return
    const steps = [...form.steps]
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    setForm({ ...form, steps })
  }

  const applyPreset = (id) => {
    setPreset(id)
    const p = STRESS_PRESETS.find((x) => x.id === id)
    if (!p) return
    if (p.profile != null) setProfile(p.profile)
    if (p.workers != null) setWorkers(p.workers)
    const patch = {}
    if (p.vus != null) patch.vus = p.vus
    if (p.duration != null) patch.duration_seconds = p.duration
    if (Object.keys(patch).length) setForm((f) => ({ ...f, ...patch }))
  }

  const saveScenario = async () => {
    setBusy(true)
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
      if (data.id) setSelectedId(data.id)
      flash('ok', 'Scenario saved', data.honesty || `id=${data.id}`)
      scenarios.reload?.()
    } catch (e) {
      flash('error', 'Save failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const loadScenario = async (id) => {
    setBusy(true)
    try {
      const { data } = await axios.get(`${API}/api/perf/scenarios/${encodeURIComponent(id)}`)
      let steps = parseJSONField(data.steps_json, [])
      if (!Array.isArray(steps) || !steps.length) {
        steps = [{
          type: 'http', name: 'Request', method: data.method || 'GET',
          url: data.target_url, body: data.body || '', think_ms: 50, headers: {},
        }]
      }
      steps = steps.map((s) => ({
        ...emptyStep(),
        ...s,
        headers: s.headers && typeof s.headers === 'object' ? s.headers : {},
      }))
      const datasets = parseJSONField(data.datasets_json, form.datasets)
      const sla = parseJSONField(data.sla_json, form.sla)
      const schedule = parseJSONField(data.schedule_json, form.schedule)
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
        schedule: { ramp_seconds: 10, ...schedule },
        jmx_xml: data.jmx_xml || '',
      })
      setTab('design')
      flash('ok', `Loaded ${data.name || id}`, id)
    } catch (e) {
      flash('error', 'Load failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const importJmxFile = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const { data } = await axios.post(
        `${API}/api/perf/scenarios/import-jmx?name=${encodeURIComponent(file.name.replace(/\.jmx$/i, ''))}`,
        { name: file.name.replace(/\.jmx$/i, ''), jmx: text },
      )
      if (data.id) {
        setSelectedId(data.id)
        await loadScenario(data.id)
      }
      flash('ok', 'JMX imported', data.honesty || data.id)
      scenarios.reload?.()
    } catch (e) {
      flash('error', 'JMX import failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const importCaptureFile = async (kind, file) => {
    if (!file) return
    setBusy(true)
    setCapturePreview(null)
    try {
      const text = await file.text()
      let body
      try {
        body = JSON.parse(text)
      } catch {
        throw new Error('File must be JSON (HAR or XHR array)')
      }
      const q = new URLSearchParams()
      q.set('name', file.name.replace(/\.(har|json)$/i, ''))
      if (captureDryRun) q.set('dry_run', '1')
      if (captureIncludeStatic) q.set('include_static', '1')
      if (selectedId && !captureDryRun) q.set('id', selectedId)
      const payload = kind === 'har'
        ? (body.log ? body : { har: body })
        : (Array.isArray(body) ? { xhr: body } : body)
      const { data } = await axios.post(
        `${API}/api/perf/scenarios/import-${kind}?${q}`,
        payload,
      )
      setCapturePreview(data)
      if (!captureDryRun && data.id) {
        setSelectedId(data.id)
        await loadScenario(data.id)
        scenarios.reload?.()
      } else if (data.steps?.length) {
        setForm((f) => ({
          ...f,
          name: data.scenario?.name || f.name,
          steps: data.steps.map((s) => ({ ...emptyStep(), ...s, headers: s.headers || {} })),
        }))
        setTab('design')
      }
      flash('ok', `${kind.toUpperCase()} ${captureDryRun ? 'preview' : 'imported'}`, `${data.count || data.steps?.length || 0} steps`)
    } catch (e) {
      flash('error', `${kind.toUpperCase()} import failed`, e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const applyCapturePreview = () => {
    const steps = capturePreview?.steps || capturePreview?.scenario?.steps
    if (!steps?.length) return
    setForm((f) => ({
      ...f,
      name: capturePreview.scenario?.name || f.name,
      steps: steps.map((s) => ({ ...emptyStep(), ...s, headers: s.headers || {} })),
    }))
    setTab('design')
    flash('ok', 'Steps applied to designer', `${steps.length} steps`)
  }

  const validateScenario = async () => {
    if (!selectedId) { flash('warn', 'Save the scenario first'); return }
    setBusy(true)
    try {
      const { data } = await axios.post(`${API}/api/perf/scenarios/${encodeURIComponent(selectedId)}/validate`)
      flash(data.ok === false ? 'error' : 'ok', 'Validation finished', JSON.stringify(data).slice(0, 400))
      setTab('results')
    } catch (e) {
      flash('error', 'Validate failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const startRun = async (scenarioId) => {
    const sid = scenarioId || selectedId
    if (!sid) { flash('warn', 'Save or select a scenario first'); return }
    setBusy(true)
    try {
      const { data } = await axios.post(`${API}/api/perf/runs`, {
        scenario_id: sid,
        vus: form.vus,
        fanout,
        profile: profile || undefined,
        engine,
        dispatch,
        workers: engine === 'jmeter' ? Number(workers) || 1 : undefined,
        schedule: form.schedule,
      })
      const rid = data.load_run_id || data.id
      if (rid) {
        setActiveRunId(rid)
        setTab('results')
      }
      const dispatched = data.dispatch?.dispatched
      flash(
        dispatched === false && data.dispatch?.error ? 'warn' : 'ok',
        dispatched ? 'Run dispatched' : 'Run created',
        data.honesty || rid,
      )
      runs.reload?.()
    } catch (e) {
      flash('error', 'Start run failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const downloadJmx = () => {
    if (!selectedId) return
    window.open(`${API}/api/perf/scenarios/${encodeURIComponent(selectedId)}/export-jmx`, '_blank')
  }

  const downloadCapture = (kind) => {
    if (!selectedId) return
    window.open(`${API}/api/perf/scenarios/${encodeURIComponent(selectedId)}/export-${kind}`, '_blank')
  }

  const evaluateGate = async (runId) => {
    const rid = runId || activeRunId
    if (!rid) { flash('warn', 'Select a run first'); return }
    setBusy(true)
    try {
      const { data } = await axios.get(`${API}/api/perf/runs/${encodeURIComponent(rid)}/gate`)
      setGateResult(data)
      setTab('sla')
      flash(data.pass ? 'ok' : 'error', data.pass ? 'SLA passed' : 'SLA failed', (data.reasons || []).join('; ') || rid)
    } catch (e) {
      flash('error', 'Gate failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const scnCols = [
    {
      key: 'name', header: 'Name',
      render: (r) => (
        <button type="button" className="opa-btn ghost" onClick={() => loadScenario(r.id)} style={{ padding: 0 }}>
          <span className="cell-strong">{r.name}</span>
        </button>
      ),
    },
    { key: 'vus', header: 'VUs', num: true },
    { key: 'duration_seconds', header: 'Dur', num: true },
    { key: 'jmx_bytes', header: 'JMX', num: true, render: (r) => fmtNum(r.jmx_bytes || 0) },
    {
      key: 'id', header: '',
      render: (r) => (
        <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => startRun(r.id)} aria-label={`Start ${r.name}`}>
          <FiPlay size={12} /> Start
        </button>
      ),
    },
  ]

  const runCols = [
    {
      key: 'id', header: 'Run',
      render: (r) => (
        <button
          type="button"
          className="opa-btn ghost opa-mono"
          style={{ fontSize: 11 }}
          onClick={() => { setActiveRunId(r.id); setTab('results') }}
        >
          {String(r.id).slice(0, 18)}
        </button>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'vus', header: 'VUs', num: true },
    {
      key: 'summary_json', header: 'Summary',
      render: (r) => {
        const s = parseSummary(r)
        return <span className="opa-mono" style={{ fontSize: 11 }}>p95={fmtNum(s.p95_ms)} err={fmtNum(s.error_rate)}</span>
      },
    },
    { key: 'started_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.started_at)}</span> },
    {
      key: 'id2', header: 'Traces',
      render: (r) => <Link to={`/traces?load_run_id=${encodeURIComponent(r.id)}`}>Open traces</Link>,
    },
  ]

  const sampleCols = [
    { key: 'label', header: 'Label', render: (r) => r.label || r.name || r.url || '—' },
    { key: 'latency_ms', header: 'ms', num: true, render: (r) => fmtNum(r.latency_ms) },
    {
      key: 'ok', header: 'OK',
      render: (r) => <StatusPill tone={r.ok || r.ok === 1 ? 'ok' : 'error'}>{r.ok || r.ok === 1 ? 'ok' : 'err'}</StatusPill>,
    },
    { key: 'ts', header: 'When', render: (r) => <span className="opa-muted">{fmtAgo(r.ts || r.t || r.started_at)}</span> },
  ]

  return (
    <div className="opa-stack perf-studio">
      <header className="perf-studio-hero">
        <div className="perf-studio-hero-main">
          <div className="perf-studio-kicker">Performance studio</div>
          <h1 className="opa-page-title">Perf lab</h1>
          <p className="opa-page-sub">
            Design scenarios visually, parameterize datasets, scale Docker load engines, and gate on SLA.
          </p>
          <div className="perf-studio-meta">
            <span className="perf-chip">Engine <strong>{engineLabel}</strong></span>
            <span className="perf-chip">Runner <strong>{runnerLabel}</strong></span>
            <span className="perf-chip">Scenarios <strong>{fmtNum(scnRows.length)}</strong></span>
            <span className="perf-chip">Runs <strong>{fmtNum(runRows.length)}</strong></span>
            {selectedId && (
              <span className="perf-chip">Active <strong className="opa-mono">{String(selectedId).slice(0, 16)}</strong></span>
            )}
          </div>
        </div>
        <div className="perf-studio-actions">
          <button type="button" className="opa-btn" disabled={busy} onClick={saveScenario} aria-label="Save scenario">
            Save scenario
          </button>
          <button type="button" className="opa-btn ghost" disabled={busy || !selectedId} onClick={validateScenario} aria-label="Validate one virtual user">
            <FiCheck size={12} /> Validate 1 VU
          </button>
          <button type="button" className="opa-btn primary" disabled={busy || !selectedId} onClick={() => startRun()} aria-label="Start load run">
            <FiPlay size={12} /> Start run
          </button>
        </div>
      </header>

      {banner && (
        <div className={`perf-banner ${banner.tone || ''}`} role="status">
          <div className="perf-banner-body">
            <div className="perf-banner-title">{banner.title}</div>
            {banner.detail && <div className="perf-banner-detail">{typeof banner.detail === 'string' ? banner.detail : JSON.stringify(banner.detail)}</div>}
          </div>
          <button type="button" className="opa-btn ghost" aria-label="Dismiss" onClick={() => setBanner(null)}><FiX size={14} /></button>
        </div>
      )}

      <div className="opa-grid cols-4">
        <KpiTile label="Scenarios" icon={<FiZap size={12} />} value={fmtNum(scnRows.length)} status="neutral" />
        <KpiTile label="Runs" icon={<FiPlay size={12} />} value={fmtNum(runRows.length)} status="neutral" />
        <KpiTile label="Live samples" icon={<FiActivity size={12} />} value={fmtNum(liveKPIs.n)} status="neutral" />
        <KpiTile
          label="Active run"
          icon={<FiBarChart2 size={12} />}
          value={runDetail?.status || (activeRunId ? '…' : '—')}
          status={runDetail?.status === 'failed' ? 'error' : runDetail?.status === 'passed' || runDetail?.status === 'ok' ? 'ok' : 'neutral'}
        />
      </div>

      <Tabs tabs={TAB_DEFS} value={tab} onChange={setTab} />

      {tab === 'design' && (
        <div className="perf-split">
          <Panel
            title="Scenario builder"
            icon={<FiPlus />}
            actions={(
              <>
                <button type="button" className="opa-btn ghost" onClick={() => addStep('http')}><FiPlus size={12} /> HTTP</button>
                <button type="button" className="opa-btn ghost" onClick={() => addStep('extract')}>Extract</button>
                <button type="button" className="opa-btn ghost" onClick={() => addStep('assert')}>Assert</button>
                <button type="button" className="opa-btn ghost" onClick={() => addStep('transaction')}>Txn</button>
              </>
            )}
          >
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="perf-field-grid">
                <div className="perf-field span-2">
                  <label htmlFor="perf-name">Scenario name</label>
                  <input id="perf-name" className="opa-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="perf-field">
                  <label htmlFor="perf-vus">Virtual users</label>
                  <input id="perf-vus" className="opa-input" type="number" min={1} value={form.vus} onChange={(e) => setForm({ ...form, vus: Number(e.target.value) })} />
                </div>
                <div className="perf-field">
                  <label htmlFor="perf-dur">Duration (s)</label>
                  <input id="perf-dur" className="opa-input" type="number" min={1} value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} />
                </div>
                <div className="perf-field">
                  <label htmlFor="perf-ramp">Ramp-up (s)</label>
                  <input
                    id="perf-ramp"
                    className="opa-input"
                    type="number"
                    min={0}
                    value={form.schedule?.ramp_seconds ?? 10}
                    onChange={(e) => setForm({ ...form, schedule: { ...form.schedule, ramp_seconds: Number(e.target.value) } })}
                  />
                </div>
                <div className="perf-field">
                  <label htmlFor="perf-p95">SLA p95 (ms)</label>
                  <input id="perf-p95" className="opa-input" type="number" value={form.sla.p95_ms} onChange={(e) => setForm({ ...form, sla: { ...form.sla, p95_ms: Number(e.target.value) } })} />
                </div>
                <div className="perf-field">
                  <label htmlFor="perf-err">Max error rate</label>
                  <input id="perf-err" className="opa-input" type="number" step="0.01" value={form.sla.error_rate_max} onChange={(e) => setForm({ ...form, sla: { ...form.sla, error_rate_max: Number(e.target.value) } })} />
                </div>
              </div>

              <p className="perf-hint">
                Add HTTP steps, extractors, and asserts. Optional CSS/XPath selectors correlate recorded UI actions with requests.
                Saving generates JMX for Docker execution.
              </p>

              {!form.steps.length ? (
                <div className="perf-empty-cta">
                  <div className="title">No steps yet</div>
                  <div className="perf-hint">Start with an HTTP request, or import traffic from Capture.</div>
                  <button type="button" className="opa-btn primary" onClick={() => addStep('http')}><FiPlus size={12} /> Add HTTP step</button>
                </div>
              ) : (
                <div className="perf-step-list">
                  {form.steps.map((step, i) => (
                    <div className="perf-step" key={`step-${i}`}>
                      <div className="perf-step-head">
                        <span className="perf-step-num">{i + 1}</span>
                        <select className="opa-input" aria-label="Step type" value={step.type || 'http'} onChange={(e) => setStep(i, { type: e.target.value })}>
                          <option value="http">HTTP request</option>
                          <option value="extract">Extract variable</option>
                          <option value="assert">Assert</option>
                          <option value="transaction">Transaction label</option>
                        </select>
                        <input className="opa-input" style={{ flex: 1, minWidth: 120 }} value={step.name || ''} onChange={(e) => setStep(i, { name: e.target.value })} placeholder="Step name" aria-label="Step name" />
                        <button type="button" className="opa-btn ghost" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Move step up">↑</button>
                        <button type="button" className="opa-btn ghost" disabled={i === form.steps.length - 1} onClick={() => moveStep(i, 1)} aria-label="Move step down">↓</button>
                        <button type="button" className="opa-btn ghost" onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })} aria-label="Remove step"><FiTrash2 size={12} /></button>
                      </div>
                      <div className="perf-step-body">
                        {(step.type === 'http' || !step.type) && (
                          <>
                            <div className="perf-field-grid wide">
                              <div className="perf-field">
                                <label>Method</label>
                                <select className="opa-input" value={step.method || 'GET'} onChange={(e) => setStep(i, { method: e.target.value })}>
                                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </div>
                              <div className="perf-field span-3">
                                <label>URL</label>
                                <input className="opa-input" value={step.url || ''} onChange={(e) => setStep(i, { url: e.target.value })} placeholder="https://… or ${token}" />
                              </div>
                              <div className="perf-field">
                                <label>Think time (ms)</label>
                                <input className="opa-input" type="number" value={step.think_ms || 0} onChange={(e) => setStep(i, { think_ms: Number(e.target.value) })} />
                              </div>
                              <div className="perf-field span-3">
                                <label>Body</label>
                                <input className="opa-input" value={step.body || ''} onChange={(e) => setStep(i, { body: e.target.value })} placeholder="Optional request body" />
                              </div>
                              <div className="perf-field span-3">
                                <label>Headers (Name: value per line)</label>
                                <textarea
                                  className="opa-input opa-mono"
                                  rows={2}
                                  value={headersToText(step.headers)}
                                  onChange={(e) => setStep(i, { headers: textToHeaders(e.target.value) })}
                                  placeholder={'Authorization: Bearer ${token}\nContent-Type: application/json'}
                                />
                              </div>
                            </div>
                            <div className="perf-field-grid wide">
                              <div className="perf-field">
                                <label>UI selector type</label>
                                <select className="opa-input" value={step.selector_type || ''} onChange={(e) => setStep(i, { selector_type: e.target.value })}>
                                  <option value="">—</option>
                                  <option value="css">CSS</option>
                                  <option value="xpath">XPath</option>
                                </select>
                              </div>
                              <div className="perf-field span-2">
                                <label>Selector</label>
                                <input className="opa-input opa-mono" value={step.selector || ''} onChange={(e) => setStep(i, { selector: e.target.value })} placeholder="#login-btn or //button[@id='save']" />
                              </div>
                              <div className="perf-field">
                                <label>UI action</label>
                                <select className="opa-input" value={step.ui_action || ''} onChange={(e) => setStep(i, { ui_action: e.target.value })}>
                                  <option value="">—</option>
                                  <option value="click">click</option>
                                  <option value="fill">fill</option>
                                  <option value="submit">submit</option>
                                  <option value="navigate">navigate</option>
                                </select>
                              </div>
                              <div className="perf-field span-3">
                                <label>Page URL (context)</label>
                                <input className="opa-input" value={step.page_url || ''} onChange={(e) => setStep(i, { page_url: e.target.value })} placeholder="https://app.example.com/login" />
                              </div>
                            </div>
                          </>
                        )}
                        {step.type === 'extract' && (
                          <div className="perf-field-grid wide">
                            <div className="perf-field">
                              <label>Engine</label>
                              <select className="opa-input" value={step.engine || 'regex'} onChange={(e) => setStep(i, { engine: e.target.value })}>
                                <option value="regex">Regex</option>
                                <option value="jsonpath">JSONPath</option>
                              </select>
                            </div>
                            <div className="perf-field span-2">
                              <label>Expression</label>
                              <input className="opa-input opa-mono" value={step.expression || ''} onChange={(e) => setStep(i, { expression: e.target.value })} />
                            </div>
                            <div className="perf-field">
                              <label>Variable</label>
                              <input className="opa-input" value={step.var || ''} onChange={(e) => setStep(i, { var: e.target.value })} />
                            </div>
                          </div>
                        )}
                        {step.type === 'assert' && (
                          <div className="perf-field-grid wide">
                            <div className="perf-field">
                              <label>Status code</label>
                              <input className="opa-input" type="number" value={step.status || 200} onChange={(e) => setStep(i, { status: Number(e.target.value) })} />
                            </div>
                            <div className="perf-field span-3">
                              <label>Body contains</label>
                              <input className="opa-input" value={step.body_contains || ''} onChange={(e) => setStep(i, { body_contains: e.target.value })} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="perf-step-toolbar">
                <button type="button" className="opa-btn primary" disabled={busy} onClick={saveScenario}>Save (generates JMX)</button>
                <button type="button" className="opa-btn ghost" disabled={busy || !selectedId} onClick={validateScenario}><FiCheck size={12} /> Validate 1 VU</button>
                <button type="button" className="opa-btn ghost" onClick={() => setTab('capture')}>Import from Capture</button>
              </div>
            </div>
          </Panel>

          <Panel title="Scenarios" flush loading={scenarios.loading} empty={!scenarios.loading && !scnRows.length} emptyText="Save a scenario to see it listed here">
            <DataTable columns={scnCols} rows={scnRows} rowKey={(r) => r.id} maxHeight={480} />
          </Panel>
        </div>
      )}

      {tab === 'users' && (
        <Panel title="Virtual users & datasets">
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="perf-field-grid">
              <div className="perf-field">
                <label htmlFor="users-vus">Virtual users</label>
                <input id="users-vus" className="opa-input" type="number" min={1} value={form.vus} onChange={(e) => setForm({ ...form, vus: Number(e.target.value) })} />
              </div>
              <div className="perf-field">
                <label htmlFor="users-ramp">Ramp-up (s)</label>
                <input
                  id="users-ramp"
                  className="opa-input"
                  type="number"
                  min={0}
                  value={form.schedule?.ramp_seconds ?? 10}
                  onChange={(e) => setForm({ ...form, schedule: { ...form.schedule, ramp_seconds: Number(e.target.value) } })}
                />
              </div>
              <div className="perf-field">
                <label htmlFor="users-dur">Duration (s)</label>
                <input id="users-dur" className="opa-input" type="number" min={1} value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} />
              </div>
              <div className="perf-field">
                <label htmlFor="users-recycle">CSV recycle</label>
                <select
                  id="users-recycle"
                  className="opa-input"
                  value={form.datasets.csv?.recycle ? '1' : '0'}
                  onChange={(e) => setForm({
                    ...form,
                    datasets: { ...form.datasets, csv: { ...form.datasets.csv, recycle: e.target.value === '1' } },
                  })}
                >
                  <option value="1">Yes — loop rows</option>
                  <option value="0">No — stop when exhausted</option>
                </select>
              </div>
            </div>
            <div className="perf-field">
              <label htmlFor="csv-cols">Column names</label>
              <input
                id="csv-cols"
                className="opa-input"
                value={form.datasets.csv?.variableNames || ''}
                onChange={(e) => setForm({ ...form, datasets: { ...form.datasets, csv: { ...form.datasets.csv, variableNames: e.target.value } } })}
                placeholder="user,password,token"
              />
            </div>
            <div className="perf-field">
              <label htmlFor="csv-data">CSV rows</label>
              <textarea
                id="csv-data"
                className="opa-input opa-mono"
                rows={10}
                value={form.datasets.csv?.inline || ''}
                onChange={(e) => setForm({ ...form, datasets: { ...form.datasets, csv: { ...form.datasets.csv, inline: e.target.value } } })}
                placeholder={'user1,secret1,tok1\nuser2,secret2,tok2'}
              />
            </div>
            <p className="perf-hint">Reference columns as {'${user}'} in URLs, headers, and bodies after save.</p>
            <div>
              <button type="button" className="opa-btn primary" disabled={busy} onClick={saveScenario}>Save users & datasets</button>
            </div>
          </div>
        </Panel>
      )}

      {tab === 'capture' && (
        <Panel title="Capture → steps">
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="perf-hint">
              Import a browser HAR or an XHR/fetch JSON log. Entries become HTTP steps with optional UI selector metadata.
              Prefer dry-run preview before persisting.
            </p>
            <div className="perf-field-grid">
              <div className="perf-field">
                <label>Mode</label>
                <select className="opa-input" value={captureDryRun ? 'dry' : 'save'} onChange={(e) => setCaptureDryRun(e.target.value === 'dry')}>
                  <option value="dry">Dry-run preview</option>
                  <option value="save">Persist scenario</option>
                </select>
              </div>
              <div className="perf-field">
                <label>Static assets</label>
                <select className="opa-input" value={captureIncludeStatic ? '1' : '0'} onChange={(e) => setCaptureIncludeStatic(e.target.value === '1')}>
                  <option value="0">Skip CSS/JS/images</option>
                  <option value="1">Include static</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <label className="opa-btn">
                <FiUpload size={12} /> Import .har
                <input type="file" accept=".har,application/json,text/json" hidden onChange={(e) => importCaptureFile('har', e.target.files?.[0])} />
              </label>
              <label className="opa-btn ghost">
                <FiUpload size={12} /> Import XHR JSON
                <input type="file" accept=".json,application/json" hidden onChange={(e) => importCaptureFile('xhr', e.target.files?.[0])} />
              </label>
              <button type="button" className="opa-btn ghost" disabled={!selectedId} onClick={() => downloadCapture('har')}><FiDownload size={12} /> Export HAR</button>
              <button type="button" className="opa-btn ghost" disabled={!selectedId} onClick={() => downloadCapture('xhr')}><FiDownload size={12} /> Export XHR</button>
            </div>
            {capturePreview && (
              <div>
                <div className="perf-hint" style={{ marginBottom: 8 }}>
                  Preview: {fmtNum(capturePreview.count || capturePreview.steps?.length || 0)} steps
                  {(capturePreview.warnings || []).length ? ` · ${(capturePreview.warnings || []).join(' · ')}` : ''}
                </div>
                <DataTable
                  columns={[
                    { key: 'method', header: 'Method', render: (r) => r.method || 'GET' },
                    { key: 'url', header: 'URL', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{r.url}</span> },
                    { key: 'selector', header: 'Selector', render: (r) => r.selector || '—' },
                  ]}
                  rows={(capturePreview.steps || capturePreview.scenario?.steps || []).slice(0, 50)}
                  rowKey={(_, i) => i}
                  maxHeight={240}
                />
                {captureDryRun && (
                  <button type="button" className="opa-btn" style={{ marginTop: 8 }} onClick={applyCapturePreview}>Apply steps to Design</button>
                )}
              </div>
            )}
            {!capturePreview && (
              <EmptyState title="No capture loaded" hint="Drop a HAR from DevTools or an XHR JSON export to seed the designer." />
            )}
          </div>
        </Panel>
      )}

      {tab === 'jmx' && (
        <Panel title="JMX source of truth">
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="perf-hint">
              Prefer Design and Capture. Paste or import a .jmx only when you already have one.
              Export downloads Agent-generated JMX used by Docker workers.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label className="opa-btn ghost">
                <FiUpload size={12} /> Import .jmx
                <input type="file" accept=".jmx,application/xml,text/xml" hidden onChange={(e) => importJmxFile(e.target.files?.[0])} />
              </label>
              <button type="button" className="opa-btn ghost" disabled={!selectedId} onClick={downloadJmx}><FiDownload size={12} /> Export .jmx</button>
            </div>
            <textarea
              className="opa-input opa-mono"
              rows={16}
              style={{ fontSize: 11 }}
              value={form.jmx_xml}
              onChange={(e) => setForm({ ...form, jmx_xml: e.target.value })}
              placeholder="Generated on Save, or paste JMX XML here"
              aria-label="JMX XML"
            />
            <button type="button" className="opa-btn" disabled={busy} onClick={saveScenario}>Save JMX</button>
          </div>
        </Panel>
      )}

      {tab === 'run' && (
        <>
          <Panel title="Run & scale">
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div className="perf-hint" style={{ marginBottom: 8 }}>Stress presets</div>
                <div className="perf-preset-row">
                  {STRESS_PRESETS.map((p) => (
                    <button
                      key={p.id || 'custom'}
                      type="button"
                      className={`perf-preset ${preset === p.id ? 'active' : ''}`}
                      onClick={() => applyPreset(p.id)}
                    >
                      <strong>{p.label}</strong>
                      {p.hint}
                    </button>
                  ))}
                </div>
              </div>
              <div className="perf-field-grid">
                <div className="perf-field">
                  <label>Dispatch now</label>
                  <select className="opa-input" value={dispatch ? '1' : '0'} onChange={(e) => setDispatch(e.target.value === '1')}>
                    <option value="1">Yes — spawn engine</option>
                    <option value="0">No — create run id only</option>
                  </select>
                </div>
                <div className="perf-field">
                  <label>Engine</label>
                  <select className="opa-input" value={engine} onChange={(e) => setEngine(e.target.value)}>
                    <option value="jmeter">Docker JMeter</option>
                    <option value="node">Node fallback (dev-only)</option>
                  </select>
                </div>
                <div className="perf-field">
                  <label>Profile</label>
                  <select className="opa-input" value={profile} onChange={(e) => setProfile(e.target.value)}>
                    <option value="">default</option>
                    <option value="soak">soak</option>
                    <option value="spike">spike</option>
                    <option value="ramp">ramp</option>
                  </select>
                </div>
                {engine === 'jmeter' && (
                  <div className="perf-field">
                    <label htmlFor="workers">Container workers</label>
                    <input id="workers" className="opa-input" type="number" min={1} max={16} value={workers} onChange={(e) => setWorkers(Number(e.target.value) || 1)} />
                  </div>
                )}
                <div className="perf-field">
                  <label>Virtual users</label>
                  <input className="opa-input" type="number" min={1} value={form.vus} onChange={(e) => setForm({ ...form, vus: Number(e.target.value) })} />
                </div>
                <div className="perf-field">
                  <label>Federation fan-out</label>
                  <select className="opa-input" value={fanout ? '1' : '0'} onChange={(e) => setFanout(e.target.value === '1')}>
                    <option value="0">Off</option>
                    <option value="1">Peers (≠ multi-region cloud)</option>
                  </select>
                </div>
              </div>
              <p className="perf-hint">
                Dispatch uses ephemeral JMeter containers. Workers split VUs across parallel containers sharing one load_run_id.
                Node requires OPA_PERF_ALLOW_NODE_FALLBACK=1.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="opa-btn primary" disabled={busy || !selectedId} onClick={() => startRun()} aria-label="Start load run">
                  <FiPlay size={12} /> Start run
                </button>
                <button type="button" className="opa-btn ghost" disabled={busy || !selectedId} onClick={validateScenario}>Validate</button>
              </div>
            </div>
          </Panel>
          <Panel title="Scenarios" flush loading={scenarios.loading} empty={!scenarios.loading && !scnRows.length} emptyText="Build a scenario in Design">
            <DataTable columns={scnCols} rows={scnRows} rowKey={(r) => r.id} />
          </Panel>
        </>
      )}

      {tab === 'results' && (
        <>
          <div className="opa-grid cols-4">
            <KpiTile label="Samples" value={fmtNum(liveKPIs.n)} status="neutral" />
            <KpiTile label="p50 ms" value={fmtNum(liveKPIs.p50)} status="neutral" />
            <KpiTile label="p95 ms" value={fmtNum(liveKPIs.p95)} status={liveKPIs.p95 > (form.sla.p95_ms || 500) ? 'warn' : 'ok'} />
            <KpiTile label="Error rate" value={fmtNum(liveKPIs.err)} status={liveKPIs.err > (form.sla.error_rate_max || 0.05) ? 'error' : 'ok'} />
          </div>
          <Panel title="Active run">
            <div style={{ padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="opa-mono" style={{ fontSize: 12 }}>{activeRunId || 'No run selected'}</span>
              <StatusPill tone="neutral">{runDetail?.status || '—'}</StatusPill>
              {activeRunId && <Link to={`/traces?load_run_id=${encodeURIComponent(activeRunId)}`}>Open traces</Link>}
              {activeRunId && (
                <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => evaluateGate(activeRunId)}>
                  <FiShield size={12} /> SLA gate
                </button>
              )}
              {!activeRunId && (
                <span className="perf-hint">Start a run or pick one from the table below.</span>
              )}
            </div>
          </Panel>
          {samples.length > 0 && (
            <Panel title="Live samples" flush>
              <DataTable columns={sampleCols} rows={samples.slice(0, 100)} rowKey={(r, i) => r.id || i} maxHeight={280} />
            </Panel>
          )}
          <Panel title="Runs" flush loading={runs.loading} empty={!runs.loading && !runRows.length} emptyText="Start a run from Run & scale">
            <DataTable columns={runCols} rows={runRows} rowKey={(r) => r.id} />
          </Panel>
        </>
      )}

      {tab === 'compare' && (
        <Panel title="Compare runs">
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="perf-compare-grid">
              <div className="perf-field">
                <label>Run A</label>
                <select className="opa-input" value={compareA} onChange={(e) => setCompareA(e.target.value)}>
                  <option value="">Select…</option>
                  {runRows.map((r) => <option key={r.id} value={r.id}>{String(r.id).slice(0, 22)} · {r.status}</option>)}
                </select>
              </div>
              <div className="perf-field">
                <label>Run B</label>
                <select className="opa-input" value={compareB} onChange={(e) => setCompareB(e.target.value)}>
                  <option value="">Select…</option>
                  {runRows.map((r) => <option key={r.id} value={r.id}>{String(r.id).slice(0, 22)} · {r.status}</option>)}
                </select>
              </div>
            </div>
            {compareA && <Link to={`/traces?load_run_id=${encodeURIComponent(compareA)}`}>Traces A</Link>}
            {compareB && <Link to={`/traces?load_run_id=${encodeURIComponent(compareB)}`}>Traces B</Link>}
            {!compare && (
              <EmptyState title="Pick two runs" hint="Compare percentiles and error rate deltas between A and B." />
            )}
            {compare && (
              <DataTable
                columns={[
                  { key: 'metric', header: 'Metric' },
                  { key: 'a', header: 'Run A', num: true },
                  { key: 'b', header: 'Run B', num: true },
                  {
                    key: 'd', header: 'Δ (B−A)', num: true,
                    render: (r) => <StatusPill tone={r.worse ? 'error' : 'ok'}>{r.d}</StatusPill>,
                  },
                ]}
                rows={[
                  { metric: 'p50 ms', a: fmtNum(compare.a.p50_ms), b: fmtNum(compare.b.p50_ms), d: fmtNum(compare.d_p50), worse: compare.d_p50 > 0 },
                  { metric: 'p95 ms', a: fmtNum(compare.a.p95_ms), b: fmtNum(compare.b.p95_ms), d: fmtNum(compare.d_p95), worse: compare.d_p95 > 0 },
                  { metric: 'Error rate', a: fmtNum(compare.a.error_rate), b: fmtNum(compare.b.error_rate), d: fmtNum(compare.d_err), worse: compare.d_err > 0 },
                  { metric: 'VUs', a: fmtNum(compare.a.vus), b: fmtNum(compare.b.vus), d: fmtNum((compare.b.vus || 0) - (compare.a.vus || 0)), worse: false },
                ]}
                rowKey={(r) => r.metric}
              />
            )}
            {baseRows.length > 0 && (
              <div>
                <div className="perf-hint" style={{ marginBottom: 6 }}>Stored baselines</div>
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
          </div>
        </Panel>
      )}

      {tab === 'sla' && (
        <Panel title="SLA gates">
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="perf-field-grid">
              <div className="perf-field">
                <label>p95 threshold (ms)</label>
                <input className="opa-input" type="number" value={form.sla.p95_ms} onChange={(e) => setForm({ ...form, sla: { ...form.sla, p95_ms: Number(e.target.value) } })} />
              </div>
              <div className="perf-field">
                <label>Max error rate</label>
                <input className="opa-input" type="number" step="0.01" value={form.sla.error_rate_max} onChange={(e) => setForm({ ...form, sla: { ...form.sla, error_rate_max: Number(e.target.value) } })} />
              </div>
              <div className="perf-field span-2">
                <label>Run</label>
                <select className="opa-input" value={activeRunId} onChange={(e) => setActiveRunId(e.target.value)}>
                  <option value="">Select run…</option>
                  {runRows.map((r) => <option key={r.id} value={r.id}>{String(r.id).slice(0, 24)} · {r.status}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="opa-btn" disabled={busy} onClick={saveScenario}>Save SLA on scenario</button>
              <button type="button" className="opa-btn primary" disabled={busy || !activeRunId} onClick={() => evaluateGate()}>
                <FiShield size={12} /> Evaluate gate
              </button>
            </div>
            <p className="perf-hint">Gate evaluation is fail-closed on the Agent — empty or in-flight summaries fail unless explicitly allowed.</p>
            {gateResult ? (
              <div>
                <StatusPill tone={gateResult.pass ? 'ok' : 'error'}>{gateResult.pass ? 'PASS' : 'FAIL'}</StatusPill>
                <div style={{ marginTop: 8 }}>
                  {(gateResult.reasons || ['No reasons returned']).map((reason, i) => (
                    <div className="perf-gate-row" key={i}>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
                {gateResult.summary && (
                  <pre className="opa-mono" style={{ fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(gateResult.summary, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <EmptyState title="No gate result yet" hint="Select a finished run and evaluate against the scenario SLA." />
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}
