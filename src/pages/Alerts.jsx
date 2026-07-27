import React, { useMemo, useState } from 'react'
import axios from 'axios'
import {
  FiBell, FiCheckCircle, FiLink, FiMessageSquare, FiPlus, FiPlay, FiEdit2,
  FiTrash2, FiX, FiClock, FiRefreshCw,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'
import './Alerts.css'

const API = import.meta.env.VITE_API_URL || ''

// API timestamps arrive as "2026-07-25 08:10:29.000"; normalize before Date.parse.
const parseTs = (ts) => {
  if (!ts) return null
  const t = Date.parse(typeof ts === 'string' ? ts.replace(' ', 'T') : ts)
  return isNaN(t) ? null : t
}

const OP_SYMBOL = { gt: '>', lt: '<', gte: '≥', lte: '≤' }
const opSym = (op) => OP_SYMBOL[op] || op || ''

const CONDITION_TYPES = [
  { value: 'error_rate', label: 'Error rate (%)' },
  { value: 'duration', label: 'Duration (ms)' },
  { value: 'throughput', label: 'Throughput (rpm)' },
]
const OPERATORS = [
  { value: 'gt', label: 'greater than (>)' },
  { value: 'gte', label: 'at least (≥)' },
  { value: 'lt', label: 'less than (<)' },
  { value: 'lte', label: 'at most (≤)' },
]
const ACTION_TYPES = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'slack', label: 'Slack' },
  { value: 'email', label: 'Email' },
]
const TARGET_LABEL = { webhook: 'Webhook URL', slack: 'Slack webhook URL', email: 'Recipient email' }

// Where an action's destination lives depends on the channel.
const actionTarget = (a) => a?.action_config?.url || a?.action_config?.webhook_url || a?.action_config?.to || ''

// Map a history status string onto a StatusPill tone.
const histTone = (s) => {
  const t = String(s || '').toLowerCase()
  if (t.includes('fail') || t.includes('error')) return 'error'
  if (t.includes('fire') || t.includes('trigger') || t.includes('breach') || t.includes('checking')) return 'warn'
  if (t.includes('ok') || t.includes('success') || t.includes('sent') || t.includes('pass') || t.includes('resolved')) return 'ok'
  return 'neutral'
}

const EMPTY_FORM = {
  id: null, name: '', service: '', condition_type: 'error_rate', operator: 'gt',
  threshold: '', cooldown_seconds: '', action_type: 'webhook', action_target: '', enabled: true,
}

