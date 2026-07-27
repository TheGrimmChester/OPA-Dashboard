import React, { useState, useMemo } from 'react'
import axios from 'axios'
import { FiKey, FiPlus, FiTrash2, FiCopy, FiCheck, FiAlertTriangle, FiGrid, FiFolder } from 'react-icons/fi'
import { Panel, DataTable, Badge, EmptyState } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { fmtAgo } from '../theme/format'

const API = import.meta.env.VITE_API_URL || ''

// Small copy-to-clipboard button used for secrets (API key, DSN).
function CopyButton({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value) } catch { /* clipboard may be blocked */ }
    setDone(true)
    setTimeout(() => setDone(false), 1600)
  }
  return (
    <button className="opa-btn ghost" onClick={copy} title="Copy to clipboard">
      {done ? <FiCheck size={13} /> : <FiCopy size={13} />} {done ? 'Copied' : label}
    </button>
  )
}

// One-time reveal callout for a freshly minted secret — it is never retrievable
// again, so it stays until the admin dismisses it.
function SecretReveal({ title, value, note, onDismiss }) {
  return (
    <div className="opa-secret-reveal">
      <div className="opa-secret-head">
        <FiAlertTriangle size={14} /> <strong>{title}</strong>
      </div>
      {note && <div className="opa-secret-note">{note}</div>}
      <div className="opa-secret-value">
        <code>{value}</code>
        <CopyButton value={value} />
      </div>
      <button className="opa-btn ghost opa-secret-dismiss" onClick={onDismiss}>Dismiss</button>
    </div>
  )
}

