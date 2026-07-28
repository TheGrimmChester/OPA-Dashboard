import React, { useCallback, useMemo, useState } from 'react'
import axios from 'axios'
import {
  FiRadio, FiPlus, FiCheck, FiX, FiEdit2, FiTrash2, FiActivity, FiAlertTriangle, FiClock,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, DataTable, StatusPill, HealthDot, TimeSeriesChart,
} from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtAgo, latencyStatus } from '../theme/format'
import './Synthetics.css'

const API = import.meta.env.VITE_API_URL || ''

const EMPTY_FORM = {
  name: '', url: '', method: 'GET', interval_seconds: '60', timeout_ms: '10000',
  assert_status: '', assert_body_contains: '', assert_max_latency_ms: '',
}

// Uptime is the headline signal: below 99% is a problem, below 99.9% is worth
// a look. No result yet → neutral (the check has not run).
const uptimeColor = (v) => (v == null ? 'var(--neutral)' : v < 99 ? 'var(--error)' : v < 99.9 ? 'var(--warn)' : 'var(--ok)')

function checkTone(c) {
  if (c.last_ok == null) return { tone: 'neutral', label: 'awaiting' }
  if (Number(c.last_ok) === 1) return { tone: 'ok', label: 'up' }
  return { tone: 'error', label: 'down' }
}

export default function Synthetics() {
  const checksQ = useApi('/api/synthetics', {}, { noRange: true })
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [selected, setSelected] = useState(null)

  const checks = checksQ.data?.checks || []
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const reload = checksQ.reload || (() => {})

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setErr(null)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.url.trim()) { setErr('A URL is required'); return }
    setBusy(true); setErr(null)
    const body = {
      name: form.name.trim(),
      url: form.url.trim(),
      method: form.method,
      interval_seconds: Number(form.interval_seconds) || 60,
      timeout_ms: Number(form.timeout_ms) || 10000,
      assert_status: Number(form.assert_status) || 0,
      assert_body_contains: form.assert_body_contains.trim(),
      assert_max_latency_ms: Number(form.assert_max_latency_ms) || 0,
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

  // Aggregate KPIs across the configured checks.
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
          <span className="opa-mono opa-muted syn-url">{r.method} {r.url}</span>
        </div>
      ),
      sortValue: (r) => r.name || '',
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

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Synthetic monitoring</h1>
          <div className="opa-page-sub">
            Scheduled probes from the agent · uptime, latency and assertion failures
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
        <KpiTile label="Avg latency 24h" icon={<FiClock size={12} />}
          value={kpis.lat == null ? '—' : fmtMs(kpis.lat)}
          status={kpis.lat == null ? 'neutral' : latencyStatus(kpis.lat)} />
      </div>

      <Panel
        title="Checks" icon={<FiRadio />} flush
        loading={checksQ.loading} error={checksQ.error}
      >
        <div style={{ padding: 'var(--sp-3) var(--sp-3) 0' }}>
          <form className="opa-inline-form" onSubmit={submit}>
            <input className="opa-input" placeholder="Name (e.g. Checkout health)" value={form.name} onChange={set('name')} />
            <input className="opa-input" placeholder="https://example.com/health" value={form.url} onChange={set('url')} />
            <select className="opa-select" value={form.method} onChange={set('method')} title="HTTP method">
              <option value="GET">GET</option>
              <option value="HEAD">HEAD</option>
              <option value="POST">POST</option>
            </select>
            <input className="opa-input" type="number" min="15" step="15" title="Interval (seconds)"
              placeholder="Every (s)" value={form.interval_seconds} onChange={set('interval_seconds')}
              style={{ flex: '0 0 110px', minWidth: 90 }} />
            <input className="opa-input" type="number" min="100" step="100" title="Timeout (ms)"
              placeholder="Timeout (ms)" value={form.timeout_ms} onChange={set('timeout_ms')}
              style={{ flex: '0 0 120px', minWidth: 90 }} />
            <input className="opa-input" type="number" min="0" title="Expected status (blank = any 2xx/3xx)"
              placeholder="Status" value={form.assert_status} onChange={set('assert_status')}
              style={{ flex: '0 0 96px', minWidth: 80 }} />
            <input className="opa-input" placeholder="Body contains (optional)"
              value={form.assert_body_contains} onChange={set('assert_body_contains')} />
            <input className="opa-input" type="number" min="0" title="Max latency budget (ms, blank = off)"
              placeholder="Max ms" value={form.assert_max_latency_ms} onChange={set('assert_max_latency_ms')}
              style={{ flex: '0 0 110px', minWidth: 90 }} />
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

// Per-check probe history: latency over time plus the recent failures.
function CheckDetail({ check, onClose }) {
  const q = useApi(`/api/synthetics/${encodeURIComponent(check?.id || '')}/results`, {}, { skip: !check })
  const results = q.data?.results || []

  // Oldest-first for the chart; failures carry their latency on a separate
  // series so they stand out as red points against the latency line.
  const series = useMemo(() => results.slice().reverse().map((r) => ({
    time: String(r.ts || '').slice(11, 19),
    latency: Number(r.latency_ms || 0),
    failure: Number(r.ok) === 1 ? null : Number(r.latency_ms || 0),
  })), [results])

  const failures = results.filter((r) => Number(r.ok) !== 1)

  const failCols = [
    { key: 'ts', header: 'When', width: 150, render: (r) => <span className="opa-muted">{fmtAgo(r.ts)}</span>, sortValue: (r) => Date.parse(r.ts) || 0 },
    { key: 'status_code', header: 'Status', width: 90, align: 'center', render: (r) => <StatusPill tone={r.status_code >= 200 && r.status_code < 400 ? 'warn' : 'error'}>{r.status_code || '—'}</StatusPill> },
    { key: 'latency_ms', header: 'Latency', num: true, width: 110, render: (r) => fmtMs(Number(r.latency_ms)) },
    { key: 'error', header: 'Error', render: (r) => <span className="syn-err" title={r.error}>{r.error || '—'}</span> },
  ]

  if (!check) return null

  return (
    <>
      <Panel
        title={`Latency · ${check.name || check.url}`} icon={<FiActivity />}
        loading={q.loading} error={q.error}
        empty={!q.loading && series.length === 0}
        emptyText="No probe results yet"
        actions={<button className="opa-btn ghost" onClick={onClose}>Close</button>}
      >
        <TimeSeriesChart
          data={series} xKey="time" height={220}
          valueFmt={fmtMs} yFmt={fmtMs}
          series={[
            { key: 'latency', name: 'Latency', color: 'var(--accent)', type: 'line' },
            { key: 'failure', name: 'Failure', color: 'var(--error)', type: 'bar' },
          ]}
        />
      </Panel>

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
