import React from 'react'
import { FiAlertCircle, FiInbox } from 'react-icons/fi'

// Standard panel with header (title + actions) and normalized loading/empty/error
// slots so every page handles states identically.
export default function Panel({ title, icon, actions, children, loading, error, empty, emptyText = 'No data', flush = false, className = '', style }) {
  return (
    <div className={`opa-panel ${className}`} style={style}>
      {(title || actions) && (
        <div className="opa-panel-head">
          {title && <h3 className="opa-panel-title">{icon}{title}</h3>}
          {actions && <div className="opa-panel-actions">{actions}</div>}
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
}
