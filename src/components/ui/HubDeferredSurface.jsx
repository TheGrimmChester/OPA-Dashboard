import React from 'react'
import { FiClock } from 'react-icons/fi'
import { hubDeferredCopy } from '../../utils/hubDeferred'
import { EmptyState } from './States'
import Panel from './Panel'

/**
 * Honest empty state for ownership.md deferred scaffolds.
 * Keeps nav reachable without spamming hub 404s.
 */
export default function HubDeferredSurface({ id, title, subtitle, embedded = false }) {
  const copy = hubDeferredCopy(id)
  if (!copy) return null

  const body = (
    <Panel expandable={false}>
      <EmptyState icon={<FiClock />} title={copy.title} hint={copy.hint} />
    </Panel>
  )

  if (embedded) return body

  return (
    <div className="opa-stack">
      {(title || subtitle) && (
        <div className="opa-page-head">
          <div>
            {title && <h1 className="opa-page-title">{title}</h1>}
            {subtitle && <div className="opa-page-sub">{subtitle}</div>}
          </div>
        </div>
      )}
      {body}
    </div>
  )
}
