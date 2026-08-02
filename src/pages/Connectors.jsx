import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiGitBranch } from 'react-icons/fi'
import { ConnectorsManager } from '../components/connectors'
import { useToast } from '../components/ui/Toast'

export default function Connectors() {
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const [banner, setBanner] = useState(null)
  const editId = searchParams.get('edit') || ''
  const role = localStorage.getItem('role') || ''
  const isAdmin = role === 'admin' || role === ''
  // Standalone connectors page: non-admins manage personal only; admins can pick scopes via API flags.
  const defaultScope = isAdmin ? 'org' : 'user'

  const onFlash = (tone, title, detail) => {
    setBanner({ tone, title, detail })
    toast.push(title, { tone: tone === 'error' ? 'error' : 'neutral' })
  }

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <h1 className="opa-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiGitBranch size={22} /> Connectors
        </h1>
        <div className="opa-page-sub">
          SCM connections (GitHub App, PAT) shared by{' '}
          <Link to="/security?tab=watch">Security · Repo Watch</Link>
          {' '}and other tools.
          {!isAdmin && <> Non-admins manage personal connectors; org defaults are on <Link to="/settings/account">Account</Link>.</>}
        </div>
      </div>

      {banner && (
        <div className="opa-banner" role="status" style={{
          display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)',
        }}>
          <div>
            <div className="cell-strong">{banner.title}</div>
            {banner.detail && (
              <div className="opa-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {typeof banner.detail === 'string' ? banner.detail : JSON.stringify(banner.detail)}
              </div>
            )}
          </div>
          <button type="button" className="opa-btn ghost" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      <ConnectorsManager initialEditId={editId} onFlash={onFlash} defaultScope={defaultScope} />
    </div>
  )
}
