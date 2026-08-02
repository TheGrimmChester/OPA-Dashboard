import React, { useMemo, useState } from 'react'
import axios from 'axios'
import {
  FiCpu, FiDownload, FiUpload, FiGitMerge, FiPlay, FiFileText,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'

const API = import.meta.env.VITE_API_URL || ''

const EMPTY_BUNDLE = `{
  "apiVersion": "opa.dev/v1",
  "kind": "ConfigBundle",
  "metadata": { "name": "example" },
  "spec": {
    "alerts": [],
    "slos": [],
    "dashboards": [],
    "synthetics": [],
    "teams": [],
    "entities": [],
    "ownership": [],
    "groups": []
  }
}`

/** Wave 22: Platform automation — mgmt API, plan/apply, export/import. */
export default function Automation() {
  const [tab, setTab] = useState('plan')
  const [bundleText, setBundleText] = useState(EMPTY_BUNDLE)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)
  const [promote, setPromote] = useState({
    source_organization_id: 'default-org',
    source_project_id: 'default-project',
    target_organization_id: 'default-org',
    target_project_id: 'staging',
    dry_run: true,
  })

  const index = useApi('/api/mgmt/v1', {}, { noRange: true })
  const revisions = useApi('/api/mgmt/v1/revisions', {}, { noRange: true })

  const resources = index.data?.resources || []
  const revs = revisions.data?.revisions || []

  const parseBundle = () => {
    try {
      return JSON.parse(bundleText)
    } catch (e) {
      throw new Error('Invalid JSON bundle: ' + e.message)
    }
  }

  const run = async (path, opts = {}) => {
    setBusy(true); setErr(null); setResult(null)
    try {
      const body = opts.noBody ? undefined : parseBundle()
      const { data } = await axios({
        method: opts.method || 'POST',
        url: `${API}${path}`,
        data: body,
        params: opts.params,
      })
      setResult(data)
      revisions.reload?.()
    } catch (e) {
      setErr(e.response?.data || e.message || 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const exportLive = async () => {
    setBusy(true); setErr(null)
    try {
      const { data } = await axios.get(`${API}/api/mgmt/v1/export`)
      setBundleText(JSON.stringify(data, null, 2))
      setResult({ exported: true, resources: Object.keys(data.spec || {}) })
      setTab('plan')
    } catch (e) {
      setErr(e.response?.data || e.message || 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  const runPromote = async () => {
    setBusy(true); setErr(null); setResult(null)
    try {
      const { data } = await axios.post(`${API}/api/mgmt/v1/promote`, promote)
      setResult(data)
      revisions.reload?.()
    } catch (e) {
      setErr(e.response?.data || e.message || 'Promote failed')
    } finally {
      setBusy(false)
    }
  }

  const diffs = result?.diffs || []
  const summary = result?.summary || {}

  const diffCols = [
    { key: 'action', header: 'Action', width: 90, render: (r) => {
      const tone = r.action === 'create' ? 'ok' : r.action === 'delete' ? 'error' : r.action === 'update' ? 'warn' : 'neutral'
      return <StatusPill tone={tone}>{r.action}</StatusPill>
    } },
    { key: 'resource', header: 'Resource', width: 110, render: (r) => <Badge>{r.resource}</Badge> },
    { key: 'id', header: 'ID', render: (r) => <span className="opa-mono">{r.id}</span> },
  ]

  const revCols = [
    { key: 'action', header: 'Action', width: 90, render: (r) => <Badge>{r.action}</Badge> },
    { key: 'applied', header: 'Applied', num: true, width: 90, render: (r) => fmtNum(r.applied) },
    { key: 'diff_count', header: 'Diffs', num: true, width: 80, render: (r) => fmtNum(r.diff_count) },
    { key: 'checksum', header: 'Checksum', render: (r) => <span className="opa-mono opa-muted">{String(r.checksum || '').slice(0, 12)}</span> },
    { key: 'created_at', header: 'When', num: true, width: 120, render: (r) => <span className="opa-muted">{fmtAgo(r.created_at)}</span> },
  ]

  const kpis = useMemo(() => ({
    resources: resources.length,
    revs: revs.length,
    create: summary.create || 0,
    update: summary.update || 0,
  }), [resources, revs, summary])

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Automation</h1>
          <div className="opa-page-sub">Management API · plan / apply · export / import / promote</div>
        </div>
        <div className="opa-row" style={{ gap: 8 }}>
          <button className="opa-btn ghost" disabled={busy} onClick={exportLive}>
            <FiDownload size={13} /> Export live
          </button>
          <a className="opa-btn ghost" href={`${API}/api/mgmt/v1/openapi.json`} target="_blank" rel="noreferrer">
            <FiFileText size={13} /> OpenAPI
          </a>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Resources" icon={<FiCpu size={12} />} value={fmtNum(kpis.resources)} status="neutral" />
        <KpiTile label="Revisions" icon={<FiGitMerge size={12} />} value={fmtNum(kpis.revs)} status="neutral" />
        <KpiTile label="Plan creates" icon={<FiUpload size={12} />} value={fmtNum(kpis.create)} status="neutral" />
        <KpiTile label="Plan updates" icon={<FiPlay size={12} />} value={fmtNum(kpis.update)} status="neutral" />
      </div>

      <div className="opa-tabs">
        <button type="button" className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>Plan / Apply</button>
        <button type="button" className={tab === 'promote' ? 'active' : ''} onClick={() => setTab('promote')}>Promote</button>
        <button type="button" className={tab === 'revisions' ? 'active' : ''} onClick={() => setTab('revisions')}>Revisions</button>
        <button type="button" className={tab === 'resources' ? 'active' : ''} onClick={() => setTab('resources')}>Resources</button>
      </div>

      {tab === 'plan' && (
        <>
          <Panel title="ConfigBundle" icon={<FiFileText />}>
            <textarea
              className="opa-input"
              style={{ width: '100%', minHeight: 220, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
              value={bundleText}
              onChange={(e) => setBundleText(e.target.value)}
            />
            <div className="opa-row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="opa-btn" disabled={busy} onClick={() => run('/api/mgmt/v1/plan')}>Plan</button>
              <button className="opa-btn primary" disabled={busy} onClick={() => run('/api/mgmt/v1/apply')}>Apply</button>
              <button className="opa-btn" disabled={busy} onClick={() => run('/api/mgmt/v1/import')}>Import</button>
              <button className="opa-btn ghost" disabled={busy} onClick={() => run('/api/mgmt/v1/import', { params: { prune: '1' } })}>
                Import + prune
              </button>
            </div>
            {err && <div className="syn-error" style={{ marginTop: 8 }}>{String(typeof err === 'object' ? JSON.stringify(err) : err)}</div>}
          </Panel>

          {diffs.length > 0 && (
            <Panel title="Diff" icon={<FiGitMerge />} flush>
              <DataTable columns={diffCols} rows={diffs.filter((d) => d.action !== 'noop')} rowKey={(r, i) => `${r.resource}:${r.id}:${i}`} maxHeight={360} />
            </Panel>
          )}

          {result && !diffs.length && (
            <Panel title="Result" icon={<FiPlay />}>
              <pre style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
            </Panel>
          )}
        </>
      )}

      {tab === 'promote' && (
        <Panel title="Promote between tenants" icon={<FiUpload />}>
          <div className="opa-inline-form" style={{ flexWrap: 'wrap' }}>
            <input className="opa-input" placeholder="Source org" value={promote.source_organization_id}
              onChange={(e) => setPromote({ ...promote, source_organization_id: e.target.value })} />
            <input className="opa-input" placeholder="Source project" value={promote.source_project_id}
              onChange={(e) => setPromote({ ...promote, source_project_id: e.target.value })} />
            <input className="opa-input" placeholder="Target org" value={promote.target_organization_id}
              onChange={(e) => setPromote({ ...promote, target_organization_id: e.target.value })} />
            <input className="opa-input" placeholder="Target project" value={promote.target_project_id}
              onChange={(e) => setPromote({ ...promote, target_project_id: e.target.value })} />
            <label className="opa-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!promote.dry_run}
                onChange={(e) => setPromote({ ...promote, dry_run: e.target.checked })} />
              Dry run
            </label>
            <button className="opa-btn primary" disabled={busy} onClick={runPromote}>
              {promote.dry_run ? 'Preview promote' : 'Promote'}
            </button>
          </div>
          {err && <div className="syn-error" style={{ marginTop: 8 }}>{String(typeof err === 'object' ? JSON.stringify(err) : err)}</div>}
          {result && (
            <pre style={{ fontSize: 12, marginTop: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
          )}
        </Panel>
      )}

      {tab === 'revisions' && (
        <Panel title="Config revisions" icon={<FiGitMerge />} flush loading={revisions.loading} error={revisions.error}
          empty={!revisions.loading && revs.length === 0} emptyText="No apply/import revisions yet">
          <DataTable columns={revCols} rows={revs} rowKey={(r) => r.id} maxHeight={420} />
        </Panel>
      )}

      {tab === 'resources' && (
        <Panel title="Managed resources" icon={<FiCpu />} flush loading={index.loading}>
          <DataTable
            columns={[
              { key: 'name', header: 'Resource', render: (r) => <span className="opa-mono cell-strong">{r.name}</span> },
              { key: 'description', header: 'Description' },
              { key: 'table', header: 'Storage', render: (r) => <span className="opa-muted">{r.table}</span> },
            ]}
            rows={resources}
            rowKey={(r) => r.name}
          />
        </Panel>
      )}
    </div>
  )
}
