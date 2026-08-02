import React, { useState } from 'react'
import axios from 'axios'
import {
  FiGlobe, FiShield, FiShare2, FiServer, FiCheck, FiX,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'
import { useI18n } from '../contexts/I18nContext'

const API = import.meta.env.VITE_API_URL || ''

const TABS = [
  { value: 'federation', labelKey: 'fed.federation', icon: <FiShare2 size={13} /> },
  { value: 'residency', labelKey: 'fed.residency', icon: <FiShield size={13} /> },
  { value: 'transfers', labelKey: 'fed.transfers', icon: <FiGlobe size={13} /> },
]

function Tabs({ tabs = [], value, onChange, t }) {
  return (
    <div className="opa-tabs">
      {tabs.map((tab) => (
        <button key={tab.value} className={`opa-tab ${value === tab.value ? 'active' : ''}`} onClick={() => onChange(tab.value)}>
          {tab.icon}{t(tab.labelKey)}
        </button>
      ))}
    </div>
  )
}

/** Wave 25: Multi-region federation & residency. */
export default function Federation() {
  const { t } = useI18n()
  const [tab, setTab] = useState('federation')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [tqlQuery, setTqlQuery] = useState('SELECT count() FROM spans SINCE 1h')
  const [policyForm, setPolicyForm] = useState({
    organization_id: 'default-org',
    project_id: 'default-project',
    home_region: 'eu-west-1',
    allowed_regions: 'eu-west-1',
    transfer_policy: 'deny',
    notes: '',
  })
  const [xferForm, setXferForm] = useState({
    organization_id: 'default-org',
    project_id: 'default-project',
    to_region: 'us-east-1',
    reason: '',
  })

  const summary = useApi('/api/federation/summary', {}, { noRange: true })
  const peers = useApi('/api/federation/peers', {}, { noRange: true })
  const policy = useApi('/api/residency/policy', {}, { noRange: true })
  const transfers = useApi('/api/residency/transfers', {}, { noRange: true })
  const topology = useApi('/api/topology', {}, { noRange: true })

  const s = summary.data || {}
  const peerRows = peers.data?.peers || []
  const xferRows = transfers.data?.transfers || []
  const pol = policy.data || {}

  const runFederationQuery = async (kind) => {
    setBusy(true); setMsg(null)
    try {
      let data
      if (kind === 'tql') {
        const res = await axios.post(`${API}/api/federation/query`, { query: tqlQuery }, { params: { kind: 'tql' } })
        data = res.data
      } else {
        const res = await axios.get(`${API}/api/federation/query`, { params: { kind } })
        data = res.data
      }
      setMsg(data)
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const upsertPolicy = async () => {
    setBusy(true); setMsg(null)
    try {
      const body = {
        ...policyForm,
        allowed_regions: String(policyForm.allowed_regions || '').split(',').map((x) => x.trim()).filter(Boolean),
      }
      const { data } = await axios.post(`${API}/api/residency/policy/upsert`, body)
      setMsg(data)
      policy.reload?.()
      summary.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const createTransfer = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/residency/transfers/create`, xferForm)
      setMsg(data)
      transfers.reload?.()
      summary.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const decide = async (row, approve) => {
    setBusy(true)
    try {
      await axios.post(`${API}/api/residency/transfers/decide`, {
        id: row.id,
        organization_id: row.organization_id,
        project_id: row.project_id,
        from_region: row.from_region,
        to_region: row.to_region,
        reason: row.reason,
        approve,
      })
      transfers.reload?.()
      summary.reload?.()
    } finally {
      setBusy(false)
    }
  }

  const peerCols = [
    { key: 'id', header: 'ID', render: (r) => <span className="opa-mono cell-strong">{r.id}</span> },
    { key: 'region', header: 'Region', render: (r) => <Badge>{r.region}</Badge> },
    { key: 'base_url', header: 'URL', render: (r) => <span className="opa-mono opa-muted">{r.base_url}</span> },
    { key: 'enabled', header: 'On', render: (r) => (r.enabled !== false ? <StatusPill tone="ok">yes</StatusPill> : <StatusPill tone="warn">no</StatusPill>) },
  ]

  const xferCols = [
    { key: 'id', header: 'ID', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{r.id}</span> },
    { key: 'from_region', header: 'From', render: (r) => <Badge>{r.from_region}</Badge> },
    { key: 'to_region', header: 'To', render: (r) => <Badge>{r.to_region}</Badge> },
    { key: 'status', header: 'Status', render: (r) => {
      const tone = r.status === 'approved' ? 'ok' : r.status === 'denied' ? 'error' : 'warn'
      return <StatusPill tone={tone}>{r.status}</StatusPill>
    } },
    { key: 'reason', header: 'Reason', render: (r) => <span className="opa-muted">{r.reason || '—'}</span> },
    { key: 'created_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.created_at)}</span> },
    { key: 'actions', header: '', render: (r) => r.status === 'requested' ? (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button className="opa-btn" disabled={busy} onClick={() => decide(r, true)} title="Approve"><FiCheck size={14} /></button>
        <button className="opa-btn" disabled={busy} onClick={() => decide(r, false)} title="Deny"><FiX size={14} /></button>
      </span>
    ) : null },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">{t('fed.title')}</h1>
          <div className="opa-page-sub">{t('fed.subtitle')}</div>
        </div>
        <StatusPill tone="ok">{s.region || topology.data?.region || '…'}</StatusPill>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Region" icon={<FiGlobe size={12} />} value={s.region || '—'} status="neutral" />
        <KpiTile label="Peers" icon={<FiShare2 size={12} />} value={fmtNum(s.peers || 0)} status="neutral" />
        <KpiTile label="Policies" icon={<FiShield size={12} />} value={fmtNum(s.policies || 0)} status="neutral" />
        <KpiTile label="Pending xfers" icon={<FiServer size={12} />} value={fmtNum(s.pending_transfers || 0)}
          status={Number(s.pending_transfers) > 0 ? 'warn' : 'ok'}
          footer={<span className="opa-muted" style={{ fontSize: 11 }}>denies {fmtNum(s.residency_denies || 0)}</span>} />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} t={t} />

      {msg && (
        <Panel title="Result">
          <pre className="opa-mono" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(msg, null, 2)}</pre>
        </Panel>
      )}

      {tab === 'federation' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="opa-btn" disabled={busy} onClick={() => runFederationQuery('summary')}>{t('fed.querySummary')}</button>
            <button className="opa-btn" disabled={busy} onClick={() => runFederationQuery('residency')}>{t('fed.queryResidency')}</button>
          </div>
          <Panel title="Federated TQL">
            <div className="opa-muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Fan-out only — rows stay in-region and are tagged with _region / _peer_id (not a global warehouse join).
            </div>
            <textarea className="opa-input" rows={3} style={{ width: '100%', fontFamily: 'var(--opa-mono, monospace)' }}
              value={tqlQuery} onChange={(e) => setTqlQuery(e.target.value)} />
            <div style={{ marginTop: 8 }}>
              <button className="opa-btn" disabled={busy || !tqlQuery.trim()} onClick={() => runFederationQuery('tql')}>{t('fed.queryTql')}</button>
            </div>
          </Panel>
          <Panel title="Peers" icon={<FiShare2 />} flush loading={peers.loading} error={peers.error}
            empty={!peers.loading && peerRows.length === 0} emptyText="Set OPA_FEDERATION_PEERS or POST /api/federation/peers/upsert">
            <DataTable columns={peerCols} rows={peerRows} rowKey={(r) => r.id} maxHeight={320} />
          </Panel>
        </>
      )}

      {tab === 'residency' && (
        <div className="opa-grid cols-2">
          <Panel title="Current policy" icon={<FiShield />} loading={policy.loading} error={policy.error}>
            <div style={{ marginBottom: 12 }}>
              Write allowed:{' '}
              <StatusPill tone={pol.write_allowed ? 'ok' : 'error'}>{pol.write_allowed ? 'yes' : 'no'}</StatusPill>
              {pol.deny_reason && <div className="opa-muted" style={{ marginTop: 8, fontSize: 12 }}>{pol.deny_reason}</div>}
            </div>
            <pre className="opa-mono" style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(pol.policy || null, null, 2)}
            </pre>
          </Panel>
          <Panel title="Upsert policy" icon={<FiShield />}>
            {['organization_id', 'project_id', 'home_region', 'allowed_regions', 'transfer_policy', 'notes'].map((k) => (
              <label key={k} style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                <span className="opa-muted">{k}</span>
                <input className="opa-input" style={{ width: '100%' }} value={policyForm[k]}
                  onChange={(e) => setPolicyForm({ ...policyForm, [k]: e.target.value })} />
              </label>
            ))}
            <button className="opa-btn" disabled={busy} onClick={upsertPolicy}>Save policy</button>
          </Panel>
        </div>
      )}

      {tab === 'transfers' && (
        <>
          <Panel title="Request transfer">
            {['organization_id', 'project_id', 'to_region', 'reason'].map((k) => (
              <label key={k} style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                <span className="opa-muted">{k}</span>
                <input className="opa-input" style={{ width: '100%' }} value={xferForm[k]}
                  onChange={(e) => setXferForm({ ...xferForm, [k]: e.target.value })} />
              </label>
            ))}
            <button className="opa-btn" disabled={busy} onClick={createTransfer}>Create</button>
          </Panel>
          <Panel title="Transfer history" icon={<FiGlobe />} flush loading={transfers.loading} error={transfers.error}
            empty={!transfers.loading && xferRows.length === 0} emptyText="No transfer requests">
            <DataTable columns={xferCols} rows={xferRows} rowKey={(r) => r.id} maxHeight={360} />
          </Panel>
        </>
      )}
    </div>
  )
}
