import React from 'react'
import { Link } from 'react-router-dom'
import { FiGitBranch, FiExternalLink, FiRefreshCw } from 'react-icons/fi'
import { connectorLabel } from '../../hooks/useConnectors'
import { connectorsHref } from '../../utils/entityLinks'

/**
 * Compact connector selector for tools that need an active SCM connector
 * (e.g. Security Repo Watch) without owning full connect/edit/delete UI.
 */
export default function ConnectorPicker({
  connectors = [],
  loading = false,
  error = null,
  value = '',
  onChange,
  onReload,
  needsReconnect = false,
  missing = false,
  reconnectHint = '',
}) {
  const selected = connectors.find((c) => c.id === value)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, fontSize: 12, minWidth: 220, flex: 1 }}>
          Active connector
          <select
            className="opa-mono"
            value={value}
            disabled={loading}
            onChange={(e) => onChange?.(e.target.value)}
            style={{ padding: '6px 8px' }}
          >
            <option value="">— Select connector —</option>
            {connectors.map((c) => (
              <option key={c.id} value={c.id}>
                {connectorLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: 1 }}>
          <Link
            to={connectorsHref({ edit: value || undefined })}
            className="opa-btn ghost"
            style={{ textDecoration: 'none' }}
          >
            <FiGitBranch size={12} /> Manage connectors
            <FiExternalLink size={11} style={{ marginLeft: 4 }} />
          </Link>
          {onReload && (
            <button type="button" className="opa-btn ghost" onClick={onReload} disabled={loading}>
              <FiRefreshCw size={12} /> Refresh
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="opa-muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Failed to load connectors: {typeof error === 'string' ? error : JSON.stringify(error)}
        </div>
      )}

      {!loading && connectors.length === 0 && (
        <div className="opa-muted" style={{ fontSize: 13, marginBottom: 8 }}>
          No connectors yet —{' '}
          <Link to={connectorsHref()}>connect a GitHub App or PAT</Link>
          {' '}to list repositories.
        </div>
      )}

      {(missing || needsReconnect) && value && (
        <div className="opa-banner" role="status" style={{
          marginTop: 8, marginBottom: 8, padding: 12, background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
        }}>
          <div className="cell-strong" style={{ marginBottom: 4 }}>
            {missing ? 'Connector not found on Agent' : 'Token missing'}
          </div>
          <div className="opa-muted" style={{ marginBottom: 8 }}>
            Deep-linked connector <code className="opa-mono">{value}</code>
            {reconnectHint || (missing
              ? ' is not in Agent memory or ClickHouse.'
              : ' — no decryptable PAT. Replace the token or reconnect on the Connectors page.')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onReload && (
              <button type="button" className="opa-btn ghost" onClick={onReload}>
                <FiRefreshCw size={12} /> Retry
              </button>
            )}
            <Link
              to={connectorsHref({ edit: selected?.id || value })}
              className="opa-btn ghost"
              style={{ textDecoration: 'none' }}
            >
              {selected ? 'Replace token' : 'Manage connectors'}
            </Link>
            {onChange && (
              <button type="button" className="opa-btn ghost" onClick={() => onChange('')}>
                Clear connector
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
