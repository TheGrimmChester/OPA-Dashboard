import React from 'react'
import { PageHeader } from '@open-family/ui'

/**
 * The header for an entity-detail page.
 *
 * There is one header component in the family, not two, so this is `PageHeader`
 * with `mono` — which puts the title in the monospace face a step down, for an
 * identifier a user might copy. The old version rendered the title in a `<span>`,
 * so these pages had no `<h1>` and no document outline at all.
 */
export default function EntityHeader({
  title, mono = true, subtitle, badges, meta, actions, breadcrumbs,
}) {
  return (
    <PageHeader
      breadcrumbs={breadcrumbs}
      title={title}
      mono={mono}
      description={subtitle}
      actions={
        (badges || meta || actions)
          ? <>{badges}{meta}{actions}</>
          : undefined
      }
    />
  )
}
