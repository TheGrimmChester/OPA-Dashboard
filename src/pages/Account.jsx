import React from 'react'
import { FiUser } from 'react-icons/fi'
import { Badge } from '../components/ui'
import { useTenant } from '../contexts/TenantContext'

/**
 * Account — signed-in identity for the OPA dashboard.
 * SCM connectors and review-provider credentials live in ORA; AppSec settings in OSA.
 */
export default function Account() {
  const { organizationId } = useTenant()
  const username = localStorage.getItem('username') || ''
  const role = localStorage.getItem('role') || ''
  const orgSelected = organizationId && organizationId !== 'all'

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <h1 className="opa-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiUser size={22} /> Account
        </h1>
        <div className="opa-page-sub">
          Profile and tenant context for Open Profiling Agent.
          {username && (
            <>
              {' '}Signed in as <code className="oui-mono">{username}</code>
              {role && <> · <Badge>{role}</Badge></>}
            </>
          )}
        </div>
      </div>

      <div className="opa-panel" style={{ padding: 16 }}>
        <div className="oui-text-muted" style={{ fontSize: 13, marginBottom: 8 }}>Organization</div>
        <div className="cell-strong">
          {orgSelected ? organizationId : 'All organizations (tenant switcher)'}
        </div>
        <p className="oui-text-muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
          Use the tenant switcher in the top bar to scope queries. API keys and users are managed under Admin.
        </p>
      </div>
    </div>
  )
}
