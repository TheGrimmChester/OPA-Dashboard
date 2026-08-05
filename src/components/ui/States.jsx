import React from 'react'
import { FiAlertCircle } from 'react-icons/fi'
import {
  EmptyState as FamilyEmptyState,
  Skeleton as FamilySkeleton,
  StatRow,
} from '@open-family/ui'

/**
 * An empty state says what is absent and what to do about it.
 *
 * `hint` becomes `description`, which is the family's name for the same thing.
 * These render `inline` because every call site in this product is inside a card
 * or a table cell, not as a whole-page state.
 */
export function EmptyState({ icon, title = 'Nothing here yet', hint, actions }) {
  return (
    <FamilyEmptyState inline icon={icon} title={title} description={hint} actions={actions} />
  )
}

/** A failure, with the reason quoted so a user can report it. */
export function ErrorState({ message = 'Something went wrong', actions }) {
  return (
    <FamilyEmptyState
      inline
      icon={<FiAlertCircle />}
      title="This panel failed to load"
      description={String(message)}
      actions={actions}
    />
  )
}

export function Skeleton({ height = 16, width = '100%' }) {
  return <FamilySkeleton height={height} width={width} />
}

/** A row of stat-tile-shaped placeholders, matching the layout that replaces it. */
export function SkeletonTiles({ count = 4 }) {
  return (
    <StatRow>
      {Array.from({ length: count }).map((_, i) => <FamilySkeleton key={i} height={92} />)}
    </StatRow>
  )
}
