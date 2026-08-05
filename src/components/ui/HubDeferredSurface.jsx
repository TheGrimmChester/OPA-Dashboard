import React from 'react'
import { FiClock } from 'react-icons/fi'
import { PageHeader, Stack, Card, EmptyState } from '@open-family/ui'
import { hubDeferredCopy } from '../../utils/hubDeferred'

/**
 * The honest empty state for a surface that is deliberately not available yet.
 *
 * This is not a failure and not an empty result — it is a page that exists in the
 * navigation so the structure is discoverable, and says plainly that its data is
 * not wired up. Keeping it reachable is better than a rail item that 404s.
 *
 * The copy comes from `hubDeferredCopy`, which is the single list of which
 * surfaces are deferred; a page passes its `id` and gets the right wording.
 */
export default function HubDeferredSurface({ id, title, subtitle, embedded = false }) {
  const copy = hubDeferredCopy(id)
  if (!copy) return null

  const body = (
    <Card>
      <EmptyState inline icon={<FiClock />} title={copy.title} description={copy.hint} />
    </Card>
  )

  if (embedded) return body

  return (
    <Stack gap="sections">
      {title || subtitle ? <PageHeader title={title} description={subtitle} /> : null}
      {body}
    </Stack>
  )
}
