import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import {
  FiRadio, FiPlus, FiCheck, FiX, FiEdit2, FiTrash2, FiActivity, FiAlertTriangle, FiClock, FiShield,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, DataTable, StatusPill, HealthDot, TimeSeriesChart, Badge,
} from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtAgo, latencyStatus } from '../theme/format'
import { tracesHref, traceHref } from '../utils/entityLinks'
import './Synthetics.css'

const API = import.meta.env.VITE_API_URL || ''

const EMPTY_FORM = {
  name: '', url: '', method: 'GET', interval_seconds: '60', timeout_ms: '10000',
  assert_status: '', assert_body_contains: '', assert_max_latency_ms: '',
  check_type: 'http', steps: '', location_id: '', body: '', cert_lead_days: '',
}

const uptimeColor = (v) => (v == null ? 'var(--neutral)' : v < 99 ? 'var(--error)' : v < 99.9 ? 'var(--warn)' : 'var(--ok)')

function checkTone(c) {
  if (c.last_ok == null) return { tone: 'neutral', label: 'awaiting' }
  if (Number(c.last_ok) === 1) return { tone: 'ok', label: 'up' }
  return { tone: 'error', label: 'down' }
}

export default function Synthetics() {
  const [searchParams, setSearchParams] = useSearchParams()
  const checksQ = useApi('/api/synthetics', {}, { noRange: true })
  const locsQ = useApi('/api/synthetics/locations', {}, { noRange: true })
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [selected, setSelected] = useState(searchParams.get('check') || null)

  const checks = checksQ.data?.checks || []
  const locations = locsQ.data?.locations || []
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const reload = checksQ.reload || (() => {})

  // Deep-link from Trace replay: /synthetics?check=…
  useEffect(() => {
    const check = searchParams.get('check')
    if (check && check !== selected) setSelected(check)
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = new URLSearchParams(searchParams)
    if (selected) p.set('check', selected)
    else p.delete('check')
    const next = p.toString()
    if (next !== searchParams.toString()) setSearchParams(p, { replace: true })
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setErr(null)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.url.trim() && form.check_type === 'http') { setErr('A URL is required'); return }
    if ((form.check_type === 'api_journey' || form.check_type === 'browser') && !form.steps.trim() && !form.url.trim()) {
      setErr('Steps JSON or a URL is required for journey checks'); return
    }
    setBusy(true); setErr(null)
    const body = {
      name: form.name.trim(),
      url: form.url.trim(),
      method: form.method,
      body: form.body,
      interval_seconds: Number(form.interval_seconds) || 60,
      timeout_ms: Number(form.timeout_ms) || 10000,
      assert_status: Number(form.assert_status) || 0,
      assert_body_contains: form.assert_body_contains.trim(),
      assert_max_latency_ms: Number(form.assert_max_latency_ms) || 0,
      check_type: form.check_type,
      steps: form.steps.trim() || '[]',
      location_id: form.location_id.trim(),
      cert_lead_days: Number(form.cert_lead_days) || 0,
      enabled: 1,
    }
    try {
      if (editingId) await axios.put(`${API}/api/synthetics/${encodeURIComponent(editingId)}`, body)
      else await axios.post(`${API}/api/synthetics`, body)
      resetForm()
      reload()
    } catch (e2) {
      setErr(e2.response?.data || e2.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const edit = (c) => {
    setEditingId(c.id)
    setForm({
      name: c.name || '',
      url: c.url || '',
      method: c.method || 'GET',
      interval_seconds: String(c.interval_seconds ?? 60),
      timeout_ms: String(c.timeout_ms ?? 10000),
      assert_status: c.assert_status ? String(c.assert_status) : '',
      assert_body_contains: c.assert_body_contains || '',
      assert_max_latency_ms: c.assert_max_latency_ms ? String(c.assert_max_latency_ms) : '',
      check_type: c.check_type || 'http',
      steps: c.steps && c.steps !== '[]' ? c.steps : '',
      location_id: c.location_id || '',
      body: c.body || '',
      cert_lead_days: c.cert_lead_days ? String(c.cert_lead_days) : '',
    })
  }

  const remove = async (c) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete check "${c.name || c.url}"?`)) return
    try {
      await axios.delete(`${API}/api/synthetics/${encodeURIComponent(c.id)}`)
      if (selected === c.id) setSelected(null)
      reload()
    } catch (e2) {
      setErr(e2.response?.data || e2.message || 'Delete failed')
    }
  }

  const kpis = useMemo(() => {
    const withResults = checks.filter((c) => c.uptime_24h != null)
    const down = checks.filter((c) => Number(c.last_ok) === 0).length
    const uptime = withResults.length
      ? withResults.reduce((a, c) => a + Number(c.uptime_24h || 0), 0) / withResults.length
      : null
    const lat = withResults.length
      ? withResults.reduce((a, c) => a + Number(c.avg_latency_ms_24h || 0), 0) / withResults.length
      : null
    return { total: checks.length, down, uptime, lat }
  }, [checks])

  const columns = [
    {
      key: 'status', header: '', width: 34, align: 'center',
      render: (r) => <HealthDot tone={checkTone(r).tone} />,
    },
    {
      key: 'name', header: 'Check',
      render: (r) => (
        <div className="syn-name">
          <span className="cell-strong">{r.name || '—'}</span>
          <span className="opa-mono opa-muted syn-url">
            <Badge>{r.check_type || 'http'}</Badge>{' '}
            {r.method && r.check_type !== 'tls' && r.check_type !== 'domain' ? `${r.method} ` : ''}{r.url}
          </span>
        </div>
      ),
      sortValue: (r) => r.name || '',
    },
    {
      key: 'location_id', header: 'Location', width: 110,
      render: (r) => <span className="opa-muted">{r.location_id || 'agent'}</span>,
    },
    {
      key: 'interval_seconds', header: 'Every', num: true, width: 90,
      render: (r) => <span className="opa-muted">{fmtNum(r.interval_seconds)}s</span>,
      sortValue: (r) => Number(r.interval_seconds),
    },
    {
      key: 'uptime_24h', header: 'Uptime 24h', num: true, width: 120,
      render: (r) => (r.uptime_24h == null
        ? <span className="opa-muted">—</span>
        : <span style={{ color: uptimeColor(Number(r.uptime_24h)) }}>{fmtPct(Number(r.uptime_24h), 1)}</span>),
      sortValue: (r) => (r.uptime_24h == null ? -1 : Number(r.uptime_24h)),
    },
    {
      key: 'avg_latency_ms_24h', header: 'Avg latency', num: true, width: 120,
      render: (r) => (r.avg_latency_ms_24h == null
        ? <span className="opa-muted">—</span>
        : <span style={{ color: `var(--${latencyStatus(Number(r.avg_latency_ms_24h))})` }}>{fmtMs(Number(r.avg_latency_ms_24h))}</span>),
      sortValue: (r) => Number(r.avg_latency_ms_24h || 0),
    },
    {
      key: 'last_error', header: 'Last error',
      render: (r) => (r.last_error
        ? <span className="syn-err" title={r.last_error}>{r.last_error}</span>
        : <span className="opa-muted">—</span>),
    },
    {
      key: 'last_run', header: 'Last run', num: true, width: 110,
      render: (r) => <span className="opa-muted">{r.last_run ? fmtAgo(r.last_run) : 'never'}</span>,
      sortValue: (r) => Date.parse(r.last_run) || 0,
    },
    {
      key: 'actions', header: '', width: 76, align: 'center',
      render: (r) => (
        <div className="opa-row" style={{ gap: 4, justifyContent: 'center' }}>
          <button className="opa-btn ghost" title="Edit"
            onClick={(e) => { e.stopPropagation(); edit(r) }}><FiEdit2 size={12} /></button>
          <button className="opa-btn ghost" title="Delete"
            onClick={(e) => { e.stopPropagation(); remove(r) }}><FiTrash2 size={12} /></button>
        </div>
      ),
    },
  ]

  const needsSteps = form.check_type === 'api_journey' || form.check_type === 'browser'
  const needsCert = form.check_type === 'tls' || form.check_type === 'domain'

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Synthetic monitoring</h1>
          <div className="opa-page-sub">
            HTTP · API journeys · TLS/domain · browser · private locations · trace-linked
          </div>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Checks" icon={<FiRadio size={12} />} value={fmtNum(kpis.total)} unit="configured" status="neutral" />
        <KpiTile label="Failing" icon={<FiAlertTriangle size={12} />} value={fmtNum(kpis.down)}
          status={kpis.down > 0 ? 'error' : 'ok'} invert />
        <KpiTile label="Avg uptime 24h" icon={<FiActivity size={12} />}
          value={kpis.uptime == null ? '—' : fmtPct(kpis.uptime, 1)}
          status={kpis.uptime == null ? 'neutral' : kpis.uptime < 99 ? 'error' : kpis.uptime < 99.9 ? 'warn' : 'ok'} />
        <KpiTile label="Locations" icon={<FiShield size={12} />} value={fmtNum(locations.length || 1)}
          unit="agent + private" status="neutral" />
      </div>

      <Panel
        title="Checks" icon={<FiRadio />} flush
        loading={checksQ.loading} error={checksQ.error}
      >
        <div style={{ padding: 'var(--sp-3) var(--sp-3) 0' }}>
          <form className="opa-inline-form syn-form-wrap" onSubmit={submit}>
            <select className="opa-select" value={form.check_type} onChange={set('check_type')} title="Check type" style={{ flex: '0 0 140px' }}>
              <option value="http">HTTP</option>
              <option value="api_journey">API journey</option>
              <option value="tls">TLS cert</option>
              <option value="domain">Domain expiry</option>
              <option value="browser">Browser</option>
            </select>
            <input className="opa-input" placeholder="Name" value={form.name} onChange={set('name')} />
            <input className="opa-input" placeholder={needsCert ? 'hostname or https://host' : 'https://example.com/health'} value={form.url} onChange={set('url')} />
            {form.check_type === 'http' && (
              <select className="opa-select" value={form.method} onChange={set('method')} title="HTTP method">
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            )}
            <input className="opa-input" type="number" min="15" step="15" title="Interval (seconds)"
              placeholder="Every (s)" value={form.interval_seconds} onChange={set('interval_seconds')}
              style={{ flex: '0 0 100px' }} />
            <input className="opa-input" placeholder="Location (blank=agent)" value={form.location_id} onChange={set('location_id')}
              style={{ flex: '0 0 140px' }} />
            {needsCert && (
              <input className="opa-input" type="number" min="1" title="Fail when days-left below this"
                placeholder="Lead days" value={form.cert_lead_days} onChange={set('cert_lead_days')}
                style={{ flex: '0 0 110px' }} />
            )}
            {form.check_type === 'http' && (
              <>
                <input className="opa-input" type="number" min="0" placeholder="Status" value={form.assert_status} onChange={set('assert_status')} style={{ flex: '0 0 90px' }} />
                <input className="opa-input" placeholder="Body contains" value={form.assert_body_contains} onChange={set('assert_body_contains')} />
              </>
            )}
            {needsSteps && (
              <textarea className="opa-input" rows={2} placeholder='Steps JSON: [{"name":"login","method":"POST","url":"...","extract":{"token":"json:access_token"}}]'
                value={form.steps} onChange={set('steps')} style={{ flex: '1 1 100%', minWidth: '100%' }} />
            )}
            <button className="opa-btn primary" disabled={busy}>
              {editingId
                ? <><FiCheck size={13} /> {busy ? 'Saving…' : 'Update check'}</>
                : <><FiPlus size={13} /> {busy ? 'Saving…' : 'Add check'}</>}
            </button>
            {editingId && (
              <button type="button" className="opa-btn ghost" onClick={resetForm}>
                <FiX size={13} /> Cancel
              </button>
            )}
          </form>
          {err && <div className="syn-error">{String(err)}</div>}
        </div>

        <DataTable
          columns={columns}
          rows={checks}
          rowKey={(r) => r.id}
          initialSort={{ key: 'uptime_24h', dir: 'asc' }}
          onRowClick={(r) => setSelected(selected === r.id ? null : r.id)}
          emptyText="No checks yet — add one above"
        />
      </Panel>

      {selected && (
        <CheckDetail
          check={checks.find((c) => c.id === selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function CheckDetail({ check, onClose }) {
  const q = useApi(`/api/synthetics/${encodeURIComponent(check?.id || '')}/results`, {}, { skip: !check })
  const results = q.data?.results || []

  const series = useMemo(() => results.slice().reverse().map((r) => ({
    time: String(r.ts || '').slice(11, 19),
    latency: Number(r.latency_ms || 0),
    failure: Number(r.ok) === 1 ? null : Number(r.latency_ms || 0),
  })), [results])

  const failures = results.filter((r) => Number(r.ok) !== 1)
  const latest = results[0]

  let steps = []
  try {
    if (latest?.steps_json) steps = JSON.parse(latest.steps_json)
  } catch (_) { steps = [] }

  let artefacts = null
  try {
    if (latest?.artefacts) artefacts = typeof latest.artefacts === 'string' ? JSON.parse(latest.artefacts) : latest.artefacts
  } catch (_) { artefacts = null }
  const screenshotB64 = artefacts?.screenshot_b64 || latest?.screenshot_b64 || ''
  const domSnap = artefacts?.dom || artefacts?.dom_snapshot || ''

  const failCols = [
    { key: 'ts', header: 'When', width: 130, render: (r) => <span className="opa-muted">{fmtAgo(r.ts)}</span>, sortValue: (r) => Date.parse(r.ts) || 0 },
    { key: 'status_code', header: 'Status', width: 80, align: 'center', render: (r) => <StatusPill tone={r.status_code >= 200 && r.status_code < 400 ? 'warn' : 'error'}>{r.status_code || '—'}</StatusPill> },
    { key: 'latency_ms', header: 'Latency', num: true, width: 100, render: (r) => fmtMs(Number(r.latency_ms)) },
    {
      key: 'trace_id', header: 'Trace', width: 120,
      render: (r) => (r.trace_id
        ? <Link className="opa-mono" to={traceHref(r.trace_id)}>{String(r.trace_id).slice(0, 12)}…</Link>
        : <span className="opa-muted">—</span>),
    },
    { key: 'cert_days_left', header: 'Days left', width: 90, num: true, render: (r) => (r.cert_days_left ? fmtNum(r.cert_days_left) : '—') },
    { key: 'error', header: 'Error', render: (r) => <span className="syn-err" title={r.error}>{r.error || '—'}</span> },
  ]

  const stepCols = [
    { key: 'name', header: 'Step', render: (r) => <span className="cell-strong">{r.name || r.action}</span> },
    { key: 'ok', header: 'OK', width: 70, render: (r) => (Number(r.ok) ? <StatusPill tone="ok">ok</StatusPill> : <StatusPill tone="error">fail</StatusPill>) },
    { key: 'latency_ms', header: 'Latency', num: true, width: 100, render: (r) => (r.latency_ms != null ? fmtMs(Number(r.latency_ms)) : '—') },
    { key: 'status_code', header: 'Status', width: 80, render: (r) => r.status_code || '—' },
    { key: 'error', header: 'Error', render: (r) => <span className="syn-err">{r.error || r.note || '—'}</span> },
  ]

  if (!check) return null

  return (
    <>
      <Panel
        title={`Latency · ${check.name || check.url}`} icon={<FiActivity />}
        loading={q.loading} error={q.error}
        empty={!q.loading && series.length === 0}
        emptyText="No probe results yet"
        actions={(
          <div className="opa-row" style={{ gap: 8 }}>
            {check.id && (
              <Link className="opa-btn ghost" to={tracesHref({ check_id: check.id })}>
                Correlated traces
              </Link>
            )}
            <button className="opa-btn ghost" onClick={onClose}>Close</button>
          </div>
        )}
      >
        {latest?.trace_id && (
          <div style={{ padding: '0 var(--sp-3) var(--sp-2)' }}>
            Latest trace:{' '}
            <Link className="opa-mono" to={traceHref(latest.trace_id)}>{latest.trace_id}</Link>
            {latest.cert_days_left != null && Number(latest.cert_days_left) !== 0 && (
              <span className="opa-muted"> · cert/domain days left: {latest.cert_days_left}</span>
            )}
          </div>
        )}
        <TimeSeriesChart
          data={series} xKey="time" height={220}
          valueFmt={fmtMs} yFmt={fmtMs}
          series={[
            { key: 'latency', name: 'Latency', color: 'var(--accent)', type: 'line' },
            { key: 'failure', name: 'Failure', color: 'var(--error)', type: 'bar' },
          ]}
        />
      </Panel>

      {steps.length > 0 && (
        <Panel title="Latest step waterfall" icon={<FiClock />} flush>
          <DataTable columns={stepCols} rows={steps} rowKey={(r, i) => i} maxHeight={280} />
        </Panel>
      )}

      {(screenshotB64 || domSnap) && (
        <Panel title="Browser artefacts" icon={<FiShield />} flush>
          {screenshotB64 && (
            <div style={{ padding: '8px 12px' }}>
              <img
                alt="Synthetic failure screenshot"
                src={screenshotB64.startsWith('data:') ? screenshotB64 : `data:image/png;base64,${screenshotB64}`}
                style={{ maxWidth: '100%', maxHeight: 360, border: '1px solid var(--border)' }}
              />
            </div>
          )}
          {domSnap && (
            <pre className="opa-mono" style={{ fontSize: 11, maxHeight: 200, overflow: 'auto', padding: 12, margin: 0 }}>
              {String(domSnap).slice(0, 4000)}
            </pre>
          )}
        </Panel>
      )}

      <Panel
        title="Recent failures" icon={<FiAlertTriangle />} flush
        loading={q.loading}
        empty={!q.loading && failures.length === 0}
        emptyText="No failures recorded"
      >
        <DataTable columns={failCols} rows={failures} rowKey={(r, i) => i}
          initialSort={{ key: 'ts', dir: 'desc' }} maxHeight={300} />
      </Panel>
    </>
  )
}
