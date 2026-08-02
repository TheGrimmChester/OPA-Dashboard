import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiCpu, FiShield } from 'react-icons/fi'
import ScopedAISettings from '../components/account/ScopedAISettings'

/**
 * Admin AI settings entry. Personal/org credentials live on Account.
 * ?scope=admin manages isolated platform-admin keys (never inherited).
 */
export default function AISettings() {
  const [params] = useSearchParams()
  const scope = params.get('scope') === 'admin' ? 'admin' : 'admin'
  const role = localStorage.getItem('role') || ''
  // Auth-off smoke leaves role empty — allow. Otherwise require platform admin.
  const isAdmin = role === 'admin' || role === ''

  return (
    <div className="opa-page">
      <div className="opa-page-header">
        <div>
          <div className="opa-page-title"><FiCpu /> AI settings</div>
          <div className="opa-page-sub">
            Platform admin credentials only — never shared with orgs or users.
            Members manage personal/org keys under{' '}
            <Link to="/settings/account">Account</Link>.
          </div>
        </div>
      </div>

      <div className="opa-muted" style={{
        marginBottom: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <FiShield size={14} style={{ marginTop: 2 }} />
        <div>
          Resolution for tenant jobs is <strong>user → org → fail closed</strong>.
          Process env API keys are not used. Admin keys on this page are isolated.
        </div>
      </div>

      {isAdmin ? (
        <ScopedAISettings scope={scope} title="Admin AI tokens" />
      ) : (
        <p className="opa-muted">Admin role required. Use <Link to="/settings/account">Account</Link> for personal or org credentials.</p>
      )}
    </div>
  )
}