export default function Alerts() {
  // Alert rules are configuration, not time-ranged telemetry.
  const alertsQ = useApi('/api/alerts', {}, { noRange: true })
  const alerts = alertsQ.data?.alerts || []

  const [showForm, setShowForm] = useState(false)
  const [editingOriginal, setEditingOriginal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formErr, setFormErr] = useState(null)
  const [saving, setSaving] = useState(false)

  const [selectedId, setSelectedId] = useState(null)
  const [testingId, setTestingId] = useState(null)

  const selectedAlert = alerts.find((a) => a.id === selectedId) || null
  const historyQ = useApi(
    selectedId ? `/api/alerts/${encodeURIComponent(selectedId)}/history` : null,
    {},
    { noRange: true, skip: !selectedId },
  )
  const history = historyQ.data?.history || []

  // --- KPI rollups ---
  const total = alerts.length
  const enabled = alerts.filter((a) => a.enabled).length
  const disabled = total - enabled
  const byAction = useMemo(() => {
    const acc = { webhook: 0, slack: 0, email: 0 }
    alerts.forEach((a) => { if (acc[a.action_type] != null) acc[a.action_type] += 1 })
    return acc
  }, [alerts])
  const servicesCovered = new Set(alerts.map((a) => a.service).filter(Boolean)).size

  // --- form helpers ---
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const startCreate = () => {
    setEditingOriginal(null)
    setForm(EMPTY_FORM)
    setFormErr(null)
    setShowForm(true)
  }
  const startEdit = (row) => {
    setEditingOriginal(row)
    setForm({
      id: row.id,
      name: row.name || '',
      service: row.service || '',
      condition_type: row.condition_type || 'error_rate',
      operator: row.condition_config?.operator || 'gt',
      threshold: row.condition_config?.threshold ?? '',
      cooldown_seconds: row.condition_config?.cooldown_seconds ?? '',
      action_type: row.action_type || 'webhook',
      action_target: actionTarget(row),
      enabled: row.enabled !== false,
    })
    setFormErr(null)
    setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditingOriginal(null); setForm(EMPTY_FORM); setFormErr(null) }

  const saveAlert = async (e) => {
    e.preventDefault()
    setFormErr(null)
    if (!form.name.trim()) { setFormErr('Name is required.'); return }
    if (form.threshold === '' || isNaN(Number(form.threshold))) { setFormErr('Threshold must be a number.'); return }
    if (!form.action_target.trim()) { setFormErr('An action target is required.'); return }

    const condition_config = { threshold: Number(form.threshold), operator: form.operator }
    if (form.cooldown_seconds !== '' && !isNaN(Number(form.cooldown_seconds))) {
      condition_config.cooldown_seconds = Number(form.cooldown_seconds)
    }
    const target = form.action_target.trim()
    const action_config = form.action_type === 'email'
      ? { to: target }
      : form.action_type === 'slack'
        ? { webhook_url: target }
        : { url: target }

    const body = {
      name: form.name.trim(),
      enabled: form.enabled,
      condition_type: form.condition_type,
      condition_config,
      action_type: form.action_type,
      action_config,
    }
    if (editingOriginal?.description != null) body.description = editingOriginal.description
    const svc = form.service.trim()
    if (svc) body.service = svc

    setSaving(true)
    try {
      if (form.id) {
        await axios.put(`${API}/api/alerts/${encodeURIComponent(form.id)}`, { ...body, id: form.id })
      } else {
        await axios.post(`${API}/api/alerts`, body)
      }
      closeForm()
      alertsQ.reload()
    } catch (err) {
      setFormErr(err.response?.data?.error || err.response?.data || err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const testAlert = async (row) => {
    setTestingId(row.id)
    setSelectedId(row.id) // surface this rule's history so the check is visible
    try {
      await axios.post(`${API}/api/alerts/${encodeURIComponent(row.id)}`)
    } catch (err) {
      window.alert(`Test failed: ${err.response?.data?.error || err.response?.data || err.message}`)
    } finally {
      setTestingId(null)
    }
  }

  const deleteAlert = async (row) => {
    if (!window.confirm(`Delete alert "${row.name || row.id}"? This cannot be undone.`)) return
    try {
      await axios.delete(`${API}/api/alerts/${encodeURIComponent(row.id)}`)
      if (selectedId === row.id) setSelectedId(null)
      if (form.id === row.id) closeForm()
      alertsQ.reload()
    } catch (err) {
      window.alert(`Delete failed: ${err.response?.data?.error || err.response?.data || err.message}`)
    }
  }

  // --- rules table ---
  const columns = [
    {
      key: 'name', header: 'Name', sortValue: (r) => r.name || '',
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div className="cell-strong">{r.name || '—'}</div>
          {r.description && (
            <div className="opa-muted" style={{ fontSize: 'var(--fs-11)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'condition', header: 'Condition', sortValue: (r) => r.condition_type || '',
      render: (r) => (
        <span className="opa-mono">
          <span className="opa-muted">{r.condition_type || '—'}</span>{' '}
          {opSym(r.condition_config?.operator)}{' '}
          <span className="cell-strong">{r.condition_config?.threshold ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'action', header: 'Action', sortValue: (r) => r.action_type || '',
      render: (r) => (
        <div className="opa-row" style={{ gap: 6, minWidth: 0 }}>
          <Badge title={r.action_type}>{r.action_type || '—'}</Badge>
          <span
            className="opa-muted opa-mono"
            title={actionTarget(r)}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--fs-11)' }}
          >
            {actionTarget(r) || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'service', header: 'Service', sortValue: (r) => r.service || '',
      render: (r) => <span className="opa-mono opa-muted">{r.service || '—'}</span>,
    },
    {
      key: 'enabled', header: 'Status', sortValue: (r) => (r.enabled ? 1 : 0),
      render: (r) => <StatusPill tone={r.enabled ? 'ok' : 'neutral'}>{r.enabled ? 'enabled' : 'disabled'}</StatusPill>,
    },
    {
      key: '_actions', header: '', sortable: false, align: 'right', width: 170,
      render: (r) => (
        <div className="alerts-actions" onClick={(e) => e.stopPropagation()}>
          <button className="opa-btn ghost" title="Test now" onClick={() => testAlert(r)} disabled={testingId === r.id}>
            <FiPlay size={12} /> {testingId === r.id ? '…' : 'Test'}
          </button>
          <button className="opa-btn ghost" title="Edit" onClick={() => startEdit(r)}><FiEdit2 size={12} /></button>
          <button className="opa-btn ghost" title="Delete" onClick={() => deleteAlert(r)}><FiTrash2 size={12} /></button>
        </div>
      ),
    },
  ]

  // --- history table ---
  const histColumns = [
    {
      key: 'fired_at', header: 'Fired', num: true, sortValue: (r) => parseTs(r.fired_at) || 0,
      render: (r) => <span className="opa-muted opa-tnum">{fmtAgo(parseTs(r.fired_at))}</span>,
    },
    {
      key: 'condition', header: 'Condition', sortable: false,
      render: (r) => (
        <span className="opa-mono">
          <span className="opa-muted">{r.condition_type || '—'}</span> {opSym(r.operator)} {r.threshold ?? '—'}
        </span>
      ),
    },
    {
      key: 'value', header: 'Value / threshold', num: true, sortValue: (r) => (typeof r.value === 'number' ? r.value : 0),
      render: (r) => (
        <span className="alerts-vt">
          <span className="cell-strong">{r.value ?? '—'}</span>{' '}
          <span className="opa-muted">vs {r.threshold ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'action_type', header: 'Action', sortable: false,
      render: (r) => <Badge>{r.action_type || '—'}</Badge>,
    },
    {
      key: 'status', header: 'Status', sortValue: (r) => r.status || '',
      render: (r) => <StatusPill tone={histTone(r.status)}>{r.status || 'unknown'}</StatusPill>,
    },
    {
      key: 'message', header: 'Message', sortable: false,
      render: (r) => <span className="alerts-hist-msg" title={r.message}>{r.message || '—'}</span>,
    },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Alerts</h1>
          <div className="opa-page-sub">
            {total} rule{total === 1 ? '' : 's'} · {enabled} enabled
          </div>
        </div>
      </div>

      {/* KPI rollups */}
      <div className="opa-grid cols-4">
        <KpiTile
          label="Total rules" icon={<FiBell size={12} />} value={fmtNum(total)} unit="rules" status="neutral"
          footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>{servicesCovered} service{servicesCovered === 1 ? '' : 's'} scoped</span>}
        />
        <KpiTile
          label="Enabled" icon={<FiCheckCircle size={12} />} value={fmtNum(enabled)} status={enabled > 0 ? 'ok' : 'neutral'}
          footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>{disabled} disabled</span>}
        />
        <KpiTile
          label="Webhook" icon={<FiLink size={12} />} value={fmtNum(byAction.webhook)} unit="rules" status="neutral"
        />
        <KpiTile
          label="Slack & Email" icon={<FiMessageSquare size={12} />} value={fmtNum(byAction.slack + byAction.email)} unit="rules" status="neutral"
          footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>{byAction.slack} Slack · {byAction.email} Email</span>}
        />
      </div>

      {/* Rules */}
      <Panel
        title="Alert rules"
        icon={<FiBell />}
        loading={alertsQ.loading}
        error={alertsQ.error}
        empty={!alertsQ.loading && !showForm && alerts.length === 0}
        emptyText="No alert rules yet — create one to start monitoring"
        actions={!showForm && (
          <button className="opa-btn primary" onClick={startCreate}><FiPlus size={13} /> New alert</button>
        )}
      >
        {showForm && (
          <form className="alerts-form" onSubmit={saveAlert}>
            <div className="alerts-field wide">
              <label>Name</label>
              <input className="opa-input" placeholder="e.g. High error rate on checkout" value={form.name} onChange={(e) => setField('name', e.target.value)} />
            </div>
            <div className="alerts-field">
              <label>Service</label>
              <input className="opa-input" placeholder="all services" value={form.service} onChange={(e) => setField('service', e.target.value)} />
            </div>
            <div className="alerts-field">
              <label>Cooldown (s)</label>
              <input className="opa-input" type="number" min="0" placeholder="optional" value={form.cooldown_seconds} onChange={(e) => setField('cooldown_seconds', e.target.value)} />
            </div>

            <div className="alerts-field">
              <label>Condition</label>
              <select className="opa-select" value={form.condition_type} onChange={(e) => setField('condition_type', e.target.value)}>
                {CONDITION_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="alerts-field">
              <label>Operator</label>
              <select className="opa-select" value={form.operator} onChange={(e) => setField('operator', e.target.value)}>
                {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="alerts-field">
              <label>Threshold</label>
              <input className="opa-input" type="number" step="any" placeholder="e.g. 5" value={form.threshold} onChange={(e) => setField('threshold', e.target.value)} />
            </div>
            <div className="alerts-field">
              <label>Action</label>
              <select className="opa-select" value={form.action_type} onChange={(e) => setField('action_type', e.target.value)}>
                {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>

            <div className="alerts-field wide">
              <label>{TARGET_LABEL[form.action_type] || 'Target'}</label>
              <input
                className="opa-input"
                type={form.action_type === 'email' ? 'email' : 'text'}
                placeholder={form.action_type === 'email' ? 'oncall@example.com' : 'https://…'}
                value={form.action_target}
                onChange={(e) => setField('action_target', e.target.value)}
              />
            </div>

            <div className="alerts-form-foot">
              <label className="alerts-form-check">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setField('enabled', e.target.checked)} />
                Enabled
              </label>
              <button type="button" className="opa-btn ghost" onClick={closeForm}>Cancel</button>
              <button type="submit" className="opa-btn primary" disabled={saving}>
                <FiPlus size={13} /> {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create alert'}
              </button>
            </div>
          </form>
        )}
        {formErr && <div className="opa-form-err">{String(formErr)}</div>}

        <DataTable
          columns={columns}
          rows={alerts}
          rowKey={(r) => r.id}
          initialSort={{ key: 'name', dir: 'asc' }}
          emptyText="No alert rules"
          onRowClick={(r) => r.id && setSelectedId((prev) => (prev === r.id ? null : r.id))}
        />
      </Panel>

      {/* Firing history for the selected rule */}
      {selectedId && (
        <Panel
          title={`Firing history · ${selectedAlert?.name || selectedId}`}
          icon={<FiClock />}
          flush
          loading={historyQ.loading}
          error={historyQ.error}
          empty={!historyQ.loading && history.length === 0}
          emptyText="No firings recorded yet"
          actions={(
            <div className="opa-row" style={{ gap: 'var(--sp-2)' }}>
              {testingId === selectedId && <StatusPill tone="warn">checking…</StatusPill>}
              <button className="opa-btn ghost" onClick={() => historyQ.reload()} title="Refresh"><FiRefreshCw size={12} /> Refresh</button>
              <button className="opa-btn ghost" onClick={() => setSelectedId(null)} title="Close"><FiX size={12} /></button>
            </div>
          )}
        >
          <DataTable
            columns={histColumns}
            rows={history}
            rowKey={(r, i) => `${r.fired_at || ''}-${i}`}
            initialSort={{ key: 'fired_at', dir: 'desc' }}
            emptyText="No firings"
          />
        </Panel>
      )}
    </div>
  )
}
