import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiGitBranch, FiEdit2, FiTrash2, FiRefreshCw } from 'react-icons/fi'
import { Panel, Badge } from '../ui'
import { useConnectors, connectorLabel } from '../../hooks/useConnectors'

/**
 * Full SCM connector management UI — list, connect GitHub App / PAT, edit, delete.
 * Embeddable; the Connectors settings page wraps this.
 */
export default function ConnectorsManager({
  initialEditId = '',
  onFlash,
  footer = null,
  defaultScope = 'org',
  scopeFilter = '', // when set, only list connectors of this scope
  readOnly = false,
}) {
  const {
    connectors: allConnectors,
    githubAppConfigured,
    canEditOrg,
    canEditAdmin,
    canEditUser,
    loading,
    error,
    reload,
    busy,
    connectPAT,
    openGitHubInstall,
    updateConnector,
    deleteConnector,
  } = useConnectors()

  const connectors = scopeFilter
    ? allConnectors.filter((c) => (c.scope || 'org') === scopeFilter)
    : allConnectors.filter((c) => {
      const s = c.scope || 'org'
      if (s === 'admin') return canEditAdmin || defaultScope === 'admin'
      return true
    })

  const allowedScopes = []
  if (canEditUser) allowedScopes.push('user')
  if (canEditOrg) allowedScopes.push('org')
  if (canEditAdmin) allowedScopes.push('admin')

  const effectiveDefault = allowedScopes.includes(defaultScope)
    ? defaultScope
    : (allowedScopes[0] || 'user')

  const [patForm, setPatForm] = useState({ token: '', login: '', repos: '', scope: effectiveDefault })
  const [editForm, setEditForm] = useState({ login: '', display_name: '', token: '' })
  const [editingId, setEditingId] = useState('')

  const flash = (tone, title, detail) => {
    onFlash?.(tone, title, detail)
  }

  useEffect(() => {
    setPatForm((f) => ({ ...f, scope: effectiveDefault }))
  }, [effectiveDefault])

  const scopeWritable = (scope) => {
    const s = scope || effectiveDefault
    if (s === 'admin') return canEditAdmin
    if (s === 'org') return canEditOrg
    return canEditUser
  }

  // Create/edit form is available when the active (or filtered) scope is writable.
  const activeScope = scopeFilter || patForm.scope || effectiveDefault
  const formReadOnly = readOnly || !scopeWritable(activeScope) || allowedScopes.length === 0

  useEffect(() => {
    if (!initialEditId || !connectors.length) return
    const c = connectors.find((x) => x.id === initialEditId)
    if (c) beginEdit(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditId, connectors.length])

  const beginEdit = (c) => {
    if (!c?.id) return
    setEditingId(c.id)
    let display = c.display_name || ''
    if (!display && c.meta_json) {
      try {
        display = JSON.parse(c.meta_json)?.display_name || ''
      } catch { /* ignore */ }
    }
    setEditForm({
      login: c.account_login || '',
      display_name: display || '',
      token: '',
    })
  }

  const handleConnectPAT = async () => {
    if (formReadOnly) return
    const scope = patForm.scope || effectiveDefault
    if (!scopeWritable(scope)) {
      flash('error', 'Not allowed', `Cannot create ${scope}-scoped connectors`)
      return
    }
    const result = await connectPAT({ ...patForm, scope })
    if (result.ok) {
      flash('ok', 'GitHub PAT connected', result.data?.honesty)
      setPatForm((f) => ({ token: '', login: f.login, repos: f.repos, scope: f.scope }))
      const id = result.data?.connector?.id
      if (id) {
        beginEdit({ id, account_login: patForm.login, display_name: '', meta_json: '{}', scope })
        setEditingId(id)
      }
    } else {
      flash('error', 'PAT connect failed', result.error)
    }
  }

  const handleGitHubInstall = async () => {
    if (formReadOnly || !canEditOrg) return
    const result = await openGitHubInstall()
    if (result.ok) return
    if (result.warn) flash('warn', 'GitHub App not configured', result.error)
    else flash('error', 'Install URL failed', result.error)
  }

  const handleSaveEdit = async () => {
    if (formReadOnly || !editingId) {
      if (!editingId) flash('warn', 'Select a connector first')
      return
    }
    const result = await updateConnector(editingId, {
      account_login: editForm.login,
      display_name: editForm.display_name,
      token: editForm.token,
    })
    if (result.ok) {
      flash('ok', 'Connector updated', result.data?.connector?.account_login || editingId)
      setEditForm((f) => ({ ...f, token: '' }))
      setEditingId('')
    } else {
      flash('error', 'Connector update failed', result.error)
    }
  }

  const handleDelete = async (id) => {
    if (formReadOnly || !id) return
    if (!window.confirm(`Delete connector ${id}? Watched repos for it will be disabled.`)) return
    const result = await deleteConnector(id)
    if (result.ok) {
      flash('ok', 'Connector deleted', id)
      if (editingId === id) setEditingId('')
    } else {
      flash('error', 'Delete failed', result.error)
    }
  }

  return (
    <Panel
      title={scopeFilter ? `Connectors · ${scopeFilter}` : 'Active connectors'}
      icon={<FiGitBranch />}
      loading={loading}
      error={error}
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!formReadOnly && canEditOrg && defaultScope !== 'user' && (
            <button type="button" className="opa-btn ghost" onClick={handleGitHubInstall}>
              Connect GitHub App
            </button>
          )}
          <button type="button" className="opa-btn ghost" onClick={() => reload?.()}>
            <FiRefreshCw size={12} /> Refresh
          </button>
        </div>
      }
    >
      <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
        GitHub App is production (webhooks + Check Runs). PAT bootstrap is for local/dev.
        App configured: {githubAppConfigured ? 'yes' : 'no'}.
        {' '}Used by{' '}
        <Link to="/security?tab=ops&mode=watch">Security · Repo Watch</Link>
        {' '}and{' '}
        <Link to="/settings/account">Account</Link>.
      </p>

      {!formReadOnly && (
        <>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              PAT token
              <input
                type="password"
                className="opa-mono"
                value={patForm.token}
                onChange={(e) => setPatForm((f) => ({ ...f, token: e.target.value }))}
                placeholder="ghp_… (or any token when mock)"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              Login
              <input
                value={patForm.login}
                onChange={(e) => setPatForm((f) => ({ ...f, login: e.target.value }))}
                placeholder="github-user"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              Extra repos (optional)
              <input
                className="opa-mono"
                value={patForm.repos}
                onChange={(e) => setPatForm((f) => ({ ...f, repos: e.target.value }))}
                placeholder="org/name … if not in list"
              />
            </label>
            {!scopeFilter && allowedScopes.length > 1 && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Scope
                <select
                  value={patForm.scope || effectiveDefault}
                  onChange={(e) => setPatForm((f) => ({ ...f, scope: e.target.value }))}
                >
                  {allowedScopes.includes('user') && <option value="user">user (personal)</option>}
                  {allowedScopes.includes('org') && <option value="org">org (shared defaults)</option>}
                  {allowedScopes.includes('admin') && <option value="admin">admin (isolated)</option>}
                </select>
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button
              type="button"
              className="opa-btn primary"
              disabled={busy || !patForm.token}
              onClick={handleConnectPAT}
            >
              Connect PAT
            </button>
          </div>
        </>
      )}

      <div>
        <div className="cell-strong" style={{ marginBottom: 8 }}>Connected</div>
        {connectors.length === 0 && (
          <div className="opa-muted">No connectors yet{scopeFilter ? ` at ${scopeFilter} scope` : ''}.</div>
        )}
        {connectors.map((c) => {
          const rowWritable = !readOnly && scopeWritable(c.scope || scopeFilter || 'org')
          return (
          <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 8, marginBottom: 8 }}>
            <button
              type="button"
              className={`opa-btn ${editingId === c.id ? 'primary' : 'ghost'}`}
              onClick={() => rowWritable && beginEdit(c)}
              title={c.has_token
                ? `Scope ${c.scope || 'org'} — credentials available`
                : 'No decryptable token — Replace token or Connect PAT'}
            >
              {connectorLabel(c)}
            </button>
            <Badge title={`scope=${c.scope || 'org'}`}>{c.scope || 'org'}</Badge>
            {rowWritable && (
              <>
                <button type="button" className="opa-btn ghost" title="Edit connector" disabled={busy}
                  onClick={() => beginEdit(c)} aria-label={`Edit ${c.id}`}>
                  <FiEdit2 size={12} />
                </button>
                <button type="button" className="opa-btn ghost" title="Delete connector" disabled={busy}
                  onClick={() => handleDelete(c.id)} aria-label={`Delete ${c.id}`}>
                  <FiTrash2 size={12} />
                </button>
              </>
            )}
          </div>
          )
        })}
      </div>

      {!formReadOnly && editingId && (
        <div style={{
          marginTop: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
        }}>
          <div className="cell-strong" style={{ marginBottom: 8 }}>
            Edit connector <code className="opa-mono" style={{ fontWeight: 400 }}>{editingId}</code>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              Login label
              <input value={editForm.login} onChange={(e) => setEditForm((f) => ({ ...f, login: e.target.value }))} placeholder="github-user" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              Display name
              <input value={editForm.display_name} onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="optional" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              Replace PAT (optional)
              <input type="password" className="opa-mono" value={editForm.token}
                onChange={(e) => setEditForm((f) => ({ ...f, token: e.target.value }))}
                placeholder="ghp_… leave blank to keep" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="opa-btn primary" disabled={busy} onClick={handleSaveEdit}>Save</button>
            <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => setEditingId('')}>Cancel</button>
          </div>
        </div>
      )}

      {footer}
    </Panel>
  )
}
