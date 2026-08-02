import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiUser, FiBriefcase, FiShield } from 'react-icons/fi'
import { Panel, Badge, Tabs } from '../components/ui'
import { ConnectorsManager } from '../components/connectors'
import ScopedAISettings from '../components/account/ScopedAISettings'
import { useTenant } from '../contexts/TenantContext'
import { useToast } from '../components/ui/Toast'

/**
 * Account / My settings — personal and (when allowed) org-scoped credentials.
 * Never surfaces admin-global keys; those stay on Admin → AI settings with admin scope.
 */
export default function Account() {
  const toast = useToast()
  const { organizationId } = useTenant()
  const username = localStorage.getItem('username') || ''
  const role = localStorage.getItem('role') || ''
  const isAdmin = role === 'admin'
  const orgSelected = organizationId && organizationId !== 'all'
  const canEditOrg = isAdmin && orgSelected

  const tabs = useMemo(() => {
    const list = [{ value: 'personal', label: 'Personal' }]
    // Members may view org defaults; only admins edit (server enforces).
    if (orgSelected) list.push({ value: 'organization', label: 'Organization' })
    return list
  }, [orgSelected])

  const [tab, setTab] = useState('personal')
  const [banner, setBanner] = useState(null)

  useEffect(() => {
    if (tab === 'organization' && !orgSelected) setTab('personal')
  }, [tab, orgSelected])

  const onFlash = (tone, title, detail) => {
    setBanner({ tone, title, detail })
    toast.push(title, { tone: tone === 'error' ? 'error' : 'neutral' })
  }

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <h1 className="opa-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiUser size={22} /> Account
        </h1>
        <div className="opa-page-sub">
          Manage your connectors and AI agent tokens.
          {' '}Jobs resolve <strong>personal → org</strong> and fail closed — admin keys are never shared.
          {username && (
            <> Signed in as <code className="opa-mono">{username}</code>
              {role && <> · <Badge>{role}</Badge></>}
            </>
          )}
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

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'personal' && (
        <div className="opa-stack" style={{ gap: 16 }}>
          <Panel title="Personal credentials" icon={<FiUser />}>
            <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
              Your overrides for the selected organization. If a personal key is unset, the org default is used.
              Platform admin keys are never visible or usable here.
            </p>
            {!orgSelected && (
              <div className="opa-muted" style={{
                marginBottom: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
              }}>
                Select an organization in the tenant switcher so personal overrides attach to the right org.
              </div>
            )}
          </Panel>

          <ScopedAISettings
            scope="user"
            title="My AI tokens"
            // Personal keys are stored per selected org — saving with tenant=All
            // silently attaches to default-org and then looks "missing" on other orgs.
            readOnly={!orgSelected}
            subtitle={orgSelected
              ? undefined
              : 'Select an organization in the tenant switcher before saving personal AI keys.'}
          />

          <ConnectorsManager
            defaultScope="user"
            scopeFilter="user"
            onFlash={onFlash}
            footer={
              <p className="opa-muted" style={{ fontSize: 12, marginTop: 12 }}>
                Prefer org-shared GitHub App connectors when available; personal PATs are for your own jobs only.
              </p>
            }
          />
        </div>
      )}

      {tab === 'organization' && (
        <div className="opa-stack" style={{ gap: 16 }}>
          <Panel title="Organization defaults" icon={<FiBriefcase />}>
            <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
              Org-level connectors and AI keys inherited by members who have no personal override.
              Only admins can edit. These are separate from platform admin keys.
            </p>
            {!orgSelected && (
              <div style={{
                marginBottom: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
              }}>
                Select an organization in the tenant switcher to manage its defaults.
              </div>
            )}
            {orgSelected && !canEditOrg && (
              <div className="opa-muted" style={{ fontSize: 13 }}>
                You can view inherited org settings but only admins can change them.
              </div>
            )}
          </Panel>

          {orgSelected && (
            <>
              <ScopedAISettings
                scope="org"
                title="Org AI tokens"
                readOnly={!canEditOrg}
              />
              <ConnectorsManager
                defaultScope="org"
                scopeFilter="org"
                readOnly={!canEditOrg}
                onFlash={onFlash}
              />
            </>
          )}
        </div>
      )}

      {isAdmin && (
        <p className="opa-muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FiShield size={12} />
          Platform admin-only keys stay under{' '}
          <Link to="/settings/ai?scope=admin">Admin · AI settings</Link>
          {' '}— they are never inherited by org members.
        </p>
      )}
    </div>
  )
}
