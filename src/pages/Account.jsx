import React from 'react'
import { PageHeader, Stack, Card, Badge, DefinitionList, Button } from '@open-family/ui'
import { useTenant } from '../contexts/TenantContext'

const OAM_URL = (import.meta.env.VITE_OAM_URL || '').replace(/\/$/, '')
const connectorsHref = OAM_URL ? `${OAM_URL}/connectors` : ''
const usersHref = OAM_URL ? `${OAM_URL}/users` : ''
const endpointsHref = OAM_URL ? `${OAM_URL}/endpoints` : ''

/**
 * Account — the signed-in identity and the tenant this dashboard is scoped to.
 *
 * Users, API keys, connectors, and AI Endpoints live in Account Manager.
 * This page is deliberately only identity and scope plus deep-links.
 */
export default function Account() {
  const { organizationId } = useTenant()
  const username = localStorage.getItem('username') || ''
  const role = localStorage.getItem('role') || ''
  const orgSelected = organizationId && organizationId !== 'all'

  return (
    <Stack gap="sections">
      <PageHeader
        title="Account"
        description="Your identity and the tenant context every query on this dashboard runs against."
        actions={role ? <Badge>{role}</Badge> : undefined}
        meta={username ? [{ label: 'Signed in as', value: username }] : undefined}
      />

      <Card
        title="Tenant scope"
        description="Change this from the switcher in the top bar. It applies to every page."
      >
        <DefinitionList
          items={[
            {
              term: 'Organisation',
              value: orgSelected ? organizationId : 'All organisations',
              mono: Boolean(orgSelected),
            },
            { term: 'User', value: username || 'Not signed in', mono: Boolean(username) },
            { term: 'Role', value: role || 'Authentication is not enforced' },
          ]}
        />
      </Card>

      <Card title="Where other settings live">
        <p className="oui-text-secondary">
          Users, API keys, AI Endpoints, and GitHub connectors are managed in Account Manager.
          Security policies live in the security product; review providers and Repo Watch live in
          the review product.
        </p>
        {(usersHref || endpointsHref || connectorsHref) ? (
          <p style={{ marginTop: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {usersHref ? (
              <Button href={usersHref} target="_blank" rel="noreferrer" variant="ghost">
                Users in Account Manager
              </Button>
            ) : null}
            {endpointsHref ? (
              <Button href={endpointsHref} target="_blank" rel="noreferrer" variant="ghost">
                AI Endpoints in Account Manager
              </Button>
            ) : null}
            {connectorsHref ? (
              <Button href={connectorsHref} target="_blank" rel="noreferrer" variant="ghost">
                Manage connectors in Account Manager
              </Button>
            ) : null}
          </p>
        ) : null}
      </Card>
    </Stack>
  )
}
