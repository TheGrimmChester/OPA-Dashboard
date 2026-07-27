import React from 'react'
import { FiInbox, FiAlertCircle } from 'react-icons/fi'

export function EmptyState({ icon, title = 'Nothing here yet', hint }) {
  return <div className="opa-empty">{icon || <FiInbox />}<div style={{ color: 'var(--text-secondary)' }}>{title}</div>{hint && <div style={{ fontSize: 'var(--fs-12)' }}>{hint}</div>}</div>
}

export function ErrorState({ message = 'Something went wrong' }) {
  return <div className="opa-errstate"><FiAlertCircle /><div>{String(message)}</div></div>
}

// Block skeleton placeholder.
export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="opa-skel" style={{ height, width, ...style }} />
}

// A grid of KPI-tile-sized skeletons.
export function SkeletonTiles({ count = 4 }) {
  return (
    <div className="opa-grid cols-4">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} height={92} />)}
    </div>
  )
}
