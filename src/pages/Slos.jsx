import React, { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  FiTarget, FiPlus, FiCheck, FiX, FiEdit2, FiTrash2, FiAlertTriangle, FiCheckCircle, FiTrendingUp,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, HealthDot, Badge, InlineBar } from '../components/ui'
import { fmtNum, fmtPct } from '../theme/format'

const API = import.meta.env.VITE_API_URL || ''

const EMPTY_FORM = { name: '', description: '', service: '', slo_type: 'availability', target_value: '', window_hours: '' }

// Burn rate is a small ratio (>1 = spending error budget faster than allowed),
// so it needs more precision than fmtNum's integer rounding.
const fmtBurn = (v) => (v == null || isNaN(v) ? '—' : `${Number(v).toFixed(2)}×`)

// Client-side status: a breach is an error; burning budget too fast or a low
// remaining budget is a warning; anything else is healthy. No metric yet → neutral.
function sloStatus(metric) {
  if (!metric) return { tone: 'neutral', label: 'awaiting' }
  if (metric.is_breach) return { tone: 'error', label: 'breached' }
  if (metric.burn_rate > 1 || metric.error_budget_remaining < 25) return { tone: 'warn', label: 'at risk' }
  return { tone: 'ok', label: 'healthy' }
}

const budgetColor = (v) => (v == null ? 'var(--neutral)' : v < 25 ? 'var(--error)' : v < 50 ? 'var(--warn)' : 'var(--ok)')
const burnColor = (v) => (v == null ? 'var(--text-secondary)' : v > 1 ? 'var(--error)' : v > 0.8 ? 'var(--warn)' : 'var(--ok)')

// Per-row helper: fetches an SLO's latest compliance metric and reports it up so
// the parent can enrich rows and aggregate the KPI tiles. Renders nothing.
// noRange: compliance is windowed by the SLO's own window_hours, so the global
// time range is irrelevant and would only cause noisy refetches.
function SloComplianceFetcher({ id, onLoad }) {
  const q = useApi(`/api/slos/${id}/compliance`, {}, { noRange: true })
  useEffect(() => {
    onLoad(id, { metric: q.data?.metrics?.[0] || null, loading: q.loading, error: q.error })
  }, [id, q.data, q.loading, q.error, onLoad])
  return null
}