export default function ApiKeys() {
  const orgsQ = useApi('/api/organizations', {}, { noRange: true })
  const orgs = orgsQ.data?.organizations || []

  const [org, setOrg] = useState('') // '' → resolved to first org below
  const activeOrg = org || orgs[0]?.org_id || 'default-org'

  const projectsQ = useApi('/api/projects', { organization_id: activeOrg }, { noRange: true, skip: !orgs.length })
  const projects = projectsQ.data?.projects || []

  const keysQ = useApi('/api/api-keys', { organization_id: activeOrg }, { noRange: true })
  const keys = keysQ.data?.api_keys || []

  // --- create-key form ---
  const [keyForm, setKeyForm] = useState({ name: '', project_id: '', expires_at: '' })
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyErr, setKeyErr] = useState(null)
  const [newKey, setNewKey] = useState(null) // one-time full key string

  const projectForForm = keyForm.project_id || projects[0]?.project_id || ''

  const createKey = async (e) => {
    e.preventDefault()
    setKeyErr(null)
    if (!projectForForm) { setKeyErr('Create a project first.'); return }
    setKeyBusy(true)
    try {
      const body = { organization_id: activeOrg, project_id: projectForForm, name: keyForm.name.trim() }
      if (keyForm.expires_at) body.expires_at = `${keyForm.expires_at}T23:59:59Z`
      const res = await axios.post(`${API}/api/api-keys`, body)
      setNewKey(res.data?.key || '(key not returned)')
      setKeyForm({ name: '', project_id: '', expires_at: '' })
      keysQ.reload()
    } catch (err) {
      setKeyErr(err.response?.data || err.message || 'Failed to create key')
    } finally {
      setKeyBusy(false)
    }
  }

  const revokeKey = async (row) => {
    if (!window.confirm(`Revoke API key "${row.name || row.key_id}"? Clients using it will stop authenticating.`)) return
    try {
      await axios.delete(`${API}/api/api-keys/${encodeURIComponent(row.key_id)}`)
      keysQ.reload()
    } catch (err) {
      window.alert(`Revoke failed: ${err.response?.data || err.message}`)
    }
  }

  // --- create-org form ---
  const [orgName, setOrgName] = useState('')
  const [orgBusy, setOrgBusy] = useState(false)
  const createOrg = async (e) => {
    e.preventDefault()
    if (!orgName.trim()) return
    setOrgBusy(true)
    try {
      await axios.post(`${API}/api/organizations`, { name: orgName.trim() })
      setOrgName('')
      orgsQ.reload()
    } catch (err) {
      window.alert(`Create org failed: ${err.response?.data || err.message}`)
    } finally { setOrgBusy(false) }
  }

  // --- create-project form ---
  const [projName, setProjName] = useState('')
  const [projBusy, setProjBusy] = useState(false)
  const [newDsn, setNewDsn] = useState(null) // one-time DSN reveal
  const createProject = async (e) => {
    e.preventDefault()
    if (!projName.trim()) return
    setProjBusy(true)
    try {
      const res = await axios.post(`${API}/api/projects`, { org_id: activeOrg, name: projName.trim() })
      if (res.data?.dsn) setNewDsn(res.data.dsn)
      setProjName('')
      projectsQ.reload()
    } catch (err) {
      window.alert(`Create project failed: ${err.response?.data || err.message}`)
    } finally { setProjBusy(false) }
  }

  const keyColumns = useMemo(() => [
    { key: 'name', header: 'Name', render: (r) => r.name || <span style={{ color: 'var(--text-muted)' }}>—</span> },
    { key: 'project_id', header: 'Project', mono: true },
    { key: 'created_at', header: 'Created', sortValue: (r) => r.created_at, render: (r) => fmtAgo(r.created_at) },
    { key: 'expires_at', header: 'Expires', render: (r) => (r.expires_at ? r.expires_at : <Badge>never</Badge>) },
    {
      key: '_actions', header: '', sortable: false, align: 'right', width: 110,
      render: (r) => (
        <button className="opa-btn ghost" onClick={(e) => { e.stopPropagation(); revokeKey(r) }} title="Revoke">
          <FiTrash2 size={13} /> Revoke
        </button>
      ),
    },
  ], [])

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">API Keys &amp; Access</h1>
          <div className="opa-page-sub">Ingestion credentials, organizations and projects</div>
        </div>
      </div>

      {/* org scope selector */}
      <div className="opa-scope-bar">
        <label className="opa-scope-label">Organization</label>
        <select className="opa-select" value={activeOrg} onChange={(e) => setOrg(e.target.value)}>
          {orgs.length === 0 && <option value="default-org">default-org</option>}
          {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name || o.org_id}</option>)}
        </select>
        <span className="opa-scope-count">{projects.length} project{projects.length === 1 ? '' : 's'} · {keys.length} key{keys.length === 1 ? '' : 's'}</span>
      </div>

      <Panel
        title="API Keys"
        icon={<FiKey size={14} />}
        loading={keysQ.loading}
        error={keysQ.error}
      >
        {newKey && (
          <SecretReveal
            title="API key created"
            value={newKey}
            note="Copy this key now — it is shown only once and cannot be retrieved again."
            onDismiss={() => setNewKey(null)}
          />
        )}

        <form className="opa-inline-form" onSubmit={createKey}>
          <input
            className="opa-input" placeholder="Key name (e.g. prod-ingest)"
            value={keyForm.name} onChange={(e) => setKeyForm((f) => ({ ...f, name: e.target.value }))}
          />
          <select
            className="opa-select" value={projectForForm}
            onChange={(e) => setKeyForm((f) => ({ ...f, project_id: e.target.value }))}
          >
            {projects.length === 0 && <option value="">— no projects —</option>}
            {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.name || p.project_id}</option>)}
          </select>
          <input
            className="opa-input" type="date" title="Expiry (optional)"
            value={keyForm.expires_at} onChange={(e) => setKeyForm((f) => ({ ...f, expires_at: e.target.value }))}
          />
          <button className="opa-btn primary" disabled={keyBusy}><FiPlus size={13} /> {keyBusy ? 'Creating…' : 'Create key'}</button>
        </form>
        {keyErr && <div className="opa-form-err">{String(keyErr)}</div>}

        {keys.length === 0
          ? <EmptyState icon={<FiKey />} title="No API keys" hint="Create a key above to start ingesting from this project." />
          : <DataTable columns={keyColumns} rows={keys} rowKey={(r) => r.key_id} initialSort={{ key: 'created_at', dir: 'desc' }} />}
      </Panel>

      <div className="opa-admin-grid">
        <Panel title="Organizations" icon={<FiGrid size={14} />} loading={orgsQ.loading} error={orgsQ.error}>
          <form className="opa-inline-form" onSubmit={createOrg}>
            <input className="opa-input" placeholder="New organization name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            <button className="opa-btn primary" disabled={orgBusy}><FiPlus size={13} /> Add</button>
          </form>
          {orgs.length === 0
            ? <EmptyState icon={<FiGrid />} title="No organizations" />
            : (
              <DataTable
                columns={[
                  { key: 'name', header: 'Name', render: (r) => r.name || r.org_id },
                  { key: 'org_id', header: 'ID', mono: true },
                ]}
                rows={orgs} rowKey={(r) => r.org_id}
              />
            )}
        </Panel>

        <Panel title="Projects" icon={<FiFolder size={14} />} loading={projectsQ.loading} error={projectsQ.error}>
          {newDsn && (
            <SecretReveal
              title="Project created"
              value={newDsn}
              note="DSN for this project — point your agent's OPA_DSN at it."
              onDismiss={() => setNewDsn(null)}
            />
          )}
          <form className="opa-inline-form" onSubmit={createProject}>
            <input className="opa-input" placeholder={`New project in ${activeOrg}`} value={projName} onChange={(e) => setProjName(e.target.value)} />
            <button className="opa-btn primary" disabled={projBusy}><FiPlus size={13} /> Add</button>
          </form>
          {projects.length === 0
            ? <EmptyState icon={<FiFolder />} title="No projects" hint="Projects scope ingestion within an organization." />
            : (
              <DataTable
                columns={[
                  { key: 'name', header: 'Name', render: (r) => r.name || r.project_id },
                  { key: 'project_id', header: 'ID', mono: true },
                ]}
                rows={projects} rowKey={(r) => r.project_id}
              />
            )}
        </Panel>
      </div>
    </div>
  )
}
