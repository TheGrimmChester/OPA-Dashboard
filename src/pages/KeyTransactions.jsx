import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiTarget, FiPlus, FiCheckCircle, FiXCircle } from 'react-icons/fi'
import axios from 'axios'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, EmptyState } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'

const API = import.meta.env.VITE_API_URL || ''

// Key Transactions — named business-critical endpoints to watch. GET/POST
// /api/key-transactions. Wires in the previously-dead page under the new IA.
export default function KeyTransactions() {
  const navigate = useNavigate()
  const kt = useApi('/api/key-transactions', {}, { noRange: true })
  const [form, setForm] = useState({ name: '', service: '', pattern: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const rows = kt.data?.transactions || []

  const create = async (e) => {
    e.preventDefault()
    if (!form.name || !form.service) { setErr('name and service are required'); return }
    setBusy(true); setErr('')
    try {
      await axios.post(`${API}/api/key-transactions`, form)
      setForm({ name: '', service: '', pattern: '', description: '' })
      kt.reload()
    } catch (e) {
      setErr(e.response?.data || e.message || 'Failed to create')
    } finally { setBusy(false) }
  }

  const columns = [
    { key: 'name', header: 'Transaction', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'service', header: 'Service', render: (r) => <span className="opa-mono">{r.service}</span> },
    { key: 'pattern', header: 'Pattern', render: (r) => <span className="opa-mono opa-muted">{r.pattern || '—'}</span> },
    { key: 'description', header: 'Description', render: (r) => r.description || '—' },
    { key: 'enabled', header: 'State', render: (r) => (
      r.enabled === false
        ? <span className="opa-row" style={{ color: 'var(--text-muted)' }}><FiXCircle size={13} /> disabled</span>
        : <span className="opa-row" style={{ color: 'var(--ok)' }}><FiCheckCircle size={13} /> enabled</span>
    ) },
    { key: 'updated_at', header: 'Updated', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.updated_at || r.created_at)}</span> },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Key Transactions</h1>
          <div className="opa-page-sub">Named business-critical endpoints to track</div>
        </div>
      </div>

      <div className="opa-grid cols-3">
        <KpiTile label="Transactions" icon={<FiTarget size={12} />} value={fmtNum(rows.length)} status="neutral" />
        <KpiTile label="Enabled" value={fmtNum(rows.filter((r) => r.enabled !== false).length)} status={rows.length ? 'ok' : 'neutral'} />
        <KpiTile label="Services covered" value={fmtNum(new Set(rows.map((r) => r.service)).size)} status="neutral" />
      </div>

      <Panel title="Define a key transaction" icon={<FiPlus />}>
        <form className="opa-row" style={{ flexWrap: 'wrap', gap: 'var(--sp-2)' }} onSubmit={create}>
          <input className="opa-input" placeholder="name (e.g. Checkout)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="opa-input" placeholder="service" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
          <input className="opa-input" placeholder="URL pattern (e.g. /cart/*)" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} />
          <input className="opa-input" style={{ flex: 1, minWidth: 160 }} placeholder="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button className="opa-btn primary" type="submit" disabled={busy}><FiPlus size={13} /> Add</button>
        </form>
        {err && <div style={{ color: 'var(--error)', fontSize: 'var(--fs-12)', marginTop: 8 }}>{String(err)}</div>}
      </Panel>

      <Panel title="Transactions" icon={<FiTarget />} flush loading={kt.loading} error={kt.error}>
        {rows.length === 0 && !kt.loading
          ? <EmptyState icon={<FiTarget />} title="No key transactions yet" hint="Define one above to start tracking a critical endpoint." />
          : <DataTable
              columns={columns} rows={rows}
              rowKey={(r, i) => r.transaction_id || `${r.service}-${r.name}-${i}`}
              onRowClick={(r) => r.service && navigate(`/services/${encodeURIComponent(r.service)}`)}
              initialSort={{ key: 'name', dir: 'asc' }}
            />}
      </Panel>
    </div>
  )
}
