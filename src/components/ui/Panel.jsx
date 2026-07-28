import React, { useCallback, useEffect, useState } from 'react'
import { FiAlertCircle, FiInbox, FiMaximize2, FiMinimize2 } from 'react-icons/fi'

// Standard panel with header (title + actions) and normalized loading/empty/error
// slots so every page handles states identically.
//
// Any panel with a title can be expanded to fill the viewport — useful for the
// dense blocks (waterfalls, flame graphs, wide tables, charts) where the grid
// cell is the limiting factor. Expansion is a CSS overlay rather than the
// browser Fullscreen API so the app's own chrome, theme and Esc handling stay
// consistent; pass `expandable={false}` to opt a panel out.
export default function Panel({
  title, icon, actions, children, loading, error, empty, emptyText = 'No data',
  flush = false, className = '', style, expandable = true,
}) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = expandable && !!title

  // Children measuring their own box (the flame graph and call graph render
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

  const panel = (
    <div
      className={`opa-panel ${expanded ? 'opa-panel-expanded' : ''} ${className}`}
      style={expanded ? undefined : style}
    >
      {(title || actions || canExpand) && (
        <div className="opa-panel-head">
          {title && <h3 className="opa-panel-title">{icon}{title}</h3>}
          {(actions || canExpand) && (
            <div className="opa-panel-actions">
              {actions}
              {canExpand && (
                <button
                  type="button"
                  className="opa-panel-expand"
                  onClick={toggle}
                  title={expanded ? 'Exit full screen (Esc)' : 'Expand to full screen'}
                  aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
                  aria-pressed={expanded}
                >
                  {expanded ? <FiMinimize2 size={13} /> : <FiMaximize2 size={13} />}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className={`opa-panel-body ${flush ? 'flush' : ''}`}>
        {loading ? (
          <div className="opa-empty"><div className="opa-skel" style={{ height: 80, width: '100%' }} /></div>
        ) : error ? (
          <div className="opa-errstate"><FiAlertCircle /><div>{String(error)}</div></div>
        ) : empty ? (
          <div className="opa-empty"><FiInbox /><div>{emptyText}</div></div>
        ) : children}
      </div>
    </div>
  )

  if (!expanded) return panel

  // Rendered in place (not a portal) so the panel keeps its React context —
  // the scrim is a sibling that closes on click.
  return (
    <>
      <div className="opa-panel-scrim" onClick={toggle} />
      {panel}
    </>
  )
}
