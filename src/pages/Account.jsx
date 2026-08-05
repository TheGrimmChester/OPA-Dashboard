import React from 'react'
import { PageHeader, Stack, Card, Badge, DefinitionList } from '@open-family/ui'
import { useTenant } from '../contexts/TenantContext'

/**
 * Account — the signed-in identity and the tenant this dashboard is scoped to.
 *
 * Source-control connectors and review-provider credentials belong to the review
 * product; application-security settings to the security product. This page is
 * deliberately only identity and scope.
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
          API keys and user accounts are managed under Administration. Anything that
          belongs to another product in the family — review connectors, security
          policies — is configured in that product.
        </p>
      </Card>
    </Stack>
  )
}
