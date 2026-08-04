import React from 'react'

// Header for entity-detail pages (service / trace / error). Title + meta chips
// on the left, actions/controls on the right.
export default function EntityHeader({ title, mono = true, subtitle, badges, meta, actions }) {
  return (
    <div className="opa-entity-head">
      <div style={{ minWidth: 0 }}>
        <div className="oui-row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <span className={mono ? 'opa-entity-title' : 'opa-entity-title'} style={!mono ? { fontFamily: 'var(--font-sans)' } : undefined}>{title}</span>
          {badges}
        </div>
        {subtitle && <div className="opa-page-sub">{subtitle}</div>}
      </div>
      <div className="opa-entity-meta">
        {meta}
        {actions}
      </div>
    </div>
  )
}