export default function Slos() {
  const slosQ = useApi('/api/slos', {}, { noRange: true })
  const slos = useMemo(() => slosQ.data?.slos || [], [slosQ.data])

  // id -> { metric, loading, error }, filled in by the per-row fetchers.
  const [compliance, setCompliance] = useState({})
  const onLoad = useCallback((id, val) => {
    setCompliance((m) => ({ ...m, [id]: val }))
  }, [])

  // --- create / edit form ---
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const startEdit = (r) => {
    setEditingId(r.id)
    setForm({
      name: r.name || '',
      description: r.description || '',
      service: r.service || '',
      slo_type: r.slo_type || 'availability',
      target_value: r.target_value ?? '',
      window_hours: r.window_hours ?? '',
    })
    setFormErr(null)
  }
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); setFormErr(null) }

  const submit = async (e) => {
    e.preventDefault()
    setFormErr(null)
    const name = form.name.trim()
    const service = form.service.trim()
    if (!name || !service) { setFormErr('Name and service are required.'); return }
    const target = Number(form.target_value)
    const windowH = Number(form.window_hours)
    if (!(target > 0)) { setFormErr('Target must be a positive number (percent, e.g. 99.9).'); return }
    if (!(windowH > 0)) { setFormErr('Window must be a positive number of hours.'); return }
    const body = {
      name,
      description: form.description.trim(),
      service,
      slo_type: form.slo_type,
      target_value: target,
      window_hours: windowH,
    }
    setBusy(true)
    try {
      if (editingId) await axios.put(`${API}/api/slos/${encodeURIComponent(editingId)}`, body)
      else await axios.post(`${API}/api/slos`, body)
      cancelEdit()
      slosQ.reload()
    } catch (err) {
      setFormErr(err.response?.data?.error || err.response?.data || err.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r) => {
    if (!window.confirm(`Delete SLO "${r.name || r.id}"? This cannot be undone.`)) return
    try {
      await axios.delete(`${API}/api/slos/${encodeURIComponent(r.id)}`)
      if (editingId === r.id) cancelEdit()
      slosQ.reload()
    } catch (err) {
      window.alert(`Delete failed: ${err.response?.data?.error || err.response?.data || err.message}`)
    }
  }

  // Enrich each SLO with its compliance entry (undefined = fetcher not reported yet).
  const rows = useMemo(() => slos.map((s) => ({ ...s, _c: compliance[s.id] })), [slos, compliance])

  // --- KPI aggregation ---
  const evaluated = rows.filter((r) => r._c && r._c.metric)
  const breaching = rows.filter((r) => r._c?.metric?.is_breach).length
  const avgCompliance = evaluated.length
    ? evaluated.reduce((sum, r) => sum + (r._c.metric.compliance_percentage || 0), 0) / evaluated.length
    : null
  const worstBurn = evaluated.length ? Math.max(...evaluated.map((r) => r._c.metric.burn_rate ?? 0)) : null
  const noneEvaluated = rows.length > 0 && evaluated.length === 0

  const columns = [
    {
      key: 'name',
      header: 'SLO',
      sortValue: (r) => r.name || '',
      render: (r) => {
        const st = sloStatus(r._c?.metric)
        return (
          <div className="opa-row" style={{ minWidth: 0, gap: 8 }}>
            <HealthDot tone={st.tone} title={st.label} />
            <div style={{ minWidth: 0 }}>
              <div className="opa-row" style={{ gap: 6 }}>
                <span className="cell-strong">{r.name || '—'}</span>
                <Badge title={`SLO type: ${r.slo_type}`}>{r.slo_type}</Badge>
              </div>
              {r.description && (
                <div className="opa-muted" style={{ fontSize: 'var(--fs-12)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>
                  {r.description}
                </div>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'service',
      header: 'Service',
      sortValue: (r) => r.service || '',
      render: (r) => <span className="opa-mono opa-muted">{r.service || '—'}</span>,
    },
    {
      key: 'target',
      header: 'Target',
      num: true,
      sortValue: (r) => r.target_value ?? null,
      render: (r) => <span className="opa-tnum">{fmtPct(r.target_value)}</span>,
    },
    {
      key: 'actual',
      header: 'Actual',
      num: true,
      sortValue: (r) => r._c?.metric?.actual_value ?? null,
      render: (r) => {
        const e = r._c
        if (!e || e.loading) return <span className="opa-muted">…</span>
        if (!e.metric) return <span className="opa-muted">—</span>
        return <span className="opa-tnum">{fmtPct(e.metric.actual_value)}</span>
      },
    },
    {
      key: 'compliance',
      header: 'Compliance',
      num: true,
      sortValue: (r) => r._c?.metric?.compliance_percentage ?? null,
      render: (r) => {
        const e = r._c
        if (!e || e.loading) return <span className="opa-muted">…</span>
        if (!e.metric) return <span className="opa-muted" style={{ fontStyle: 'italic' }}>Awaiting first evaluation</span>
        const tone = sloStatus(e.metric).tone
        return <span className="opa-tnum" style={tone !== 'neutral' ? { color: `var(--${tone})` } : undefined}>{fmtPct(e.metric.compliance_percentage)}</span>
      },
    },
    {
      key: 'budget',
      header: 'Error budget',
      num: true,
      sortValue: (r) => r._c?.metric?.error_budget_remaining ?? null,
      render: (r) => {
        const m = r._c?.metric
        if (!m) return <span className="opa-muted">—</span>
        const v = m.error_budget_remaining
        return (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <InlineBar value={v} max={100} label={fmtPct(v)} color={budgetColor(v)} width={110} />
          </div>
        )
      },
    },
    {
      key: 'burn',
      header: 'Burn rate',
      num: true,
      sortValue: (r) => r._c?.metric?.burn_rate ?? null,
      render: (r) => {
        const m = r._c?.metric
        if (!m) return <span className="opa-muted">—</span>
        return <span className="opa-tnum" style={{ color: burnColor(m.burn_rate) }}>{fmtBurn(m.burn_rate)}</span>
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => sloStatus(r._c?.metric).label,
      render: (r) => {
        const st = sloStatus(r._c?.metric)
        return <StatusPill tone={st.tone}>{st.label}</StatusPill>
      },
    },
    {
      key: '_actions',
      header: '',
      sortable: false,
      align: 'right',
      width: 96,
      render: (r) => (
        <div className="opa-row" style={{ justifyContent: 'flex-end', gap: 2 }}>
          <button className="opa-btn ghost" onClick={(e) => { e.stopPropagation(); startEdit(r) }} title="Edit SLO">
            <FiEdit2 size={13} />
          </button>
          <button className="opa-btn ghost" onClick={(e) => { e.stopPropagation(); remove(r) }} title="Delete SLO">
            <FiTrash2 size={13} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="opa-stack">
      {/* Per-row compliance fetchers (render nothing). */}
      {slos.map((s) => <SloComplianceFetcher key={s.id} id={s.id} onLoad={onLoad} />)}

      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Service Level Objectives</h1>
          <div className="opa-page-sub">
            {slos.length} objective{slos.length === 1 ? '' : 's'}
            {breaching > 0 ? ` · ${breaching} breaching` : ''}
          </div>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Total SLOs" icon={<FiTarget size={12} />} value={fmtNum(slos.length)} unit="defined" status="neutral" />
        <KpiTile label="Breaching" icon={<FiAlertTriangle size={12} />} value={fmtNum(breaching)} status={breaching > 0 ? 'error' : 'ok'} />
        <KpiTile
          label="Avg compliance"
          icon={<FiCheckCircle size={12} />}
          value={avgCompliance == null ? '—' : fmtPct(avgCompliance)}
          status={avgCompliance == null ? 'neutral' : avgCompliance >= 99 ? 'ok' : avgCompliance >= 95 ? 'warn' : 'error'}
        />
        <KpiTile
          label="Worst burn rate"
          icon={<FiTrendingUp size={12} />}
          value={worstBurn == null ? '—' : fmtBurn(worstBurn)}
          status={worstBurn == null ? 'neutral' : worstBurn > 1 ? 'error' : 'ok'}
        />
      </div>

      <Panel
        title="Objectives"
        icon={<FiTarget />}
        loading={slosQ.loading}
        error={slosQ.error}
        empty={!slosQ.loading && slos.length === 0}
        emptyText="No SLOs yet — define one below"
        flush
      >
        <div style={{ padding: 'var(--sp-3) var(--sp-3) 0' }}>
          <form className="opa-inline-form" onSubmit={submit}>
            <input className="opa-input" placeholder="Name (e.g. Checkout availability)" value={form.name} onChange={set('name')} />
            <input className="opa-input" placeholder="Service" value={form.service} onChange={set('service')} />
            <select className="opa-select" value={form.slo_type} onChange={set('slo_type')} title="SLO type">
              <option value="availability">availability</option>
              <option value="error_rate">error_rate</option>
            </select>
            <input className="opa-input" type="number" step="0.1" min="0" placeholder="Target %" title="Target (percent, e.g. 99.9)" value={form.target_value} onChange={set('target_value')} style={{ flex: '0 0 110px', minWidth: 90 }} />
            <input className="opa-input" type="number" step="1" min="0" placeholder="Window (h)" title="Window (hours)" value={form.window_hours} onChange={set('window_hours')} style={{ flex: '0 0 120px', minWidth: 90 }} />
            <input className="opa-input" placeholder="Description (optional)" value={form.description} onChange={set('description')} />
            <button className="opa-btn primary" disabled={busy}>
              {editingId ? <><FiCheck size={13} /> {busy ? 'Saving…' : 'Update SLO'}</> : <><FiPlus size={13} /> {busy ? 'Saving…' : 'Add SLO'}</>}
            </button>
            {editingId && (
              <button type="button" className="opa-btn ghost" onClick={cancelEdit} disabled={busy}>
                <FiX size={13} /> Cancel
              </button>
            )}
          </form>
          {formErr && <div className="opa-form-err">{String(formErr)}</div>}
          {noneEvaluated && (
            <div className="opa-muted" style={{ fontSize: 'var(--fs-12)', marginBottom: 'var(--sp-3)' }}>
              Awaiting first evaluation — compliance metrics appear once the evaluator has run.
            </div>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          initialSort={{ key: 'compliance', dir: 'asc' }}
          emptyText="No SLOs yet"
        />
      </Panel>
    </div>
  )
}
