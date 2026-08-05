import React, { useCallback, useEffect, useState } from 'react'
import { FiAlertCircle, FiMaximize2, FiMinimize2, FiRefreshCw } from 'react-icons/fi'
import { Card, Button, EmptyState, Skeleton } from '@open-family/ui'

/**
 * The family `Card`, plus this product's expand-to-viewport affordance.
 *
 * The expansion is not decoration: the dense blocks here (waterfalls, flame
 * graphs, call graphs, wide tables) are limited by their grid cell, and a user
 * reading one needs the whole viewport. It is a CSS overlay rather than the
 * browser Fullscreen API so the app's own chrome, theme and Esc handling stay
 * consistent. There is no equivalent in the kit yet.
 *
 * `loading` / `error` / `empty` are for a card whose body is NOT a table. When the
 * body is a table, pass those to the table instead — it renders a skeleton in the
 * shape of the final rows, which a generic card-level spinner cannot do.
 */
export default function Panel({
  title, description, actions, children,
  // Accepted so call sites convert independently. The family's card titles are
  // text: an icon beside one adds a thing to scan and names nothing.
  icon: _icon,
  loading, error, empty, emptyText = 'No data', onRetry,
  flush = false, className = '', expandable = true,
}) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = expandable && !!title

  // Children that measure their own box (the flame graph and call graph render
  // fixed-width SVGs sized from the panel) listen for window resize, which a
  // CSS-only size change never fires — so nudge them once the new size is laid
  // out. Harmless for anything that already flexes.
  const nudgeLayout = useCallback(() => {
    requestAnimationFrame(() => {
      try { window.dispatchEvent(new Event('resize')) } catch (_e) { /* ignore */ }
    })
  }, [])

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
    nudgeLayout()
  }, [nudgeLayout])

  // Esc closes, and the page behind must not scroll while an overlay is up.
  useEffect(() => {
    if (!expanded) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { setExpanded(false); nudgeLayout() }
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [expanded, nudgeLayout])

  let body = children
  if (loading) {
    body = (
      <div className="oui-stack">
        <Skeleton height={16} width="42%" />
        <Skeleton height={80} />
      </div>
    )
  } else if (error) {
    body = (
      <EmptyState
        inline
        icon={<FiAlertCircle />}
        title="This panel failed to load"
        description={String(error)}
        actions={onRetry ? <Button icon={<FiRefreshCw />} onClick={onRetry}>Retry</Button> : undefined}
      />
    )
  } else if (empty) {
    body = <EmptyState inline title={emptyText} />
  }

  const card = (
    <Card
      title={title}
      description={description}
      flush={flush && !loading && !error && !empty}
      className={`${expanded ? 'opa-panel-expanded' : ''} ${className}`.trim()}
      actions={
        (actions || canExpand) ? (
          <>
            {actions}
            {canExpand ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggle}
                aria-pressed={expanded}
                aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
                title={expanded ? 'Exit full screen (Esc)' : 'Expand to full screen'}
                icon={expanded ? <FiMinimize2 /> : <FiMaximize2 />}
              />
            ) : null}
          </>
        ) : undefined
      }
    >
      {body}
    </Card>
  )

  if (!expanded) return card

  // Rendered in place rather than through a portal so the panel keeps its React
  // context; the scrim is a sibling that closes on click.
  return (
    <>
      <div className="opa-panel-scrim" onClick={toggle} />
      {card}
    </>
  )
}
